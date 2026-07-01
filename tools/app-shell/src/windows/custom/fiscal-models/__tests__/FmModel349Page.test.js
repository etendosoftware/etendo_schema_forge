import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'models', '349', 'FmModel349Page.jsx'), 'utf8');

describe('FmModel349Page — exports', () => {
  it('has default export', () => assert.match(src, /export default/));
});

describe('FmModel349Page — composition', () => {
  it('renders KpiWidget', () => assert.match(src, /KpiWidget/));
  it('has back navigation (onBack)', () => assert.match(src, /onBack/));
  it('renders operator table', () => assert.match(src, /operator|operador/i));
});

describe('FmModel349Page — no removed features', () => {
  it('does not reference AuditReasonModal', () => assert.doesNotMatch(src, /AuditReasonModal/));
  it('does not reference manualAdj', () => assert.doesNotMatch(src, /manualAdj/));
});

describe('FmModel349Page — keys (no Triangulares, pairs grouped)', () => {
  // KEY_IDS is defined as a plain string array: const KEY_IDS = ['E', 'S', 'A', 'I']
  const keyIds = src.match(/const KEY_IDS\s*=\s*\[([^\]]+)\]/)?.[1] ?? '';

  it('does not include Triangulares key', () => assert.doesNotMatch(src, /Triangulares/));
  it('has Entregas key (E)', () => assert.match(keyIds, /'E'/));
  it('has Servicios prestados key (S)', () => assert.match(keyIds, /'S'/));
  it('has Adquisiciones key (A)', () => assert.match(keyIds, /'A'/));
  it('has Servicios recibidos key (I)', () => assert.match(keyIds, /'I'/));
  it('Entregas (E) appears before Servicios prestados (S) in KEYS', () => {
    const eIdx = keyIds.indexOf("'E'");
    const sIdx = keyIds.indexOf("'S'");
    assert.ok(eIdx !== -1 && sIdx !== -1 && eIdx < sIdx, 'E must come before S');
  });
  it('Servicios prestados (S) appears before Adquisiciones (A) in KEYS', () => {
    const sIdx = keyIds.indexOf("'S'");
    const aIdx = keyIds.indexOf("'A'");
    assert.ok(sIdx !== -1 && aIdx !== -1 && sIdx < aIdx, 'S must come before A');
  });
  it('Adquisiciones (A) appears before Servicios recibidos (I) in KEYS', () => {
    const aIdx = keyIds.indexOf("'A'");
    const iIdx = keyIds.indexOf("'I'");
    assert.ok(aIdx !== -1 && iIdx !== -1 && aIdx < iIdx, 'A must come before I');
  });
});

describe('FmModel349Page — compute & generate wiring', () => {
  it('imports compute349Operators from fiscalModelsUtils', () =>
    assert.match(src, /compute349Operators/));
  it('imports generate349File from fiscalModelsUtils', () =>
    assert.match(src, /generate349File/));
  it('accepts token and apiBaseUrl props', () =>
    assert.match(src, /token.*apiBaseUrl|apiBaseUrl.*token/));
  it('has handleCompute function', () =>
    assert.match(src, /function handleCompute|handleCompute\s*=/));
  it('has handleGenerate function', () =>
    assert.match(src, /function handleGenerate|handleGenerate\s*=/));
  it('has handlePreviewPdf function', () =>
    assert.match(src, /function handlePreviewPdf|handlePreviewPdf\s*=/));
  it('liveOperators state is defined', () =>
    assert.match(src, /liveOperators/));
});

describe('FmModel349Page — PDF preview', () => {
  it('imports use349Pdf', () =>
    assert.match(src, /use349Pdf/));
  it('imports DocumentPreview', () =>
    assert.match(src, /DocumentPreview/));
  it('renders DocumentPreview (in JSX)', () =>
    assert.match(src, /<DocumentPreview/));
  it('has showPdf state', () =>
    assert.match(src, /showPdf/));
  it('calls clearPdf on close (onClose clears state)', () =>
    assert.match(src, /clearPdf/));
});

describe('FmModel349Page — button states', () => {
  it('Recalculate button has disabled={computing} attribute', () =>
    assert.match(src, /disabled=\{computing\}/));
  it('Generate button has disabled={generating} attribute', () =>
    assert.match(src, /disabled=\{generating\}/));
  it('Preview PDF button has disabled={pdfLoading} attribute', () =>
    assert.match(src, /disabled=\{pdfLoading\}/));
});
