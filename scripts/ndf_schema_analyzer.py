#!/usr/bin/env python3
"""
NDF Schema Analyzer

Parses NDF game data files and produces a JSON schema describing:
  - Every field in every module/descriptor type
  - Inferred value type (boolean, integer, float, enum, string, reference, guid, array, map, object)
  - min / max for numeric fields
  - Sorted list of unique observed values for string / enum fields

Usage:
  python ndf_schema_analyzer.py [file1.txt file2.txt ...]

  Defaults to UniteDescriptor.txt if no files are given.
  Output is written to ndf_schema.json (and also printed to stdout).
"""

import re
import json
import sys
from pathlib import Path
from collections import defaultdict


# ── Value-type inference ────────────────────────────────────────────────────
_TYPE_RULES = [
    ("guid",             re.compile(r"^GUID:\{[0-9a-fA-F\-]+\}$")),
    ("boolean",          re.compile(r"^(True|False)$")),
    ("float",            re.compile(r"^-?\d+\.\d+$")),
    ("integer",          re.compile(r"^-?\d+$")),
    ("enum",             re.compile(r"^E[A-Z]\w*/\w+$")),
    ("local_reference",  re.compile(r"^~/[\w/\.]+$")),
    ("global_reference", re.compile(r"^\$/[\w/\.]+$")),
    ("string",           re.compile(r"^'[^']*'$|^\"[^\"]*\"$")),
]


def infer_type(v: str) -> str:
    v = v.strip()
    for name, pat in _TYPE_RULES:
        if pat.match(v):
            return name
    if v.startswith("["):
        return "array"
    if v.startswith("MAP"):
        return "map"
    if re.match(r"^[A-Z]\w*\s*\(", v):
        return "object"
    return "raw"


# ── Bracket matcher ─────────────────────────────────────────────────────────
def matching_close(text: str, start: int, open_ch: str, close_ch: str) -> int:
    """Return the index of the bracket that closes the one at `start`."""
    depth = 0
    i = start
    in_sq = in_dq = False
    while i < len(text):
        c = text[i]
        if in_sq:
            if c == "'":
                in_sq = False
        elif in_dq:
            if c == '"':
                in_dq = False
        else:
            if c == "'":
                in_sq = True
            elif c == '"':
                in_dq = True
            elif c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return len(text) - 1  # unclosed — return end as fallback


# ── Value extractor ─────────────────────────────────────────────────────────
def extract_value(text: str) -> tuple:
    """
    Parse one value from the start of `text`.
    Returns (raw_value_string, chars_consumed).
    """
    s = text.lstrip()
    offset = len(text) - len(s)

    if not s:
        return None, offset

    # Array  [...]
    if s[0] == "[":
        end = matching_close(s, 0, "[", "]") + 1
        return s[:end], offset + end

    # MAP  [...]
    if s.startswith("MAP"):
        m = re.match(r"MAP\s*\[", s)
        if m:
            bracket = m.end() - 1
            end = matching_close(s, bracket, "[", "]") + 1
            return s[:end], offset + end

    # Typed nested object  TypeName( ... )  or  TypeName\n( ... )
    obj = re.match(r"([A-Z]\w*)\s*\(", s, re.DOTALL)
    if obj:
        paren = s.index("(", obj.start())
        end = matching_close(s, paren, "(", ")") + 1
        return s[:end], offset + end

    # Single-quoted string
    if s[0] == "'":
        close = s.index("'", 1)
        return s[: close + 1], offset + close + 1

    # Double-quoted string
    if s[0] == '"':
        close = s.index('"', 1)
        return s[: close + 1], offset + close + 1

    # GUID
    guid = re.match(r"GUID:\{[0-9a-fA-F\-]+\}", s)
    if guid:
        return guid.group(), offset + guid.end()

    # Scalar (number, bool, enum, local/global reference, bare identifier)
    scalar = re.match(r"[^\s,\)\]\n]+", s)
    if scalar:
        return scalar.group(), offset + scalar.end()

    return None, offset + 1


