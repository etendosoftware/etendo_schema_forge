import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// All genericLabels keys consumed by the dashboard components:
//   PendingTasksRail (pending* keys), FinancialSummaryCard (financial* + yoy* keys),
//   BestProductsList (bestProducts* keys), and the shared noDataAvailable key.
const DASHBOARD_KEYS = [
  'pendingTasksTitle',
  'pendingSubjectSalesInvoices',
  'pendingSubjectShipments',
  'pendingSubjectCollections',
  'pendingSubjectPayments',
  'pendingSubjectReceptions',
  'pendingSubjectStock',
  'pendingStateOverdue',
  'pendingStatePending',
  'pendingStateDueToday',
  'pendingStateLowStock',
  'financialSummaryTitle',
  'financialSummaryPositive',
  'financialSummaryIncome',
  'financialSummaryExpenses',
  'financialSummaryProfit',
  'yoyUp',
  'yoyDown',
  'bestProductsTitle',
  'bestProductsTrendPositive',
  'bestProductsToggleUnits',
  'bestProductsToggleRevenue',
  'noDataAvailable',
];

describe('Dashboard genericLabels — en_US contract', () => {
  let enUS;

  before(() => {
    const url = new URL('../en_US.json', import.meta.url);
    enUS = JSON.parse(readFileSync(url, 'utf8'));
  });

  it('en_US.json has a genericLabels section', () => {
    assert.ok(enUS.genericLabels, 'genericLabels section is missing from en_US.json');
    assert.equal(typeof enUS.genericLabels, 'object');
  });

  for (const key of DASHBOARD_KEYS) {
    it(`en_US.genericLabels["${key}"] exists and is a non-empty string`, () => {
      assert.ok(key in enUS.genericLabels, `Missing key: ${key}`);
      assert.equal(typeof enUS.genericLabels[key], 'string', `${key} must be a string`);
      assert.ok(enUS.genericLabels[key].trim().length > 0, `${key} must not be blank`);
    });
  }

  it('yoyUp contains the {pct} placeholder', () => {
    assert.ok(enUS.genericLabels.yoyUp.includes('{pct}'), 'yoyUp must include {pct}');
  });

  it('yoyDown contains the {pct} placeholder', () => {
    assert.ok(enUS.genericLabels.yoyDown.includes('{pct}'), 'yoyDown must include {pct}');
  });
});

describe('Dashboard genericLabels — es_ES contract', () => {
  let esES;

  before(() => {
    const url = new URL('../es_ES.json', import.meta.url);
    esES = JSON.parse(readFileSync(url, 'utf8'));
  });

  it('es_ES.json has a genericLabels section', () => {
    assert.ok(esES.genericLabels, 'genericLabels section is missing from es_ES.json');
    assert.equal(typeof esES.genericLabels, 'object');
  });

  for (const key of DASHBOARD_KEYS) {
    it(`es_ES.genericLabels["${key}"] exists and is a non-empty string`, () => {
      assert.ok(key in esES.genericLabels, `Missing key: ${key}`);
      assert.equal(typeof esES.genericLabels[key], 'string', `${key} must be a string`);
      assert.ok(esES.genericLabels[key].trim().length > 0, `${key} must not be blank`);
    });
  }

  it('yoyUp contains the {pct} placeholder', () => {
    assert.ok(esES.genericLabels.yoyUp.includes('{pct}'), 'yoyUp must include {pct}');
  });

  it('yoyDown contains the {pct} placeholder', () => {
    assert.ok(esES.genericLabels.yoyDown.includes('{pct}'), 'yoyDown must include {pct}');
  });

  it('es_ES translations differ from en_US (not copied verbatim)', () => {
    const url = new URL('../en_US.json', import.meta.url);
    const enUS = JSON.parse(readFileSync(url, 'utf8'));
    assert.notEqual(
      esES.genericLabels.pendingTasksTitle,
      enUS.genericLabels.pendingTasksTitle,
      'es_ES.pendingTasksTitle should be a Spanish translation, not a copy of the English value',
    );
  });
});

describe('Dashboard genericLabels — locale parity', () => {
  let enUS;
  let esES;

  before(() => {
    const enUrl = new URL('../en_US.json', import.meta.url);
    const esUrl = new URL('../es_ES.json', import.meta.url);
    enUS = JSON.parse(readFileSync(enUrl, 'utf8'));
    esES = JSON.parse(readFileSync(esUrl, 'utf8'));
  });

  it('every DASHBOARD_KEY present in en_US is also present in es_ES', () => {
    const missing = DASHBOARD_KEYS.filter(k => !(k in (esES.genericLabels ?? {})));
    assert.equal(
      missing.length, 0,
      `Keys in en_US but missing from es_ES.genericLabels: ${missing.join(', ')}`,
    );
  });
});
