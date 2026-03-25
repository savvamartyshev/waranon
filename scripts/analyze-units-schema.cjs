#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MAX_OPTION_SET_VALUES = 50;
const MAX_EXAMPLES = 5;

const OPTION_SET_EXCLUDED_FIELDS = new Set([
  "DescriptorId",
  "ClassNameForDebug",
  "NameToken",
  "ButtonTexture",
  "UpgradeFromUnit",
  "ValidOrders",
  "UnlockableOrders",
  "ReferenceMesh",
  "MimeticName",
  "BlackHoleKey",
  "ShowRoomBlackHoleIdentifier",
  "Connoisseur",
]);

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Failed to read file: ${filePath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function isWhitespace(ch) {
  return /\s/.test(ch);
}

function isIdentifierStart(ch) {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}

class Parser {
  constructor(text) {
    this.text = text;
    this.pos = 0;
    this.len = text.length;
  }

  eof() {
    return this.pos >= this.len;
  }

  peek(offset = 0) {
    return this.text[this.pos + offset];
  }

  next() {
    return this.text[this.pos++];
  }

  error(message) {
    const start = Math.max(0, this.pos - 50);
    const end = Math.min(this.len, this.pos + 50);
    const snippet = this.text.slice(start, end).replace(/\n/g, "\\n");
    throw new Error(`${message} at pos ${this.pos}. Context: ${snippet}`);
  }

  skipWhitespaceAndComments() {
    while (!this.eof()) {
      if (isWhitespace(this.peek())) {
        this.pos++;
        continue;
      }

      if (this.peek() === "/" && this.peek(1) === "/") {
        this.pos += 2;
        while (!this.eof() && this.peek() !== "\n") {
          this.pos++;
        }
        continue;
      }

      break;
    }
  }

  matchKeyword(word) {
    this.skipWhitespaceAndComments();
    const slice = this.text.slice(this.pos, this.pos + word.length);
    if (slice === word) {
      const nextChar = this.text[this.pos + word.length];
      const prevChar = this.text[this.pos - 1];
      const nextOk = !nextChar || !isIdentifierPart(nextChar);
      const prevOk = !prevChar || !isIdentifierPart(prevChar);
      if (prevOk && nextOk) {
        this.pos += word.length;
        return true;
      }
    }
    return false;
  }

  expectKeyword(word) {
    if (!this.matchKeyword(word)) {
      this.error(`Expected keyword "${word}"`);
    }
  }

  matchChar(ch) {
    this.skipWhitespaceAndComments();
    if (this.peek() === ch) {
      this.pos++;
      return true;
    }
    return false;
  }

  expectChar(ch) {
    if (!this.matchChar(ch)) {
      this.error(`Expected "${ch}"`);
    }
  }

  readIdentifier() {
    this.skipWhitespaceAndComments();
    if (!isIdentifierStart(this.peek())) {
      this.error("Expected identifier");
    }

    const start = this.pos;
    this.pos++;

    while (!this.eof() && isIdentifierPart(this.peek())) {
      this.pos++;
    }

    return this.text.slice(start, this.pos);
  }

  readBareToken() {
    this.skipWhitespaceAndComments();

    const start = this.pos;

    while (!this.eof()) {
      const ch = this.peek();
      if (
        isWhitespace(ch) ||
        ch === "," ||
        ch === "]" ||
        ch === ")" ||
        ch === "(" ||
        ch === "[" ||
        ch === "|"
      ) {
        break;
      }
      this.pos++;
    }

    return this.text.slice(start, this.pos);
  }

  readQuotedString() {
    this.skipWhitespaceAndComments();
    const quote = this.peek();

    if (quote !== "'" && quote !== '"') {
      this.error("Expected quoted string");
    }

    this.pos++;
    let out = "";

    while (!this.eof()) {
      const ch = this.next();

      if (ch === "\\") {
        if (this.eof()) break;
        out += ch + this.next();
        continue;
      }

      if (ch === quote) {
        return {
          type: "string",
          quote,
          value: out,
        };
      }

      out += ch;
    }

    this.error("Unterminated string");
  }

  readNumberOrWord() {
    const token = this.readBareToken();

    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return {
        type: "number",
        value: Number(token),
        raw: token,
      };
    }

    if (/^(True|False)$/i.test(token)) {
      return {
        type: "boolean",
        value: /^true$/i.test(token),
        raw: token,
      };
    }

    if (/^GUID:\{[^}]+\}$/.test(token)) {
      return {
        type: "guid",
        value: token,
      };
    }

    if (token === "MAP") {
      return {
        type: "map_keyword",
        value: token,
      };
    }

    if (/^\$\/[A-Za-z0-9_./-]+$/.test(token)) {
      return {
        type: "resource_ref",
        value: token,
      };
    }

    if (/^~\/[A-Za-z0-9_./-]+$/.test(token)) {
      return {
        type: "local_ref",
        value: token,
      };
    }

    if (/^[A-Za-z0-9_]+\/[A-Za-z0-9_]+$/.test(token)) {
      return {
        type: "enum_path",
        value: token,
      };
    }

    return {
      type: "symbol",
      value: token,
    };
  }

  parseArray() {
    this.expectChar("[");
    const items = [];

    while (true) {
      this.skipWhitespaceAndComments();

      if (this.matchChar("]")) {
        break;
      }

      const item = this.parseValue();
      items.push(item);

      this.skipWhitespaceAndComments();
      this.matchChar(",");
    }

    return {
      type: "array",
      items,
    };
  }

  parseTuple() {
    this.expectChar("(");
    const items = [];

    while (true) {
      this.skipWhitespaceAndComments();

      if (this.matchChar(")")) {
        break;
      }

      items.push(this.parseValue());

      this.skipWhitespaceAndComments();
      this.matchChar(",");
    }

    return {
      type: "tuple",
      items,
    };
  }

  parseMap() {
    this.expectKeyword("MAP");
    const array = this.parseArray();

    return {
      type: "map",
      entries: array.items,
    };
  }

  parsePipeExpression(firstNode) {
    if (!firstNode) {
      this.error("Missing first node for pipe expression");
    }

    const items = [firstNode];

    while (true) {
      this.skipWhitespaceAndComments();

      if (!this.matchChar("|")) {
        break;
      }

      const nextValue = this.parseSingleValue();
      if (!nextValue) {
        this.error('Expected value after "|"');
      }

      items.push(nextValue);
    }

    if (items.length === 1) {
      return firstNode;
    }

    return {
      type: "union",
      items,
    };
  }

  tryParseAssignment() {
    const save = this.pos;
    this.skipWhitespaceAndComments();

    if (!isIdentifierStart(this.peek())) {
      return null;
    }

    const name = this.readIdentifier();
    this.skipWhitespaceAndComments();

    if (!this.matchChar("=")) {
      this.pos = save;
      return null;
    }

    const value = this.parseValue();
    return {
      type: "assignment",
      name,
      value,
    };
  }

  parseTypedObjectWithKnownName(typeName) {
    this.skipWhitespaceAndComments();

    if (!this.matchChar("(")) {
      return {
        type: "symbol",
        value: typeName,
      };
    }

    this.skipWhitespaceAndComments();

    if (this.matchChar(")")) {
      return {
        type: "typed_object",
        name: typeName,
        fields: [],
      };
    }

    const fields = [];
    const items = [];

    while (true) {
      this.skipWhitespaceAndComments();

      if (this.matchChar(")")) {
        break;
      }

      const assignment = this.tryParseAssignment();
      if (assignment) {
        fields.push(assignment);
      } else {
        items.push(this.parseValue());
      }

      this.skipWhitespaceAndComments();
      this.matchChar(",");
    }

    if (items.length > 0 && fields.length === 0) {
      return {
        type: "typed_call",
        name: typeName,
        args: items,
      };
    }

    if (items.length > 0) {
      return {
        type: "typed_object",
        name: typeName,
        fields,
        items,
      };
    }

    return {
      type: "typed_object",
      name: typeName,
      fields,
    };
  }

  parseSingleValue() {
    this.skipWhitespaceAndComments();

    const ch = this.peek();

    if (!ch) {
      this.error("Unexpected end of input while reading value");
    }

    if (ch === "'" || ch === '"') {
      return this.readQuotedString();
    }

    if (ch === "[") {
      return this.parseArray();
    }

    if (ch === "(") {
      return this.parseTuple();
    }

    if (this.text.slice(this.pos, this.pos + 3) === "MAP") {
      const after = this.text[this.pos + 3];
      if (!after || /\s|\[/.test(after)) {
        return this.parseMap();
      }
    }

    if (isIdentifierStart(ch)) {
      const save = this.pos;
      const ident = this.readIdentifier();
      this.skipWhitespaceAndComments();

      if (this.peek() === "(") {
        return this.parseTypedObjectWithKnownName(ident);
      }

      this.pos = save;
      const token = this.readNumberOrWord();

      if (
        token.type === "symbol" &&
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(token.value)
      ) {
        const save2 = this.pos;
        this.skipWhitespaceAndComments();
        if (this.peek() === "(") {
          return this.parseTypedObjectWithKnownName(token.value);
        }
        this.pos = save2;
      }

      return token;
    }

    if (ch === "~" || ch === "$" || /[-0-9]/.test(ch)) {
      return this.readNumberOrWord();
    }

    this.error(`Unexpected character "${ch}"`);
  }

  parseValue() {
    const first = this.parseSingleValue();
    return this.parsePipeExpression(first);
  }

  parseEntityBody() {
    const fields = [];

    this.expectChar("(");

    while (true) {
      this.skipWhitespaceAndComments();

      if (this.matchChar(")")) {
        break;
      }

      const assignment = this.tryParseAssignment();
      if (!assignment) {
        this.error("Expected field assignment in entity body");
      }

      fields.push(assignment);

      this.skipWhitespaceAndComments();
      this.matchChar(",");
    }

    return fields;
  }

  parseEntity() {
    this.expectKeyword("export");
    const name = this.readIdentifier();
    this.expectKeyword("is");
    const kind = this.readIdentifier();

    if (kind !== "TEntityDescriptor") {
      this.error(`Expected TEntityDescriptor, got ${kind}`);
    }

    const fields = this.parseEntityBody();

    return {
      type: "entity",
      name,
      kind,
      fields,
    };
  }

  parseFile() {
    const entities = [];

    while (true) {
      this.skipWhitespaceAndComments();
      if (this.eof()) break;

      if (!this.matchKeyword("export")) {
        this.error('Expected "export"');
      }

      this.pos -= "export".length;
      entities.push(this.parseEntity());
    }

    return entities;
  }
}

