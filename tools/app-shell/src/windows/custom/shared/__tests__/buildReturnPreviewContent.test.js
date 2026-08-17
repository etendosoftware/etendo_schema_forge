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

  it('imports PreviewActionButtons as the default export of PreviewActionButtons.jsx', () => {
    assert.match(src, /import PreviewActionButtons from '\.\.\/PreviewActionButtons\.jsx'/);
  });

  it('imports ReturnDocStatsPanel from local preview-cards', () => {
    assert.match(src, /import ReturnDocStatsPanel from '\.\/ReturnDocStatsPanel\.jsx'/);
  });

  // ── Function signature / destructured params ───────────────────────────────

  it('accepts doc, pdfBlob, handleDownload, modalRef params', () => {
    assert.match(src, /doc, pdfBlob, handleDownload, modalRef/);
    assert.doesNotMatch(src, /openEmailModal/);
  });

  it('accepts specs, partnerName, movementDate, token, apiBaseUrl, ui params', () => {
    assert.match(src, /specs, partnerName, movementDate, token, apiBaseUrl, ui/);
  });

  // ETP-4789: optional canDownload gate, defaulting to true so the existing
  // caller (ReturnMaterialReceiptPreview, out of scope for this ticket) keeps
  // its current always-downloadable behavior.
  it('accepts an optional canDownload param defaulting to true (ETP-4789)', () => {
    assert.match(src, /canDownload = true/);
  });

  it('accepts an optional onEmail param (ETP-4718 — send-email wiring)', () => {
    assert.match(src, /\bonEmail,/);
  });

  // ── Return value ───────────────────────────────────────────────────────────

  it('returns an object with actionButtons and tabs keys', () => {
    assert.match(src, /return \{ actionButtons, tabs \}/);
  });

  // ── actionButtons — PreviewActionButtons wiring ───────────────────────────

  it('renders PreviewActionButtons in actionButtons', () => {
    assert.match(src, /<PreviewActionButtons/);
  });

  it('forwards the onEmail param to PreviewActionButtons (ETP-4718 — send-email wiring)', () => {
    assert.match(src, /<PreviewActionButtons[\s\S]{0,40}onEmail=\{onEmail\}/);
  });

  it('passes hasPdf={!!pdfBlob} to PreviewActionButtons', () => {
    assert.match(src, /hasPdf=\{!!pdfBlob\}/);
  });

  it('passes onDownloadPdf={canDownload ? handleDownload : undefined} to PreviewActionButtons (ETP-4789)', () => {
    assert.match(src, /onDownloadPdf=\{canDownload \? handleDownload : undefined\}/);
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

  // ── tabs — general only ───────────────────────────────────────────────────

  // ETP-4855 — the Messages/History placeholders were removed everywhere, and
  // with them makeStaticPreviewTabs, the helper that injected them into the
  // three windows built through here.
  it('injects no static placeholder tabs', () => {
    assert.doesNotMatch(src, /makeStaticPreviewTabs/);
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
