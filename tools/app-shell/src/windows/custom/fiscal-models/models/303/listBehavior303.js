// Modelo 303 behaviour of the declarations list (FmListPage.jsx), bound to the model in
// modelRegistryList.js (ETP-5716: moved verbatim out of FmListPage.jsx).
//
//   computeFn         the "Resultado" auto-compute (GET /fiscal303/boxes)
//   checkModifiedFn   the draft polling check (checkModified303) — a getter, so the function is
//                     read at render time exactly as FmListPage read it before (tests that mock
//                     fiscalModelsUtils.js compare it by identity)
//   deriveListResult  the row's "Resultado" { kind, amount } from a successful compute
import { apiFetch } from '@/auth/api.js';
import {
  checkModified303, deriveResultKind, applyOverrides, recomputeDerivedBoxes, getBoxValue,
} from '../../fiscalModelsUtils.js';

// Real-mode only: throws on fetch failure instead of falling back to mock data.
// Module-level helper (not the component/hook), so it uses the ambient `apiFetch`
// bound to the session, taking the explicit `token` it already receives as an
// override rather than a React hook it has no component body to call from.
async function computeBoxes303Real(decl, { token, apiBaseUrl } = {}) {
  if (!apiBaseUrl) throw new Error('missing credentials');
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const params = new URLSearchParams({ year: decl.year, period: decl.period });
  const res = await apiFetch(`${base}/fiscal303/boxes?${params}`, { baseUrl: '', token });
  if (!res.ok) throw new Error(`boxes fetch failed: ${res.status}`);
  return await res.json();
}

// ETP-5272 pt.6 (4th finding) — GET /fiscal303/boxes (computeBoxes303Real above)
// computes purely from invoice data: no declaration id, no manualData input, so
// `computed.summary.result` is always box 46 ("Resultado régimen general", a
// sub-total under a "standard company" assumption), never the true final result
// (box 71, "Resultado de la liquidación"). Same class of bug already fixed in
// FmModel303Page.jsx's `applyComputeResult` — reuse its exact helpers (merge this
// row's manualOverrides, re-derive box 71) instead of trusting the raw summary, so
// the list and the detail page can never disagree on the same declaration's result.
function deriveListResult303(decl, computed) {
  const manualOverrides = decl.manualData?.manualOverrides ?? {};
  const mergedBoxes = recomputeDerivedBoxes(
    applyOverrides(computed.boxes, manualOverrides),
    decl.manualData?.identification,
  );
  // ETP-5393 Bug B — `??` doesn't catch NaN; require a finite number before
  // trusting the re-derived box 71 (same guard as FmModel303Page's applyComputeResult).
  const box71Derived = getBoxValue(mergedBoxes, 71);
  const r = Number.isFinite(box71Derived) ? box71Derived : computed.summary.result;
  // A submission snapshot keeps only the invoice COUNT (`sourceCount`), not the
  // per-invoice `sources` (ETP-5438) — either one answers "has invoices".
  const hasInvoices = (computed.sources?.length ?? (Number(computed.sourceCount) || 0)) > 0;
  const kind = deriveResultKind({ ...computed.summary, result: r }, { hasInvoices });
  return { kind, amount: Math.abs(r) };
}

const listBehavior303 = Object.freeze({
  computeFn: computeBoxes303Real,
  get checkModifiedFn() { return checkModified303; },
  deriveListResult: deriveListResult303,
});

export default listBehavior303;