# ── Schema storage ──────────────────────────────────────────────────────────
class FieldInfo:
    MAX_VALUES = 500

    __slots__ = ("types", "values", "min_val", "max_val", "count")

    def __init__(self):
        self.types = set()
        self.values = set()
        self.min_val = None
        self.max_val = None
        self.count = 0

    def record(self, raw: str, kind: str):
        self.types.add(kind)
        self.count += 1
        if kind in ("float", "integer"):
            try:
                n = float(raw)
                self.min_val = min(self.min_val, n) if self.min_val is not None else n
                self.max_val = max(self.max_val, n) if self.max_val is not None else n
            except ValueError:
                pass
        elif kind in ("string", "enum"):
            if len(self.values) < self.MAX_VALUES:
                self.values.add(raw.strip("'\""))

    def to_dict(self) -> dict:
        d = {"types": sorted(self.types), "count": self.count}
        if self.values:
            d["values"] = sorted(self.values)
        if self.min_val is not None:
            d["min"] = self.min_val
            d["max"] = self.max_val
        return d


# {ModuleType: {dot.separated.field.path: FieldInfo}}
_schema: dict = defaultdict(lambda: defaultdict(FieldInfo))


# ── Module body parser ──────────────────────────────────────────────────────
def parse_module_body(text: str, module_type: str, prefix: str = ""):
    i = 0
    n = len(text)
    while i < n:
        # Skip whitespace
        while i < n and text[i] in " \t\r\n":
            i += 1
        if i >= n:
            break

        # Match  FIELD_NAME =
        m = re.match(r"(\w+)\s*=\s*", text[i:])
        if not m:
            i += 1
            continue

        field = m.group(1)
        field_path = f"{prefix}{field}" if prefix else field
        val_start = i + m.end()

        raw, consumed = extract_value(text[val_start:])
        if raw is None:
            i = val_start + 1
            continue

        kind = infer_type(raw)

        if kind == "object":
            _schema[module_type][field_path].record("object", "object")
            # Recurse into the nested object body
            obj_m = re.match(r"[A-Z]\w*\s*\(", raw, re.DOTALL)
            if obj_m:
                paren = raw.index("(")
                close = matching_close(raw, paren, "(", ")")
                nested_body = raw[paren + 1 : close]
                parse_module_body(nested_body, module_type, f"{field_path}.")

        elif kind in ("array", "map"):
            _schema[module_type][field_path].record(kind, kind)
            # Scan array / map items
            bracket = raw.index("[")
            inner = raw[bracket + 1 : matching_close(raw, bracket, "[", "]")]
            scan_collection_items(inner, module_type, f"{field_path}[]")

        else:
            _schema[module_type][field_path].record(raw, kind)

        i = val_start + consumed


def scan_collection_items(inner: str, module_type: str, field_path: str):
    """Extract and record scalar items (and descend into nested module objects)."""
    i = 0
    n = len(inner)
    while i < n:
        while i < n and inner[i] in " \t\r\n,":
            i += 1
        if i >= n:
            break

        raw, consumed = extract_value(inner[i:])
        if raw is None:
            i += 1
            continue

        kind = infer_type(raw)

        if kind == "object":
            # Likely a module descriptor inside ModulesDescriptors = [...]
            obj_m = re.match(r"([A-Z]\w*)\s*\(", raw.strip(), re.DOTALL)
            if obj_m:
                inner_type = obj_m.group(1)
                paren = raw.index("(")
                close = matching_close(raw, paren, "(", ")")
                body = raw[paren + 1 : close]
                parse_module_body(body, inner_type)
        elif kind in ("array", "map"):
            pass  # nested collections — skip for now
        else:
            _schema[module_type][field_path].record(raw, kind)

        i += consumed


# ── Top-level export scanner ────────────────────────────────────────────────
def analyze_file(path: str):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    # Strip // comments
    text = re.sub(r"//[^\n]*", "", text)

    export_pat = re.compile(r"\bexport\s+(\w+)\s+is\s+(\w+)\s*\(", re.DOTALL)
    count = 0
    for m in export_pat.finditer(text):
        export_type = m.group(2)
        paren_start = m.end() - 1
        close = matching_close(text, paren_start, "(", ")")
        body = text[paren_start + 1 : close]
        parse_module_body(body, export_type)
        count += 1

    print(f"  → {count} exports found in {Path(path).name}", file=sys.stderr)


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    default = r"C:\Users\savva\waranon-1\src\templates\UniteDescriptor.txt"
    files = sys.argv[1:] or [default]

    for f in files:
        print(f"Analyzing: {f}", file=sys.stderr)
        analyze_file(f)

    result = {
        module: {
            field: info.to_dict()
            for field, info in sorted(fields.items())
        }
        for module, fields in sorted(_schema.items())
    }

    out_path = Path("ndf_schema.json")
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nSchema written to: {out_path.resolve()}", file=sys.stderr)
    print(f"Module types found: {len(result)}", file=sys.stderr)

    # Also print to stdout
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
