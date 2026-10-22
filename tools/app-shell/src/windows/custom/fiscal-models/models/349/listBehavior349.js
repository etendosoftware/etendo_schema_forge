// Modelo 349 behaviour of the declarations list (FmListPage.jsx), bound to the model in
// modelRegistryList.js (ETP-5716: moved verbatim out of FmListPage.jsx).
//
//   computeFn         the "Resultado" auto-compute (GET /fiscal349/operators)
//   checkModifiedFn   the draft polling check (checkModified349) — a getter, so the function is
//                     read at render time exactly as FmListPage read it before (tests that mock
//                     fiscalModelsUtils.js compare it by identity)
//   deriveListResult  the row's "Resultado" { kind, amount } from a successful compute
import { compute349Operators, checkModified349 } from '../../fiscalModelsUtils.js';

async function computeOperators349Real(decl, { token, apiBaseUrl } = {}) {
  return compute349Operators(decl, { token, apiBaseUrl });
}

// ETP-5432 pt.2 — sums a 349 key-totals object (`summary` or `rectificativeSummary`,
// both `{ totalE, totalS, totalA, totalI }`) via Math.abs on each key, so a
// negative corrective delta contributes to the list's "Resultado" total instead of
// silently cancelling a positive one (or a same-sized regular total) into 0 — the
// exact anti-netting rule `RectificativeSubtotalCard` (FmModel349Page.jsx) already
// applies when rendering these same two objects on the detail page.
function sumAbsKeyTotals(obj) {
  return ['totalE', 'totalS', 'totalA', 'totalI']
    .reduce((s, k) => s + Math.abs(parseFloat(obj?.[k]) || 0), 0);
}

// ETP-5432 pt.2 — a rectification-only period (no regular operators
// alongside it) has an all-zero regular `summary` (Fiscal349BoxesHandler
// always emits `summaryByKey` from the REGULAR aggregation only), so
// summing `summary` alone silently showed "Informativa"/0 here even
// though the declaration has real corrective operators — the detail
// page's own RectificativeSubtotalCard already renders the same
// `rectificativeSummary` correctly, so this was a list-only gap.
// Correctives are SIGNED deltas (can be negative), so they are summed
// via Math.abs — the same anti-cancellation rule RectificativeSubtotalCard
// documents for why E/S/A/I are never netted against each other; without
// it a -30 sales correction offset by a +30 purchase one would still sum
// to 0 and reproduce this exact bug.
function deriveListResult349(decl, computed) {
  const total = sumAbsKeyTotals(computed.summary) + sumAbsKeyTotals(computed.rectificativeSummary);
  return { kind: 'info', amount: total };
}

const listBehavior349 = Object.freeze({
  computeFn: computeOperators349Real,
  get checkModifiedFn() { return checkModified349; },
  deriveListResult: deriveListResult349,
});

export default listBehavior349;