function scalarType(node) {
  if (!node) return "unknown";

  switch (node.type) {
    case "string":
      return "string";
    case "union":
      return "union";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "guid":
      return "guid";
    case "enum_path":
      return "enum_path";
    case "resource_ref":
      return "resource_ref";
    case "local_ref":
      return "local_ref";
    case "symbol":
      return "symbol";
    case "array":
      return "array";
    case "map":
      return "map";
    case "tuple":
      return "tuple";
    case "typed_object":
      return "typed_object";
    case "typed_call":
      return "typed_call";
    default:
      return node.type || "unknown";
  }
}

function nodeToExample(node) {
  if (!node) return "null";

  switch (node.type) {
    case "string":
    case "guid":
    case "enum_path":
    case "resource_ref":
    case "local_ref":
    case "symbol":
      return String(node.value);

    case "number":
    case "boolean":
      return String(node.value);

    case "array":
      return `[${Array.isArray(node.items) ? node.items.length : 0} items]`;

    case "map":
      return `MAP[${Array.isArray(node.entries) ? node.entries.length : 0} entries]`;

    case "tuple":
      return `(${Array.isArray(node.items) ? node.items.length : 0} items)`;

    case "union":
      return Array.isArray(node.items)
        ? node.items.map(nodeToExample).join(" | ")
        : "union";

    case "typed_object":
      return `${node.name}(${Array.isArray(node.fields) ? node.fields.length : 0} fields)`;

    case "typed_call":
      return `${node.name}(${Array.isArray(node.args) ? node.args.length : 0} args)`;

    default:
      return node.type || "unknown";
  }
}

