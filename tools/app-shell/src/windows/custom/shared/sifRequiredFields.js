/**
 * Which SIF ("Datos fiscales") fields are mandatory — ONE rule, shared by the "Datos fiscales"
 * step of the invoice-creating modals (`InvoiceSifStep.jsx`) and the invoices' SIF tab
 * (`SifTab.jsx`), so the red `*` and the step's blocked button never drift apart.
 *
 * None of these columns is mandatory in the Application Dictionary (every `EM_Aeatsii_*`,
 * `EM_Etvfac_*`, `EM_Tbai_*` and `EM_Etsg_*` text/list/date column of `C_Invoice` is nullable):
 * "mandatory" here means a fiscal system REFUSES the invoice when the field is empty. The list
 * mirrors those refusals, and a field belongs here only while one of them exists:
 *
 *   - SII (`SIIUtils`, the pre-send validation of `org.openbravo.module.sii`): the invoice type
 *     ("Clave tipo factura", sales `aeatsiiClaveTipo` / purchase `aeatsiiClaveTipoFc`) and the SII
 *     description (`aeatsiiDescripcionSii`); on a rectificative, the rectification reason
 *     (`aeatsiiMotivoRectif` — also `RectificationFiscalCodeGuard` in com.etendoerp.go, which
 *     refuses the completion with a 422, and the `EM_AEATSII_C_INV_RECT_CHK` constraint).
 *   - VERI*FACTU (`InitialValidator#addStructureValidations` of `com.etendoerp.verifactu`): the
 *     invoice type (`etvfacInvType` — on a rectificative it must be R1-R5, same guard), the
 *     operation description (`etvfacVerifacDesc`) and the operation date (`etsgDateOperation`).
 *   - TicketBAI: the rectification code (`tbaiReverseinvoicecode`) on a rectificative (same guard).
 *
 * NOT mandatory, on purpose: the SII exemption cause (`aeatsiiCauseExemption`). An exempt tax
 * without a cause only raises the non-blocking "should indicate an exemption cause" warning toast
 * (`sifDataTabs.toast.exemptionCauseRequired`); nothing refuses the invoice for it.
 */

/** The rectification reason/code of each system: required on a rectificative invoice only. */
const REQUIRED_ON_RECTIFICATIVE = new Set(['aeatsiiMotivoRectif', 'tbaiReverseinvoicecode']);

/** Required whenever the field is shown (its system is active for the invoice). */
const ALWAYS_REQUIRED = new Set([
  'aeatsiiClaveTipo',
  'aeatsiiClaveTipoFc',
  'aeatsiiDescripcionSii',
  'etvfacInvType',
  'etvfacVerifacDesc',
]);

/** The operation date is shared by SII and VERI*FACTU; only VERI*FACTU refuses it empty. */
const REQUIRED_WITH_VERIFACTU = new Set(['etsgDateOperation']);

/**
 * Whether a SIF field is mandatory for an invoice.
 *
 * @param {string} name the field's DAL property name
 * @param {object} [context]
 * @param {boolean} [context.rectificative] the invoice is (or will be) a sales rectificative
 * @param {boolean} [context.verifactu] VERI*FACTU is active for the invoice
 * @returns {boolean}
 */
export function isSifFieldRequired(name, { rectificative = false, verifactu = false } = {}) {
  if (ALWAYS_REQUIRED.has(name)) return true;
  if (REQUIRED_ON_RECTIFICATIVE.has(name)) return rectificative;
  if (REQUIRED_WITH_VERIFACTU.has(name)) return verifactu;
  return false;
}

/**
 * Whether a field is one of the rectification codes a rectificative invoice needs — the two
 * dedicated ones, and VERI*FACTU's type, which carries the code (R1-R5) on a rectificative.
 */
export function isRectificationCodeField(name, { rectificative = false } = {}) {
  return rectificative && (REQUIRED_ON_RECTIFICATIVE.has(name) || name === 'etvfacInvType');
}

function isBlank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

/**
 * The mandatory fields, among `names`, that `values` leaves empty.
 *
 * @param {string[]} names the fields actually shown
 * @param {object} values field values by name
 * @param {object} [context] see {@link isSifFieldRequired}
 * @returns {string[]}
 */
export function missingRequiredSifFields(names, values, context) {
  return (names ?? []).filter(name => isSifFieldRequired(name, context) && isBlank(values?.[name]));
}
