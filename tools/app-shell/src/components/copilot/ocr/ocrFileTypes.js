import { isFileTypeAllowed } from '@/components/attachments/attachmentPolicy';
import { FILE_TYPE_TABLE } from '@/windows/custom/shared/attachmentFileTypes';

/**
 * ETP-5735 — formats the OCR reader accepts: the `ocr` entries of the shared `FILE_TYPE_TABLE`
 * (the generic attachment types also allow GIF/SVG, which the OCR tool cannot read).
 */
const OCR_TYPES = FILE_TYPE_TABLE.filter((type) => type.ocr);

const EXTENSIONS_BY_MIME = Object.fromEntries(OCR_TYPES.map((type) => [type.mime, type.extensions]));

export const OCR_ALLOWED_MIME_TYPES = OCR_TYPES.map((type) => type.mime);

/** Extensions without the leading dot — the format `isFileTypeAllowed` expects. */
export const OCR_ALLOWED_EXTENSIONS = OCR_TYPES.flatMap((type) => type.extensions);

/** Value for `<input accept>`: MIME list plus dotted extensions. */
export const OCR_ACCEPT_ATTR = [
  ...OCR_ALLOWED_MIME_TYPES,
  ...OCR_ALLOWED_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/**
 * Whether the picked file passes the declared-type check (MIME, falling back to extension).
 * The declared type is only a hint; use `sniffOcrMimeType` for the real one.
 */
export function isOcrFileAllowed(file) {
  return isFileTypeAllowed(file, {
    allowedMimeTypes: OCR_ALLOWED_MIME_TYPES,
    allowedExtensions: OCR_ALLOWED_EXTENSIONS,
  });
}

const startsWith = (bytes, signature, offset = 0) =>
  signature.every((value, index) => bytes[offset + index] === value);

/**
 * Detects the real MIME type from the file's magic bytes. Browsers derive `File.type` from
 * the extension, so a PNG renamed `.pdf` would otherwise reach the PDF viewer.
 *
 * @param {Blob} file
 * @returns {Promise<string|null>} One of `OCR_ALLOWED_MIME_TYPES`, or null when unrecognised.
 */
export async function sniffOcrMimeType(file) {
  let bytes;
  try {
    bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return null;
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) // RIFF
    && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // WEBP
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * File name to store the scanned document under: the original name when its extension already
 * matches the real (sniffed) type, otherwise the extension swapped for the right one. The
 * attachments API rejects a file whose content does not match its extension, so a PNG named
 * `.pdf` would otherwise never be attached.
 *
 * @param {string} fileName - The name the user's file has.
 * @param {string|null} mime - The sniffed MIME (one of `OCR_ALLOWED_MIME_TYPES`).
 * @returns {string} The name to upload under (the original when nothing needs fixing).
 */
export function nameForOcrMime(fileName, mime) {
  const extensions = EXTENSIONS_BY_MIME[mime];
  const name = String(fileName || '');
  if (!extensions) return name;
  const dot = name.lastIndexOf('.');
  const current = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (extensions.includes(current)) return name;
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${extensions[0]}`;
}
