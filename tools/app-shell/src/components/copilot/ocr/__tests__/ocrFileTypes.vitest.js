// @covers tools/app-shell/src/components/copilot/ocr/ocrFileTypes.js
import {
  OCR_ALLOWED_MIME_TYPES,
  OCR_ALLOWED_EXTENSIONS,
  OCR_ACCEPT_ATTR,
  isOcrFileAllowed,
  sniffOcrMimeType,
  nameForOcrMime,
} from '../ocrFileTypes';
import { MAGIC, makeFile, pdfFile, pngFile, jpegFile, webpFile } from './ocrFixtures.js';

describe('OCR accepted formats', () => {
  it('lists PDF, JPEG, PNG and WebP only', () => {
    expect(OCR_ALLOWED_MIME_TYPES).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    expect(OCR_ALLOWED_EXTENSIONS).toEqual(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
  });

  it('builds the accept attribute from MIME types and dotted extensions', () => {
    expect(OCR_ACCEPT_ATTR.split(',')).toEqual([
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      '.pdf', '.jpg', '.jpeg', '.png', '.webp',
    ]);
  });
});

describe('isOcrFileAllowed', () => {
  it.each([
    ['a.pdf', 'application/pdf'],
    ['a.jpg', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
  ])('allows %s declared as %s', (name, type) => {
    expect(isOcrFileAllowed(new File(['x'], name, { type }))).toBe(true);
  });

  it('falls back to the extension when the browser declares no type', () => {
    expect(isOcrFileAllowed(new File(['x'], 'scan.PNG', { type: '' }))).toBe(true);
  });

  it.each([
    ['a.tiff', 'image/tiff'],
    ['a.svg', 'image/svg+xml'],
    ['a.heic', 'image/heic'],
    ['a.gif', 'image/gif'],
    ['a.txt', 'text/plain'],
  ])('rejects %s declared as %s', (name, type) => {
    expect(isOcrFileAllowed(new File(['x'], name, { type }))).toBe(false);
  });
});

describe('sniffOcrMimeType', () => {
  it.each([
    ['PDF', pdfFile(), 'application/pdf'],
    ['PNG', pngFile(), 'image/png'],
    ['JPEG', jpegFile(), 'image/jpeg'],
    ['WebP', webpFile(), 'image/webp'],
  ])('detects %s from its magic bytes', async (_label, file, mime) => {
    expect(await sniffOcrMimeType(file)).toBe(mime);
  });

  it('ignores the declared type and the name', async () => {
    expect(await sniffOcrMimeType(makeFile('x.pdf', MAGIC.png, 'application/pdf'))).toBe('image/png');
    expect(await sniffOcrMimeType(makeFile('x.png', MAGIC.pdf, 'image/png'))).toBe('application/pdf');
  });

  it.each([
    ['HEIC', MAGIC.heic],
    ['GIF', MAGIC.gif],
    ['plain text', MAGIC.text],
  ])('returns null for %s content', async (_label, bytes) => {
    expect(await sniffOcrMimeType(makeFile('x.jpg', bytes, 'image/jpeg'))).toBeNull();
  });

  it('returns null for an empty file', async () => {
    expect(await sniffOcrMimeType(new File([], 'empty.pdf'))).toBeNull();
  });

  it('does not take a bare RIFF container (e.g. WAV) for WebP', async () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    expect(await sniffOcrMimeType(makeFile('x.webp', wav, 'image/webp'))).toBeNull();
  });

  it('returns null instead of throwing when the file cannot be read', async () => {
    const unreadable = { slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }) };
    expect(await sniffOcrMimeType(unreadable)).toBeNull();
  });
});

describe('nameForOcrMime', () => {
  it.each([
    ['invoice.pdf', 'application/pdf', 'invoice.pdf'],
    ['scan.jpg', 'image/jpeg', 'scan.jpg'],
    ['scan.jpeg', 'image/jpeg', 'scan.jpeg'],
    ['SCAN.JPG', 'image/jpeg', 'SCAN.JPG'],
    ['Scan.PNG', 'image/png', 'Scan.PNG'],
    ['a.webp', 'image/webp', 'a.webp'],
  ])('keeps %s when its extension already matches %s', (name, mime, expected) => {
    expect(nameForOcrMime(name, mime)).toBe(expected);
  });

  it.each([
    ['fake.pdf', 'image/png', 'fake.png'],
    ['scan.png', 'application/pdf', 'scan.pdf'],
    ['photo.jpg', 'image/webp', 'photo.webp'],
    ['photo.png', 'image/jpeg', 'photo.jpg'],
  ])('swaps the extension of %s for the one of %s', (name, mime, expected) => {
    expect(nameForOcrMime(name, mime)).toBe(expected);
  });

  it('swaps only the last extension', () => {
    expect(nameForOcrMime('Copia de a.b.pdf', 'image/png')).toBe('Copia de a.b.png');
  });

  it('treats a leading-dot name as a dotfile and appends the extension', () => {
    expect(nameForOcrMime('.png', 'application/pdf')).toBe('.png.pdf');
  });

  it('appends the extension when the name has none', () => {
    expect(nameForOcrMime('receipt', 'image/png')).toBe('receipt.png');
  });

  it.each([[null], [undefined], ['image/gif']])('returns the original name for an unknown mime (%s)', (mime) => {
    expect(nameForOcrMime('fake.pdf', mime)).toBe('fake.pdf');
  });
});
