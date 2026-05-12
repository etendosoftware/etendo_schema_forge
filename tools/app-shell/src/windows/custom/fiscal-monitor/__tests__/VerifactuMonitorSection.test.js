import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'VerifactuMonitorSection.jsx'), 'utf8');

// Copied from VerifactuMonitorSection.jsx — function is not exported so it is
// tested inline here. Update both if the source changes.
function fmtDate(raw) {
  if (!raw) return '—';
  const parts = String(raw).split(/[-/]/);
  if (parts.length !== 3) return raw;
  const [a, b, c] = parts.map(p => p.trim());
  return a.length === 4 ? `${c}/${b}/${a}` : `${a}/${b}/${c}`;
}

// Guards: fmtDate correctly converts ISO dates from the API to display format
describe('fmtDate — inline logic (copied from VerifactuMonitorSection.jsx)', () => {
  it('converts ISO yyyy-mm-dd to dd/mm/yyyy', () => assert.equal(fmtDate('2025-04-14'), '14/04/2025'));
  it('converts slash-separated yyyy/mm/dd to dd/mm/yyyy', () => assert.equal(fmtDate('2025/04/14'), '14/04/2025'));
  it('keeps already-formatted dd/mm/yyyy unchanged', () => assert.equal(fmtDate('14/04/2025'), '14/04/2025'));
  it('normalises dd-mm-yyyy to dd/mm/yyyy', () => assert.equal(fmtDate('14-04-2025'), '14/04/2025'));
  it('returns — for null', () => assert.equal(fmtDate(null), '—'));
  it('returns — for empty string', () => assert.equal(fmtDate(''), '—'));
  it('returns raw string when fewer than 3 parts', () => assert.equal(fmtDate('2025-04'), '2025-04'));
  it('trims spaced separators — 2025 - 04 - 14 → 14/04/2025', () => assert.equal(fmtDate('2025 - 04 - 14'), '14/04/2025'));
});

// Guards: fmtDate source structure matches expected implementation
describe('fmtDate — source inspection', () => {
  it('function is defined', () => assert.match(src, /function fmtDate\(raw\)/));
  it('returns — for falsy input', () => assert.match(src, /if \(!raw\) return/));
  it('detects year-first format via a.length === 4', () => assert.match(src, /a\.length === 4/));
  it('splits on both - and / separators', () => assert.match(src, /\[-\/\]/));
});

// Guards: date column was added and colSpan updated from 8 to 9
describe('VerifactuMonitorSection — date column structure', () => {
  it('header row has exactly 9 <th> elements', () => {
    const thMatches = src.match(/<th[\s>]/g) || [];
    assert.equal(thMatches.length, 9);
  });

  it('empty-state row uses colSpan={9} (not 8)', () => {
    assert.match(src, /colSpan=\{9\}/);
  });

  it('date column header uses fiscalMonitor.col.date i18n key', () => {
    assert.match(src, /fiscalMonitor\.col\.date/);
  });

  it('date cell renders fmtDate(row.invoiceDate)', () => {
    assert.match(src, /fmtDate\(row\.invoiceDate\)/);
  });
});

// Guards: onBpClick wiring — StatusPill click opens contact detail for error rows
describe('VerifactuMonitorSection — onBpClick wiring', () => {
  it('declares onBpClick in the function signature', () => {
    assert.match(src, /onBpClick\b/);
  });

  it('imports isErrorStatus from FmPrimitives', () => {
    assert.match(src, /isErrorStatus.*from.*FmPrimitives/);
  });

  it('passes onClick prop to StatusPill', () => {
    assert.match(src, /StatusPill[\s\S]*?onClick=/);
  });

  it('onClick is conditional on isErrorStatus result', () => {
    assert.match(src, /isErrorStatus[\s\S]*?onBpClick/);
  });

  it('onClick callback passes businessPartner to onBpClick', () => {
    assert.match(src, /onBpClick.*businessPartner/);
  });
});
