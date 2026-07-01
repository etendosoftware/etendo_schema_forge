import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '..', 'preview-cards', 'buildReturnPreviewContent.jsx'),
  'utf8',
);

describe('buildReturnPreviewContent', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports buildReturnPreviewContent as a named export (not default)', () => {
    assert.match(src, /export function buildReturnPreviewContent/);
  });

  it('does NOT use a default export', () => {
    assert.doesNotMatch(src, /export default/);
  });

  // ── Imports ────────────────────────────────────────────────────────────────

  it('imports PreviewActionButtons and makeStaticPreviewTabs from PreviewActionButtons.jsx', () => {
    assert.match(src, /import PreviewActionButtons.*makeStaticPreviewTabs.*from '\.\.\/PreviewActionButtons\.jsx'/);
  });

  it('imports ReturnDocStatsPanel from local preview-cards', () => {
    assert.match(src, /import ReturnDocStatsPanel from '\.\/ReturnDocStatsPanel\.jsx'/);
  });

  // ── Function signature / destructured params ───────────────────────────────

  it('accepts doc, openEmailModal, pdfBlob, handleDownload, modalRef params', () => {
    assert.match(src, /doc, openEmailModal, pdfBlob, handleDownload, modalRef/);
  });

  it('accepts specs, partnerName, movementDate, token, apiBaseUrl, ui params', () => {
    assert.match(src, /specs, partnerName, movementDate, token, apiBaseUrl, ui/);
  });

  // ── Return value ───────────────────────────────────────────────────────────

  it('returns an object with actionButtons and tabs keys', () => {
    assert.match(src, /return \{ actionButtons, tabs \}/);
  });

  // ── actionButtons — PreviewActionButtons wiring ───────────────────────────

  it('renders PreviewActionButtons in actionButtons', () => {
    assert.match(src, /<PreviewActionButtons/);
  });

  it('passes onEmail={openEmailModal} to PreviewActionButtons', () => {
    assert.match(src, /onEmail=\{openEmailModal\}/);
  });

  it('passes hasPdf={!!pdfBlob} to PreviewActionButtons', () => {
    assert.match(src, /hasPdf=\{!!pdfBlob\}/);
  });

  it('passes onDownloadPdf={handleDownload} to PreviewActionButtons', () => {
    assert.match(src, /onDownloadPdf=\{handleDownload\}/);
  });

  // ── tabs[0] — general tab ─────────────────────────────────────────────────

  it("first tab has key: 'general'", () => {
    assert.match(src, /key: 'general'/);
  });

  it("first tab label uses ui('invoicePreviewGeneral')", () => {
    assert.match(src, /ui\('invoicePreviewGeneral'\)/);
  });

  it('first tab content renders ReturnDocStatsPanel', () => {
    assert.match(src, /<ReturnDocStatsPanel/);
  });

  it('passes doc, partnerName, movementDate, token, apiBaseUrl, ui, specs to ReturnDocStatsPanel', () => {
    assert.match(src, /doc=\{doc\}/);
    assert.match(src, /partnerName=\{partnerName\}/);
    assert.match(src, /movementDate=\{movementDate\}/);
    assert.match(src, /token=\{token\}/);
    assert.match(src, /apiBaseUrl=\{apiBaseUrl\}/);
    assert.match(src, /ui=\{ui\}/);
    assert.match(src, /specs=\{specs\}/);
  });

  // ── makeStaticPreviewTabs spread ──────────────────────────────────────────

  it('spreads makeStaticPreviewTabs(ui) into the tabs array', () => {
    assert.match(src, /\.\.\.makeStaticPreviewTabs\(ui\)/);
  });

  // ── i18n — no hardcoded user-visible strings ──────────────────────────────

  it('uses ui() for sendLabel key (no hardcoded string)', () => {
    assert.match(src, /ui\('invoicePreviewSend'\)/);
  });

  it('uses ui() for downloadLabel key', () => {
    assert.match(src, /ui\('invoicePreviewDownloadPdf'\)/);
  });

  it('uses ui() for editLabel key', () => {
    assert.match(src, /ui\('invoicePreviewEdit'\)/);
  });

});
