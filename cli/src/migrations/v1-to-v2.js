/**
 * Migration v1 -> v2: Remap entity keys from tableName-based to tabName-based.
 *
 * Old format (v1): entity keys derived from toCamelCase(tableName)
 *   e.g., { "cOrder": {...}, "cOrderLine": {...} }
 *
 * New format (v2): entity keys derived from toCamelCase(tabName)
 *   e.g., { "header": {...}, "lines": {...} }
 *
 * Requires context.schemaRaw to build the mapping.
 * If schemaRaw is not available, returns decisions unchanged (migration skipped
 * but version is still bumped so it does not re-run).
 */

import { toCamelCase } from '../utils.js';

/**
 * Strip common lowercase prefixes (c, m, ad) if followed by an uppercase letter.
 * Mirrors the logic in resolve-curated.js autoSimplifyEntityName.
 */
function autoSimplifyEntityName(rawName) {
  if (!rawName) return rawName;
  // Replace slashes with camelCase join: "vendor/creditor" → "vendorCreditor"
  let name = rawName.includes('/')
    ? rawName.split('/').map((seg, i) => i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1)).join('')
    : rawName;
  const match = name.match(/^(c|m|ad)([A-Z].*)$/);
  if (match) {
    const rest = match[2];
    return rest.charAt(0).toLowerCase() + rest.slice(1);
  }
  return name;
}

/**
 * Migrate decisions from v1 (tableName-based entity keys) to v2 (tabName-based).
 *
 * @param {Object} decisions - v1 decisions object (deep-cloned by the runner)
 * @param {Object} [context={}] - optional context with schemaRaw
 * @returns {Object} migrated decisions
 */
export function migrate(decisions, context = {}) {
  const schemaRaw = context.schemaRaw;

  // If no schemaRaw available, skip entity remapping silently.
  // The resolve-curated fallback matching handles unmigrated keys at runtime.
  if (!schemaRaw || !schemaRaw.entities || !decisions.entities) {
    return decisions;
  }

  // Build mapping: oldKey -> newKey
  // For each raw entity, determine what the old v1 key would have been
  // and what the new v2 key should be.
  const keyMap = {}; // oldKey -> newKey

  for (const rawEntity of schemaRaw.entities) {
    if (!rawEntity.tabName || !rawEntity.tableName) continue;

    const newKey = autoSimplifyEntityName(toCamelCase(rawEntity.tabName));
    const tableBasedKey = toCamelCase(rawEntity.tableName);
    const simplifiedKey = autoSimplifyEntityName(tableBasedKey);

    // Try to match against existing decision keys
    // Check: exact tableName-based key (e.g., "cOrder")
    // Skip if already mapped (multiple tabs can share the same table, e.g. C_BPartner)
    if (decisions.entities[tableBasedKey] && !keyMap[tableBasedKey]) {
      keyMap[tableBasedKey] = newKey;
    }
    // Check: simplified key (e.g., "order") from previous autoSimplify
    else if (decisions.entities[simplifiedKey] && simplifiedKey !== tableBasedKey && !keyMap[simplifiedKey]) {
      keyMap[simplifiedKey] = newKey;
    }
    // If the key already matches the new format, no remapping needed
  }

  // Skip if no remapping needed
  if (Object.keys(keyMap).length === 0) {
    return decisions;
  }

  // Check for collisions: two old keys mapping to the same new key
  const newKeys = Object.values(keyMap);
  const uniqueNew = new Set(newKeys);
  if (uniqueNew.size !== newKeys.length) {
    console.warn('  WARN: Entity key collision detected in v1->v2 migration — skipping remapping');
    return decisions;
  }

  // Build full remap (including simplified → newKey for window-level references)
  const allRemap = {};
  for (const [oldKey, newKey] of Object.entries(keyMap)) {
    allRemap[oldKey] = newKey;
    const simplified = autoSimplifyEntityName(oldKey);
    if (simplified !== oldKey) allRemap[simplified] = newKey;
  }

  // Remap entity keys
  const newEntities = {};
  for (const [oldKey, value] of Object.entries(decisions.entities)) {
    const newKey = keyMap[oldKey] || oldKey;
    newEntities[newKey] = value;
  }
  decisions.entities = newEntities;

  // Remap window-level entity references
  if (decisions.window) {
    if (decisions.window.detailEntity && allRemap[decisions.window.detailEntity]) {
      decisions.window.detailEntity = allRemap[decisions.window.detailEntity];
    }
    if (decisions.window.secondaryTabs) {
      const newTabs = {};
      for (const [tabKey, tabVal] of Object.entries(decisions.window.secondaryTabs)) {
        const newTabKey = allRemap[tabKey] || tabKey;
        newTabs[newTabKey] = tabVal;
      }
      decisions.window.secondaryTabs = newTabs;
    }
  }

  return decisions;
}
