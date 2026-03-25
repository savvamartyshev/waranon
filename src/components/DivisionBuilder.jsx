import { useMemo, useState } from "react";
import CountryBuilder from "./CountryBuilder";
import CustomDivisionBuilder from "./CustomDivisionBuilder";
import { exportMod } from "../logic/exportMod";
import { parseCountriesInfoEntries } from "../generators/country";
import { parseDivisionEntries } from "../generators/divisions";
import { buildLocalizationMap } from "../generators/localization";
import {
  parseDivisionRuleEntries,
  findDivisionRuleById,
  serializeDivisionRule,
  diffDivisionRules,
} from "../generators/divisionRules";
import { parseUnitEntries, buildUnitsByCategory } from "../generators/units";

const categories = ["log", "inf", "art", "tnk", "rec", "aa", "hel", "air"];

function createEmptyCategories() {
  return {
    log: [],
    inf: [],
    art: [],
    tnk: [],
    rec: [],
    aa: [],
    hel: [],
    air: [],
  };
}

export default function DivisionBuilder({
  project,
  setProject,
  showCountryEditor,
  setShowCountryEditor,
  showDivisionEditor,
  setShowDivisionEditor,
  divisionRules = [],
  onClearDivisionRule,
  onAddUnitToDivisionRule,
  onRemoveUnitFromDivisionRule,
  onCreateDivisionRuleFromBase,
}) {
  const division = project.division;
  const [addMenuCategory, setAddMenuCategory] = useState(null);

  const localizationMap = useMemo(() => {
    try {
      return buildLocalizationMap(project.files.localizationText);
    } catch (error) {
      console.error("Failed to parse localization:", error);
      return {};
    }
  }, [project.files.localizationText]);

  const parsedCountries = useMemo(() => {
    const text = project.files.uiSpecificCountriesText;
    if (!text) return [];

    try {
      return parseCountriesInfoEntries(text);
    } catch (error) {
      console.error("Failed to parse countries:", error);
      return [];
    }
  }, [project.files.uiSpecificCountriesText]);

  const parsedDivisions = useMemo(() => {
    const text = project.files.divisionsText;
    if (!text) return [];

    try {
      return parseDivisionEntries(text);
    } catch (error) {
      console.error("Failed to parse divisions:", error);
      return [];
    }
  }, [project.files.divisionsText]);

  const parsedDivisionRules = useMemo(() => {
    const text = project.files.divisionRulesText;
    if (!text) return [];

    try {
      return parseDivisionRuleEntries(text);
    } catch (error) {
      console.error("Failed to parse division rules:", error);
      return [];
    }
  }, [project.files.divisionRulesText]);

  const parsedUnits = useMemo(() => {
    const text = project.files.unitsText;
    if (!text) return [];

    try {
      return parseUnitEntries(text);
    } catch (error) {
      console.error("Failed to parse units:", error);
      return [];
    }
  }, [project.files.unitsText]);

  const filteredDivisions = useMemo(() => {
    if (!division.countryId) return [];

    return parsedDivisions.filter((entry) => entry.countryId === division.countryId);
  }, [parsedDivisions, division.countryId]);

  const filteredCustomDivisions = useMemo(() => {
    if (!division.countryId) return [];

    return (project.customDivisions || []).filter(
      (entry) => entry.countryId === division.countryId
    );
  }, [project.customDivisions, division.countryId]);

  const allDivisionRules = useMemo(() => {
    if (divisionRules.length) return divisionRules;
    return [];
  }, [divisionRules]);

  const selectedBaseDivisionEntry = useMemo(() => {
    const baseDivision =
      parsedDivisions.find((entry) => entry.id === division.baseDivision) || null;

    const customDivision =
      (project.customDivisions || []).find(
        (entry) => entry.id === division.baseDivision
      ) || null;

    return customDivision || baseDivision;
  }, [parsedDivisions, project.customDivisions, division.baseDivision]);

  const activeRuleEntry = useMemo(() => {
    return findDivisionRuleById(allDivisionRules, division.divisionRule);
  }, [allDivisionRules, division.divisionRule]);

  const baseRuleEntry = useMemo(() => {
    const baseRuleId = selectedBaseDivisionEntry?.divisionRule || "";
    return findDivisionRuleById(parsedDivisionRules, baseRuleId);
  }, [parsedDivisionRules, selectedBaseDivisionEntry]);

  const derivedUnitsByCategory = useMemo(() => {
    if (!activeRuleEntry) return createEmptyCategories();

    return buildUnitsByCategory({
      selectedDivision: {
        divisionRule: activeRuleEntry.id,
      },
      divisionRules: allDivisionRules,
      units: parsedUnits,
      localizationMap,
    });
  }, [activeRuleEntry, allDivisionRules, parsedUnits, localizationMap]);

  const allUnitsByCategory = useMemo(() => {
    const categoryBuckets = createEmptyCategories();

    for (const unit of parsedUnits) {
      const built = buildUnitsByCategory({
        selectedDivision: {
          divisionRule: "__temp__",
        },
        divisionRules: [{ id: "__temp__", unitIds: [unit.id] }],
        units: parsedUnits,
        localizationMap,
      });

      for (const category of categories) {
        if (built[category]?.length) {
          categoryBuckets[category].push({
            id: unit.id,
            name:
              localizationMap[unit.nameToken] ||
              unit.className ||
              unit.id,
            unitRole: unit.unitRole,
            factoryType: unit.factoryType,
          });
        }
      }
    }

    return categoryBuckets;
  }, [parsedUnits, localizationMap]);

  const availableUnitsToAddByCategory = useMemo(() => {
    const currentIds = new Set(activeRuleEntry?.unitIds || []);
    const result = createEmptyCategories();

    for (const category of categories) {
      result[category] = (allUnitsByCategory[category] || []).filter(
        (unit) => !currentIds.has(unit.id)
      );
    }

    return result;
  }, [allUnitsByCategory, activeRuleEntry]);

  const currentRulePreview = useMemo(() => {
    return serializeDivisionRule(activeRuleEntry);
  }, [activeRuleEntry]);

  const ruleDiff = useMemo(() => {
    return diffDivisionRules(baseRuleEntry, activeRuleEntry);
  }, [baseRuleEntry, activeRuleEntry]);

  function updateDivisionField(field, value) {
    setProject((prev) => ({
      ...prev,
      division: {
        ...prev.division,
        [field]: value,
      },
    }));
  }

  function getDivisionFriendlyName(entry) {
    return (
      localizationMap[entry.divisionNameToken] ||
      entry.cfgName ||
      entry.exportName ||
      entry.id ||
      "Unknown Division"
    );
  }

  function handleCountryChange(value) {
    if (value === "__ADD_CUSTOM_COUNTRY__") {
      setShowCountryEditor(true);
      return;
    }

    setProject((prev) => ({
      ...prev,
      division: {
        ...prev.division,
        countryId: value,
        baseDivision: "",
        divisionRule: "",
      },
    }));
  }

  function handleBaseDivisionChange(value) {
    if (value === "__ADD_CUSTOM_DIVISION__") {
      setShowDivisionEditor(true);
      return;
    }

    if (!value) {
      setProject((prev) => ({
        ...prev,
        division: {
          ...prev.division,
          baseDivision: "",
          divisionRule: "",
        },
      }));
      return;
    }

    const selectedDivisionEntry =
      parsedDivisions.find((entry) => entry.id === value) ||
      (project.customDivisions || []).find((entry) => entry.id === value);

    const baseRuleId = selectedDivisionEntry?.divisionRule || "";

    setProject((prev) => ({
      ...prev,
      division: {
        ...prev.division,
        baseDivision: value,
        divisionRule: baseRuleId,
      },
    }));
  }

  async function handleExport() {
    try {
      const blob = await exportMod(project);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${project.meta?.modName || "mod"}.zip`;
      link.click();

      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Division Rules Builder</h1>

        <div style={styles.topBar}>
          <div style={styles.fieldBox}>
            <label style={styles.label}>Division Alliance</label>
            <select
              value={division.alliance}
              onChange={(e) => updateDivisionField("alliance", e.target.value)}
              style={styles.select}
            >
              <option value="NATO">NATO</option>
              <option value="PACT">PACT</option>
            </select>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.label}>Division Country</label>
            <select
              value={division.countryId}
              onChange={(e) => handleCountryChange(e.target.value)}
              style={styles.select}
            >
              <option value="">Select country</option>

              {parsedCountries.map((country) => (
                <option key={country.tag} value={country.tag}>
                  {country.tag} ({country.coalition})
                </option>
              ))}

              {(project.customCountries || []).map((country) => (
                <option key={country.countryTag} value={country.countryTag}>
                  {country.countryTag} (custom)
                </option>
              ))}

              <option value="__ADD_CUSTOM_COUNTRY__">
                + Add Custom Country
              </option>
            </select>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.label}>Base Division</label>
            <select
              value={division.baseDivision || ""}
              onChange={(e) => handleBaseDivisionChange(e.target.value)}
              style={styles.select}
              disabled={!division.countryId}
            >
              <option value="">
                {division.countryId ? "Select division" : "Select country first"}
              </option>

              {filteredDivisions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {getDivisionFriendlyName(entry)}
                </option>
              ))}

              {filteredCustomDivisions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.cfgName || entry.id} (custom)
                </option>
              ))}

              <option value="__ADD_CUSTOM_DIVISION__">
                + Add Custom Division
              </option>
            </select>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.label}>Active Rule</label>
            <input
              type="text"
              value={division.divisionRule || ""}
              readOnly
              style={styles.input}
            />
          </div>

          <div style={styles.exportBox}>
            <button type="button" style={styles.exportButton} onClick={handleExport}>
              Export Mod
            </button>
          </div>
        </div>

        <div style={styles.actionBar}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={onClearDivisionRule}
            disabled={!division.divisionRule}
          >
            Clear Division
          </button>

          {selectedBaseDivisionEntry?.divisionRule && (
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() =>
                onCreateDivisionRuleFromBase?.({
                  newRuleId: division.divisionRule || selectedBaseDivisionEntry.divisionRule,
                  baseRuleId: selectedBaseDivisionEntry.divisionRule,
                })
              }
            >
              Reload From Base Division
            </button>
          )}
        </div>

        <div style={styles.grid}>
          {categories.map((category) => (
            <div key={category} style={styles.column}>
              <div style={styles.columnHeader}>{category.toUpperCase()}</div>

              {(derivedUnitsByCategory[category] || []).map((unit) => (
                <div key={unit.id} style={styles.unitCard}>
                  <div style={styles.unitIcon}>
                    {unit.factoryType || unit.unitRole || "unit"}
                  </div>

                  <div style={styles.unitNameWrap}>
                    <div style={styles.unitName}>
                      {unit.name || unit.id || "unit name"}
                    </div>

                    <button
                      type="button"
                      style={styles.removeButton}
                      onClick={() => onRemoveUnitFromDivisionRule?.(unit.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {addMenuCategory === category && (
                <div style={styles.addMenu}>
                  {(availableUnitsToAddByCategory[category] || []).slice(0, 12).map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      style={styles.addMenuItem}
                      onClick={() => {
                        onAddUnitToDivisionRule?.(unit.id);
                        setAddMenuCategory(null);
                      }}
                    >
                      {unit.name}
                    </button>
                  ))}

                  {!(availableUnitsToAddByCategory[category] || []).length && (
                    <div style={styles.emptyAddMenu}>No units available</div>
                  )}
                </div>
              )}

              <button
                type="button"
                style={styles.addButton}
                onClick={() =>
                  setAddMenuCategory((current) =>
                    current === category ? null : category
                  )
                }
                disabled={!division.divisionRule}
              >
                +
              </button>
            </div>
          ))}
        </div>

        <div style={styles.previewSection}>
          <div style={styles.previewHeader}>Current Rule Preview</div>

          <div style={styles.diffRow}>
            <div style={styles.diffBox}>
              <div style={styles.diffTitle}>Added</div>
              {ruleDiff.added.length ? (
                ruleDiff.added.map((id) => (
                  <div key={id} style={styles.diffItem}>+ {id}</div>
                ))
              ) : (
                <div style={styles.diffEmpty}>No added units</div>
              )}
            </div>

            <div style={styles.diffBox}>
              <div style={styles.diffTitle}>Removed</div>
              {ruleDiff.removed.length ? (
                ruleDiff.removed.map((id) => (
                  <div key={id} style={styles.diffItem}>- {id}</div>
                ))
              ) : (
                <div style={styles.diffEmpty}>No removed units</div>
              )}
            </div>
          </div>

          <pre style={styles.previewCode}>
            {currentRulePreview || "// No active division rule selected"}
          </pre>
        </div>

        {showCountryEditor && (
          <div style={styles.modal}>
            <div style={styles.modalCard}>
              <CountryBuilder
                uiSpecificCountriesText={project.files.uiSpecificCountriesText}
                onCancel={() => setShowCountryEditor(false)}
                onSave={(customCountry) => {
                  setProject((prev) => ({
                    ...prev,
                    customCountries: [...(prev.customCountries || []), customCountry],
                    division: {
                      ...prev.division,
                      countryId: customCountry.countryTag,
                    },
                  }));

                  setShowCountryEditor(false);
                }}
              />
            </div>
          </div>
        )}

        {showDivisionEditor && (
          <div style={styles.modal}>
            <div style={styles.modalCard}>
              <CustomDivisionBuilder
                divisionsText={project.files.divisionsText}
                localizationText={project.files.localizationText}
                uiSpecificCountriesText={project.files.uiSpecificCountriesText}
                customCountries={project.customCountries || []}
                customDivisions={project.customDivisions || []}
                onCancel={() => setShowDivisionEditor(false)}
                onSave={(customDivision) => {
                  setProject((prev) => ({
                    ...prev,
                    customDivisions: [
                      ...(prev.customDivisions || []),
                      customDivision,
                    ],
                    division: {
                      ...prev.division,
                      countryId: customDivision.countryId,
                      baseDivision: customDivision.id,
                      divisionRule: customDivision.divisionRule || "",
                      deckBudget: customDivision.deckBudget,
                    },
                  }));

                  setShowDivisionEditor(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b0b0b",
    color: "#ffffff",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  title: {
    marginBottom: "24px",
    color: "#ffffff",
  },
  topBar: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(160px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
    alignItems: "end",
  },
  actionBar: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
  },
  fieldBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "bold",
  },
  input: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #666",
    background: "#111",
    color: "#fff",
  },
  select: {
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #666",
    background: "#111",
    color: "#fff",
  },
  exportBox: {
    display: "flex",
    alignItems: "end",
  },
  exportButton: {
    width: "100%",
    padding: "14px",
    borderRadius: "12px",
    border: "1px solid #888",
    background: "#111",
    color: "#fff",
    fontWeight: "bold",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "10px 14px",
    borderRadius: "10px",
    border: "1px solid #888",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, minmax(120px, 1fr))",
    gap: "0",
    border: "1px solid #888",
    marginBottom: "24px",
  },
  column: {
    borderRight: "1px solid #888",
    minHeight: "260px",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  columnHeader: {
    borderBottom: "1px solid #888",
    padding: "8px",
    textAlign: "center",
    fontWeight: "bold",
  },
  unitCard: {
    display: "grid",
    gridTemplateColumns: "56px 1fr",
    borderBottom: "1px solid #666",
    minHeight: "58px",
  },
  unitIcon: {
    borderRight: "1px solid #666",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "11px",
    padding: "4px",
    textAlign: "center",
  },
  unitNameWrap: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "6px",
    gap: "6px",
  },
  unitName: {
    fontSize: "12px",
    textAlign: "center",
  },
  removeButton: {
    border: "1px solid #666",
    background: "#1a1a1a",
    color: "#fff",
    fontSize: "11px",
    cursor: "pointer",
    padding: "4px 6px",
    borderRadius: "6px",
  },
  addButton: {
    marginTop: "auto",
    border: "none",
    borderTop: "1px solid #666",
    background: "#111",
    color: "#fff",
    fontSize: "20px",
    cursor: "pointer",
    padding: "8px",
  },
  addMenu: {
    borderTop: "1px solid #666",
    background: "#161616",
    maxHeight: "220px",
    overflowY: "auto",
  },
  addMenuItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    color: "#fff",
    border: "none",
    borderBottom: "1px solid #333",
    padding: "8px",
    cursor: "pointer",
    fontSize: "12px",
  },
  emptyAddMenu: {
    padding: "10px",
    fontSize: "12px",
    color: "#aaa",
  },
  previewSection: {
    border: "1px solid #666",
    borderRadius: "12px",
    background: "#101010",
    overflow: "hidden",
  },
  previewHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid #666",
    fontWeight: "bold",
  },
  diffRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0",
    borderBottom: "1px solid #666",
  },
  diffBox: {
    padding: "12px 16px",
    borderRight: "1px solid #666",
  },
  diffTitle: {
    fontWeight: "bold",
    marginBottom: "8px",
  },
  diffItem: {
    fontSize: "12px",
    marginBottom: "4px",
    fontFamily: "monospace",
  },
  diffEmpty: {
    fontSize: "12px",
    color: "#aaa",
  },
  previewCode: {
    margin: 0,
    padding: "16px",
    background: "#0d0d0d",
    color: "#d8d8d8",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    fontSize: "12px",
    lineHeight: 1.5,
    fontFamily: "monospace",
  },
  modal: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    zIndex: 1000,
  },
  modalCard: {
    width: "720px",
    maxWidth: "95vw",
    maxHeight: "85vh",
    overflowY: "auto",
    background: "#111",
    border: "1px solid #666",
    borderRadius: "14px",
    padding: "20px",
  },
};