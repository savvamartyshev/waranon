import { useMemo, useState } from "react";
import { parseCountriesInfoEntries } from "../generators/country";
import { buildLocalizationMap } from "../generators/localization";

function buildEditedUnitNameToken(unitId) {
  const cleaned = String(unitId || "UNIT")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  return `UN_${cleaned}`.slice(0, 24);
}

export default function UnitEditor({
  unit,
  unitsText,
  localizationText,
  uiSpecificCountriesText,
  customCountries = [],
  existingCustomUnit = null,
  onSave,
  onCancel,
}) {
  const localizationMap = useMemo(() => {
    try {
      return buildLocalizationMap(localizationText);
    } catch {
      return {};
    }
  }, [localizationText]);

  const builtInCountries = useMemo(() => {
    try {
      return parseCountriesInfoEntries(uiSpecificCountriesText);
    } catch {
      return [];
    }
  }, [uiSpecificCountriesText]);

  const mergedCountries = useMemo(() => {
    const builtIn = builtInCountries.map((country) => ({
      tag: country.tag,
      coalition: country.coalition,
      isCustom: false,
    }));

    const custom = customCountries.map((country) => ({
      tag: country.countryTag,
      coalition: country.coalition,
      isCustom: true,
    }));

    const seen = new Set();
    return [...builtIn, ...custom].filter((country) => {
      if (seen.has(country.tag)) return false;
      seen.add(country.tag);
      return true;
    });
  }, [builtInCountries, customCountries]);

  const currentDisplayName =
    existingCustomUnit?.displayName ||
    localizationMap[existingCustomUnit?.nameToken] ||
    localizationMap[unit?.nameToken] ||
    unit?.className ||
    unit?.id ||
    "";

  const [countryId, setCountryId] = useState(
    existingCustomUnit?.countryId || unit?.countryId || ""
  );
  const [displayName, setDisplayName] = useState(currentDisplayName);

  const validationError = useMemo(() => {
    if (!unit?.id) return "No unit selected.";
    if (!countryId) return "Country is required.";
    if (!displayName.trim()) return "Unit name is required.";
    return "";
  }, [unit, countryId, displayName]);

  function handleSave() {
    if (validationError) {
      alert(validationError);
      return;
    }

    const editedUnit = {
      id: unit.id,
      sourceType: "edited",
      baseUnitId: unit.id,
      baseUnit: unit,
      countryId,
      displayName: displayName.trim(),
      nameToken:
        existingCustomUnit?.nameToken || buildEditedUnitNameToken(unit.id),
    };

    onSave(editedUnit);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Edit Unit</h2>

      <div style={{ marginBottom: "14px", color: "#ccc", fontSize: "14px" }}>
        <div><strong>Unit ID:</strong> {unit?.id}</div>
        <div><strong>Class Name:</strong> {unit?.className || "—"}</div>
        <div><strong>Current Token:</strong> {unit?.nameToken || "—"}</div>
      </div>

      <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
        <div>
          <label>Unit Name</label>
          <br />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
            placeholder="Enter unit display name"
          />
        </div>

        <div>
          <label>Country</label>
          <br />
          <select
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            style={{ width: "100%", padding: "8px", marginTop: "4px" }}
          >
            <option value="">Select country</option>
            {mergedCountries.map((country) => (
              <option key={country.tag} value={country.tag}>
                {country.tag} ({country.coalition})
                {country.isCustom ? " (custom)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: "12px",
            border: "1px solid #666",
            borderRadius: "10px",
            background: "#0f0f0f",
          }}
        >
          <div style={{ marginBottom: "8px", fontWeight: "bold" }}>
            Edited Preview
          </div>
          <div><strong>Name:</strong> {displayName || "—"}</div>
          <div><strong>Country:</strong> {countryId || "—"}</div>
          <div>
            <strong>Name Token:</strong>{" "}
            {existingCustomUnit?.nameToken || buildEditedUnitNameToken(unit?.id)}
          </div>
        </div>

        {validationError && (
          <div
            style={{
              padding: "10px",
              borderRadius: "8px",
              background: "#2a1111",
              border: "1px solid #7a2b2b",
              color: "#ffaaaa",
            }}
          >
            {validationError}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={handleSave} disabled={Boolean(validationError)}>
          Save Unit
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}