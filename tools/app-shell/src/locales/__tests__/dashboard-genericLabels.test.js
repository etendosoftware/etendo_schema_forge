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
  'financialSummaryNegative',
  'financialSummaryIncome',
  'financialSummaryExpenses',
  'financialSummaryProfit',
  'yoyUp',
  'yoyDown',
  'financialSummaryPeriodYtd',
  'financialSummaryPeriodMtd',
  'financialSummaryPeriodLast30d',
  'financialSummaryPeriodLast90d',
  'financialSummaryPeriodLastYear',
  'financialSummaryComparisonYtd',
  'financialSummaryComparisonMtd',
  'financialSummaryComparisonLast30d',
  'financialSummaryComparisonLast90d',
  'financialSummaryComparisonLastYear',
  'financialSummaryNoPrevious',
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

// ETP-5493: the Financial Summary copy is interpolated with the selected period.
describe('Dashboard genericLabels — ETP-5493 period placeholders', () => {
  for (const locale of ['en_US', 'es_ES', 'es_AR']) {
    describe(locale, () => {
      let labels;

      before(() => {
        const url = new URL(`../${locale}.json`, import.meta.url);
        labels = JSON.parse(readFileSync(url, 'utf8')).genericLabels;
      });

      for (const key of ['financialSummaryPositive', 'financialSummaryNegative']) {
        it(`${key} contains the {period} placeholder`, () => {
          assert.ok(labels[key].includes('{period}'), `${key} must include {period}`);
        });
      }

      for (const key of ['yoyUp', 'yoyDown']) {
        it(`${key} contains the {pct} and {comparison} placeholders`, () => {
          assert.ok(labels[key].includes('{pct}'), `${key} must include {pct}`);
          assert.ok(labels[key].includes('{comparison}'), `${key} must include {comparison}`);
        });
      }

      it('has all 11 new period/comparison/no-previous keys as non-blank strings', () => {
        const newKeys = DASHBOARD_KEYS.filter(
          (k) => /^financialSummary(Period|Comparison)/.test(k) || k === 'financialSummaryNoPrevious',
        );
        assert.equal(newKeys.length, 11);
        for (const key of newKeys) {
          assert.equal(typeof labels[key], 'string', `${locale}.${key} must be a string`);
          assert.ok(labels[key].trim().length > 0, `${locale}.${key} must not be blank`);
        }
      });

      it('the period and comparison fragments carry no unresolved placeholders', () => {
        for (const key of DASHBOARD_KEYS.filter((k) => /^financialSummary(Period|Comparison)/.test(k))) {
          assert.doesNotMatch(labels[key], /\{\w+\}/, `${locale}.${key} must be a plain fragment`);
        }
      });
    });
  }
});
