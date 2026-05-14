#!/usr/bin/env python3
"""
NDF Hierarchical Schema Analyzer

Produces a nested schema that mirrors the actual NDF structure.
Arrays of objects are expanded inline; each distinct object type gets its
own merged schema. Scalar fields carry type, example, min/max, and values.

Usage:
  python ndf_hierarchical_analyzer.py [file.txt ...]
  Defaults to WeaponDescriptor.txt. Output: ndf_hierarchical_{stem}.json
"""

import re
import json
import sys
from pathlib import Path


# ── Type inference ────────────────────────────────────────────────────────────
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


# ── Bracket matcher ───────────────────────────────────────────────────────────
def matching_close(text: str, start: int, open_ch: str, close_ch: str) -> int:
    depth = 0
    i = start
    in_sq = in_dq = False
    while i < len(text):
        c = text[i]
        if in_sq:
            if c == "'": in_sq = False
        elif in_dq:
            if c == '"': in_dq = False
        else:
            if c == "'": in_sq = True
            elif c == '"': in_dq = True
            elif c == open_ch: depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return len(text) - 1


# ── Value extractor ───────────────────────────────────────────────────────────
def extract_value(text: str) -> tuple:
    s = text.lstrip()
    offset = len(text) - len(s)
    if not s:
        return None, offset

    if s[0] == "[":
        end = matching_close(s, 0, "[", "]") + 1
        return s[:end], offset + end

    if s.startswith("MAP"):
        m = re.match(r"MAP\s*\[", s)
        if m:
            bracket = m.end() - 1
            end = matching_close(s, bracket, "[", "]") + 1
            return s[:end], offset + end

    obj = re.match(r"([A-Z]\w*)\s*\(", s, re.DOTALL)
    if obj:
        paren = s.index("(", obj.start())
        end = matching_close(s, paren, "(", ")") + 1
        return s[:end], offset + end

    if s[0] == "'":
        close = s.index("'", 1)
        return s[:close + 1], offset + close + 1

    if s[0] == '"':
        close = s.index('"', 1)
        return s[:close + 1], offset + close + 1

    guid = re.match(r"GUID:\{[0-9a-fA-F\-]+\}", s)
    if guid:
        return guid.group(), offset + guid.end()

    scalar = re.match(r"[^\s,\)\]\n]+", s)
    if scalar:
        return scalar.group(), offset + scalar.end()

    return None, offset + 1


# ── Schema node ───────────────────────────────────────────────────────────────
_COLLECT_MAX = 500
_DISPLAY_MAX = 20


class SchemaNode:
    """Represents the merged schema for a single field position."""
    __slots__ = ("types", "count", "example", "values",
                 "min_val", "max_val", "fields", "item_nodes")

    def __init__(self):
        self.types = set()       # observed scalar types
        self.count = 0
        self.example = None      # first seen value
        self.values = set()      # unique values for string/enum/reference
        self.min_val = None
        self.max_val = None
        self.fields = {}         # {field_name: SchemaNode}  — for objects
        self.item_nodes = {}     # {type_or_kind: SchemaNode} — for arrays

    # ── recording ─────────────────────────────────────────────────────────────
    def record_scalar(self, raw: str, kind: str):
        self.types.add(kind)
        self.count += 1
        if self.example is None:
            self.example = raw.strip("'\"") if kind not in ("raw",) else raw
        if kind in ("float", "integer"):
            try:
                n = float(raw)
                self.min_val = min(self.min_val, n) if self.min_val is not None else n
                self.max_val = max(self.max_val, n) if self.max_val is not None else n
            except ValueError:
                pass
        elif kind in ("string", "enum", "local_reference", "global_reference"):
            if len(self.values) < _COLLECT_MAX:
                self.values.add(raw.strip("'\""))

    def record_array(self, raw: str):
        self.types.add("array")
        self.count += 1
        if self.example is None:
            self.example = (raw[:120] + "...") if len(raw) > 120 else raw

    # ── merging ───────────────────────────────────────────────────────────────
    def merge(self, other: "SchemaNode"):
        self.types |= other.types
        self.count += other.count
        if self.example is None:
            self.example = other.example
        self.values |= other.values
        if other.min_val is not None:
            self.min_val = min(self.min_val, other.min_val) if self.min_val is not None else other.min_val
            self.max_val = max(self.max_val, other.max_val) if self.max_val is not None else other.max_val
        for k, v in other.fields.items():
            if k not in self.fields:
                self.fields[k] = SchemaNode()
            self.fields[k].merge(v)
        for k, v in other.item_nodes.items():
            if k not in self.item_nodes:
                self.item_nodes[k] = SchemaNode()
            self.item_nodes[k].merge(v)

    # ── serialization ─────────────────────────────────────────────────────────
    def to_dict(self) -> dict:
        d = {}

        types_list = sorted(self.types)
        d["type"] = types_list[0] if len(types_list) == 1 else types_list

        d["count"] = self.count

        if self.example is not None:
            d["example"] = self.example

        if self.values:
            sv = sorted(self.values)
            d["values"] = sv[:_DISPLAY_MAX] + (["..."] if len(sv) > _DISPLAY_MAX else [])

        if self.min_val is not None:
            d["min"] = self.min_val
            d["max"] = self.max_val

        if self.fields:
            d["fields"] = {k: v.to_dict() for k, v in sorted(self.fields.items())}

        if self.item_nodes:
            if len(self.item_nodes) == 1:
                (item_key, item_node), = self.item_nodes.items()
                d["items"] = {"type": item_key, **item_node.to_dict()}
                # Remove redundant "type" key nested under items if it matches
                if d["items"].get("type") == item_key:
                    pass  # keep for clarity
            else:
                d["items"] = {k: v.to_dict() for k, v in sorted(self.item_nodes.items())}

        return d


