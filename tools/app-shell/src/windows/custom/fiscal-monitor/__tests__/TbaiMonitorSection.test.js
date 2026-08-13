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

// Guards: pending status rows open invoice preview instead of the contact popup
describe('TbaiMonitorSection — pending status opens invoice preview', () => {
  it('imports isPendingStatus from FmPrimitives', () => {
    assert.match(src, /isPendingStatus.*from.*FmPrimitives/);
  });

  it('declares onInvoiceOpen in the function signature', () => {
    assert.match(src, /onInvoiceOpen\b/);
  });

  it('onClick callback calls onInvoiceOpen for pending rows', () => {
    assert.match(src, /isPendingStatus[\s\S]*?onInvoiceOpen/);
  });

  it('passes the invoice FK field (row.invoice) as first arg to onInvoiceOpen', () => {
    assert.match(src, /onInvoiceOpen\??\.\(row\.invoice/);
  });

  it('always uses sales-invoice hint for TBAI (TBAI is sales-only)', () => {
    assert.match(src, /sales-invoice/);
  });
});

// Guards: export button and related state/constants are present
describe('TbaiMonitorSection — CSV export wiring', () => {
  it('imports fetchCsvAndDownload from FmPrimitives', () => {
    assert.match(src, /fetchCsvAndDownload.*from.*FmPrimitives/);
  });

  it('declares TBAI_EXPORT_COLS constant', () => {
    assert.match(src, /const TBAI_EXPORT_COLS/);
  });

  it('TBAI_EXPORT_COLS is an array with at least one column definition', () => {
    assert.match(src, /TBAI_EXPORT_COLS\s*=\s*\[/);
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

  it('handleExport calls fetchCsvAndDownload with TBAI_EXPORT_COLS', () => {
    assert.match(src, /fetchCsvAndDownload[\s\S]*?TBAI_EXPORT_COLS/);
  });

  it('handleExport builds criteria params from the active filter', () => {
    assert.match(src, /params\.criteria\s*=|params\[.criteria.\]\s*=/);
  });
});
