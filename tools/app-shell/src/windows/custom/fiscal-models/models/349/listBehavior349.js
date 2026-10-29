// Modelo 349 behaviour of the declarations list (FmListPage.jsx), bound to the model in
// modelRegistryList.js (ETP-5716: moved verbatim out of FmListPage.jsx).
//
//   computeFn         the "Resultado" auto-compute (GET /fiscal349/operators)
//   checkModifiedFn   the draft polling check (checkModified349) — a getter, so the function is
//                     read at render time exactly as FmListPage read it before (tests that mock
//                     fiscalModelsUtils.js compare it by identity)
//   deriveListResult  the row's "Resultado" { kind, amount, rectifications,
//                     rectificationOriginsLabel } from a successful compute
import { compute349Operators, checkModified349 } from '../../fiscalModelsUtils.js';
import {
  sum349OperationsBase, sumAbsRectificativeTotals,
  collectRectificationOrigins, formatRectificationOriginsLabel,
} from './operations349.js';

async function computeOperators349Real(decl, { token, apiBaseUrl } = {}) {
  return compute349Operators(decl, { token, apiBaseUrl });
}

/**
 * ETP-5725 (QA CP-19) — the row reports the SAME two figures the AEAT type-1 header keeps
 * apart, and never their sum:
 *
 *   `amount`                total of OPERATIONS — identical, by construction, to the detail
 *                           page's "Total operaciones" KPI and to the generated .349 file,
 *                           because both now go through `sum349OperationsBase` over the
 *                           same payload. Rendered by the "Resultado" column alone.
 *   `rectifications`        amount of the prior-period RECTIFICATIONS this declaration
 *                           carries. Rendered by its OWN "Rectificaciones" column (Ruben's
 *                           review of the real AEAT Sede UI replaced the first cut's stacked
 *                           "rect. X" sub-line inside "Resultado" with a separate column).
 *   `rectificationOriginsLabel`  the distinct prior periods those rectifications correct,
 *                           sorted ascending and pre-formatted as "09, 10, 11" — the "de …"
 *                           line under that column's pill. Formatted here, not in the
 *                           generic `FmListPage.jsx`, so that page stays unaware of the
 *                           349-specific (year, period) row shape — the same reason the 390
 *                           ships its own `labelKey` instead of a raw kind code.
 *
 * This replaces `sumAbsKeyTotals(summary) + sumAbsKeyTotals(rectificativeSummary)`, which
 * added the two blocks together and is the whole of CP-19: the list read 2.390,00 € where
 * the detail and the file read 2.290,00 € plus 100,00 € of rectifications.
 *
 * ETP-5432 pt.2's case is deliberately preserved and is now reported correctly rather than
 * by inflating the operations total: a rectification-only period has an all-zero regular
 * `summary` (the backend builds `summaryByKey` from the REGULAR aggregation only), so it
 * yields `amount: 0` (rendered as "—") WITH a non-zero `rectifications` in the other column.
 * Note an ordinaria carrying rectifications is entirely normal: a rectificativa issued in
 * month 10 against an invoice of month 09 is a rectification record (ejercicio/periodo = 09)
 * inside the ORDINARIA of month 10 — it does not make month 10 sustitutiva, and month 09 is
 * untouched.
 */
function deriveListResult349(decl, computed) {
  return {
    kind: 'info',
    amount: sum349OperationsBase(computed?.operators),
    rectifications: sumAbsRectificativeTotals(computed?.rectificativeSummary),
    rectificationOriginsLabel: formatRectificationOriginsLabel(
      collectRectificationOrigins(computed?.operators, decl?.year)),
  };
}

const listBehavior349 = Object.freeze({
  computeFn: computeOperators349Real,
  get checkModifiedFn() { return checkModified349; },
  deriveListResult: deriveListResult349,
});

export default listBehavior349;
