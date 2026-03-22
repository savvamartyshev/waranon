import { v4 as uuidv4 } from 'uuid' // or use crypto.randomUUID()

export function createDivisionFromBase(baseDivision, overrides, existingDivisions) {
  const newDivision = structuredClone(baseDivision)

  // --- Core identity ---
  newDivision.id = crypto.randomUUID()
  newDivision.descriptorId = crypto.randomUUID()

  // --- Apply overrides LAST ---
  Object.assign(newDivision, overrides)

  // --- Enforce required uniqueness ---
  newDivision.cfgName = makeUnique(
    newDivision.cfgName,
    existingDivisions.map(d => d.cfgName)
  )

  newDivision.divisionName = enforceTokenLength(newDivision.divisionName, 10)
  newDivision.summaryToken = enforceTokenLength(newDivision.summaryToken, 10)
  newDivision.historyToken = enforceTokenLength(newDivision.historyToken, 10)

  // --- Interface Order ---
  newDivision.interfaceOrder =
    Math.max(0, ...existingDivisions.map(d => d.interfaceOrder || 0)) + 1

  // --- Country Tag Injection ---
  if (newDivision.tags) {
    newDivision.tags.countryTag = newDivision.countryId
  }

  // --- Rename linked systems ---
  newDivision.divisionRules.id = generateRuleName(newDivision.cfgName)
  newDivision.costMatrix.id = generateCostMatrixName(newDivision.cfgName)

  return newDivision
}
//unique name generator

function makeUnique(base, existingList) {
  let name = base
  let i = 1

  while (existingList.includes(name)) {
    name = `${base}_${i}`
    i++
  }

  return name
}

//token length enforcer
function enforceTokenLength(value, length) {
  if (!value || value.length !== length) {
    throw new Error(`Token must be exactly ${length} characters`)
  }
  return value
}

//rule+matrixnaming
function generateRuleName(cfgName) {
  return `Descriptor_Deck_Division_${cfgName}_Rule`
}

function generateCostMatrixName(cfgName) {
  return `MatrixCostName_${cfgName}`
}