import { uploadAndMarkMainAttachment } from '../copilot/ocr/listAttachments.js';

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
export function resolveNeoBaseUrl(apiBaseUrl) {
  return apiBaseUrl ? apiBaseUrl.replace(/\/[^/]+$/, '') : '/sws/neo';
}

// ETP-4315 — physical Attachment table (C_File) per window, mirroring the
// attachmentConfig.tableName wired on each window's Preview component. Windows
// not listed here never pass a real pdfBlob/pdfBlobUrl into SendDocumentModal
// (no caching to do), so cacheDocumentPreviewFile skips them instead of
// falling back to the retired preview-file cache.
export const WINDOW_ATTACHMENT_TABLE = {
  'sales-invoice': 'C_Invoice',
  'purchase-invoice': 'C_Invoice',
  'sales-order': 'C_Order',
  'purchase-order': 'C_Order',
  'sales-quotation': 'C_Order',
  'goods-shipment': 'M_InOut',
  'return-to-vendor-shipment': 'M_InOut',
  'return-material-receipt': 'M_InOut',
};

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
  token,
  specName,
  documentId,
  documentNo,
  pdfBlob,
  pdfBlobUrl,
}) {
  const tableName = WINDOW_ATTACHMENT_TABLE[specName];
  if (!tableName) return { skipped: true };
  const previewBlob = await resolvePreviewBlob(pdfBlob, pdfBlobUrl);
  if (!previewBlob) return { skipped: true };
  const created = await uploadAndMarkMainAttachment({
    token,
    tableName,
    recordId: documentId,
    file: previewBlob,
    fileName: buildPreviewFileName(specName, documentNo, documentId),
    apiBaseUrl,
  });
  if (!created || !created.id) {
    throw new Error('Preview file cache failed');
  }
  return { skipped: false };
}

async function resolvePreviewBlob(pdfBlob, pdfBlobUrl) {
  if (pdfBlob) return pdfBlob;
  if (!pdfBlobUrl) return null;
  // raw-fetch-ok: a blob: URL created by the preview, NOT an API endpoint — it takes no
  // auth headers and no base URL (ETP-5022).
  const res = await fetch(pdfBlobUrl);
  if (!res.ok) {
    throw new Error(`Preview PDF fetch failed (${res.status})`);
  }
  return res.blob();
}

export async function sendDocumentEmail({
  apiBaseUrl,
  token,
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
    token,
    specName: windowName,
    documentId,
    documentNo,
    pdfBlob,
    pdfBlobUrl,
  });
  const res = await apiFetch(`${resolveNeoBaseUrl(apiBaseUrl)}/email-contracts/${contractName}/send`, {
    method: 'POST',
    baseUrl: '',
    token,
    body: JSON.stringify(buildEmailContractCommand(contractName, documentId, { recipientEdits, messageEdits })),
  });
  return readEmailContractResponse(res);
}
