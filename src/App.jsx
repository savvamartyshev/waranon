import { useMemo, useState } from "react";
import DivisionBuilder from "./components/DivisionBuilder";
import uiSpecificCountriesText from "./templates/UISpecificCountriesInfos.txt?raw";
import divisionsText from "./templates/Divisions.txt?raw";
import localizationText from "./templates/localizationexample.txt?raw";
import divisionRulesText from "./templates/DivisionRules.txt?raw";
import unitsText from "./templates/UniteDescriptor.txt?raw";
import deckSerializerText from "./templates/DeckSerializer.txt?raw";
import {
  parseDivisionRuleEntries,
  findDivisionRuleById,
  cloneDivisionRule,
  addUnitToDivisionRule,
  removeUnitFromDivisionRule,
  clearDivisionRule,
} from "./generators/divisionRules";

function createEmptyProject() {
  return {
    meta: {
      modName: "sampleMod",
      version: "0.1.0",
    },
    division: {
      baseDivision: "",
      alliance: "NATO",
      countryId: "",
      divisionName: "",
      modeSuffix: "multi",
      descriptorExportName: "",
      cfgName: "",
      descriptorId: "",
      divisionNameToken: "",
      summaryTextToken: "",
      historyTextToken: "",
      deckBudget: 50,
      interfaceOrder: null,
      divisionTags: [],
      typeToken: "",
      divisionRule: "",
      costMatrix: "",
      emblemTexture: "",
      standoutUnits: [],
      useCustomEmblem: false,
      emblemFile: null,
      emblemPreviewUrl: "",
    },
    customCountries: [],
    customDivisions: [],
    customDivisionRules: [],
    unitsByCategory: {
      log: [],
      inf: [],
      art: [],
      tnk: [],
      rec: [],
      aa: [],
      hel: [],
      air: [],
    },
    customUnits: [],
    customWeapons: [],
    customAmmo: [],
    files: {
      uiSpecificCountriesText,
      divisionsText,
      localizationText,
      divisionRulesText,
      unitsText,
      deckSerializerText,
    },
    validation: {
      errors: [],
      warnings: [],
    },
  };
}

export default function App() {
  const [project, setProject] = useState(createEmptyProject());
  const [showCountryEditor, setShowCountryEditor] = useState(false);
  const [showDivisionEditor, setShowDivisionEditor] = useState(false);

  const parsedDivisionRules = useMemo(() => {
    return parseDivisionRuleEntries(project.files.divisionRulesText);
  }, [project.files.divisionRulesText]);

  const allDivisionRules = useMemo(() => {
    const custom = project.customDivisionRules || [];
    const customIds = new Set(custom.map((rule) => rule.id));
    const baseWithoutOverrides = parsedDivisionRules.filter(
      (rule) => !customIds.has(rule.id)
    );

    return [...baseWithoutOverrides, ...custom];
  }, [parsedDivisionRules, project.customDivisionRules]);

  function updateCurrentDivisionRule(transform) {
    setProject((prev) => {
      const currentRuleId = prev.division.divisionRule;
      if (!currentRuleId) return prev;

      const existingCustomRule = (prev.customDivisionRules || []).find(
        (rule) => rule.id === currentRuleId
      );

      if (existingCustomRule) {
        return {
          ...prev,
          customDivisionRules: prev.customDivisionRules.map((rule) =>
            rule.id === currentRuleId ? transform(rule) : rule
          ),
        };
      }

      const parsedBaseRule = parsedDivisionRules.find(
        (rule) => rule.id === currentRuleId
      );
      if (!parsedBaseRule) return prev;

      const newCustomRule = transform(cloneDivisionRule(parsedBaseRule, currentRuleId));

      return {
        ...prev,
        customDivisionRules: [...(prev.customDivisionRules || []), newCustomRule],
      };
    });
  }

  function handleClearCurrentDivisionRule() {
    updateCurrentDivisionRule((rule) => clearDivisionRule(rule));
  }

  function handleAddUnitToCurrentDivisionRule(unitId) {
    updateCurrentDivisionRule((rule) => addUnitToDivisionRule(rule, unitId));
  }

  function handleRemoveUnitFromCurrentDivisionRule(unitId) {
    updateCurrentDivisionRule((rule) => removeUnitFromDivisionRule(rule, unitId));
  }

  function createDivisionRuleFromBase({ newRuleId, baseRuleId }) {
    setProject((prev) => {
      const baseRule =
        findDivisionRuleById(parsedDivisionRules, baseRuleId) ||
        findDivisionRuleById(prev.customDivisionRules || [], baseRuleId);

      const clonedRule = cloneDivisionRule(baseRule, newRuleId);

      return {
        ...prev,
        customDivisionRules: [
          ...(prev.customDivisionRules || []).filter((rule) => rule.id !== newRuleId),
          clonedRule,
        ],
        division: {
          ...prev.division,
          divisionRule: newRuleId,
        },
      };
    });
  }

  return (
    <DivisionBuilder
      project={project}
      setProject={setProject}
      showCountryEditor={showCountryEditor}
      setShowCountryEditor={setShowCountryEditor}
      showDivisionEditor={showDivisionEditor}
      setShowDivisionEditor={setShowDivisionEditor}
      divisionRules={allDivisionRules}
      onClearDivisionRule={handleClearCurrentDivisionRule}
      onAddUnitToDivisionRule={handleAddUnitToCurrentDivisionRule}
      onRemoveUnitFromDivisionRule={handleRemoveUnitFromCurrentDivisionRule}
      onCreateDivisionRuleFromBase={createDivisionRuleFromBase}
    />
  );
}