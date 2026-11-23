/**
 * ETP-6049 — backend codes of the Invoice Inbox mapped to `genericLabels` keys (pure).
 *
 * The SPA never shows a backend label for these: the `Status` reference list translations
 * (`AD_REF_LIST_TRL`) are the English text in every language, `Error_Code` rows carry no
 * identifier, and the upload messages (`ETGO_InvoiceInbox*` in `AD_MESSAGE`) are English only.
 * Every code is translated here, by code; an unknown code gets a generic text.
 *
 * Sources (com.etendoerp.go): the reference lists of ETGO_INCOMING_DOCUMENT; per-file codes in
 * `InvoiceInboxIntake` (`results[].code`); request codes in `InvoiceInboxUploadEndpoint`
 * (`error.code` of the NEO error envelope); discard codes in `InvoiceInboxHeaderHandler` (the
 * `discard` action).
 */

export const STATUS_LABEL_KEYS = Object.freeze({
  PROCESSING: 'invoiceInboxStatusProcessing',
  PENDING_REVIEW: 'invoiceInboxStatusPendingReview',
  ERROR: 'invoiceInboxStatusError',
  READY: 'invoiceInboxStatusReady',
  CONFIRMED: 'invoiceInboxStatusConfirmed',
  DISCARDED: 'invoiceInboxStatusDiscarded',
});

/** `StatusTag` tone per status. */
export const STATUS_TONES = Object.freeze({
  PROCESSING: 'info',
  PENDING_REVIEW: 'warning',
  ERROR: 'destructive',
  READY: 'success',
  CONFIRMED: 'success',
  DISCARDED: 'neutral',
});

export const ERROR_CODE_LABEL_KEYS = Object.freeze({
  UNREADABLE: 'invoiceInboxErrorUnreadable',
  SERVICE_FAILURE: 'invoiceInboxErrorServiceFailure',
  FOREIGN_RECEIVER: 'invoiceInboxErrorForeignReceiver',
  MISSING_FIELDS: 'invoiceInboxErrorMissingFields',
  REFERENCE_TOO_LONG: 'invoiceInboxErrorReferenceTooLong',
  CONFIRM_FAILED: 'invoiceInboxErrorConfirmFailed',
});
const ERROR_CODE_FALLBACK_KEY = 'invoiceInboxErrorUnknown';

/** Per-file refusal of a 200 upload answer (`results[].code`). */
export const FILE_RESULT_LABEL_KEYS = Object.freeze({
  unsupported_type: 'invoiceInboxFileUnsupportedType',
  empty_file: 'invoiceInboxFileEmpty',
  invalid_content: 'invoiceInboxFileInvalidContent',
  store_failed: 'invoiceInboxFileStoreFailed',
});

/** Request refusal (`error.code` of a non-2xx upload answer). */
export const UPLOAD_ERROR_LABEL_KEYS = Object.freeze({
  feature_disabled: 'invoiceInboxUploadFeatureDisabled',
  access_denied: 'invoiceInboxUploadAccessDenied',
  org_not_allowed: 'invoiceInboxUploadOrgNotAllowed',
  request_too_large: 'invoiceInboxUploadTooLarge',
  not_multipart: 'invoiceInboxUploadFailed',
  no_files: 'invoiceInboxUploadFailed',
  too_many_files: 'invoiceInboxErrorTooMany',
});
const UPLOAD_FALLBACK_KEY = 'invoiceInboxUploadFailed';

/**
 * Codes after which no other file of the queue can succeed (the account, the role or the
 * organization is refused): the rest of the queue is not sent.
 */
export const QUEUE_STOPPING_CODES = new Set(['feature_disabled', 'access_denied', 'org_not_allowed']);

/**
 * Refusal of one discard (`error.code` of the action's answer), as a reason fragment shown after
 * a colon in the toast. `access_denied` and `not_found` are derived from a code-less 403 / 404
 * (`discardFailureCode`).
 */
export const DISCARD_ERROR_LABEL_KEYS = Object.freeze({
  not_discardable: 'invoiceInboxDiscardReasonNotDiscardable',
  not_found: 'invoiceInboxDiscardReasonNotFound',
  org_not_allowed: 'invoiceInboxDiscardReasonOrg',
  access_denied: 'invoiceInboxDiscardReasonAccess',
  feature_disabled: 'invoiceInboxDiscardReasonFeatureDisabled',
});
export const DISCARD_FALLBACK_KEY = 'invoiceInboxDiscardReasonGeneric';

/**
 * Discard codes after which no other document can succeed (the account or the role is refused):
 * the rest of the batch is not sent. `org_not_allowed` is per row (another row may belong to a
 * writable organization), so it does not stop the batch.
 */
export const DISCARD_STOPPING_CODES = new Set(['feature_disabled', 'access_denied']);

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/** The code of a failed discard: `error.code`, else derived from the HTTP status, else null. */
export function discardFailureCode({ code, httpStatus }) {
  if (code) return code;
  if (httpStatus === HTTP_FORBIDDEN) return 'access_denied';
  if (httpStatus === HTTP_NOT_FOUND) return 'not_found';
  return null;
}

export function discardReasonKey(code) {
  return DISCARD_ERROR_LABEL_KEYS[code] ?? DISCARD_FALLBACK_KEY;
}

/**
 * Refusal of one confirm (`error.code` of the action's answer), as a reason fragment shown after a
 * colon in the toast (ETP-6051). `access_denied` and `not_found` are derived from a code-less 403 /
 * 404 (`discardFailureCode`, shared).
 */
