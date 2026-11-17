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
