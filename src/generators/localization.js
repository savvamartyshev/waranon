export function parseLocalizationCsv(text) {
  if (!text || typeof text !== "string") return [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Skip header row like:
  // "TOKEN";"REFTEXT"
  const dataLines =
    lines[0].includes('"TOKEN";"REFTEXT"') ? lines.slice(1) : lines;

  const entries = [];

  for (const line of dataLines) {
    const match = line.match(/^"([^"]*)";"([^"]*)"$/);
    if (!match) continue;

    entries.push({
      token: match[1],
      text: match[2],
    });
  }

  return entries;
}

export function buildLocalizationMap(text) {
  const entries = parseLocalizationCsv(text);
  const map = {};

  for (const entry of entries) {
    map[entry.token] = entry.text;
  }

  return map;
}