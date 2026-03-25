/**
 * useImages.js
 *
 * Centralised image resolution for flags, division emblems, and unit portraits.
 *
 * Vite's import.meta.glob eagerly imports every PNG under /waranon/images at
 * build time, producing a map of { "/waranon/images/flags/BEL_FLAG.png": url }.
 * We then expose three simple lookup functions so the rest of the app never
 * has to construct paths manually.
 *
 * Custom images (uploaded by the user as File objects) are handled separately —
 * pass the object URL produced by URL.createObjectURL() directly wherever an
 * <img src> is needed.
 */

// ── Vite glob imports ────────────────────────────────────────────────────────
// Each returns { [absolutePath]: resolvedUrl }

const flagModules = import.meta.glob(
  "/images/flags/*.png",
  { eager: true, import: "default" }
);

const divisionModules = import.meta.glob(
  "/images/divisions/*.png",
  { eager: true, import: "default" }
);

const unitModules = import.meta.glob(
  "/images/units/*.png",
  { eager: true, import: "default" }
);

// ── Normalise to lowercase-keyed filename→url maps ───────────────────────────
// Keyed by bare filename (no path, no extension) in lowercase for
// case-insensitive lookups.

function buildIndex(modules) {
  const index = {};
  for (const [path, url] of Object.entries(modules)) {
    const bare = path.split("/").pop().replace(/\.png$/i, "").toLowerCase();
    index[bare] = url;
  }
  return index;
}

const flagIndex     = buildIndex(flagModules);
const divisionIndex = buildIndex(divisionModules);
const unitIndex     = buildIndex(unitModules);

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Resolve a country flag image URL.
 *
 * Resolution order:
 *  1. customFlagUrl  – object URL from a user-uploaded File (custom countries)
 *  2. flagFileName   – the bare filename stored in the texture bank, e.g. "BEL_FLAG"
 *  3. Fallback: derive from countryTag → "<TAG>_FLAG"
 *
 * Returns null if nothing is found.
 *
 * @param {object} params
 * @param {string} [params.countryTag]    e.g. "BEL"
 * @param {string} [params.flagFileName]  e.g. "BEL_FLAG.png" or "BEL_FLAG"
 * @param {string} [params.customFlagUrl] object URL from URL.createObjectURL()
 */
export function resolveFlagUrl({ countryTag, flagFileName, customFlagUrl } = {}) {
  if (customFlagUrl) return customFlagUrl;

  if (flagFileName) {
    const key = flagFileName.replace(/\.png$/i, "").toLowerCase();
    if (flagIndex[key]) return flagIndex[key];
  }

  if (countryTag) {
    const key = `${countryTag}_flag`.toLowerCase();
    if (flagIndex[key]) return flagIndex[key];
  }

  return null;
}

/**
 * Resolve a division emblem image URL.
 *
 * The game stores emblem texture names like:
 *   Texture_Division_Emblem_BEL_16e_Meca
 * and file names like:
 *   BEL_16e_Meca.png
 *
 * Resolution order:
 *  1. customEmblemUrl – object URL from a user-uploaded File (custom divisions)
 *  2. emblemTexture   – full texture name, e.g. "Texture_Division_Emblem_BEL_16e_Meca"
 *                       → strips "Texture_Division_Emblem_" prefix → "BEL_16e_Meca"
 *  3. cfgName         – e.g. "BEL_16e_Meca_multi" (also tried as-is)
 *
 * Returns null if nothing is found.
 *
 * @param {object} params
 * @param {string} [params.emblemTexture]   e.g. "Texture_Division_Emblem_BEL_16e_Meca"
 * @param {string} [params.cfgName]         e.g. "BEL_16e_Meca_multi"
 * @param {string} [params.customEmblemUrl] object URL from URL.createObjectURL()
 */
export function resolveEmblemUrl({ emblemTexture, cfgName, customEmblemUrl } = {}) {
  if (customEmblemUrl) return customEmblemUrl;

  if (emblemTexture) {
    // Try with the Texture_Division_Emblem_ prefix stripped
    const stripped = emblemTexture
      .replace(/^Texture_Division_Emblem_/i, "")
      .toLowerCase();
    if (divisionIndex[stripped]) return divisionIndex[stripped];

    // Also try the full name as-is
    const full = emblemTexture.toLowerCase();
    if (divisionIndex[full]) return divisionIndex[full];
  }

  if (cfgName) {
    const key = cfgName.toLowerCase();
    if (divisionIndex[key]) return divisionIndex[key];
  }

  return null;
}

/**
 * Resolve a unit portrait image URL.
 *
 * The game uses ClassNameForDebug as the portrait filename, e.g.:
 *   ClassNameForDebug = 'Unit_2K11_KRUG_DDR'  →  Unit_2K11_KRUG_DDR.png
 *
 * Resolution order:
 *  1. customPortraitUrl – object URL from a user-uploaded File (custom units)
 *  2. className         – ClassNameForDebug value, e.g. "Unit_2K11_KRUG_DDR"
 *  3. unitId            – descriptor ID as fallback
 *
 * Returns null if nothing is found.
 *
 * @param {object} params
 * @param {string} [params.className]        ClassNameForDebug value
 * @param {string} [params.unitId]           Descriptor export name
 * @param {string} [params.customPortraitUrl] object URL from URL.createObjectURL()
 */
export function resolveUnitPortraitUrl({ className, unitId, customPortraitUrl } = {}) {
  if (customPortraitUrl) return customPortraitUrl;

  if (className) {
    const key = className.toLowerCase();
    if (unitIndex[key]) return unitIndex[key];
  }

  if (unitId) {
    const key = unitId.toLowerCase();
    if (unitIndex[key]) return unitIndex[key];
  }

  return null;
}