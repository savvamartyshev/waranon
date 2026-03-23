#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function collectEntityBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];

  let currentName = null;
  let currentLines = [];

  for (const line of lines) {
    const headerMatch = line.match(
      /^export\s+([A-Za-z0-9_]+)\s+is\s+TEntityDescriptor\b/,
    );

    if (headerMatch) {
      if (currentName) {
        blocks.push({
          id: currentName,
          text: currentLines.join("\n"),
        });
      }

      currentName = headerMatch[1];
      currentLines = [line];
      continue;
    }

    if (currentName) {
      currentLines.push(line);
    }
  }

  if (currentName) {
    blocks.push({
      id: currentName,
      text: currentLines.join("\n"),
    });
  }

  return blocks;
}

function detectValueType(rawValue) {
  const value = rawValue.trim();

  if (/^(True|False)$/i.test(value)) return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number";
  if (/^GUID:\{[^}]+\}$/.test(value)) return "guid";
  if (/^'.*'$/.test(value)) return "single_quoted_string";
  if (/^".*"$/.test(value)) return "double_quoted_string";
  if (/^[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(value)) return "enum_path";
  if (/^\$\/[A-Za-z0-9_\/.]+$/.test(value)) return "resource_ref";
  if (/^~\/[A-Za-z0-9_\/.]+$/.test(value)) return "local_ref";
  if (/^\[.*\]$/.test(value)) return "inline_array";
  if (/^\(.*\)$/.test(value)) return "inline_block";
  return "unknown";
}

function normalizeValue(rawValue, type) {
  const value = rawValue.trim();

  if (type === "single_quoted_string" || type === "double_quoted_string") {
    return value.slice(1, -1);
  }

  if (type === "boolean") {
    return /^true$/i.test(value);
  }

  if (type === "number") {
    return Number(value);
  }

  return value;
}

function ensureField(schema, fieldName) {
  if (!schema[fieldName]) {
    schema[fieldName] = {
      count: 0,
      types: new Set(),
      values: new Set(),
      min: null,
      max: null,
      examples: [],
    };
  }
  return schema[fieldName];
}

function addExample(field, value) {
  if (field.examples.length >= 5) return;
  if (!field.examples.includes(value)) {
    field.examples.push(value);
  }
}

function profileBlockLines(blockText, schema) {
  const lines = blockText.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;
    if (line.startsWith("//")) continue;

    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;

    const fieldName = match[1];
    const rawValue = match[2].trim();

    const type = detectValueType(rawValue);
    const value = normalizeValue(rawValue, type);

    const field = ensureField(schema, fieldName);
    field.count += 1;
    field.types.add(type);

    if (type === "number") {
      field.min = field.min === null ? value : Math.min(field.min, value);
      field.max = field.max === null ? value : Math.max(field.max, value);
    } else if (
      type === "boolean" ||
      type === "single_quoted_string" ||
      type === "double_quoted_string" ||
      type === "enum_path"
    ) {
      if (field.values.size < 200) {
        field.values.add(String(value));
      }
    }

    addExample(field, String(value));
  }
}

function finalizeSchema(schema) {
  const out = {};

  for (const [fieldName, field] of Object.entries(schema)) {
    out[fieldName] = {
      count: field.count,
      types: Array.from(field.types).sort(),
      optionSetValues: Array.from(field.values).sort(),
      min: field.min,
      max: field.max,
      examples: field.examples,
    };
  }

  return out;
}

function summarizeBlocks(blocks) {
  const schema = {};

  for (const block of blocks) {
    profileBlockLines(block.text, schema);
  }

  return finalizeSchema(schema);
}

function buildTopLevelSummary(blocks, schemaSummary) {
  return {
    totalEntityDescriptors: blocks.length,
    fieldsDiscovered: Object.keys(schemaSummary).length,
    descriptorExamples: blocks.slice(0, 10).map((b) => b.id),
  };
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    console.error(
      "Usage: node scripts/analyze-units-schema.js <input-file> [output-json]",
    );
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  const text = readFileSafe(resolvedInput);

  const blocks = collectEntityBlocks(text);
  const schemaSummary = summarizeBlocks(blocks);
  const report = {
    inputFile: resolvedInput,
    generatedAt: new Date().toISOString(),
    summary: buildTopLevelSummary(blocks, schemaSummary),
    schema: schemaSummary,
  };

  const json = JSON.stringify(report, null, 2);

  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, json, "utf8");
    console.log(`Wrote schema report to ${resolvedOutput}`);
  } else {
    console.log(json);
  }
}

main();