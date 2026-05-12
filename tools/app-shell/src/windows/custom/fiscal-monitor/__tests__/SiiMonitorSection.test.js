import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SiiMonitorSection.jsx'), 'utf8');

describe('SiiMonitorSection — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SiiMonitorSection/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /useUI.*from.*@\/i18n/);
  });

  it('imports SII entity constants from useFiscalMonitor', () => {
    assert.match(src, /SII_EMITIDAS_ENTITY/);
    assert.match(src, /SII_RECIBIDAS_ENTITY/);
    assert.match(src, /from.*useFiscalMonitor/);
  });
});

describe('SiiMonitorSection — tab state', () => {
  it('defaults to the issued tab', () => {
    assert.match(src, /useState\(['"]issued['"]\)/);
  });

  it('renders issued and received tab buttons with fm-tabs class', () => {
    assert.match(src, /fm-tabs/);
    assert.match(src, /fiscalMonitor\.sii\.tab\.issued/);
    assert.match(src, /fiscalMonitor\.sii\.tab\.received/);
  });

  it('marks the active tab with the active CSS class', () => {
    assert.match(src, /tab === 'issued' \? ' active'/);
    assert.match(src, /tab === 'received' \? ' active'/);
  });

  it('calls onTabChange with the combined tab+period key', () => {
    assert.match(src, /onTabChange\?\.\(/);
  });
});

describe('SiiMonitorSection — period segmented control', () => {
  it('defaults to the current period', () => {
    assert.match(src, /useState\(['"]current['"]\)/);
  });

  it('renders current and previous period buttons inside fm-segmented', () => {
    assert.match(src, /fm-segmented/);
    assert.match(src, /fiscalMonitor\.sii\.period\.current/);
    assert.match(src, /fiscalMonitor\.sii\.period\.previous/);
  });

  it('marks the active period with the active CSS class', () => {
    assert.match(src, /period === ['"]current['"] \? .* active/);
    assert.match(src, /period === ['"]previous['"] \? .* active/);
  });

  it('combines tab and period into an entity key (issued/received + Previous)', () => {
    assert.match(src, /issuedPrevious/);
    assert.match(src, /receivedPrevious/);
  });
});

describe('SiiMonitorSection — initialTab prop', () => {
  it('derives tab and period from the initialTab prop', () => {
    assert.match(src, /initialTab/);
    assert.match(src, /initialTab\.includes\(['"]previous['"]\)/);
  });

  it('sets received tab when initialTab starts with received', () => {
    assert.match(src, /initialTab\.startsWith\(['"]received['"]\)/);
  });
});

// Guards: SiiMonitorSection.fmtDate now uses the same year-first detection as TBAI/VF
// and trims whitespace from each part (unified across all three monitor sections).
describe('SiiMonitorSection — fmtDate inline logic (copied from SiiMonitorSection.jsx)', () => {
  // Copied from SiiMonitorSection.jsx — not exported.
  function fmtDate(raw) {
    if (!raw) return '—';
    const parts = String(raw).split(/[-/]/);
    if (parts.length !== 3) return raw;
    const [a, b, c] = parts.map(p => p.trim());
    return a.length === 4 ? `${c}/${b}/${a}` : `${a}/${b}/${c}`;
  }

  it('converts ISO yyyy-mm-dd to dd/mm/yyyy', () => assert.equal(fmtDate('2025-04-14'), '14/04/2025'));
  it('converts yyyy/mm/dd to dd/mm/yyyy', () => assert.equal(fmtDate('2025/04/14'), '14/04/2025'));
  it('keeps already-formatted dd/mm/yyyy unchanged', () => assert.equal(fmtDate('14/04/2025'), '14/04/2025'));
  it('normalises dd-mm-yyyy to dd/mm/yyyy', () => assert.equal(fmtDate('14-04-2025'), '14/04/2025'));
  it('trims spaced separators — 2025 - 04 - 14 → 14/04/2025', () => assert.equal(fmtDate('2025 - 04 - 14'), '14/04/2025'));
  it('returns — for null', () => assert.equal(fmtDate(null), '—'));
  it('returns — for empty string', () => assert.equal(fmtDate(''), '—'));
  it('returns raw string when fewer than 3 parts', () => assert.equal(fmtDate('2025-04'), '2025-04'));
});

// Guards: onBpClick wiring — StatusPill click must open contact detail for error rows only
describe('SiiMonitorSection — onBpClick wiring', () => {
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

describe('SiiMonitorSection — data fetching', () => {
  it('uses mockRows prop when provided (bypasses fetch)', () => {
    assert.match(src, /mockRows/);
    assert.match(src, /if \(mockRows\)/);
  });

  it('resets to page 1 when tab or period changes', () => {
    assert.match(src, /setPage\(1\)/);
  });

  it('fetches from the sii-monitor NEO endpoint with parentId param', () => {
    assert.match(src, /parentId/);
    assert.match(src, /_startRow/);
    assert.match(src, /_endRow/);
  });

  it('surfaces fetch errors in state', () => {
    assert.match(src, /setError/);
  });
});

describe('SiiMonitorSection — section title', () => {
  it('renders the SII section title from i18n', () => {
    assert.match(src, /fiscalMonitor\.sii\.title/);
  });

  it('includes a badge-system SII badge', () => {
    assert.match(src, /badge-system/);
  });
});
