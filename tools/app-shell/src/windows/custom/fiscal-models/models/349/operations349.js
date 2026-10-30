// Modelo 349 — the period's two totals (ETP-5725, QA CP-19).
//
// The AEAT 349 record of design carries TWO independent (count, amount) pairs in its type-1
// header, over DISJOINT sets of type-2 records: "importe de las operaciones intracomunitarias"
// aggregates the OPERATOR records only, and "importe de las rectificaciones" aggregates the
// RECTIFICATION records only. There is no third, combined field, and a rectification record
// cannot even carry a current-period operation amount (its base-imponible positions are
// blanks). A prior-period rectification therefore NEVER counts toward the period's total of
// operations.
//
// Carrying rectifications does not change a declaration's TYPE: a rectificativa issued in
// month 10 against an already-declared invoice of month 09 is a rectification record
// (ejercicio/periodo = 09) inside the ORDINARIA of month 10. It does not make month 10
// sustitutiva, and month 09's declaration is untouched. "Sustitutiva" is decided on the
// declaration's OWN period — one was already filed for it and new invoices OF THAT PERIOD
// appeared afterwards.
//
// The list's "Resultado" column used to add the two blocks together
// (`sumAbsKeyTotals(summary) + sumAbsKeyTotals(rectificativeSummary)`), which is why it
// disagreed with both the detail "Total operaciones" KPI and the generated .349 file by
// exactly the rectifications amount. These helpers are now THE reduction, applied to the one
// `GET /fiscal349/operators` payload that already feeds both screens, so the two figures are
// the same number by construction rather than by two reductions that happen to agree.
//
// Deliberately its own module rather than another export of `fiscalModelsUtils.js`: several
// suites replace that module with a non-spread `vi.mock` factory, so a new export there is
// `undefined` inside them. Co-located with the model that owns the rule instead.

/**
 * Whether an operator row of the `GET /fiscal349/operators` payload is a corrective
 * ("registro tipo 2") row. `rectificative` is present on EVERY row (false for regular ones,
 * never omitted); this only normalizes the string/boolean shapes NEO can emit.
 */
export function isRectificativeOp(op) {
  return op?.rectificative === true || op?.rectificative === 'true' || op?.rectificative === 'Y';
}

/**
 * The declaration's TOTAL OF OPERATIONS: the summed base of the regular (non-corrective)
 * operator rows, and nothing else. Shared verbatim by the detail page's "Total operaciones"
 * KPI (`FmModel349Page.jsx`) and the list's "Resultado" column (`listBehavior349.js`).
 *
 * Corrective rows carry SIGNED deltas and are excluded here; their own total is
 * `sumRestatedRectifications` below, which is reported separately and never added in.
 */
export function sum349OperationsBase(operators) {
  return (operators ?? [])
    .filter(op => !isRectificativeOp(op))
    .reduce((sum, op) => sum + (parseFloat(op?.base) || 0), 0);
}

/**
 * ETP-5725 real-world follow-up (QA CP-19) — superseded `sumAbsRectificativeTotals` below
 * (removed, see git history): that function summed `Math.abs` of the backend's per-key SIGNED
 * DELTAS (`rectificativeSummary`), which is a wrong BASE QUANTITY, not an aggregation-strategy
 * bug. Verified against a real, multi-record declaration (ETP-5725): the AEAT's own "Resumen de
 * la declaración" screen reported "Importe de las rectificaciones: 2.152,00", matching EXACTLY
 * the sum of the three records' RESTATED ("Base imponible rectificada") bases — 1.608,00 +
 * 176,00 + 368,00 — never a delta, never an abs-per-key sum, never a signed net; none of those
 * combinations can reproduce 2.152,00 from the numbers available. The abs-delta sum for that
 * same declaration read 452,00 (and a signed net would have read -352,00) — neither close.
 *
 * `correctedBase` (backend, `Fiscal349BoxesHandler#appendOperators`) is the per-row fix: the
 * restated total itself, `former + delta`, exposed alongside (never replacing) the existing
 * signed-delta `base` — the Operadores tab's per-row "Base imponible" display for a corrective
 * row still needs that delta ("what this one record changed") and is untouched by any of this.
 *
 * This is now THE single reduction for "the declaration's real rectifications amount" — Σ
 * `correctedBase` across every corrective row, no grouping, no sign games. Used by the list's
 * "Rectificaciones" column (`listBehavior349.js`) AND the detail page's "Subtotal
 * rectificativas" card's own grand total (`FmModel349Page.jsx`, `RectificativeSubtotalCard`) —
 * list and detail now compute the identical number from the identical payload, by construction,
 * the same discipline `sum349OperationsBase` already established for the operations total.
 */
export function sumRestatedRectifications(operators) {
  return (operators ?? [])
    .filter(isRectificativeOp)
    .reduce((sum, op) => sum + (parseFloat(op?.correctedBase) || 0), 0);
}

/** The four AEAT349 tributary keys, in the order `RectificativeSubtotalCard` renders them —
 * mirrors `Fiscal349BoxesHandler`'s `SUMMARY_KEYS` / `FmModel349Page.jsx`'s local `KEY_IDS`. */
const RECTIF_KEY_IDS = ['E', 'S', 'A', 'I'];

