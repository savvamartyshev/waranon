import { useMemo, useState } from "react";
import { parseCountriesInfoEntries } from "../generators/country";
import { buildLocalizationMap } from "../generators/localization";

function buildEditedUnitNameToken(unitId) {
  const cleaned = String(unitId || "UNIT")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  return `UN_${cleaned}`.slice(0, 24);
}

function numberOrEmpty(value) {
  return value === null || value === undefined ? "" : String(value);
}

function toNullableNumber(value) {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function Field({ label, value, onChange, type = "text", step = "any" }) {
  return (
    <div>
      <label style={{ display: "block", marginBottom: 4 }}>{label}</label>
      <input
        type={type}
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: 8 }}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #444",
        borderRadius: 12,
        padding: 16,
        background: "#121212",
        marginBottom: 16,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 12 }}>{title}</div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

export default function UnitEditor({
  unit,
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

  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [countryId, setCountryId] = useState(
    existingCustomUnit?.countryId || unit?.countryId || ""
  );

  const [unitConcealmentBonus, setUnitConcealmentBonus] = useState(
    numberOrEmpty(existingCustomUnit?.unitConcealmentBonus ?? unit?.unitConcealmentBonus)
  );
  const [dangerousness, setDangerousness] = useState(
    numberOrEmpty(existingCustomUnit?.dangerousness ?? unit?.dangerousness)
  );

  const [maxPhysicalDamages, setMaxPhysicalDamages] = useState(
    numberOrEmpty(existingCustomUnit?.maxPhysicalDamages ?? unit?.maxPhysicalDamages)
  );

  const [maxSpeedInKmph, setMaxSpeedInKmph] = useState(
    numberOrEmpty(existingCustomUnit?.maxSpeedInKmph ?? unit?.maxSpeedInKmph)
  );
  const [speedBonusFactorOnRoad, setSpeedBonusFactorOnRoad] = useState(
    numberOrEmpty(existingCustomUnit?.speedBonusFactorOnRoad ?? unit?.speedBonusFactorOnRoad)
  );
  const [maxAccelerationGRU, setMaxAccelerationGRU] = useState(
    numberOrEmpty(existingCustomUnit?.maxAccelerationGRU ?? unit?.maxAccelerationGRU)
  );
  const [maxDecelerationGRU, setMaxDecelerationGRU] = useState(
    numberOrEmpty(existingCustomUnit?.maxDecelerationGRU ?? unit?.maxDecelerationGRU)
  );
  const [tempsDemiTour, setTempsDemiTour] = useState(
    numberOrEmpty(existingCustomUnit?.tempsDemiTour ?? unit?.tempsDemiTour)
  );
  const [engineCooldownTime, setEngineCooldownTime] = useState(
    numberOrEmpty(existingCustomUnit?.engineCooldownTime ?? unit?.engineCooldownTime)
  );
  const [fuelCapacity, setFuelCapacity] = useState(
    numberOrEmpty(existingCustomUnit?.fuelCapacity ?? unit?.fuelCapacity)
  );
  const [fuelMoveDuration, setFuelMoveDuration] = useState(
    numberOrEmpty(existingCustomUnit?.fuelMoveDuration ?? unit?.fuelMoveDuration)
  );
  const [displayRoadSpeedInKmph, setDisplayRoadSpeedInKmph] = useState(
    numberOrEmpty(existingCustomUnit?.displayRoadSpeedInKmph ?? unit?.displayRoadSpeedInKmph)
  );

  const [visionStandard, setVisionStandard] = useState(
    numberOrEmpty(existingCustomUnit?.visionStandard ?? unit?.visionStandard)
  );
  const [visionLowAltitude, setVisionLowAltitude] = useState(
    numberOrEmpty(existingCustomUnit?.visionLowAltitude ?? unit?.visionLowAltitude)
  );
  const [visionHighAltitude, setVisionHighAltitude] = useState(
    numberOrEmpty(existingCustomUnit?.visionHighAltitude ?? unit?.visionHighAltitude)
  );

  const [opticalStandard, setOpticalStandard] = useState(
    numberOrEmpty(existingCustomUnit?.opticalStandard ?? unit?.opticalStandard)
  );
  const [opticalLowAltitude, setOpticalLowAltitude] = useState(
    numberOrEmpty(existingCustomUnit?.opticalLowAltitude ?? unit?.opticalLowAltitude)
  );
  const [opticalHighAltitude, setOpticalHighAltitude] = useState(
    numberOrEmpty(existingCustomUnit?.opticalHighAltitude ?? unit?.opticalHighAltitude)
  );

  const [buttonTexture, setButtonTexture] = useState(
    existingCustomUnit?.buttonTexture || unit?.buttonTexture || ""
  );
  const [buttonImageFile, setButtonImageFile] = useState(
    existingCustomUnit?.buttonImageFile || null
  );
  const [buttonImagePreviewUrl, setButtonImagePreviewUrl] = useState(
    existingCustomUnit?.buttonImagePreviewUrl || ""
  );

  const validationError = useMemo(() => {
    if (!unit?.id) return "No unit selected.";
    if (!countryId) return "Country is required.";
    if (!displayName.trim()) return "Unit name is required.";
    return "";
  }, [unit, countryId, displayName]);

  function handleButtonImageChange(file) {
    if (!file) {
      setButtonImageFile(null);
      setButtonImagePreviewUrl("");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".png")) {
      alert("Unit icon must be a PNG.");
      return;
    }

    setButtonImageFile(file);
    setButtonImagePreviewUrl(URL.createObjectURL(file));
  }

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

      className: unit.className,
      coalition:
        mergedCountries.find((c) => c.tag === countryId)?.coalition || unit.coalition,
      countryId,

      nameToken: existingCustomUnit?.nameToken || buildEditedUnitNameToken(unit.id),
      displayName: displayName.trim(),

      unitConcealmentBonus: toNullableNumber(unitConcealmentBonus),
      dangerousness: toNullableNumber(dangerousness),
      maxPhysicalDamages: toNullableNumber(maxPhysicalDamages),

      maxSpeedInKmph: toNullableNumber(maxSpeedInKmph),
      speedBonusFactorOnRoad: toNullableNumber(speedBonusFactorOnRoad),
      maxAccelerationGRU: toNullableNumber(maxAccelerationGRU),
      maxDecelerationGRU: toNullableNumber(maxDecelerationGRU),
      tempsDemiTour: toNullableNumber(tempsDemiTour),
      engineCooldownTime: toNullableNumber(engineCooldownTime),
      fuelCapacity: toNullableNumber(fuelCapacity),
      fuelMoveDuration: toNullableNumber(fuelMoveDuration),
      displayRoadSpeedInKmph: toNullableNumber(displayRoadSpeedInKmph),

      visionStandard: toNullableNumber(visionStandard),
      visionLowAltitude: toNullableNumber(visionLowAltitude),
      visionHighAltitude: toNullableNumber(visionHighAltitude),

      opticalStandard: toNullableNumber(opticalStandard),
      opticalLowAltitude: toNullableNumber(opticalLowAltitude),
      opticalHighAltitude: toNullableNumber(opticalHighAltitude),

      buttonTexture,
      buttonImageFile,
      buttonImagePreviewUrl,
    };

    onSave(editedUnit);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Edit Unit</h2>

      <div style={{ marginBottom: 16, color: "#bbb" }}>
        <div><strong>Unit ID:</strong> {unit?.id}</div>
        <div><strong>Class:</strong> {unit?.className || "—"}</div>
        <div><strong>Factory:</strong> {unit?.factoryType || "—"}</div>
      </div>

      <Section title="General">
        <Field label="Unit Name" value={displayName} onChange={setDisplayName} />
        <div>
          <label style={{ display: "block", marginBottom: 4 }}>Country</label>
          <select
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            style={{ width: "100%", padding: 8 }}
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
      </Section>

      <Section title="Movement">
        <Field label="Max Speed In Kmph" value={maxSpeedInKmph} onChange={setMaxSpeedInKmph} type="number" />
        <Field label="Speed Bonus Factor On Road" value={speedBonusFactorOnRoad} onChange={setSpeedBonusFactorOnRoad} type="number" />
        <Field label="Max Acceleration GRU" value={maxAccelerationGRU} onChange={setMaxAccelerationGRU} type="number" />
        <Field label="Max Deceleration GRU" value={maxDecelerationGRU} onChange={setMaxDecelerationGRU} type="number" />
        <Field label="Temps Demi Tour" value={tempsDemiTour} onChange={setTempsDemiTour} type="number" />
        <Field label="Engine Cooldown Time" value={engineCooldownTime} onChange={setEngineCooldownTime} type="number" />
        <Field label="Fuel Capacity" value={fuelCapacity} onChange={setFuelCapacity} type="number" />
        <Field label="Fuel Move Duration" value={fuelMoveDuration} onChange={setFuelMoveDuration} type="number" />
        <Field label="Display Road Speed In Kmph" value={displayRoadSpeedInKmph} onChange={setDisplayRoadSpeedInKmph} type="number" />
      </Section>

      <Section title="Visibility">
        <Field label="Unit Concealment Bonus" value={unitConcealmentBonus} onChange={setUnitConcealmentBonus} type="number" />
        <Field label="Dangerousness" value={dangerousness} onChange={setDangerousness} type="number" />

        <Field label="Vision Standard" value={visionStandard} onChange={setVisionStandard} type="number" />
        <Field label="Vision Low Altitude" value={visionLowAltitude} onChange={setVisionLowAltitude} type="number" />
        <Field label="Vision High Altitude" value={visionHighAltitude} onChange={setVisionHighAltitude} type="number" />

        <Field label="Optical Standard" value={opticalStandard} onChange={setOpticalStandard} type="number" />
        <Field label="Optical Low Altitude" value={opticalLowAltitude} onChange={setOpticalLowAltitude} type="number" />
        <Field label="Optical High Altitude" value={opticalHighAltitude} onChange={setOpticalHighAltitude} type="number" />
      </Section>

      <Section title="Weapons / Damage">
        <Field label="Max Physical Damages" value={maxPhysicalDamages} onChange={setMaxPhysicalDamages} type="number" />
      </Section>

      <Section title="UI / Icon">
        <Field label="Button Texture Token" value={buttonTexture} onChange={setButtonTexture} />
        <div>
          <label style={{ display: "block", marginBottom: 4 }}>Custom Button PNG</label>
          <input
            type="file"
            accept=".png,image/png"
            onChange={(e) => handleButtonImageChange(e.target.files?.[0] || null)}
          />
        </div>

        {buttonImagePreviewUrl && (
          <div>
            <div style={{ marginBottom: 8 }}>Preview</div>
            <img
              src={buttonImagePreviewUrl}
              alt="Unit icon preview"
              style={{
                width: 96,
                height: 96,
                objectFit: "contain",
                border: "1px solid #555",
                background: "#1a1a1a",
                padding: 8,
              }}
            />
          </div>
        )}
      </Section>

      {validationError && (
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            border: "1px solid #7a2b2b",
            background: "#2a1111",
            color: "#ffb0b0",
            borderRadius: 10,
          }}
        >
          {validationError}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleSave}>
          Save Unit
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}