// Modelo 390 behaviour of the declarations list (FmListPage.jsx), bound to the model in
// modelRegistryList.js (ETP-5716).
//
//   computeFn         the "Resultado" auto-compute (GET /fiscal390/boxes, stored inputs)
//   checkModifiedFn   the draft polling check (GET /fiscal390/modified)
//   deriveListResult  the row's "Resultado" { kind, amount } from a successful compute
import { deriveResultKind } from '../../fiscalModelsUtils.js';
import { fetchBoxes390, checkModified390 } from './fm390Api.js';
import { parseAmount, toBoxMap, annualResultOf } from './fm390Layouts.js';

function computeBoxes390(decl, { token, apiBaseUrl } = {}) {
  return fetchBoxes390(decl, { token, apiBaseUrl });
}

// "Resultado" of a 390 = the annual result: `summary.annualResult` as the backend sends it ([86],
// or [94] when the declarant files to several administrations), falling back to the same choice
// made from the boxes (a snapshot or payload without that field). Kind: the shared sign rule
// (`deriveResultKind`: > 0 "A ingresar", < 0 "A compensar/devolver", 0 "Resultado cero" when the
// exercise had activity, "Sin resultado" otherwise). There are no per-invoice `sources` in the
// 390 payload: activity = any accrued or deductible VAT.
function deriveListResult390(decl, computed) {
  const fromSummary = parseAmount(computed?.summary?.annualResult);
  const result = fromSummary ?? annualResultOf(computed?.boxes, computed?.mode);
  const boxes = toBoxMap(computed?.boxes);
  const accrued = parseAmount(computed?.summary?.accrued) ?? boxes[47] ?? 0;
  const deductible = parseAmount(computed?.summary?.deductible) ?? boxes[64] ?? 0;
  const hasInvoices = accrued !== 0 || deductible !== 0;
  const kind = deriveResultKind({ result }, { hasInvoices });
  return { kind, amount: Math.abs(result) };
}

const listBehavior390 = Object.freeze({
  computeFn: computeBoxes390,
  checkModifiedFn: checkModified390,
  deriveListResult: deriveListResult390,
});

export default listBehavior390;