/**
 * `sumRestatedRectifications`'s per-key breakdown — the restated ("corrected") base, grouped by
 * AEAT349 key, over every corrective row. Partitioning the same `correctedBase` values by key
 * and summing within each is mathematically identical to summing them all directly, so
 * `Object.values(rectifiedBaseByKey(operators)).reduce((s, v) => s + v, 0)` ALWAYS equals
 * `sumRestatedRectifications(operators)` — no separate reconciliation between the card and the
 * list is possible, by construction, not by convention.
 *
 * This is what `RectificativeSubtotalCard` (`FmModel349Page.jsx`) now reads INSTEAD of the
 * backend's `rectificativeSummary` (the delta-based per-key map) for its own per-key rows.
 * `rectificativeSummary` is left completely alone on the backend — nothing else there reads it
 * today, but it is still the correct, documented shape of a stable API field, and removing it
 * is not this change's business.
 *
 * Computed client-side from `operators[]`, the same way `sum349OperationsBase` and
 * `sumRestatedRectifications` already are, rather than as a new backend aggregate: one fewer
 * payload field, and it can never drift from the row-level `correctedBase` it is built from.
 *
 * Unlike `rectificativeSummary`'s deltas (legitimately negative), a restated base is a real
 * AEAT amount and the AEAT's own convention is explicit — "Todos los importes serán
 * positivos" — so these are rendered as plain amounts with NO sign-based color (see
 * `RectificativeSubtotalCard`'s own comment for why the old red-for-negative styling is gone).
 */
export function rectifiedBaseByKey(operators) {
  const totals = {};
  RECTIF_KEY_IDS.forEach(k => { totals[k] = 0; });
  for (const op of operators ?? []) {
    if (!isRectificativeOp(op)) continue;
    const key = op?.key;
    if (key == null || !(key in totals)) continue;
    totals[key] += parseFloat(op?.correctedBase) || 0;
  }
  return totals;
}

// ── List "Rectificaciones" column (ETP-5725, QA CP-19 follow-up) ───────────
//
// Ruben's review of the real AEAT Sede UI replaced the stacked "rect. X" sub-line inside
// "Resultado" with its OWN column: a pill (amount) plus, below it, the distinct origin
// periods the rectifications correct — "de 09, 10, 11". "Resultado" goes back to showing
// ONLY the operations total, exactly as the detail KPI and the .349 file do.

/** Sort key for a 349 period code (`"01"`-`"12"` monthly, `"T1"`-`"T4"` quarterly) — the same
 * rule `periodSortValue` (FmListPage.jsx) applies, kept local here rather than imported: a
 * corrective's `declaredPeriod` is never the annual code that function also handles. */
function monthlyOrQuarterlySortValue(period) {
  if (/^T\d$/.test(period)) return parseInt(period[1], 10) * 3;
  if (/^\d{1,2}$/.test(period)) return parseInt(period, 10);
  return 0;
}

/**
 * The distinct `(declaredYear, declaredPeriod)` pairs of this declaration's corrective rows,
 * sorted ascending (year first, then period/quarter within it) — the origins contributing to
 * `sumRestatedRectifications`.
 *
 * A corrective row's `Year`/`Period` identify the period it corrects, grouped by the DAO on
 * `(BPId, TaxKey, Year, Period)` — a declaration CAN carry rectifications of more than one
 * prior period (e.g. correcting both 09 and 10 in the 11 ordinaria), and in principle of more
 * than one prior YEAR too, since `Year` is a real, independently-grouped field and nothing
 * restricts a correction to the current exercise. `declYear` (the declaration's own year) is
 * the fallback for a row that — defensively — carries a period but no year of its own.
 *
 * Each entry is `{ year, period, crossYear }`; `crossYear` is true when `year` differs from
 * `declYear`, which the caller uses to decide whether a label needs a year qualifier at all
 * (ordinary same-year case: no qualifier, exactly what the mockup shows).
 */
export function collectRectificationOrigins(operators, declYear) {
  const seen = new Map();
  for (const op of operators ?? []) {
    if (!isRectificativeOp(op)) continue;
    const period = String(op?.declaredPeriod ?? '').trim();
    if (!period) continue;
    const year = String(op?.declaredYear ?? declYear ?? '').trim();
    const key = `${year}|${period}`;
    if (!seen.has(key)) seen.set(key, { year, period, crossYear: !!year && year !== String(declYear ?? '') });
  }
  return [...seen.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year.localeCompare(b.year);
    return monthlyOrQuarterlySortValue(a.period) - monthlyOrQuarterlySortValue(b.period);
  });
}

/**
 * Renders `collectRectificationOrigins`' result as the "de 09, 10, 11" line. Reuses the
 * window's existing period-label convention (the raw code, unmodified — see `periodLabel` /
 * `declaredPeriodLabel`) rather than inventing a new one. A cross-year origin — rare, but
 * structurally possible per `collectRectificationOrigins`'s own doc — is qualified with its
 * full year exactly as `declaredPeriodLabel` already does for the detail page's "Rectificaciones"
 * tab (`"<period> <year>"`), so a reader is never left to assume same-year when it isn't.
 */
export function formatRectificationOriginsLabel(origins) {
  if (!origins?.length) return '';
  return origins
    .map(o => (o.crossYear ? `${o.period} ${o.year}` : o.period))
    .join(', ');
}
