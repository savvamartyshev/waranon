export function parseDivisionRuleEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];

  const blockRegex =
    /([A-Za-z0-9_]+)\s+is\s+TDeckDivisionRule\s*\(([\s\S]*?)\n\)/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const id = match[1];
    const block = match[2];

    const unitIds = [
      ...block.matchAll(/UnitDescriptor\s*=\s*\$\/GFX\/Unit\/([A-Za-z0-9_]+)/g),
    ].map((m) => m[1]);

    entries.push({
      id,
      unitIds,
      rawBlock: block,
    });
  }

  return entries;
}

export function findDivisionRuleById(divisionRules, ruleId) {
  if (!Array.isArray(divisionRules) || !ruleId) return null;
  return divisionRules.find((rule) => rule.id === ruleId) || null;
}

export function cloneDivisionRule(rule, newId = "") {
  if (!rule) {
    return {
      id: newId || "",
      unitIds: [],
      rawBlock: "",
    };
  }

  return {
    id: newId || rule.id,
    unitIds: [...rule.unitIds],
    rawBlock: rule.rawBlock || "",
  };
}

export function clearDivisionRule(rule) {
  if (!rule) return null;

  return {
    ...rule,
    unitIds: [],
  };
}

export function addUnitToDivisionRule(rule, unitId) {
  if (!rule || !unitId) return rule;
  if (rule.unitIds.includes(unitId)) return rule;

  return {
    ...rule,
    unitIds: [...rule.unitIds, unitId],
  };
}

export function removeUnitFromDivisionRule(rule, unitId) {
  if (!rule || !unitId) return rule;

  return {
    ...rule,
    unitIds: rule.unitIds.filter((id) => id !== unitId),
  };
}

export function serializeDivisionRule(rule) {
  if (!rule?.id) return "";

  const unitLines = (rule.unitIds || [])
    .map(
      (unitId) =>
        `        TDeckUniteRule\n        (\n            UnitDescriptor = $/GFX/Unit/${unitId}\n        )`
    )
    .join(",\n");

  return `${rule.id} is TDeckDivisionRule
(
    Units = 
    [
${unitLines}
    ]
)`;
}

export function diffDivisionRules(baseRule, currentRule) {
  const baseSet = new Set(baseRule?.unitIds || []);
  const currentSet = new Set(currentRule?.unitIds || []);

  const added = [...currentSet].filter((id) => !baseSet.has(id));
  const removed = [...baseSet].filter((id) => !currentSet.has(id));

  return { added, removed };
}