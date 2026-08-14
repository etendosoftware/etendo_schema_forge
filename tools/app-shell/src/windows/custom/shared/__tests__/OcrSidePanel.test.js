import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'OcrSidePanel.jsx'), 'utf8');

describe('OcrSidePanel — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function OcrSidePanel/);
  });

  it('declares the three Figma tabs (Archivo, Mensajes, Historial)', () => {
    assert.match(src, /labelKey:\s*'ocrSidePanelTabFile'/);
    assert.match(src, /labelKey:\s*'ocrSidePanelTabMessages'/);
    assert.match(src, /labelKey:\s*'ocrSidePanelTabHistory'/);
  });

  it('starts with the file tab active by default', () => {
    assert.match(src, /useState\(\s*['"]file['"]\s*\)/);
  });

  it('lazy-loads OcrInlineUploader instead of importing eagerly', () => {
    assert.match(src, /lazy\(\s*\(\)\s*=>\s*import\(/);
    assert.match(src, /OcrInlineUploader/);
    assert.match(src, /Suspense/);
  });

  it('matches the OCR doc type from the current route', () => {
    assert.match(src, /matchOcrDocType\(location\.pathname\)/);
  });

  it('passes docTypeId from the matched OCR doc type to the uploader', () => {
    assert.match(src, /docTypeId:\s*ocrDocType\?\.id/);
  });
});

describe('OcrSidePanel — FileTab gating', () => {
  it('renders the OcrInlineUploader when isNew (new record path)', () => {
    assert.match(src, /if \(props\.isNew\)/);
    assert.match(src, /<LazyOcrInlineUploader[\s\S]*?\{\.\.\.props\}[\s\S]*?\/>/);
  });

  it('renders the AttachmentsView when not isNew (edit path)', () => {
    assert.match(src, /return <AttachmentsView[\s\S]*?\{\.\.\.props\}[\s\S]*?\/>/);
  });
});

describe('OcrSidePanel — AttachmentsView', () => {
  it('looks up the docType to derive the AD table name for the lookup call', () => {
    assert.match(src, /getOcrDocType\(docTypeId\)\?\.tableName/);
  });

  it('resolves the record\'s single marked "main" attachment inside an effect (ETP-4315 — no ad-hoc PDF heuristic)', () => {
    assert.match(src, /fetchMainAttachment\(\{\s*token,\s*tableName,\s*recordId,\s*apiBaseUrl\s*\}\)/);
    assert.doesNotMatch(src, /listAttachments\(/);
    assert.doesNotMatch(src, /\.find\(\s*a\s*=>\s*\/\\\.pdf\$\/i\.test/);
  });

  it('renders the resolved main attachment inline via PdfViewer using a blob URL from NEO', () => {
    assert.match(src, /fetchAttachmentBlobUrl\(/);
    assert.match(src, /<LazyPdfViewer url=\{pdfUrl\}/);
  });

  it('revokes the blob URL on unmount to avoid leaking memory', () => {
    assert.match(src, /URL\.revokeObjectURL\(createdUrl\)/);
  });

  it('shows a localized empty state when no attachment is marked as main', () => {
    assert.match(src, /ui\('ocrSidePanelNoAttachments'\)/);
  });
});

describe('OcrSidePanel — i18n', () => {
  it('renders the Figma title and hint via i18n keys', () => {
    assert.match(src, /ui\('ocrSidePanelTitle'\)/);
    assert.match(src, /ui\('ocrSidePanelHint'\)/);
  });

  it('uses the coming-soon key for placeholder tabs', () => {
    assert.match(src, /ui\('ocrSidePanelComingSoon'\)/);
  });

  it('does not contain hardcoded Spanish strings (must go through ui())', () => {
    assert.doesNotMatch(src, />\s*Subir Factura\s*</);
    assert.doesNotMatch(src, />\s*Próximamente\s*</);
    assert.doesNotMatch(src, />\s*Archivo\s*</);
  });
});
