export function parseUnitEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];

  const blockRegex =
    /export\s+([A-Za-z0-9_]+)\s+is\s+TEntityDescriptor\s*\(([\s\S]*?)\n\)/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const id = match[1];
    const block = match[2];

    const classNameMatch = block.match(/ClassNameForDebug\s*=\s*'([^']+)'/);
    const coalitionMatch = block.match(/Coalition\s*=\s*ECoalition\/([A-Z]+)/);
    const countryMatch = block.match(/MotherCountry\s*=\s*'([^']+)'/);
    const unitRoleMatch = block.match(/UnitRole\s*=\s*'([^']+)'/);
    const nameTokenMatch = block.match(/NameToken\s*=\s*'([^']+)'/);
    const buttonTextureMatch = block.match(/ButtonTexture\s*=\s*'([^']+)'/);
    const menuIconTextureMatch = block.match(/MenuIconTexture\s*=\s*'([^']+)'/);

    // This looks for:
    // TProductionModuleDescriptor
    // (
    //     FactoryType = EFactory/Tanks
    // )
    //
    // It allows any content inside that production module block before FactoryType.
    const factoryTypeMatch = block.match(
      /TProductionModuleDescriptor\s*\([\s\S]*?FactoryType\s*=\s*EFactory\/([A-Za-z0-9_]+)/,
    );

    entries.push({
      id,
      className: classNameMatch?.[1] || "",
      coalition: coalitionMatch?.[1] || "",
      countryId: countryMatch?.[1] || "",
      unitRole: unitRoleMatch?.[1] || "",
      factoryType: factoryTypeMatch?.[1] || "",
      nameToken: nameTokenMatch?.[1] || "",
      buttonTexture: buttonTextureMatch?.[1] || "",
      menuIconTexture: menuIconTextureMatch?.[1] || "",
      rawBlock: block,
    });
  }

  return entries;
}

export function mapFactoryTypeToCategory(factoryType) {
  switch (factoryType) {
    case "Logistic":
      return "log";
    case "Infantry":
      return "inf";
    case "Art":
      return "art";
    case "Tanks":
      return "tnk";
    case "Recons":
      return "rec";
    case "DCA":
      return "aa";
    case "Helis":
      return "hel";
    case "Planes":
      return "air";

    // You can decide how you want to handle Defense / UniversalFactory.
    // For now, these return null so they won't show up.
    case "Defense":
    case "UniversalFactory":
    default:
      return null;
  }
}

export function buildUnitsByCategory({
  selectedDivision,
  divisionRules,
  units,
  localizationMap = {},
}) {
  const emptyCategories = {
    log: [],
    inf: [],
    art: [],
    tnk: [],
    rec: [],
    aa: [],
    hel: [],
    air: [],
  };

  if (!selectedDivision?.divisionRule) {
    return emptyCategories;
  }

  const rule = divisionRules.find(
    (entry) => entry.id === selectedDivision.divisionRule,
  );

  if (!rule) {
    return emptyCategories;
  }

  const unitMap = new Map(units.map((unit) => [unit.id, unit]));
  const result = {
    log: [],
    inf: [],
    art: [],
    tnk: [],
    rec: [],
    aa: [],
    hel: [],
    air: [],
  };

  for (const unitId of rule.unitIds) {
    const unit = unitMap.get(unitId);
    if (!unit) continue;

    const category = mapFactoryTypeToCategory(unit.factoryType);
    if (!category) continue;

    result[category].push({
      id: unit.id,
      className: unit.className,
      countryId: unit.countryId,
      coalition: unit.coalition,
      unitRole: unit.unitRole,
      factoryType: unit.factoryType,
      nameToken: unit.nameToken,
      name: localizationMap[unit.nameToken] || unit.className || unit.id,
      buttonTexture: unit.buttonTexture,
      menuIconTexture: unit.menuIconTexture,
    });
  }

  return result;
}