# ── Parsing ───────────────────────────────────────────────────────────────────
def parse_body(text: str) -> dict:
    """Parse FIELD = VALUE pairs from an object body. Returns {field: SchemaNode}."""
    fields: dict[str, SchemaNode] = {}
    i = 0
    n = len(text)
    while i < n:
        while i < n and text[i] in " \t\r\n":
            i += 1
        if i >= n:
            break
        m = re.match(r"(\w+)\s*=\s*", text[i:])
        if not m:
            i += 1
            continue
        field = m.group(1)
        val_start = i + m.end()
        raw, consumed = extract_value(text[val_start:])
        if raw is None:
            i = val_start + 1
            continue
        kind = infer_type(raw)
        node = parse_value(raw, kind)
        if field not in fields:
            fields[field] = SchemaNode()
        fields[field].merge(node)
        i = val_start + consumed
    return fields


def parse_value(raw: str, kind: str) -> SchemaNode:
    """Build a SchemaNode from a single raw value."""
    node = SchemaNode()

    if kind == "object":
        obj_m = re.match(r"([A-Z]\w*)\s*\(", raw.strip(), re.DOTALL)
        if obj_m:
            obj_type = obj_m.group(1)
            node.types.add(obj_type)
            node.count = 1
            paren = raw.index("(")
            close = matching_close(raw, paren, "(", ")")
            node.fields = parse_body(raw[paren + 1 : close])
    elif kind in ("array", "map"):
        node.record_array(raw)
        bracket = raw.index("[")
        inner = raw[bracket + 1 : matching_close(raw, bracket, "[", "]")]
        for item_key, item_node in parse_array_items(inner):
            if item_key not in node.item_nodes:
                node.item_nodes[item_key] = SchemaNode()
            node.item_nodes[item_key].merge(item_node)
    else:
        node.record_scalar(raw, kind)

    return node


def parse_array_items(inner: str) -> list:
    """Parse items inside [...], returning [(type_key, SchemaNode), ...]."""
    results = []
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
            obj_m = re.match(r"([A-Z]\w*)\s*\(", raw.strip(), re.DOTALL)
            if obj_m:
                obj_type = obj_m.group(1)
                item_node = SchemaNode()
                item_node.count = 1
                paren = raw.index("(")
                close = matching_close(raw, paren, "(", ")")
                item_node.fields = parse_body(raw[paren + 1 : close])
                results.append((obj_type, item_node))
        elif kind not in ("array", "map"):
            item_node = SchemaNode()
            item_node.record_scalar(raw, kind)
            results.append((kind, item_node))
        i += consumed
    return results


# ── Top-level scanner ─────────────────────────────────────────────────────────
def analyze_file(path: str) -> dict:
    """Parse a file and return {export_type: SchemaNode (with merged fields)}."""
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"//[^\n]*", "", text)

    top: dict[str, SchemaNode] = {}
    export_pat = re.compile(r"(?:export\s+)?(\w+)\s+is\s+(\w+)\s*\(", re.DOTALL)
    count = 0

    for m in export_pat.finditer(text):
        export_type = m.group(2)
        paren_start = m.end() - 1
        close = matching_close(text, paren_start, "(", ")")
        body_fields = parse_body(text[paren_start + 1 : close])

        if export_type not in top:
            top[export_type] = SchemaNode()
            top[export_type].types.add(export_type)

        container = top[export_type]
        container.count += 1

        for field_name, field_node in body_fields.items():
            if field_name not in container.fields:
                container.fields[field_name] = SchemaNode()
            container.fields[field_name].merge(field_node)

        count += 1

    print(f"  → {count} exports, {len(top)} top-level type(s) in {Path(path).name}", file=sys.stderr)
    return top


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    default = r"C:\Users\savva\waranon-1\src\templates\WeaponDescriptor.txt"
    files = sys.argv[1:] or [default]

    combined: dict[str, SchemaNode] = {}
    for f in files:
        print(f"Analyzing: {f}", file=sys.stderr)
        for export_type, node in analyze_file(f).items():
            if export_type not in combined:
                combined[export_type] = SchemaNode()
                combined[export_type].types |= node.types
            combined[export_type].count += node.count
            for field_name, field_node in node.fields.items():
                if field_name not in combined[export_type].fields:
                    combined[export_type].fields[field_name] = SchemaNode()
                combined[export_type].fields[field_name].merge(field_node)

    result = {
        export_type: {
            "count": node.count,
            "fields": {k: v.to_dict() for k, v in sorted(node.fields.items())},
        }
        for export_type, node in sorted(combined.items())
    }

    if len(files) == 1:
        stem = Path(files[0]).stem
        out_path = Path(f"ndf_hierarchical_{stem}.json")
    else:
        out_path = Path("ndf_hierarchical_combined.json")

    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nSchema written to: {out_path.resolve()}", file=sys.stderr)
    print(f"Top-level types: {list(result.keys())}", file=sys.stderr)


if __name__ == "__main__":
    main()
