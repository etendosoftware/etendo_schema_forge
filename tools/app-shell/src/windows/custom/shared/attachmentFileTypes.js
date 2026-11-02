/**
 * Single source of file-type knowledge for attachments and the OCR reader (ETP-5735): each
 * entry pairs a MIME type with its rendering group, the extensions that map to it and whether
 * the OCR tool can read it (GIF/SVG cannot). `ACCEPTED_TYPES`, the extension -> MIME lookup and
 * the OCR allow-list in `components/copilot/ocr/ocrFileTypes.js` are all derived from it.
 */
export const FILE_TYPE_TABLE = [
  { mime: 'application/pdf', group: 'pdf', extensions: ['pdf'], ocr: true },
  { mime: 'image/jpeg', group: 'image', extensions: ['jpg', 'jpeg'], ocr: true },
  { mime: 'image/jpg', group: 'image', extensions: [], ocr: false },
  { mime: 'image/png', group: 'image', extensions: ['png'], ocr: true },
  { mime: 'image/gif', group: 'image', extensions: ['gif'], ocr: false },
  { mime: 'image/webp', group: 'image', extensions: ['webp'], ocr: true },
  { mime: 'image/svg+xml', group: 'image', extensions: ['svg'], ocr: false },
];

export const ACCEPTED_TYPES = Object.fromEntries(
  FILE_TYPE_TABLE.map(({ mime, group }) => [mime, group]),
);

export const ACCEPT_ATTR = Object.keys(ACCEPTED_TYPES).join(',');

const MIME_BY_EXTENSION = Object.fromEntries(
  FILE_TYPE_TABLE.flatMap(({ mime, extensions }) => extensions.map((ext) => [ext, mime])),
);

const GENERIC_MIME = 'application/octet-stream';

/**
 * ETP-5735 — the MIME type a stored attachment should be rendered as. The stored data type
 * wins unless it is blank or the generic `application/octet-stream` (the core's MIME
 * detection does not recognise WEBP and answers that); then the file name's extension is
 * consulted, limited to the types in `ACCEPTED_TYPES`. Anything unknown keeps the stored value.
 *
 * @param {string|null|undefined} dataType - The attachment's stored data type.
 * @param {string|null|undefined} fileName - The attachment's file name.
 * @returns {string|null|undefined} The type to route the viewer on.
 */
export function resolveAttachmentMime(dataType, fileName) {
  if (dataType && dataType !== GENERIC_MIME) return dataType;
  const name = String(fileName || '');
  const dot = name.lastIndexOf('.');
  const fromName = dot >= 0 ? MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] : undefined;
  return fromName && ACCEPTED_TYPES[fromName] ? fromName : dataType;
}
