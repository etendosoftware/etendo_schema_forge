// Modelo 390 behaviour of the declarations list (FmListPage.jsx), bound to the model in
// modelRegistryList.js (ETP-5716).
//
//   computeFn         the "Resultado" auto-compute (GET /fiscal390/boxes, stored inputs)
//   checkModifiedFn   the draft polling check (GET /fiscal390/modified)
//   deriveListResult  the row's "Resultado" { kind, amount } from a successful compute
import { fetchBoxes390, checkModified390 } from './fm390Api.js';
import {
  parseAmount, toBoxMap, annualResultOf, resultKind390, RESULT_LABEL_KEY_390,
} from './fm390Layouts.js';

function computeBoxes390(decl, { token, apiBaseUrl } = {}) {
  return fetchBoxes390(decl, { token, apiBaseUrl });
}

// "Resultado" of a 390 = the annual result: `summary.annualResult` as the backend sends it ([86],
// or [94] when the declarant files to several administrations), falling back to the same choice
// made from the boxes (a snapshot or payload without that field). Kind: the 390's own informative
// rule (`resultKind390`: > 0 "Resultado positivo", < 0 "Resultado negativo", 0 "Resultado cero"
// when the exercise had activity, "Sin resultado" otherwise) — NOT the 303's "A ingresar" /
// "A compensar/devolver": the 390 settles nothing, the last 303 did ([97] / [98]). The badge text
// travels as `labelKey` and the amount keeps its sign. There are no per-invoice `sources` in the
// 390 payload: activity = any accrued or deductible VAT.
function deriveListResult390(decl, computed) {
  const fromSummary = parseAmount(computed?.summary?.annualResult);
  const result = fromSummary ?? annualResultOf(computed?.boxes, computed?.mode);
  const boxes = toBoxMap(computed?.boxes);
  const accrued = parseAmount(computed?.summary?.accrued) ?? boxes[47] ?? 0;
  const deductible = parseAmount(computed?.summary?.deductible) ?? boxes[64] ?? 0;
  const kind = resultKind390(result, { hasActivity: accrued !== 0 || deductible !== 0 });
  return { kind, labelKey: RESULT_LABEL_KEY_390[kind], amount: result };
}

const listBehavior390 = Object.freeze({
  computeFn: computeBoxes390,
  checkModifiedFn: checkModified390,
  deriveListResult: deriveListResult390,
});

export default listBehavior390;
