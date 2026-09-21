/**
 * Test-support helper: resolve the API key a NEO spec exposes for a given AD
 * column, straight from the window's generated `contract.json`.
 *
 * WHY THIS EXISTS (ETP-5381)
 * --------------------------
 * `NeoFieldFilter.filterRecord` SILENTLY DROPS any body key that is not part of
 * the spec's included fields — no error, no log, HTTP 200. So posting an
 * invoice line under a key that does not exist in the spec creates the line
 * with that column NULL and nothing anywhere reports it. That is exactly how
 * `C_OrderLine_ID` was lost on every sales-invoice import: the modals sent
 * `cOrderlineId`, the spec's key is `salesOrderLine`.
 *
 * Tests must therefore anchor the expected key to the spec, not to a literal
 * copied from the component under test — otherwise the test agrees with the
 * bug. `contract.json` is generated from the same `decisions.json` that
 * `push-to-neo.js` pushes into `ETGO_SF_FIELD.java_qualifier`, so it is the
 * closest source of truth available without a DB dependency.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACTS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * @param {string} windowSpec kebab-case artifact directory, e.g. 'sales-invoice'
 * @param {string} entity     contract entity name, e.g. 'lines'
 * @param {string} adColumn   AD column name, e.g. 'C_OrderLine_ID'
 * @returns {string} the spec's API key for that column
 */
export function apiKeyForColumn(windowSpec, entity, adColumn) {
  const contract = JSON.parse(
    readFileSync(join(ARTIFACTS_DIR, windowSpec, 'contract.json'), 'utf8'),
  );

  const keys = new Set();
  for (const contractName of ['frontendContract', 'backendContract']) {
    const fields = contract?.[contractName]?.entities?.[entity]?.fields || [];
    for (const field of fields) {
      if (field.column === adColumn && field.apiKey) keys.add(field.apiKey);
    }
  }

  if (keys.size !== 1) {
    throw new Error(
      `apiKeyForColumn: expected exactly one API key for ${windowSpec}/${entity}/${adColumn}, `
      + `found [${[...keys].join(', ')}]`,
    );
  }
  return [...keys][0];
}

/**
 * The invoice-line -> order-line foreign key, as exposed by the given window's
 * spec. Resolves to `salesOrderLine` today; anchored to the contract so a spec
 * rename cannot leave the modals posting a dead key.
 *
 * @param {string} windowSpec e.g. 'sales-invoice' | 'purchase-invoice'
 */
export function orderLineApiKey(windowSpec) {
  return apiKeyForColumn(windowSpec, 'lines', 'C_OrderLine_ID');
}
