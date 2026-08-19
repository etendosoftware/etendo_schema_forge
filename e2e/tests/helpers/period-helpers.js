/**
 * Live-backend integration-spec guard: ensures the accounting period for
 * "today" is OPEN for the document base types a flow is about to exercise,
 * opening it automatically when it is not.
 *
 * Why this exists (ETP-4567): `c_periodcontrol` rows default to
 * `periodstatus='N'` (Never Opened) until manually opened from the Etendo
 * UI (see docs/etendo-ad/onboarding-gaps.md §C2). Without this guard, a
 * closed period makes the backend reject the receipt/shipment/invoice
 * confirm call with "The Period does not exist or it is not opened", and
 * the live-backend integration specs don't surface that at all — they just
 * time out ~10s later waiting for an unrelated UI element (e.g. "Ver
 * factura"), producing a confusing generic Playwright timeout instead of
 * the real cause. On top of that, a clean/fresh environment never has any
 * period opened at all, and even a seeded one eventually rolls into a
 * period nobody opened yet (e.g. next year) — a fail-fast-only guard would
 * just make that recurring gap fail loudly instead of not failing at all.
 * This helper resolves the period covering today and opens it for exactly
 * the doc base types the flow needs, mirroring the Java-side
 * `PeriodTestUtils.ensureOpenPeriod(Date)` used by the equivalent
 * OBBaseTest integration coverage.
 *
 * A doc base type with NO `c_periodcontrol` row at all for the covering
 * period is a genuine data-setup gap, not something this helper can safely
 * fix by inventing a row — it still throws a clear `Error` for that case.
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

const PERIOD_STATUS_OPEN = 'O';
const PERIOD_ACTION_NONE = 'N';
const OPENCLOSE_OPEN = 'C';

function formatDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Ensures the accounting period covering "today" is open
 * (`periodstatus='O'`) for every requested doc base type, on the given org
 * — opening it (and its per-doctype `c_periodcontrol` rows) when it is not.
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
 * @returns {Promise<void>} Resolves once every requested doc base type is
 *   confirmed open (whether it already was, or was just opened), or when
 *   the DB check itself could not run (skipped with a console warning).
 *   Throws a clear `Error` when a requested doc base type has no
 *   `c_periodcontrol` row at all for the current period — a data-setup gap
 *   this helper will not paper over by inventing a row.
 */
export async function ensureOpenPeriod({
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
        `SELECT pc.docbasetype, pc.periodstatus, pc.c_period_id, pc.ad_org_id,
                p.name AS period_name, p.startdate, p.enddate
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

    const rowByType = new Map(result.rows.map((row) => [row.docbasetype, row]));
    const missing = docBaseTypes.filter((docBaseType) => !rowByType.has(docBaseType));

    if (missing.length > 0) {
      const sample = result.rows[0];
      const periodLabel = sample
        ? `"${sample.period_name}" (${formatDate(sample.startdate)} to ${formatDate(sample.enddate)})`
        : 'the current period (no c_periodcontrol row found at all for it)';

      throw new Error(
        `No c_periodcontrol row at all for org "${orgName}", period ${periodLabel}, ` +
        `document types: ${missing.join(', ')}. This is a data-setup gap this helper ` +
        `will not paper over by inventing a row — see docs/etendo-ad/onboarding-gaps.md §C2.`,
      );
    }

    const notOpen = docBaseTypes.filter(
      (docBaseType) => rowByType.get(docBaseType).periodstatus !== PERIOD_STATUS_OPEN,
    );

    if (notOpen.length === 0) return;

    const { c_period_id: periodId, ad_org_id: orgId } = rowByType.get(notOpen[0]);

    await pool.query(
      `UPDATE c_periodcontrol
       SET periodstatus = $1, periodaction = $2, openclose = $3
       WHERE c_period_id = $4 AND ad_org_id = $5 AND docbasetype = ANY($6::text[])`,
      [PERIOD_STATUS_OPEN, PERIOD_ACTION_NONE, OPENCLOSE_OPEN, periodId, orgId, notOpen],
    );

    await pool.query(
      `UPDATE c_period SET openclose = $1 WHERE c_period_id = $2`,
      [OPENCLOSE_OPEN, periodId],
    );
  } finally {
    if (shouldClosePool) {
      await closePool(pool).catch(() => {});
    }
  }
}
