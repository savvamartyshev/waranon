import JSZip from "jszip";
import {
  applyNewCountryToUiSpecificCountriesFile,
} from "../generators/country";

export async function exportMod(project) {
  const zip = new JSZip();

  const modName = project.meta?.modName || "sampleMod";
  const root = zip.folder(modName);

  if (!root) throw new Error("Failed to create mod root folder.");

  // -------------------------
  // 1. Countries (you already did this well)
  // -------------------------

  let uiSpecificCountriesText = project.files.uiSpecificCountriesText;

  for (const customCountry of project.customCountries) {
    uiSpecificCountriesText =
      applyNewCountryToUiSpecificCountriesFile(
        uiSpecificCountriesText,
        customCountry.generated
      );
  }

  root.file(
    "GameData/Generated/UserInterface/UISpecificCountriesInfos.ndf",
    uiSpecificCountriesText
  );

  // UnitNames
  for (const customCountry of project.customCountries) {
    root.file(
      `GameData/Generated/Gameplay/Gfx/UnitNames/UnitNames_${customCountry.countryTag}.NDF`,
      customCountry.generated.unitNamesFile
    );
  }

  // INTERFACE_OUTGAME.csv
  let interfaceCsv = `"TOKEN";"REFTEXT"\n`;

  for (const customCountry of project.customCountries) {
    interfaceCsv += `"${customCountry.nameToken}";"${customCountry.countryName}"\n`;
  }

  root.file(
    `GameData/Localisation/${modName}/INTERFACE_OUTGAME.csv`,
    interfaceCsv
  );

  // Flags
  for (const customCountry of project.customCountries) {
    if (customCountry.useCustomFlag && customCountry.flagFile) {
      root.file(
        `GameData/Assets/2D/Interface/Common/Flags/${customCountry.generated.flagFileName}`,
        customCountry.flagFile
      );
    }
  }

  // -------------------------
  // 2. Divisions (NEW SECTION)
  // -------------------------

  for (const division of project.divisions || []) {
    exportDivisionFiles(root, division);
  }

  // -------------------------
  // 3. Debug / Metadata
  // -------------------------

  root.file(
    "README.txt",
    [
      "WARNO Division Builder Export",
      `Mod Name: ${modName}`,
      `Divisions: ${(project.divisions || []).length}`,
      `Custom Countries: ${project.customCountries.length}`,
    ].join("\n")
  );

  // -------------------------
  // 4. Generate ZIP
  // -------------------------

  const blob = await zip.generateAsync({ type: "blob" });
  return blob;
}

function exportDivisionFiles(root, division) {
  // 1. Division NDF
  root.file(
    `GameData/Generated/Gameplay/Decks/Division_${division.cfgName}.ndf`,
    buildDivisionNDF(division)
  );

  // 2. Division Rules
  root.file(
    `GameData/Generated/Gameplay/Decks/DivisionRules.ndf`,
    buildDivisionRulesNDF(division)
  );

  // 3. Cost Matrix
  root.file(
    `GameData/Generated/Gameplay/Decks/DivisionCostMatrix.ndf`,
    buildCostMatrixNDF(division)
  );
}