function ensureAccumulator(target, key) {
  if (!target[key]) {
    target[key] = {
      count: 0,
      types: new Set(),
      optionSetValues: new Set(),
      optionSetValuesSkipped: false,
      optionSetValuesTruncated: false,
      min: null,
      max: null,
      examples: [],
    };
  }
  return target[key];
}

function addExample(acc, value) {
  if (acc.examples.length >= MAX_EXAMPLES) return;
  if (!acc.examples.includes(value)) {
    acc.examples.push(value);
  }
}

function shouldCollectOptionSet(pathParts, node) {
  const fieldName = pathParts[pathParts.length - 1] || "";

  if (OPTION_SET_EXCLUDED_FIELDS.has(fieldName)) {
    return false;
  }

  if (
    /Texture|Token|Descriptor|Mesh|BlackHole|Mimetic|Order|Connoisseur/i.test(
      fieldName,
    )
  ) {
    return false;
  }

  return (
    node.type === "boolean" ||
    node.type === "string" ||
    node.type === "enum_path" ||
    node.type === "symbol"
  );
}

function primitiveOptionValue(node) {
  if (node.type === "string") return node.value;
  if (node.type === "boolean") return String(node.value);
  if (node.type === "enum_path") return node.value;
  if (node.type === "symbol") return node.value;
  return null;
}

