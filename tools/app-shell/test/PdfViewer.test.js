import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');
const SOURCE = resolve(APP_SHELL, 'src/windows/custom/shared/PdfViewer.jsx');
const EN_LOCALE = resolve(APP_SHELL, 'src/locales/en_US.json');
const ES_LOCALE = resolve(APP_SHELL, 'src/locales/es_ES.json');

describe('PdfViewer source', () => {
  it('file exists', () => {
    assert.ok(existsSync(SOURCE), 'PdfViewer.jsx should exist');
  });

  it('exports PdfViewer as default', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export default function PdfViewer'), 'should export default PdfViewer');
  });

  it('uses react-pdf Document and Page components', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("from 'react-pdf'"), 'should import from react-pdf');
    assert.ok(src.includes('Document'), 'should use Document component');
    assert.ok(src.includes('Page'), 'should use Page component');
  });

  it('configures pdf.js worker via Vite ?url import', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("'pdfjs-dist/build/pdf.worker.min.mjs?url'"),
      'should import worker file via Vite ?url syntax'
    );
    assert.ok(
      src.includes('pdfjs.GlobalWorkerOptions.workerSrc'),
      'should assign worker to GlobalWorkerOptions.workerSrc'
    );
  });

  it('defines zoom step and bounds', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('ZOOM_STEP'), 'should define ZOOM_STEP constant');
    assert.ok(src.includes('MIN_ZOOM'), 'should define MIN_ZOOM constant');
    assert.ok(src.includes('MAX_ZOOM'), 'should define MAX_ZOOM constant');
  });

  it('clamps zoom-in at MAX_ZOOM and zoom-out at MIN_ZOOM', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes('Math.min(s + ZOOM_STEP, MAX_ZOOM)'),
      'zoomIn should clamp to MAX_ZOOM'
    );
    assert.ok(
      src.includes('Math.max(s - ZOOM_STEP, MIN_ZOOM)'),
      'zoomOut should clamp to MIN_ZOOM'
    );
  });

  it('toggles fit mode between width and page', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("'width'"), 'should declare width mode');
    assert.ok(src.includes("'page'"), 'should declare page mode');
    assert.ok(
      src.includes('toggleFitMode'),
      'should expose toggleFitMode handler'
    );
    assert.ok(
      src.includes("(m === 'width' ? 'page' : 'width')"),
      'toggle should swap between width and page'
    );
  });

  it('measures the outer container (not scrollRef) to avoid scrollbar feedback loop', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('ResizeObserver'), 'should use ResizeObserver');
    assert.ok(
      src.includes('containerRef.current'),
      'ResizeObserver should observe containerRef (outer wrapper without overflow), not scrollRef'
    );
  });

  it('renders the page with width = baseWidth * scale (no scale prop on Page)', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes('baseWidth * scale'),
      'effectiveWidth should be baseWidth multiplied by scale'
    );
    assert.ok(
      src.includes('width={effectiveWidth}'),
      'Page should receive width prop, not scale (avoids react-pdf double-multiplication)'
    );
  });

  it('reads page aspect ratio from the loaded PDF (with A4 fallback)', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('A4_ASPECT'), 'should declare A4_ASPECT fallback');
    assert.ok(src.includes('842 / 595'), 'A4_ASPECT should be portrait height/width');
    assert.ok(
      src.includes('originalWidth') && src.includes('originalHeight'),
      'should read originalWidth/Height from page on load'
    );
  });

  it('disables zoom buttons at min/max boundaries', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('disabled={scale >= MAX_ZOOM}'), 'zoom-in disabled at max');
    assert.ok(src.includes('disabled={scale <= MIN_ZOOM}'), 'zoom-out disabled at min');
  });

  it('uses i18n keys for aria-labels (no hardcoded strings)', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("ui('pdfViewerZoomIn')"),
      'zoom-in aria-label should use ui(pdfViewerZoomIn)'
    );
    assert.ok(
      src.includes("ui('pdfViewerFitToPage')"),
      'fit-to-page aria-label should use ui(pdfViewerFitToPage)'
    );
    assert.ok(
      src.includes("ui('pdfViewerZoomOut')"),
      'zoom-out aria-label should use ui(pdfViewerZoomOut)'
    );
    assert.ok(
      !src.match(/aria-label="Zoom in"|aria-label="Zoom out"|aria-label="Fit to page"/),
      'should not have hardcoded English aria-labels'
    );
  });

  it('declares the i18n keys in en_US and es_ES locales', () => {
    const en = JSON.parse(readFileSync(EN_LOCALE, 'utf8')).genericLabels;
    const es = JSON.parse(readFileSync(ES_LOCALE, 'utf8')).genericLabels;
    for (const key of ['pdfViewerZoomIn', 'pdfViewerFitToPage', 'pdfViewerZoomOut']) {
      assert.ok(en[key], `en_US.genericLabels should declare ${key}`);
      assert.ok(es[key], `es_ES.genericLabels should declare ${key}`);
    }
  });
});
