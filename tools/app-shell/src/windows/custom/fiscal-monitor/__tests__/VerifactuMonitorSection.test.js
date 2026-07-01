import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'VerifactuMonitorSection.jsx'), 'utf8');

// Guards: core primitives are imported from FmPrimitives
describe('VerifactuMonitorSection — FmPrimitives imports', () => {
  it('imports StatusPill from FmPrimitives', () => assert.match(src, /StatusPill.*from.*FmPrimitives/));
  it('imports ScrollSentinel from FmPrimitives', () => assert.match(src, /ScrollSentinel.*from.*FmPrimitives/));
  it('does not import fmtDate (no date column in Verifactu)', () => assert.doesNotMatch(src, /fmtDate.*from.*FmPrimitives/));
});

// Guards: table structure — 6 cols (checkbox + 5 data), no date/issuerNIF columns
describe('VerifactuMonitorSection — table structure', () => {
  it('header row has exactly 6 <th> elements', () => {
    const thMatches = src.match(/<th[\s>]/g) || [];
    assert.equal(thMatches.length, 6);
  });

  it('empty-state row uses colSpan={6}', () => {
    assert.match(src, /colSpan=\{6\}/);
  });
});

// Guards: onVfErrorClick wiring — StatusPill click opens VfSolveErrorModal for error rows
describe('VerifactuMonitorSection — onBpClick wiring', () => {
  it('declares onBpClick in the function signature', () => {
    assert.match(src, /onBpClick\b/);
  });

  it('declares onVfErrorClick in the function signature', () => {
    assert.match(src, /onVfErrorClick\b/);
  });

  it('imports isErrorStatus from FmPrimitives', () => {
    assert.match(src, /isErrorStatus.*from.*FmPrimitives/);
  });

  it('passes onClick prop to StatusPill', () => {
    assert.match(src, /StatusPill[\s\S]*?onClick=/);
  });

  it('onClick is conditional on isErrorStatus result', () => {
    assert.match(src, /isErrorStatus[\s\S]*?onVfErrorClick/);
  });

  it('onClick callback passes the full row to onVfErrorClick', () => {
    assert.match(src, /onVfErrorClick\?\.\(row\)/);
  });
});

// Guards: export button and related state/constants are present
describe('VerifactuMonitorSection — CSV export wiring', () => {
  it('imports fetchCsvAndDownload from FmPrimitives', () => {
    assert.match(src, /fetchCsvAndDownload.*from.*FmPrimitives/);
  });

  it('imports buildCsvAndDownload from FmPrimitives', () => {
    assert.match(src, /buildCsvAndDownload.*from.*FmPrimitives/);
  });

  it('declares VF_CORRECT_EXPORT_COLS constant', () => {
    assert.match(src, /const VF_CORRECT_EXPORT_COLS/);
  });

  it('VF_CORRECT_EXPORT_COLS is an array with at least one column definition', () => {
    assert.match(src, /VF_CORRECT_EXPORT_COLS\s*=\s*\[/);
  });

  it('declares exporting state with useState', () => {
    assert.match(src, /const\s+\[exporting,\s*setExporting\]\s*=\s*useState\(false\)/);
  });

  it('export button has onClick={handleExport}', () => {
    assert.match(src, /onClick=\{handleExport\}/);
  });

  it('export button is disabled when loading or exporting', () => {
    assert.match(src, /disabled=\{loading \|\| exporting\}/);
  });

  it('handleExport uses fetchCsvAndDownload for the correct tab', () => {
    assert.match(src, /fetchCsvAndDownload[\s\S]*?VF_CORRECT_EXPORT_COLS/);
  });

  it('handleExport uses buildCsvAndDownload for the problems tab (client-side)', () => {
    assert.match(src, /buildCsvAndDownload\s*\(\s*['"]verifactu_problems['"]/);
  });
});

// Guards: resolve errors button — new feature for clearing invalid/partial rows
describe('VerifactuMonitorSection — resolve errors button', () => {
  it('declares onVfResolveClick in the function signature', () => {
    assert.match(src, /onVfResolveClick\b/);
  });

  it('computes selectedErrorRows from selectedIds and isErrorStatus', () => {
    assert.match(src, /selectedErrorRows/);
    assert.match(src, /isErrorStatus/);
    assert.match(src, /selectedIds\.has/);
  });

  it('computes selectedErrorType to detect mixed selections', () => {
    assert.match(src, /selectedErrorType/);
  });

  it('canResolve is false when selectedErrorType is mixed', () => {
    assert.match(src, /selectedErrorType !== 'mixed'/);
  });

  it('resolve button and export button share a flex container with gap', () => {
    assert.match(src, /style=\{\{ display: 'flex', gap: 8 \}\}/);
  });

  it('resolve button calls onVfResolveClick with selectedErrorRows', () => {
    assert.match(src, /onVfResolveClick\?\.\(selectedErrorRows\)/);
  });

  it('resolve button has fm-export-btn--primary class', () => {
    assert.match(src, /fm-export-btn--primary/);
  });

  it('resolve button title uses vfSolveError.mixedTypes when canResolve is false', () => {
    assert.match(src, /vfSolveError\.mixedTypes/);
  });
});