function updateAccumulator(acc, pathParts, node) {
  acc.count += 1;
  acc.types.add(scalarType(node));

  if (node.type === "number") {
    acc.min = acc.min === null ? node.value : Math.min(acc.min, node.value);
    acc.max = acc.max === null ? node.value : Math.max(acc.max, node.value);
  }

  if (shouldCollectOptionSet(pathParts, node)) {
    const v = primitiveOptionValue(node);
    if (v !== null) {
      if (acc.optionSetValues.size < MAX_OPTION_SET_VALUES) {
        acc.optionSetValues.add(v);
      } else {
        acc.optionSetValuesTruncated = true;
      }
    }
  } else if (
    node.type === "string" ||
    node.type === "boolean" ||
    node.type === "enum_path" ||
    node.type === "symbol"
  ) {
    acc.optionSetValuesSkipped = true;
  }

  addExample(acc, nodeToExample(node));
}

function walkNode(node, pathParts, pathSchema) {
  const pathKey = pathParts.join(".");
  const acc = ensureAccumulator(pathSchema, pathKey);
  updateAccumulator(acc, pathParts, node);

  switch (node.type) {
    case "array":
      for (const item of node.items || []) {
        walkNode(item, [...pathParts, "[]"], pathSchema);
      }
      break;

    case "map":
      for (const entry of node.entries || []) {
        walkNode(entry, [...pathParts, "MAP_ENTRY"], pathSchema);
      }
      break;

    case "union":
      if (Array.isArray(node.items)) {
        for (let i = 0; i < node.items.length; i++) {
          walkNode(node.items[i], [...pathParts, `|${i}`], pathSchema);
        }
      }
      break;

    case "tuple":
      for (let i = 0; i < (node.items || []).length; i++) {
        walkNode(node.items[i], [...pathParts, `#${i}`], pathSchema);
      }
      break;

    case "typed_object":
      {
        const typedKey = [...pathParts, `<${node.name}>`].join(".");
        const typedAcc = ensureAccumulator(pathSchema, typedKey);
        typedAcc.count += 1;
        typedAcc.types.add("typed_object_instance");
        addExample(typedAcc, node.name);

        for (const field of node.fields || []) {
          walkNode(
            field.value,
            [...pathParts, node.name, field.name],
            pathSchema,
          );
        }

        for (let i = 0; i < (node.items || []).length; i++) {
          walkNode(
            node.items[i],
            [...pathParts, node.name, `item${i}`],
            pathSchema,
          );
        }
      }
      break;

    case "typed_call":
      for (let i = 0; i < (node.args || []).length; i++) {
        walkNode(
          node.args[i],
          [...pathParts, node.name, `arg${i}`],
          pathSchema,
        );
      }
      break;

    default:
      break;
  }
}

function collectEntityField(entity, fieldName) {
  return entity.fields.find((f) => f.name === fieldName);
}

function summarizeModules(entities) {
  const moduleSchema = {};
  const moduleUsage = {};

  for (const entity of entities) {
    const modulesField = collectEntityField(entity, "ModulesDescriptors");
    if (!modulesField || modulesField.value.type !== "array") continue;

    for (const item of modulesField.value.items) {
      let moduleType = null;

      if (item.type === "typed_object") {
        moduleType = item.name;
      } else if (item.type === "typed_call") {
        moduleType = item.name;
      } else if (item.type === "local_ref") {
        moduleType = "__local_ref__";
      } else if (item.type === "resource_ref") {
        moduleType = "__resource_ref__";
      } else if (item.type === "symbol") {
        moduleType = "__symbol_module__";
      } else {
        moduleType = `__${item.type}__`;
      }

      if (!moduleUsage[moduleType]) {
        moduleUsage[moduleType] = {
          count: 0,
          examples: [],
        };
      }

      moduleUsage[moduleType].count += 1;
      addExample(moduleUsage[moduleType], nodeToExample(item));

      if (item.type === "typed_object") {
        for (const field of item.fields || []) {
          const key = `${moduleType}.${field.name}`;
          const acc = ensureAccumulator(moduleSchema, key);
          updateAccumulator(acc, [moduleType, field.name], field.value);
        }
      }

      if (item.type === "typed_call") {
        for (let i = 0; i < (item.args || []).length; i++) {
          const key = `${moduleType}.arg${i}`;
          const acc = ensureAccumulator(moduleSchema, key);
          updateAccumulator(acc, [moduleType, `arg${i}`], item.args[i]);
        }
      }
    }
  }

  return {
    moduleUsage: finalizeAccMap(moduleUsage),
    moduleSchema: finalizeAccMap(moduleSchema),
  };
}

