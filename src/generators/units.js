function matchNumber(block, regex) {
  const match = block.match(regex);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function matchString(block, regex) {
  return block.match(regex)?.[1] || "";
}

export function parseUnitEntries(text) {
  if (!text || typeof text !== "string") return [];

  const entries = [];

  const blockRegex =
    /export\s+([A-Za-z0-9_]+)\s+is\s+TEntityDescriptor\s*\(([\s\S]*?)\n\)/g;

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const id = match[1];
    const block = match[2];

    const className = matchString(block, /ClassNameForDebug\s*=\s*'([^']+)'/);
    const coalition = matchString(
      block,
      /Coalition\s*=\s*ECoalition\/([A-Z]+)/,
    );
    const countryId = matchString(block, /MotherCountry\s*=\s*'([^']+)'/);
    const unitRole = matchString(block, /UnitRole\s*=\s*'([^']+)'/);
    const nameToken = matchString(block, /NameToken\s*=\s*'([^']+)'/);
    const buttonTexture = matchString(block, /ButtonTexture\s*=\s*'([^']+)'/);
    const menuIconTexture = matchString(
      block,
      /MenuIconTexture\s*=\s*'([^']+)'/,
    );

    const factoryType = matchString(
      block,
      /TProductionModuleDescriptor\s*\([\s\S]*?FactoryType\s*=\s*EFactory\/([A-Za-z0-9_]+)/,
    );

    const displayRoadSpeedInKmph = matchNumber(
      block,
      /DisplayRoadSpeedInKmph\s*=\s*([0-9.]+)/,
    );

    const unitConcealmentBonus = matchNumber(
      block,
      /UnitConcealmentBonus\s*=\s*([0-9.]+)/,
    );

    const maxPhysicalDamages = matchNumber(
      block,
      /MaxPhysicalDamages\s*=\s*([0-9.]+)/,
    );

    const dangerousness = matchNumber(
      block,
      /TDangerousnessModuleDescriptor\s*\(\s*Dangerousness\s*=\s*([0-9.]+)/,
    );

    const maxSpeedInKmph = matchNumber(block, /MaxSpeedInKmph\s*=\s*([0-9.]+)/);

    const speedBonusFactorOnRoad = matchNumber(
      block,
      /SpeedBonusFactorOnRoad\s*=\s*([0-9.]+)/,
    );

    const maxAccelerationGRU = matchNumber(
      block,
      /MaxAccelerationGRU\s*=\s*([0-9.]+)/,
    );

    const maxDecelerationGRU = matchNumber(
      block,
      /MaxDecelerationGRU\s*=\s*([0-9.]+)/,
    );

    const tempsDemiTour = matchNumber(block, /TempsDemiTour\s*=\s*([0-9.]+)/);

    const engineCooldownTime = matchNumber(
      block,
      /EngineCooldownTime\s*=\s*([0-9.]+)/,
    );

    const fuelCapacity = matchNumber(block, /FuelCapacity\s*=\s*([0-9.]+)/);

    const fuelMoveDuration = matchNumber(
      block,
      /FuelMoveDuration\s*=\s*([0-9.]+)/,
    );

    const visionStandard = matchNumber(
      block,
      /\(\s*EVisionRange\/Standard,\s*([0-9.]+)\s*\)/,
    );

    const visionLowAltitude = matchNumber(
      block,
      /\(\s*EVisionRange\/LowAltitude,\s*([0-9.]+)\s*\)/,
    );

    const visionHighAltitude = matchNumber(
      block,
      /\(\s*EVisionRange\/HighAltitude,\s*([0-9.]+)\s*\)/,
    );

    const opticalStandard = matchNumber(
      block,
      /\(\s*EOpticalStrength\/Standard,\s*([0-9.]+)\s*\)/,
    );

    const opticalLowAltitude = matchNumber(
      block,
      /\(\s*EOpticalStrength\/LowAltitude,\s*([0-9.]+)\s*\)/,
    );

    const opticalHighAltitude = matchNumber(
      block,
      /\(\s*EOpticalStrength\/HighAltitude,\s*([0-9.]+)\s*\)/,
    );

    entries.push({
      id,
      className,
      coalition,
      countryId,
      unitRole,
      factoryType,
      nameToken,
      buttonTexture,
      menuIconTexture,

      displayRoadSpeedInKmph,
      unitConcealmentBonus,
      maxPhysicalDamages,
      dangerousness,

      maxSpeedInKmph,
      speedBonusFactorOnRoad,
      maxAccelerationGRU,
      maxDecelerationGRU,
      tempsDemiTour,
      engineCooldownTime,
      fuelCapacity,
      fuelMoveDuration,

      visionStandard,
      visionLowAltitude,
      visionHighAltitude,
      opticalStandard,
      opticalLowAltitude,
      opticalHighAltitude,

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
      name: unit.displayName || localizationMap[unit.nameToken] || unit.className || unit.id,
      buttonTexture: unit.buttonTexture,
      menuIconTexture: unit.menuIconTexture,

      displayRoadSpeedInKmph: unit.displayRoadSpeedInKmph,
      unitConcealmentBonus: unit.unitConcealmentBonus,
      maxPhysicalDamages: unit.maxPhysicalDamages,
      dangerousness: unit.dangerousness,
      maxSpeedInKmph: unit.maxSpeedInKmph,
      speedBonusFactorOnRoad: unit.speedBonusFactorOnRoad,
      maxAccelerationGRU: unit.maxAccelerationGRU,
      maxDecelerationGRU: unit.maxDecelerationGRU,
      tempsDemiTour: unit.tempsDemiTour,
      engineCooldownTime: unit.engineCooldownTime,
      fuelCapacity: unit.fuelCapacity,
      fuelMoveDuration: unit.fuelMoveDuration,
      visionStandard: unit.visionStandard,
      visionLowAltitude: unit.visionLowAltitude,
      visionHighAltitude: unit.visionHighAltitude,
      opticalStandard: unit.opticalStandard,
      opticalLowAltitude: unit.opticalLowAltitude,
      opticalHighAltitude: unit.opticalHighAltitude,
    });
  }

  return result;
}
