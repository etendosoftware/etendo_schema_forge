import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// CATEGORY_MAP mirrors the mapping in PendingTasksRail.jsx (taskKey → subject/state i18n keys + badge category).
// Kept in sync with the component — if a new taskKey is added there, add it here too.
const CATEGORY_MAP = {
  overdueInvoices:               { category: 'sales',       subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'  },
  overdueInvoices_plural:        { category: 'sales',       subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'  },
  pendingSalesDeliveries:        { category: 'sales',       subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'  },
  pendingSalesDeliveries_plural: { category: 'sales',       subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'  },
  collectionsDueToday:           { category: 'collections', subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday' },
  collectionsDueToday_plural:    { category: 'collections', subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday' },
  paymentsDueToday:              { category: 'payments',    subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday' },
  paymentsDueToday_plural:       { category: 'payments',    subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday' },
  pendingReceptions:             { category: 'purchases',   subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'  },
  pendingReceptions_plural:      { category: 'purchases',   subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'  },
  lowStockAlert:                 { category: 'stock',       subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock' },
  lowStockAlerts:                { category: 'stock',       subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock' },
};

const STATUS_BADGE_STYLES = {
  sales:       { backgroundColor: 'var(--status-destructive-bg)', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / 0.3)' },
  collections: { backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', borderColor: 'var(--status-warning-border)' },
  payments:    { backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', borderColor: 'var(--status-warning-border)' },
  purchases:   { backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info-fg)', borderColor: 'var(--status-info-border)' },
  stock:       { backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', borderColor: 'var(--status-warning-border)' },
  other:       { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border-subtle))' },
};

function resolveTaskMeta(task) {
  const key = task.taskKey;
  const meta = key && CATEGORY_MAP[key];
  if (meta) return meta;
  return { category: 'other', subjectKey: null, stateKey: null };
}

describe('PendingTasksRail — CATEGORY_MAP completeness', () => {
  const KNOWN_TASK_KEYS = Object.keys(CATEGORY_MAP);

  it('has exactly 12 task keys (6 singular + 6 plural)', () => {
    assert.equal(KNOWN_TASK_KEYS.length, 12);
  });

  for (const key of KNOWN_TASK_KEYS) {
    it(`"${key}" has category, subjectKey, and stateKey`, () => {
      const meta = CATEGORY_MAP[key];
      assert.ok(meta.category, `${key}.category is empty`);
      assert.ok(meta.subjectKey, `${key}.subjectKey is empty`);
      assert.ok(meta.stateKey, `${key}.stateKey is empty`);
    });
  }

  it('plural variants share the same category/keys as their singular counterpart', () => {
    const singularKeys = KNOWN_TASK_KEYS.filter(k => !k.endsWith('_plural'));
    for (const key of singularKeys) {
      const pluralKey = `${key}_plural`;
      if (!CATEGORY_MAP[pluralKey]) continue;
      assert.equal(CATEGORY_MAP[key].category,   CATEGORY_MAP[pluralKey].category,   `${key} vs ${pluralKey} category mismatch`);
      assert.equal(CATEGORY_MAP[key].subjectKey, CATEGORY_MAP[pluralKey].subjectKey, `${key} vs ${pluralKey} subjectKey mismatch`);
      assert.equal(CATEGORY_MAP[key].stateKey,   CATEGORY_MAP[pluralKey].stateKey,   `${key} vs ${pluralKey} stateKey mismatch`);
    }
  });
});

describe('PendingTasksRail — resolveTaskMeta fallback', () => {
  it('returns "other" category for an unknown taskKey', () => {
    const meta = resolveTaskMeta({ taskKey: 'unknownTask' });
    assert.equal(meta.category, 'other');
    assert.equal(meta.subjectKey, null);
    assert.equal(meta.stateKey, null);
  });

  it('returns "other" category when taskKey is absent', () => {
    assert.equal(resolveTaskMeta({}).category, 'other');
  });

  it('resolves overdueInvoices → sales / pendingSubjectSalesInvoices / pendingStateOverdue', () => {
    const meta = resolveTaskMeta({ taskKey: 'overdueInvoices' });
    assert.equal(meta.category, 'sales');
    assert.equal(meta.subjectKey, 'pendingSubjectSalesInvoices');
    assert.equal(meta.stateKey, 'pendingStateOverdue');
  });

  it('resolves collectionsDueToday → collections / pendingStateDueToday', () => {
    const meta = resolveTaskMeta({ taskKey: 'collectionsDueToday' });
    assert.equal(meta.category, 'collections');
    assert.equal(meta.stateKey, 'pendingStateDueToday');
  });

  it('resolves paymentsDueToday → payments / pendingStateDueToday', () => {
    const meta = resolveTaskMeta({ taskKey: 'paymentsDueToday' });
    assert.equal(meta.category, 'payments');
    assert.equal(meta.stateKey, 'pendingStateDueToday');
  });

  it('resolves lowStockAlert → stock / pendingStateLowStock', () => {
    const meta = resolveTaskMeta({ taskKey: 'lowStockAlert' });
    assert.equal(meta.category, 'stock');
    assert.equal(meta.stateKey, 'pendingStateLowStock');
  });

  it('resolves pendingReceptions_plural → purchases / pendingStatePending', () => {
    const meta = resolveTaskMeta({ taskKey: 'pendingReceptions_plural' });
    assert.equal(meta.category, 'purchases');
    assert.equal(meta.stateKey, 'pendingStatePending');
  });
});

describe('PendingTasksRail — STATUS_BADGE_STYLES semantic roles', () => {
  const EXPECTED_CATEGORIES = ['sales', 'collections', 'payments', 'purchases', 'stock', 'other'];

  it('has all 6 required category styles', () => {
    for (const cat of EXPECTED_CATEGORIES) {
      assert.ok(STATUS_BADGE_STYLES[cat], `Missing style for category: ${cat}`);
    }
  });

  it('every style has backgroundColor, color, and borderColor', () => {
    for (const [cat, style] of Object.entries(STATUS_BADGE_STYLES)) {
      assert.ok(style.backgroundColor, `${cat}.backgroundColor is empty`);
      assert.ok(style.color, `${cat}.color is empty`);
      assert.ok(style.borderColor, `${cat}.borderColor is empty`);
    }
  });

  it('sales uses destructive roles', () => {
    assert.equal(STATUS_BADGE_STYLES.sales.backgroundColor, 'var(--status-destructive-bg)');
    assert.equal(STATUS_BADGE_STYLES.sales.color, 'hsl(var(--destructive))');
    assert.equal(STATUS_BADGE_STYLES.sales.borderColor, 'hsl(var(--destructive) / 0.3)');
  });

  it('collections uses warning roles', () => {
    assert.equal(STATUS_BADGE_STYLES.collections.backgroundColor, 'var(--status-warning-bg)');
    assert.equal(STATUS_BADGE_STYLES.collections.color, 'var(--status-warning-fg)');
    assert.equal(STATUS_BADGE_STYLES.collections.borderColor, 'var(--status-warning-border)');
  });

  it('payments shares the same palette as collections', () => {
    assert.deepStrictEqual(STATUS_BADGE_STYLES.payments, STATUS_BADGE_STYLES.collections);
  });

  it('purchases uses info roles', () => {
    assert.equal(STATUS_BADGE_STYLES.purchases.backgroundColor, 'var(--status-info-bg)');
    assert.equal(STATUS_BADGE_STYLES.purchases.color, 'var(--status-info-fg)');
    assert.equal(STATUS_BADGE_STYLES.purchases.borderColor, 'var(--status-info-border)');
  });

  it('stock uses warning roles', () => {
    assert.equal(STATUS_BADGE_STYLES.stock.backgroundColor, 'var(--status-warning-bg)');
    assert.equal(STATUS_BADGE_STYLES.stock.color, 'var(--status-warning-fg)');
    assert.equal(STATUS_BADGE_STYLES.stock.borderColor, 'var(--status-warning-border)');
  });

  it('other (fallback) uses muted roles', () => {
    assert.equal(STATUS_BADGE_STYLES.other.backgroundColor, 'hsl(var(--muted))');
    assert.equal(STATUS_BADGE_STYLES.other.color, 'hsl(var(--muted-foreground))');
    assert.equal(STATUS_BADGE_STYLES.other.borderColor, 'hsl(var(--border-subtle))');
  });
});
