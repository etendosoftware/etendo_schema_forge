/**
 * ETP-6049 — client-side checks of an Invoice Inbox upload selection (pure, `node --test`).
 *
 * The limits mirror the backend upload endpoint (`InvoiceInboxUploadEndpoint` /
 * `InvoiceInboxIntake` in com.etendoerp.go): PDF, JPG, JPEG or PNG; at most 20 files per upload;
 * at most 10 MB per file; no empty file. The backend stays the authority — this only spares a
 * round trip and names the refused files up front.
 *
 * Rules (product decision, 2026-11-03):
 *   - more than 20 files: warn and upload NONE (`blocked: 'tooMany'`);
 *   - otherwise the valid files are uploaded and each refused one is reported with its reason;
 *   - when no file is valid, nothing is uploaded and the refusals are reported.
 */

export const MAX_FILES_PER_UPLOAD = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = Object.freeze(['pdf', 'jpg', 'jpeg', 'png']);
/** Value for `<input accept>`. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export const REJECT_FORMAT = 'format';
export const REJECT_EMPTY = 'empty';
export const REJECT_TOO_LARGE = 'tooLarge';

/** Lower-case extension of a file name, or '' when it has none. */
export function fileExtension(name) {
  const dot = String(name ?? '').lastIndexOf('.');
  return dot < 0 ? '' : String(name).slice(dot + 1).toLowerCase();
}

/** Whether a file name looks like an image (for the document icon). */
export function isImageFileName(name) {
  return ['jpg', 'jpeg', 'png'].includes(fileExtension(name));
}

/** Why one file is refused, or null when it is valid. */
export function rejectionReason(file) {
  if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file?.name))) return REJECT_FORMAT;
  if (!file.size) return REJECT_EMPTY;
  if (file.size > MAX_FILE_BYTES) return REJECT_TOO_LARGE;
  return null;
}

/**
 * Splits a selection into what is uploaded and what is refused.
 *
 * @param {ArrayLike<File>} files
 * @returns {{ blocked: 'tooMany'|null, accepted: File[], rejected: Array<{file: File, reason: string}> }}
 */
export function validateInboxSelection(files) {
  const list = Array.from(files ?? []);
  if (list.length > MAX_FILES_PER_UPLOAD) return { blocked: 'tooMany', accepted: [], rejected: [] };
  const accepted = [];
  const rejected = [];
  for (const file of list) {
    const reason = rejectionReason(file);
    if (reason) rejected.push({ file, reason });
    else accepted.push(file);
  }
  return { blocked: null, accepted, rejected };
}

const REJECT_MESSAGE_KEYS = Object.freeze({
  [REJECT_FORMAT]: { one: 'invoiceInboxRejectedFormatOne', many: 'invoiceInboxRejectedFormatMany' },
  [REJECT_EMPTY]: { one: 'invoiceInboxRejectedEmptyOne', many: 'invoiceInboxRejectedEmptyMany' },
  [REJECT_TOO_LARGE]: { one: 'invoiceInboxRejectedTooLargeOne', many: 'invoiceInboxRejectedTooLargeMany' },
});

/**
 * The warnings to show for a validated selection, as `genericLabels` keys with their params, one
 * per refusal reason, each naming the refused files. Empty when everything is uploaded.
 *
 * @returns {Array<{key: string, params?: object}>}
 */
export function selectionWarnings({ blocked, rejected }) {
  if (blocked === 'tooMany') return [{ key: 'invoiceInboxErrorTooMany' }];
  return Object.entries(groupRejectedNames(rejected)).map(([reason, names]) => ({
    key: names.length === 1 ? REJECT_MESSAGE_KEYS[reason].one : REJECT_MESSAGE_KEYS[reason].many,
    params: { count: names.length, files: names.join(', ') },
  }));
}

/** Refused files grouped by reason, keeping selection order: `{ format: ['a.webp'], ... }`. */
export function groupRejectedNames(rejected) {
  const groups = {};
  for (const { file, reason } of rejected ?? []) {
    groups[reason] ??= [];
    groups[reason].push(file.name);
  }
  return groups;
}
