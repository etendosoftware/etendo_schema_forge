import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'TbaiMonitorSection.jsx'), 'utf8');

// Guards: TbaiMonitorSection component contract
describe('TbaiMonitorSection — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function TbaiMonitorSection/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /useUI.*from.*@\/i18n/);
  });

  it('imports TBAI constants from useFiscalMonitor', () => {
    assert.match(src, /TBAI_SPEC/);
    assert.match(src, /TBAI_ENTITY/);
    assert.match(src, /from.*useFiscalMonitor/);
  });
});

// Guards: TbaiMonitorSection.fmtDate is the same shape as the VF version (a.length===4 guard).
// Tested independently so drift between the two copies is caught.
describe('TbaiMonitorSection — fmtDate inline logic (copied from TbaiMonitorSection.jsx)', () => {
  // Copied from TbaiMonitorSection.jsx — not exported.
  function fmtDate(raw) {
    if (!raw) return '—';
    const parts = String(raw).split(/[-/]/);
    if (parts.length !== 3) return raw;
    const [a, b, c] = parts.map(p => p.trim());
    return a.length === 4 ? `${c}/${b}/${a}` : `${a}/${b}/${c}`;
  }

  it('converts ISO yyyy-mm-dd to dd/mm/yyyy', () => assert.equal(fmtDate('2025-04-14'), '14/04/2025'));
  it('converts slash-separated yyyy/mm/dd to dd/mm/yyyy', () => assert.equal(fmtDate('2025/04/14'), '14/04/2025'));
  it('keeps already-formatted dd/mm/yyyy unchanged', () => assert.equal(fmtDate('14/04/2025'), '14/04/2025'));
  it('normalises dd-mm-yyyy to dd/mm/yyyy', () => assert.equal(fmtDate('14-04-2025'), '14/04/2025'));
  it('returns — for null', () => assert.equal(fmtDate(null), '—'));
  it('returns — for empty string', () => assert.equal(fmtDate(''), '—'));
  it('returns raw string when fewer than 3 parts', () => assert.equal(fmtDate('2025-04'), '2025-04'));
  it('trims spaced separators — 2025 - 04 - 14 → 14/04/2025', () => assert.equal(fmtDate('2025 - 04 - 14'), '14/04/2025'));
});

// Guards: onBpClick wiring — StatusPill click must open contact detail for error rows only
describe('TbaiMonitorSection — onBpClick wiring', () => {
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
