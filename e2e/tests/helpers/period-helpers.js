/**
 * Live-backend integration-spec guard: fails fast, with a clear message,
 * when the accounting period for "today" is not OPEN for the document
 * base types a flow is about to exercise.
 *
 * Why this exists (ETP-4567): `c_periodcontrol` rows default to
 * `periodstatus='N'` (Never Opened) until manually opened from the Etendo
 * UI (see docs/etendo-ad/onboarding-gaps.md §C2). Without this guard, a
 * closed period makes the backend reject the receipt/shipment/invoice
 * confirm call with "The Period does not exist or it is not opened", but
 * the live-backend integration specs don't surface that — they just time
 * out ~10s later waiting for an unrelated UI element (e.g. "Ver factura"),
 * producing a confusing generic Playwright timeout instead of the real
 * cause. This check turns that into a <1s failure with an actionable
 * message, run BEFORE any page navigation.
 *
 * Deliberately NOT auto-opening the period here — that would mix test
 * "arrange" with a real accounting/business action. Opening a period is a
 * human decision made through the Etendo UI.
 *
 * This is a local-dev convenience, not a hard requirement: reuses the same
 * gradle.properties / env-var DB credential resolution as `cli/src/db.js`
 * (see docs/e2e-testing-guide.md). When the DB is unreachable (e.g. running
 * against a remote/deployed environment with no local Postgres access),
 * the check is skipped with a console warning instead of failing the suite.
 */

import { createDbPool, closePool } from '../../../cli/src/db.js';

export const DEFAULT_ORG_NAME = 'GOOrg';
export const DEFAULT_DOC_BASE_TYPES = ['SOO', 'POO', 'ARI', 'API', 'MMS', 'MMR'];

function formatDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Asserts that the accounting period covering "today" is open
 * (`periodstatus='O'`) for every requested doc base type, on the given org.
 *
 * @param {object} [options]
 * @param {string} [options.orgName='GOOrg'] - AD_Org.name to check (resolved
 *   by name, never a hardcoded/guessed AD_Org_ID).
 * @param {string[]} [options.docBaseTypes] - C_PeriodControl.docbasetype
 *   values the flow under test will exercise. Defaults to the sales +
 *   purchase + AR/AP invoice + inventory set used by the ETP-4567 flows.
 * @param {{query: Function}} [options.pool] - Injectable DB pool (test seam).
 *   When omitted, a real pool is created via `createDbPool()` and closed
 *   before returning.
 * @returns {Promise<void>} Resolves when the period is open for every
 *   requested doc base type, or when the DB check itself could not run
 *   (skipped with a console warning). Throws a clear `Error` when the DB is
 *   reachable but the period is closed for one or more doc base types.
 */
export async function assertPeriodOpen({
  orgName = DEFAULT_ORG_NAME,
  docBaseTypes = DEFAULT_DOC_BASE_TYPES,
  pool: injectedPool,
} = {}) {
  const pool = injectedPool || createDbPool();
  const shouldClosePool = !injectedPool;

  try {
    let result;
    try {
      result = await pool.query(
        `SELECT pc.docbasetype, pc.periodstatus, p.name AS period_name, p.startdate, p.enddate
         FROM c_periodcontrol pc
         JOIN c_period p ON p.c_period_id = pc.c_period_id
         JOIN ad_org o ON o.ad_org_id = pc.ad_org_id
         WHERE o.name = $1
           AND CURRENT_DATE BETWEEN p.startdate AND p.enddate
           AND pc.docbasetype = ANY($2::text[])`,
        [orgName, docBaseTypes],
      );
    } catch (dbError) {
      console.warn(
        `[period-helpers] Skipping accounting-period check for org "${orgName}" — ` +
        `DB unreachable or query failed (${dbError.message}). This guard is a ` +
        `local-dev convenience, not a hard requirement; see docs/e2e-testing-guide.md.`,
      );
      return;
    }

    const statusByType = new Map(result.rows.map((row) => [row.docbasetype, row.periodstatus]));
    const notOpen = docBaseTypes.filter((docBaseType) => statusByType.get(docBaseType) !== 'O');

    if (notOpen.length === 0) return;

    const sample = result.rows[0];
    const periodLabel = sample
      ? `"${sample.period_name}" (${formatDate(sample.startdate)} to ${formatDate(sample.enddate)})`
      : 'the current period (no c_periodcontrol row found at all for it)';

    throw new Error(
      `Accounting period not open for org "${orgName}", period ${periodLabel}. ` +
      `Document types not open: ${notOpen.join(', ')}. ` +
      `Fix: Open it via Etendo UI: General Ledger → Setup → Open/Close Period Control → ` +
      `select the period → Open Period for the listed document types.`,
    );
  } finally {
    if (shouldClosePool) {
      await closePool(pool).catch(() => {});
    }
  }
}
