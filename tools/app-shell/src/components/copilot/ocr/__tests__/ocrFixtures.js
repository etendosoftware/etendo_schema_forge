// @covers tools/app-shell/src/components/copilot/ocr/ocrFileTypes.js
// Shared fixtures for the OCR picker tests: files that start with REAL magic bytes, because the
// uploader decides by content (sniffOcrMimeType), not by the declared type or the extension.

export const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34], // %PDF-1.4
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46],
  webp: [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], // RIFF....WEBP
  heic: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], // ....ftypheic
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  text: [0x68, 0x65, 0x6c, 0x6c, 0x6f],
};

/** A File whose first bytes are `bytes`, padded with zeros up to `size`. */
export function makeFile(name, bytes, type, size = 2048) {
  const body = new Uint8Array(Math.max(size, bytes.length));
  body.set(bytes);
  return new File([body], name, { type });
}

export const pdfFile = (name = 'invoice.pdf', size = 2048) => makeFile(name, MAGIC.pdf, 'application/pdf', size);
export const pngFile = (name = 'scan.png', size = 2048) => makeFile(name, MAGIC.png, 'image/png', size);
export const jpegFile = (name = 'scan.jpg', size = 2048) => makeFile(name, MAGIC.jpeg, 'image/jpeg', size);
export const webpFile = (name = 'scan.webp', size = 2048) => makeFile(name, MAGIC.webp, 'image/webp', size);
