import { useMemo, useState } from "react";
import CountryBuilder from "./CountryBuilder";
import CustomDivisionBuilder from "./CustomDivisionBuilder";
import { exportMod } from "../logic/exportMod";
import { parseCountriesInfoEntries, parseTextureEntries } from "../generators/country";
import { parseDivisionEntries } from "../generators/divisions";
import { buildLocalizationMap } from "../generators/localization";
import {
  parseDivisionRuleEntries,
  findDivisionRuleById,
  serializeDivisionRule,
  diffDivisionRules,
} from "../generators/divisionRules";
import { parseUnitEntries, buildUnitsByCategory } from "../generators/units";
import {
  resolveFlagUrl,
  resolveEmblemUrl,
  resolveUnitPortraitUrl,
} from "../hooks/useImages";

const categories = ["log", "inf", "art", "tnk", "rec", "aa", "hel", "air"];

function createEmptyCategories() {
  return { log: [], inf: [], art: [], tnk: [], rec: [], aa: [], hel: [], air: [] };
}

// ── Tiny image sub-components ────────────────────────────────────────────────

function FlagImg({ src, alt, size = 20 }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || ""}
      className="db-flag-img"
      style={{ width: size, height: Math.round(size * 0.67), objectFit: "cover" }}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

function EmblemImg({ src, alt, size = 20 }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt || ""}
      className="db-emblem-img"
      style={{ width: size, height: size, objectFit: "contain" }}
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