export const CONFIRM_ERROR_LABEL_KEYS = Object.freeze({
  not_confirmable: 'invoiceInboxConfirmReasonNotConfirmable',
  not_found: 'invoiceInboxDiscardReasonNotFound',
  org_not_allowed: 'invoiceInboxConfirmReasonOrg',
  access_denied: 'invoiceInboxConfirmReasonAccess',
  feature_disabled: 'invoiceInboxDiscardReasonFeatureDisabled',
  stale_document: 'invoiceInboxConfirmReasonStale',
  not_valid: 'invoiceInboxConfirmReasonNotValid',
  duplicate_invoice: 'invoiceInboxConfirmReasonDuplicate',
  missing_exchange_rate: 'invoiceInboxConfirmReasonExchangeRate',
  vendor_address_missing: 'invoiceInboxConfirmReasonVendorAddress',
  QUOTA_EXCEEDED: 'invoiceInboxConfirmReasonQuota',
  price_list_tax_included: 'invoiceInboxConfirmReasonPriceListTax',
  confirm_failed: 'invoiceInboxConfirmReasonFailed',
});
export const CONFIRM_FALLBACK_KEY = 'invoiceInboxConfirmReasonGeneric';
/** Several different reasons in one batch. */
export const CONFIRM_SEVERAL_KEY = 'invoiceInboxConfirmReasonSeveral';

/**
 * Confirm codes after which no other document can succeed (the account, the role or the plan quota
 * is refused): the rest of the queue is not sent. Per-document refusals (`org_not_allowed`,
 * `not_valid`, `duplicate_invoice`, `missing_exchange_rate`, `confirm_failed`…) do not stop it.
 */
export const CONFIRM_STOPPING_CODES = new Set(['feature_disabled', 'access_denied', 'QUOTA_EXCEEDED']);

export function confirmReasonKey(code) {
  return CONFIRM_ERROR_LABEL_KEYS[code] ?? CONFIRM_FALLBACK_KEY;
}

/**
 * The reason of a failed confirm is stored as an IDENTIFIER (`{code, params}`, ETP-6051), never as
 * translated text: the SPA translates it here, with the same table for the stored path
 * (`review.errorInfo`) and the live 422 (`error.detailCode` / `error.detailParams`). `step_failed` and
 * `search_key_exists` carry the failed `step`, translated through `CONFIRM_STEP_KEYS`.
 */
export const CONFIRM_FAILED_DETAIL_KEYS = Object.freeze({
  no_lookups: 'invoiceInboxConfirmDetailNoLookups',
  completion_error: 'invoiceInboxConfirmDetailCompletionError',
  no_vendor_category: 'invoiceInboxConfirmDetailNoVendorCategory',
  no_product_sequence: 'invoiceInboxConfirmDetailNoProductSequence',
  no_file: 'invoiceInboxConfirmDetailNoFile',
  attach_failed: 'invoiceInboxConfirmDetailAttachFailed',
  currency_mismatch: 'invoiceInboxConfirmDetailCurrencyMismatch',
  total_mismatch: 'invoiceInboxConfirmDetailTotalMismatch',
  step_failed: 'invoiceInboxConfirmDetailStepFailed',
  search_key_exists: 'invoiceInboxConfirmDetailSearchKeyExists',
  refused: 'invoiceInboxConfirmDetailRefused',
});

/** The failed step of a `step_failed` / `search_key_exists` detail, by `params.step`. */
export const CONFIRM_STEP_KEYS = Object.freeze({
  vendor: 'invoiceInboxConfirmStepVendor',
  vendorAddress: 'invoiceInboxConfirmStepVendorAddress',
  header: 'invoiceInboxConfirmStepHeader',
  line: 'invoiceInboxConfirmStepLine',
  product: 'invoiceInboxConfirmStepProduct',
  creation: 'invoiceInboxConfirmStepCreation',
});

function stepText(ui, params) {
  return ui(CONFIRM_STEP_KEYS[params.step] ?? CONFIRM_STEP_KEYS.creation, { n: params.n ?? '', name: params.name ?? '' });
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * The text of the reason a confirm failed, in the user's language.
 *
 * @param {Function} ui the `useUI()` translator
 * @param {{code?: string, params?: object, text?: string}|null} info the identifier (`errorInfo` of the
 *   review answer, or `{code: detailCode, params: detailParams}` of the live 422)
 * @param {string|null} [legacy] the raw stored string: legacy free text of rows written before the
 *   identifier, shown as it is when there is no `info`
 * @returns {string|null} `null` when there is nothing to show (the caller shows the no-detail text)
 */
export function confirmFailedDetail(ui, info, legacy = null) {
  const code = info?.code;
  if (!code) return nonEmpty(legacy);
  const params = info.params ?? {};
  const key = CONFIRM_FAILED_DETAIL_KEYS[code];
  if (!key) return nonEmpty(params.reason) ?? nonEmpty(params.message) ?? nonEmpty(info.text) ?? nonEmpty(legacy);
  if (code === 'step_failed' || code === 'search_key_exists') {
    const missing = Array.isArray(params.missing) && params.missing.length > 0 ? ` (${params.missing.join(', ')})` : '';
    return ui(key, { step: stepText(ui, params), reason: params.reason ?? '', missing });
  }
  return ui(key, { ...params });
}

export function statusLabelKey(status) {
  return STATUS_LABEL_KEYS[status] ?? null;
}

export function errorCodeLabelKey(code) {
  return ERROR_CODE_LABEL_KEYS[code] ?? ERROR_CODE_FALLBACK_KEY;
}

export function fileResultLabelKey(code) {
  return FILE_RESULT_LABEL_KEYS[code] ?? UPLOAD_FALLBACK_KEY;
}

export function uploadErrorLabelKey(code) {
  return UPLOAD_ERROR_LABEL_KEYS[code] ?? UPLOAD_FALLBACK_KEY;
}
