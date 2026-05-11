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