function buildDescriptorSummary(entity) {
  const fieldNames = entity.fields.map((f) => f.name);
  const modulesField = collectEntityField(entity, "ModulesDescriptors");

  const moduleTypes = [];
  if (modulesField && modulesField.value.type === "array") {
    for (const item of modulesField.value.items) {
      if (item.type === "typed_object" || item.type === "typed_call") {
        moduleTypes.push(item.name);
      } else if (item.type === "local_ref") {
        moduleTypes.push("__local_ref__");
      } else if (item.type === "resource_ref") {
        moduleTypes.push("__resource_ref__");
      } else if (item.type === "symbol") {
        moduleTypes.push("__symbol_module__");
      } else {
        moduleTypes.push(`__${item.type}__`);
      }
    }
  }

  const descriptorId = collectEntityField(entity, "DescriptorId");
  const className = collectEntityField(entity, "ClassNameForDebug");

  return {
    name: entity.name,
    descriptorId:
      descriptorId && descriptorId.value.type === "guid"
        ? descriptorId.value.value
        : descriptorId
          ? nodeToExample(descriptorId.value)
          : null,
    className:
      className && className.value.type === "string"
        ? className.value.value
        : className
          ? nodeToExample(className.value)
          : null,
    fieldCount: fieldNames.length,
    fields: fieldNames,
    moduleCount: moduleTypes.length,
    moduleTypes,
  };
}

function finalizeAccMap(obj) {
  const out = {};

  for (const [key, acc] of Object.entries(obj)) {
    out[key] = {
      count: acc.count,
      types: Array.from(acc.types || []).sort(),
      optionSetValues: Array.from(acc.optionSetValues || []).sort(),
      optionSetValuesSkipped: Boolean(acc.optionSetValuesSkipped),
      optionSetValuesTruncated: Boolean(acc.optionSetValuesTruncated),
      min: acc.min ?? null,
      max: acc.max ?? null,
      examples: acc.examples || [],
    };

    if ("count" in acc && !("types" in acc)) {
      out[key] = {
        count: acc.count,
        examples: acc.examples || [],
      };
    }
  }

  return out;
}

function buildPathSchema(entities) {
  const pathSchema = {};

  for (const entity of entities) {
    for (const field of entity.fields) {
      walkNode(field.value, ["entity", field.name], pathSchema);
    }
  }

  return finalizeAccMap(pathSchema);
}

function buildReport(inputFile, entities) {
  const descriptorSummaries = entities.map(buildDescriptorSummary);
  const pathSchema = buildPathSchema(entities);
  const modules = summarizeModules(entities);

  return {
    inputFile,
    generatedAt: new Date().toISOString(),
    summary: {
      totalEntityDescriptors: entities.length,
      descriptorExamples: entities.slice(0, 10).map((e) => e.name),
      uniquePathCount: Object.keys(pathSchema).length,
      uniqueModuleSchemaPaths: Object.keys(modules.moduleSchema).length,
      uniqueModuleTypes: Object.keys(modules.moduleUsage).length,
    },
    descriptors: descriptorSummaries,
    pathSchema,
    moduleUsage: modules.moduleUsage,
    moduleSchema: modules.moduleSchema,
  };
}

function run(inputPath, outputPath) {
  const resolvedInput = path.resolve(inputPath);
  const text = readFileSafe(resolvedInput);

  let entities;
  try {
    const parser = new Parser(text);
    entities = parser.parseFile();
  } catch (error) {
    console.error("Parse failed:");
    console.error(error.message);
    process.exit(1);
  }

  const report = buildReport(resolvedInput, entities);
  const json = JSON.stringify(report, null, 2);

  if (outputPath) {
    const resolvedOutput = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, json, "utf8");
    console.log(`Wrote schema report to ${resolvedOutput}`);
  } else {
    console.log(json);
  }

  return report;
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    console.error(
      "Usage: node scripts/analyze-units-schema.cjs <input-file> [output-json]",
    );
    process.exit(1);
  }

  run(inputPath, outputPath);
}

if (require.main === module) {
  main();
}

module.exports = {
  Parser,
  run,
  buildReport,
};