import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FiscalKpiCards.jsx'), 'utf8');

describe('FiscalKpiCards — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function FiscalKpiCards/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /useUI.*from.*@\/i18n/);
  });

  it('returns null for unknown variants', () => {
    assert.match(src, /return null/);
  });
});

describe('FiscalKpiCards — SII variant', () => {
  it('renders four KPI cards for the sii variant', () => {
    assert.match(src, /variant === ['"]sii['"]/);
    assert.match(src, /fiscalMonitor\.kpi\.sii\.issued/);
    assert.match(src, /fiscalMonitor\.kpi\.sii\.received/);
  });

  it('includes the current-period sub label on both cards (previous-period card removed, ETP-5432)', () => {
    const matches = src.match(/fiscalMonitor\.kpi\.sii\.sub\.current/g);
    assert.ok(matches && matches.length >= 2, 'expected sub.current on both issued and received cards');
    assert.doesNotMatch(src, /fiscalMonitor\.kpi\.sii\.sub\.previous/);
  });

  it('marks the issued card active when activeKey === issued', () => {
    assert.match(src, /activeKey === ['"]issued['"]/);
  });

  it('marks the received card active when activeKey === received', () => {
    assert.match(src, /activeKey === ['"]received['"]/);
  });

  it('calls onPick with issued when the issued card is clicked', () => {
    assert.match(src, /onPick\(['"]issued['"]\)/);
  });

  it('calls onPick with received when the received card is clicked', () => {
    assert.match(src, /onPick\(['"]received['"]\)/);
  });
});

describe('FiscalKpiCards — TBAI variant', () => {
  it('renders three KPI cards for the tbai variant', () => {
    assert.match(src, /variant === ['"]tbai['"]/);
    assert.match(src, /fiscalMonitor\.kpi\.tbai\.total/);
  });

  it('includes an error/rejected KPI combining rejected + error counts', () => {
    assert.match(src, /\(tbai\.rejected \?\? 0\) \+ \(tbai\.error \?\? 0\)/);
  });

  it('TBAI error card active key aligns with onPick key (Rechazado)', () => {
    assert.match(src, /activeKey === ['"]Rechazado['"]/);
  });
});

describe('FiscalKpiCards — Verifactu variant', () => {
  it('renders four KPI cards for the verifactu variant', () => {
    assert.match(src, /variant === ['"]verifactu['"]/);
    assert.match(src, /fiscalMonitor\.kpi\.verifactu\.accepted/);
    assert.match(src, /fiscalMonitor\.kpi\.verifactu\.partiallyAccepted/);
    assert.match(src, /fiscalMonitor\.kpi\.verifactu\.rejected/);
    assert.match(src, /fiscalMonitor\.kpi\.verifactu\.invalid/);
  });

  it('calls onPick with accepted for the accepted card', () => {
    assert.match(src, /onPick\(['"]accepted['"]\)/);
  });

  it('calls onPick with rejected for the rejected card', () => {
    assert.match(src, /onPick\(['"]rejected['"]\)/);
  });
});

describe('FiscalKpiCards — FmKpi primitive', () => {
  it('each KPI card is clickable (role=button, onClick, tabIndex)', () => {
    assert.match(src, /role="button"/);
    assert.match(src, /tabIndex=\{0\}/);
    assert.match(src, /onClick/);
  });

  it('applies active class when active prop is true', () => {
    assert.match(src, /active \? ' active' : ''/);
  });

  it('formats numbers with toLocaleString de-DE', () => {
    assert.match(src, /toLocaleString\(['"]de-DE['"]\)/);
  });
});
