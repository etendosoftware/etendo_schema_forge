// ETP-4576 — both POSTs here take their credential from the active session
// scheme instead of a `token` threaded down from the modal. Unsafe methods, so
// the cookie scheme attaches the CSRF proof; `credentials: 'include'` is what
// lets the `__Host-` cookie reach a cross-origin backend.
// Relative, NOT `@/`: this module is imported by a `node --test` file and plain
// Node cannot resolve the Vite alias — it fails the whole file with
// ERR_MODULE_NOT_FOUND before any assertion runs.
import { writeHeaders } from '../../lib/sessionHeaders.js';

export function resolveNeoBaseUrl(apiBaseUrl) {
  return apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '') : '/sws/neo';
}

export function resolveDocumentEmailContract(windowName) {
  return `${windowName}-send`;
}

export function buildEmailContractCommand(contractName, documentId, options = {}) {
  const command = {
    version: 'v1',
    recordId: documentId,
    intent: 'send-document',
  };
  // ETP-4717 — opt-in, mirrors recipientEdits: only present when the operator
  // actually changed subject/message away from their auto-derived defaults,
  // so an untouched send stays byte-identical with the legacy payload shape.
  if (options.messageEdits) {
    command.messageEdits = options.messageEdits;
  }
  if (options.recipientEdits) {
    // Server derives the idempotency key from the final recipient set.
    command.recipientEdits = options.recipientEdits;
    return command;
  }
  command.idempotencyKey = `${contractName}:${documentId}:send:v1`;
  return command;
}

export async function readEmailContractResponse(res) {
  try {
    const payload = await res.json();
    return payload?.response?.data ?? payload?.data ?? payload ?? {};
  } catch {
    return {};
  }
}

export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function buildPreviewFileName(specName, documentNo, documentId) {
  const safeSpecName = sanitizeFileNamePart(specName) || 'document';
  const safeDocumentName = sanitizeFileNamePart(documentNo ?? documentId) || documentId;
  return `${safeSpecName}-${safeDocumentName}.pdf`;
}

function sanitizeFileNamePart(value) {
  const raw = String(value ?? '');
  let safeValue = '';
  let lastWasDash = false;

  for (const char of raw) {
    if (isSafeFileNameChar(char)) {
      safeValue += char;
      lastWasDash = false;
    } else if (!lastWasDash) {
      safeValue += '-';
      lastWasDash = true;
    }
  }

  return trimDashes(safeValue);
}

function isSafeFileNameChar(char) {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || char === '.'
    || char === '_'
    || char === '-';
}

function trimDashes(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
}

export async function cacheDocumentPreviewFile({
  apiBaseUrl,
  specName,
  documentId,
  documentNo,
  pdfBlob,
  pdfBlobUrl,
}) {
  const previewBlob = await resolvePreviewBlob(pdfBlob, pdfBlobUrl);
  if (!previewBlob) return { skipped: true };
  const fileData = await blobToBase64(previewBlob);
  const res = await fetch(`${resolveNeoBaseUrl(apiBaseUrl)}/preview-file`, {
    method: 'POST',
    headers: writeHeaders(),
    credentials: 'include',
    body: JSON.stringify({
      specName,
      recordId: documentId,
      fileName: buildPreviewFileName(specName, documentNo, documentId),
      mimeType: previewBlob.type || 'application/pdf',
      fileData,
    }),
  });
  if (!res.ok) {
    throw new Error(`Preview file cache failed (${res.status})`);
  }
  return { skipped: false };
}

async function resolvePreviewBlob(pdfBlob, pdfBlobUrl) {
  if (pdfBlob) return pdfBlob;
  if (!pdfBlobUrl) return null;
  const res = await fetch(pdfBlobUrl);
  if (!res.ok) {
    throw new Error(`Preview PDF fetch failed (${res.status})`);
  }
  return res.blob();
}

export async function sendDocumentEmail({
  apiBaseUrl,
  documentId,
  windowName,
  documentNo,
  pdfBlob,
  pdfBlobUrl,
  recipientEdits,
  messageEdits,
}) {
  const contractName = resolveDocumentEmailContract(windowName);
  await cacheDocumentPreviewFile({
    apiBaseUrl,
    specName: windowName,
    documentId,
    documentNo,
    pdfBlob,
    pdfBlobUrl,
  });
  const res = await fetch(`${resolveNeoBaseUrl(apiBaseUrl)}/email-contracts/${contractName}/send`, {
    method: 'POST',
    headers: writeHeaders(),
    credentials: 'include',
    body: JSON.stringify(buildEmailContractCommand(contractName, documentId, { recipientEdits, messageEdits })),
  });
  return readEmailContractResponse(res);
}
