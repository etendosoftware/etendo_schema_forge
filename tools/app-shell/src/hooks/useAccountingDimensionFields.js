import { useDisplayLogic } from './useDisplayLogic';

/**
 * Filters a list of accounting-dimension field definitions (Contacto, Producto,
 * Proyecto, Centro de costo — see ETP-4529) down to the ones that should actually
 * render right now, using the SAME server-side evaluator DetailView uses for
 * generated windows:
 *
 *   POST /sws/neo/{spec}/{entity}/evaluate-display
 *     → NeoDisplayLogicHelper.handleEvaluateDisplay() (com.etendoerp.go)
 *     → DynamicExpressionParser.getJSExpression()
 *     → DimensionDisplayUtility.computeAccountingDimensionDisplayLogic()
 *
 * which reads the client's real per-dimension `AD_Client` configuration
 * (`Project_Acctdim_Header`, etc.) instead of a hardcoded local decision.
 *
 * This is the shared, config-aware replacement for the two windows that used to
 * hardcode their own "always show these N dimension selectors" array
 * (`AssetsDetailPanel.jsx`'s `dimensionFields`, `AmortizationLinesTable.jsx`'s
 * `DIMENSION_FIELDS`) — both now call this hook instead.
 *
 * A field is HIDDEN only when the server explicitly returns
 * `visibility[key] === false`. Fields the server never mentions — either because
 * the request hasn't resolved yet, or because the underlying `AD_Field.DisplayLogic`
 * is still empty at the Application Dictionary level (e.g. amortization's
 * `costcenter`/`eTADASBpartner` — see ETP-4529 notes in `amortization.md`) — stay
 * visible by default. This is intentional: it fails open exactly like
 * `NeoDisplayLogicHelper.evaluateExpression()` does server-side, and it means that
 * once the AD-level `DisplayLogic` is populated by a future change, this hook
 * starts honoring it with ZERO further code changes here.
 *
 * @param entity - the ETGO_SF_ENTITY name to evaluate against (e.g. 'assets', 'lines')
 * @param record - representative field values sent as the evaluate-display context.
 *   Accounting-dimension visibility is config-driven, not record-driven, so a
 *   representative record (e.g. the parent header) is a safe, valid context even
 *   when the caller doesn't have one single "current record" (a lines grid with many
 *   rows sharing one entity, for instance).
 * @param fields - candidate dimension field definitions, each with a `key`
 * @param opts.token, opts.apiBaseUrl - passed straight through to useDisplayLogic
 * @returns the filtered fields array
 */
export function useAccountingDimensionFields(entity, record, fields, { token, apiBaseUrl } = {}) {
  const displayLogic = useDisplayLogic(entity, record, { token, apiBaseUrl });
  return fields.filter(f => displayLogic?.visibility?.[f.key] !== false);
}