function UnitPortrait({ src, alt }) {
  if (!src) {
    return <div className="db-unit-portrait db-unit-portrait--empty" />;
  }
  return (
    <img
      src={src}
      alt={alt || ""}
      className="db-unit-portrait"
      onError={(e) => {
        e.currentTarget.replaceWith(Object.assign(document.createElement("div"), {
          className: "db-unit-portrait db-unit-portrait--empty",
        }));
      }}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────────────

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

  // ── Parsed data ────────────────────────────────────────────────────────────

  const localizationMap = useMemo(() => {
    try { return buildLocalizationMap(project.files.localizationText); }
    catch { return {}; }
  }, [project.files.localizationText]);

  const parsedCountries = useMemo(() => {
    const text = project.files.uiSpecificCountriesText;
    if (!text) return [];
    try { return parseCountriesInfoEntries(text); }
    catch { return []; }
  }, [project.files.uiSpecificCountriesText]);

  // Texture bank gives us the actual PNG filename for each flag texture token
  const parsedTextures = useMemo(() => {
    const text = project.files.uiSpecificCountriesText;
    if (!text) return [];
    try { return parseTextureEntries(text); }
    catch { return []; }
  }, [project.files.uiSpecificCountriesText]);

  // Map: countryTag → bare flag filename, e.g. "BEL" → "BEL_FLAG.png"
  const countryFlagFileMap = useMemo(() => {
    const map = {};
    for (const country of parsedCountries) {
      const texture = parsedTextures.find((t) => t.textureToken === country.flagTextureToken);
      if (texture?.fileName) {
        map[country.tag] = texture.fileName.split("/").pop();
      }
    }
    // Also cover custom countries that supply a flagPreviewUrl directly
    for (const cc of (project.customCountries || [])) {
      if (cc.flagPreviewUrl) map[cc.countryTag] = "__custom__";
    }
    return map;
  }, [parsedCountries, parsedTextures, project.customCountries]);

  const parsedDivisions = useMemo(() => {
    const text = project.files.divisionsText;
    if (!text) return [];
    try { return parseDivisionEntries(text); }
    catch { return []; }
  }, [project.files.divisionsText]);

  const parsedDivisionRules = useMemo(() => {
    const text = project.files.divisionRulesText;
    if (!text) return [];
    try { return parseDivisionRuleEntries(text); }
    catch { return []; }
  }, [project.files.divisionRulesText]);

  const parsedUnits = useMemo(() => {
    const text = project.files.unitsText;
    if (!text) return [];
    try { return parseUnitEntries(text); }
    catch { return []; }
  }, [project.files.unitsText]);

  // ── Derived selections ─────────────────────────────────────────────────────

  const filteredDivisions = useMemo(() => {
    if (!division.countryId) return [];
    return parsedDivisions.filter((e) => e.countryId === division.countryId);
  }, [parsedDivisions, division.countryId]);

  const filteredCustomDivisions = useMemo(() => {
    if (!division.countryId) return [];
    return (project.customDivisions || []).filter((e) => e.countryId === division.countryId);
  }, [project.customDivisions, division.countryId]);

  const allDivisionRules = useMemo(() => divisionRules.length ? divisionRules : [], [divisionRules]);

  const selectedBaseDivisionEntry = useMemo(() => {
    const base   = parsedDivisions.find((e) => e.id === division.baseDivision) || null;
    const custom = (project.customDivisions || []).find((e) => e.id === division.baseDivision) || null;
    return custom || base;
  }, [parsedDivisions, project.customDivisions, division.baseDivision]);

  const activeRuleEntry = useMemo(
    () => findDivisionRuleById(allDivisionRules, division.divisionRule),
    [allDivisionRules, division.divisionRule]
  );

  const baseRuleEntry = useMemo(() => {
    const baseRuleId = selectedBaseDivisionEntry?.divisionRule || "";
    return findDivisionRuleById(parsedDivisionRules, baseRuleId);
  }, [parsedDivisionRules, selectedBaseDivisionEntry]);

  const derivedUnitsByCategory = useMemo(() => {
    if (!activeRuleEntry) return createEmptyCategories();
    return buildUnitsByCategory({
      selectedDivision: { divisionRule: activeRuleEntry.id },
      divisionRules: allDivisionRules,
      units: parsedUnits,
      localizationMap,
    });
  }, [activeRuleEntry, allDivisionRules, parsedUnits, localizationMap]);

  const allUnitsByCategory = useMemo(() => {
    const buckets = createEmptyCategories();
    for (const unit of parsedUnits) {
      const built = buildUnitsByCategory({
        selectedDivision: { divisionRule: "__temp__" },
        divisionRules: [{ id: "__temp__", unitIds: [unit.id] }],
        units: parsedUnits,
        localizationMap,
      });
      for (const cat of categories) {
        if (built[cat]?.length) {
          buckets[cat].push({
            id: unit.id,
            name: localizationMap[unit.nameToken] || unit.className || unit.id,
            unitRole: unit.unitRole,
            factoryType: unit.factoryType,
            className: unit.className,
          });
        }
      }
    }
    return buckets;
  }, [parsedUnits, localizationMap]);

  const availableUnitsToAddByCategory = useMemo(() => {
    const currentIds = new Set(activeRuleEntry?.unitIds || []);
    const result = createEmptyCategories();
    for (const cat of categories) {
      result[cat] = (allUnitsByCategory[cat] || []).filter((u) => !currentIds.has(u.id));
    }
    return result;
  }, [allUnitsByCategory, activeRuleEntry]);

  const currentRulePreview = useMemo(() => serializeDivisionRule(activeRuleEntry), [activeRuleEntry]);
  const ruleDiff = useMemo(() => diffDivisionRules(baseRuleEntry, activeRuleEntry), [baseRuleEntry, activeRuleEntry]);

  // ── Image helpers ──────────────────────────────────────────────────────────

  function getFlagUrl(countryTag) {
    const customCountry = (project.customCountries || []).find((c) => c.countryTag === countryTag);
    return resolveFlagUrl({
      countryTag,
      flagFileName: countryFlagFileMap[countryTag],
      customFlagUrl: customCountry?.flagPreviewUrl || null,
    });
  }

  function getDivisionEmblemUrl(divisionEntry) {
    if (!divisionEntry) return null;
    const customDiv = (project.customDivisions || []).find((d) => d.id === divisionEntry.id);
    return resolveEmblemUrl({
      emblemTexture: divisionEntry.emblemTexture,
      cfgName: divisionEntry.cfgName,
      customEmblemUrl: customDiv?.emblemPreviewUrl || null,
    });
  }

  // ── Field updates ──────────────────────────────────────────────────────────

  function updateDivisionField(field, value) {
    setProject((prev) => ({ ...prev, division: { ...prev.division, [field]: value } }));
  }

  function getDivisionFriendlyName(entry) {
    return localizationMap[entry.divisionNameToken] || entry.cfgName || entry.exportName || entry.id || "Unknown Division";
  }

  function handleCountryChange(value) {
    if (value === "__ADD_CUSTOM_COUNTRY__") { setShowCountryEditor(true); return; }
    setProject((prev) => ({
      ...prev,
      division: { ...prev.division, countryId: value, baseDivision: "", divisionRule: "" },
    }));
  }

  function handleBaseDivisionChange(value) {
    if (value === "__ADD_CUSTOM_DIVISION__") { setShowDivisionEditor(true); return; }
    if (!value) {
      setProject((prev) => ({ ...prev, division: { ...prev.division, baseDivision: "", divisionRule: "" } }));
      return;
    }
    const entry =
      parsedDivisions.find((e) => e.id === value) ||
      (project.customDivisions || []).find((e) => e.id === value);
    setProject((prev) => ({
      ...prev,
      division: { ...prev.division, baseDivision: value, divisionRule: entry?.divisionRule || "" },
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

  // Pre-resolve images for the currently selected country / division
  const selectedCountryFlagUrl = division.countryId ? getFlagUrl(division.countryId) : null;
  const selectedDivisionEmblemUrl = getDivisionEmblemUrl(selectedBaseDivisionEntry);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="db-page">

      {/* ── Header ── */}
      <header className="db-header">
        <div className="db-header-badge">⊞</div>
        <span className="db-header-title">Division Rules Builder</span>
        <span className="db-header-sep" />
        <span className="db-header-sub">warno-mod-tools</span>
        <div className="db-header-actions">
          <button type="button" className="db-btn db-btn-primary" onClick={handleExport}>
            ↓ Export Mod
          </button>
        </div>
      </header>

      <main className="db-main">

        {/* ── Control bar ── */}
        <div className="db-control-bar">

          <div className="db-field">
            <label className="db-label">Division Alliance</label>
            <select
              className="db-select"
              value={division.alliance}
              onChange={(e) => updateDivisionField("alliance", e.target.value)}
            >
              <option value="NATO">NATO</option>
              <option value="PACT">PACT</option>
            </select>
          </div>

          {/* Country with flag icon */}
          <div className="db-field">
            <label className="db-label">Division Country</label>
            <div className="db-select-with-icon">
              <FlagImg src={selectedCountryFlagUrl} alt={division.countryId} size={18} />
              <select
                className={`db-select${selectedCountryFlagUrl ? " db-select--has-icon" : ""}`}
                value={division.countryId}
                onChange={(e) => handleCountryChange(e.target.value)}
              >
                <option value="">Select country</option>
                {parsedCountries.map((c) => (
                  <option key={c.tag} value={c.tag}>{c.tag} ({c.coalition})</option>
                ))}
                {(project.customCountries || []).map((c) => (
                  <option key={c.countryTag} value={c.countryTag}>{c.countryTag} (custom)</option>
                ))}
                <option value="__ADD_CUSTOM_COUNTRY__">+ Add Custom Country</option>
              </select>
            </div>
          </div>

          {/* Base Division with emblem icon */}
          <div className="db-field">
            <label className="db-label">Base Division</label>
            <div className="db-select-with-icon">
              <EmblemImg src={selectedDivisionEmblemUrl} alt={division.baseDivision} size={18} />
              <select
                className={`db-select${selectedDivisionEmblemUrl ? " db-select--has-icon" : ""}`}
                value={division.baseDivision || ""}
                onChange={(e) => handleBaseDivisionChange(e.target.value)}
                disabled={!division.countryId}
              >
                <option value="">
                  {division.countryId ? "Select division" : "Select country first"}
                </option>
                {filteredDivisions.map((e) => (
                  <option key={e.id} value={e.id}>{getDivisionFriendlyName(e)}</option>
                ))}
                {filteredCustomDivisions.map((e) => (
                  <option key={e.id} value={e.id}>{e.cfgName || e.id} (custom)</option>
                ))}
                <option value="__ADD_CUSTOM_DIVISION__">+ Add Custom Division</option>
              </select>
            </div>
          </div>

          <div className="db-field">
            <label className="db-label">Active Rule</label>
            <input type="text" className="db-input" value={division.divisionRule || ""} readOnly placeholder="—" />
          </div>

        </div>

        {/* ── Action bar ── */}
        <div className="db-action-bar">
          <button
            type="button"
            className="db-btn db-btn-secondary"
            onClick={onClearDivisionRule}
            disabled={!division.divisionRule}
          >
            Clear Division
          </button>
          {selectedBaseDivisionEntry?.divisionRule && (
            <button
              type="button"
              className="db-btn db-btn-secondary"
              onClick={() =>
                onCreateDivisionRuleFromBase?.({
                  newRuleId: division.divisionRule || selectedBaseDivisionEntry.divisionRule,
                  baseRuleId: selectedBaseDivisionEntry.divisionRule,
                })
              }
            >
              ↺ Reload From Base
            </button>
          )}
        </div>

        {/* ── Unit grid ── */}
        <div className="db-grid">
          {categories.map((cat) => (
            <div key={cat} className="db-column">
              <div className="db-column-header">{cat}</div>

              {(derivedUnitsByCategory[cat] || []).map((unit) => {
                const portraitUrl = resolveUnitPortraitUrl({
                  className: unit.className,
                  unitId: unit.id,
                });
                return (
                  <div key={unit.id} className="db-unit-card">
                    <div className="db-unit-icon">
                      <UnitPortrait src={portraitUrl} alt={unit.name} />
                    </div>
                    <div className="db-unit-body">
                      <div className="db-unit-name">{unit.name || unit.id}</div>
                      <button
                        type="button"
                        className="db-unit-remove"
                        onClick={() => onRemoveUnitFromDivisionRule?.(unit.id)}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                );
              })}

              {addMenuCategory === cat && (
                <div className="db-add-menu">
                  {(availableUnitsToAddByCategory[cat] || []).slice(0, 12).map((unit) => {
                    const portraitUrl = resolveUnitPortraitUrl({
                      className: unit.className,
                      unitId: unit.id,
                    });
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        className="db-add-menu-item"
                        onClick={() => {
                          onAddUnitToDivisionRule?.(unit.id);
                          setAddMenuCategory(null);
                        }}
                      >
                        {portraitUrl && (
                          <img
                            src={portraitUrl}
                            alt=""
                            className="db-add-menu-portrait"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        )}
                        {unit.name}
                      </button>
                    );
                  })}
                  {!(availableUnitsToAddByCategory[cat] || []).length && (
                    <div className="db-add-menu-empty">No units available</div>
                  )}
                </div>
              )}

              <button
                type="button"
                className="db-add-btn"
                onClick={() => setAddMenuCategory((cur) => cur === cat ? null : cat)}
                disabled={!division.divisionRule}
                title="Add unit"
              >
                +
              </button>
            </div>
          ))}
        </div>

        {/* ── Preview ── */}
        <div className="db-preview">
          <div className="db-preview-header">Current Rule Preview</div>
          <div className="db-diff-row">
            <div className="db-diff-box">
              <div className="db-diff-title">Added</div>
              {ruleDiff.added.length
                ? ruleDiff.added.map((id) => <div key={id} className="db-diff-item-added">+ {id}</div>)
                : <div className="db-diff-empty">No added units</div>}
            </div>
            <div className="db-diff-box">
              <div className="db-diff-title">Removed</div>
              {ruleDiff.removed.length
                ? ruleDiff.removed.map((id) => <div key={id} className="db-diff-item-removed">− {id}</div>)
                : <div className="db-diff-empty">No removed units</div>}
            </div>
          </div>
          <pre className="db-code">
            {currentRulePreview || "// No active division rule selected"}
          </pre>
        </div>

      </main>

      {/* ── Modals ── */}
      {showCountryEditor && (
        <div className="db-modal-backdrop">
          <div className="db-modal-card">
            <CountryBuilder
              uiSpecificCountriesText={project.files.uiSpecificCountriesText}
              onCancel={() => setShowCountryEditor(false)}
              onSave={(customCountry) => {
                setProject((prev) => ({
                  ...prev,
                  customCountries: [...(prev.customCountries || []), customCountry],
                  division: { ...prev.division, countryId: customCountry.countryTag },
                }));
                setShowCountryEditor(false);
              }}
            />
          </div>
        </div>
      )}

      {showDivisionEditor && (
        <div className="db-modal-backdrop">
          <div className="db-modal-card">
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
                  customDivisions: [...(prev.customDivisions || []), customDivision],
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
  );
}