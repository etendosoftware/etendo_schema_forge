import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// CATEGORY_MAP mirrors the mapping in PendingTasksRail.jsx (taskKey → subject/state i18n keys,
// `category` for telemetry, `tone` for badge color). Kept in sync with the component — if a new
// taskKey is added there, add it here too.
//
// ETP-5017: `category` and `tone` were split apart. Before this change the badge color and the
// telemetry bucket were the same field, so the payments card could not turn red on overdue
// without corrupting its `payments` telemetry type. Now `paymentsOverdue*` keeps
// category: 'payments' (telemetry) while tone: 'danger' drives the badge color.
const CATEGORY_MAP = {
  overdueInvoices:               { category: 'sales',       tone: 'danger',  subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'         },
  overdueInvoices_plural:        { category: 'sales',       tone: 'danger',  subjectKey: 'pendingSubjectSalesInvoices', stateKey: 'pendingStateOverdue'         },
  pendingSalesDeliveries:        { category: 'sales',       tone: 'danger',  subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'         },
  pendingSalesDeliveries_plural: { category: 'sales',       tone: 'danger',  subjectKey: 'pendingSubjectShipments',     stateKey: 'pendingStatePending'         },
  collectionsDueToday:           { category: 'collections', tone: 'warning', subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday'        },
  collectionsDueToday_plural:    { category: 'collections', tone: 'warning', subjectKey: 'pendingSubjectCollections',   stateKey: 'pendingStateDueToday'        },
  paymentsDueToday:              { category: 'payments',    tone: 'warning', subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday'        },
  paymentsDueToday_plural:       { category: 'payments',    tone: 'warning', subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateDueToday'        },
  paymentsOverdue:               { category: 'payments',    tone: 'danger',  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateOverduePayments' },
  paymentsOverdue_plural:        { category: 'payments',    tone: 'danger',  subjectKey: 'pendingSubjectPayments',      stateKey: 'pendingStateOverduePayments' },
  pendingReceptions:             { category: 'purchases',   tone: 'info',    subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'         },
  pendingReceptions_plural:      { category: 'purchases',   tone: 'info',    subjectKey: 'pendingSubjectReceptions',    stateKey: 'pendingStatePending'         },
  lowStockAlert:                 { category: 'stock',       tone: 'warning', subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock'        },
  lowStockAlerts:                { category: 'stock',       tone: 'warning', subjectKey: 'pendingSubjectStock',         stateKey: 'pendingStateLowStock'        },
};

const STATUS_BADGE_STYLES = {
  danger:  { backgroundColor: 'var(--status-destructive-bg)', color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / 0.3)' },
  warning: { backgroundColor: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)', borderColor: 'var(--status-warning-border)' },
  info:    { backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info-fg)', borderColor: 'var(--status-info-border)' },
  muted:   { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border-subtle))' },
};

function resolveTaskMeta(task) {
  const key = task.taskKey;
  const meta = key && CATEGORY_MAP[key];
  if (meta) return meta;
  return { category: 'other', tone: 'muted', subjectKey: null, stateKey: null };
}

describe('PendingTasksRail — CATEGORY_MAP completeness', () => {
  const KNOWN_TASK_KEYS = Object.keys(CATEGORY_MAP);

  it('has exactly 14 task keys (7 singular + 7 plural, ETP-5017 adds paymentsOverdue*)', () => {
    assert.equal(KNOWN_TASK_KEYS.length, 14);
  });

  for (const key of KNOWN_TASK_KEYS) {
    it(`"${key}" has category, tone, subjectKey, and stateKey`, () => {
      const meta = CATEGORY_MAP[key];
      assert.ok(meta.category, `${key}.category is empty`);
      assert.ok(meta.tone, `${key}.tone is empty`);
      assert.ok(meta.subjectKey, `${key}.subjectKey is empty`);
      assert.ok(meta.stateKey, `${key}.stateKey is empty`);
    });
  }

  it('plural variants share the same category/tone/keys as their singular counterpart', () => {
    const singularKeys = KNOWN_TASK_KEYS.filter(k => !k.endsWith('_plural'));
    for (const key of singularKeys) {
      const pluralKey = `${key}_plural`;
      if (!CATEGORY_MAP[pluralKey]) continue;
      assert.equal(CATEGORY_MAP[key].category,   CATEGORY_MAP[pluralKey].category,   `${key} vs ${pluralKey} category mismatch`);
      assert.equal(CATEGORY_MAP[key].tone,       CATEGORY_MAP[pluralKey].tone,       `${key} vs ${pluralKey} tone mismatch`);
      assert.equal(CATEGORY_MAP[key].subjectKey, CATEGORY_MAP[pluralKey].subjectKey, `${key} vs ${pluralKey} subjectKey mismatch`);
      assert.equal(CATEGORY_MAP[key].stateKey,   CATEGORY_MAP[pluralKey].stateKey,   `${key} vs ${pluralKey} stateKey mismatch`);
    }
  });

  // ETP-5017: paymentsDueToday and paymentsOverdue must stay in the same `payments`
  // telemetry bucket even though their badge tone differs (warning vs danger).
  it('paymentsDueToday and paymentsOverdue share category "payments" but differ in tone', () => {
    assert.equal(CATEGORY_MAP.paymentsDueToday.category, 'payments');
    assert.equal(CATEGORY_MAP.paymentsOverdue.category, 'payments');
    assert.equal(CATEGORY_MAP.paymentsDueToday.tone, 'warning');
    assert.equal(CATEGORY_MAP.paymentsOverdue.tone, 'danger');
  });

  // Distinct i18n key from pendingStateOverdue (used by overdueInvoices): in Spanish
  // "Vencidos" (masculine, "Pagos") differs from "Vencidas" (feminine, "Facturas").
  it('paymentsOverdue uses its own stateKey, not the sales-invoice pendingStateOverdue', () => {
    assert.equal(CATEGORY_MAP.paymentsOverdue.stateKey, 'pendingStateOverduePayments');
    assert.notEqual(CATEGORY_MAP.paymentsOverdue.stateKey, CATEGORY_MAP.overdueInvoices.stateKey);
  });
});

describe('PendingTasksRail — resolveTaskMeta fallback', () => {
  it('returns "other" category and "muted" tone for an unknown taskKey', () => {
    const meta = resolveTaskMeta({ taskKey: 'unknownTask' });
    assert.equal(meta.category, 'other');
    assert.equal(meta.tone, 'muted');
    assert.equal(meta.subjectKey, null);
    assert.equal(meta.stateKey, null);
  });

  it('returns "other" category when taskKey is absent', () => {
    assert.equal(resolveTaskMeta({}).category, 'other');
  });

  it('resolves overdueInvoices → sales / danger / pendingSubjectSalesInvoices / pendingStateOverdue', () => {
    const meta = resolveTaskMeta({ taskKey: 'overdueInvoices' });
    assert.equal(meta.category, 'sales');
    assert.equal(meta.tone, 'danger');
    assert.equal(meta.subjectKey, 'pendingSubjectSalesInvoices');
    assert.equal(meta.stateKey, 'pendingStateOverdue');
  });

  it('resolves collectionsDueToday → collections / warning / pendingStateDueToday', () => {
    const meta = resolveTaskMeta({ taskKey: 'collectionsDueToday' });
    assert.equal(meta.category, 'collections');
    assert.equal(meta.tone, 'warning');
    assert.equal(meta.stateKey, 'pendingStateDueToday');
  });

  it('resolves paymentsDueToday → payments / warning / pendingStateDueToday', () => {
    const meta = resolveTaskMeta({ taskKey: 'paymentsDueToday' });
    assert.equal(meta.category, 'payments');
    assert.equal(meta.tone, 'warning');
    assert.equal(meta.stateKey, 'pendingStateDueToday');
  });

  it('resolves paymentsOverdue → payments / danger / pendingStateOverduePayments', () => {
    const meta = resolveTaskMeta({ taskKey: 'paymentsOverdue' });
    assert.equal(meta.category, 'payments');
    assert.equal(meta.tone, 'danger');
    assert.equal(meta.stateKey, 'pendingStateOverduePayments');
  });

  it('resolves paymentsOverdue_plural → payments / danger / pendingStateOverduePayments', () => {
    const meta = resolveTaskMeta({ taskKey: 'paymentsOverdue_plural' });
    assert.equal(meta.category, 'payments');
    assert.equal(meta.tone, 'danger');
    assert.equal(meta.stateKey, 'pendingStateOverduePayments');
  });

  it('resolves lowStockAlert → stock / warning / pendingStateLowStock', () => {
    const meta = resolveTaskMeta({ taskKey: 'lowStockAlert' });
    assert.equal(meta.category, 'stock');
    assert.equal(meta.tone, 'warning');
    assert.equal(meta.stateKey, 'pendingStateLowStock');
  });

  it('resolves pendingReceptions_plural → purchases / info / pendingStatePending', () => {
    const meta = resolveTaskMeta({ taskKey: 'pendingReceptions_plural' });
    assert.equal(meta.category, 'purchases');
    assert.equal(meta.tone, 'info');
    assert.equal(meta.stateKey, 'pendingStatePending');
  });
});

describe('PendingTasksRail — STATUS_BADGE_STYLES semantic roles (keyed by tone)', () => {
  const EXPECTED_TONES = ['danger', 'warning', 'info', 'muted'];

  it('has all 4 required tone styles', () => {
    for (const tone of EXPECTED_TONES) {
      assert.ok(STATUS_BADGE_STYLES[tone], `Missing style for tone: ${tone}`);
    }
  });

  it('every style has backgroundColor, color, and borderColor', () => {
    for (const [tone, style] of Object.entries(STATUS_BADGE_STYLES)) {
      assert.ok(style.backgroundColor, `${tone}.backgroundColor is empty`);
      assert.ok(style.color, `${tone}.color is empty`);
      assert.ok(style.borderColor, `${tone}.borderColor is empty`);
    }
  });

  it('danger uses destructive roles', () => {
    assert.equal(STATUS_BADGE_STYLES.danger.backgroundColor, 'var(--status-destructive-bg)');
    assert.equal(STATUS_BADGE_STYLES.danger.color, 'hsl(var(--destructive))');
    assert.equal(STATUS_BADGE_STYLES.danger.borderColor, 'hsl(var(--destructive) / 0.3)');
  });

  it('warning uses warning roles', () => {
    assert.equal(STATUS_BADGE_STYLES.warning.backgroundColor, 'var(--status-warning-bg)');
    assert.equal(STATUS_BADGE_STYLES.warning.color, 'var(--status-warning-fg)');
    assert.equal(STATUS_BADGE_STYLES.warning.borderColor, 'var(--status-warning-border)');
  });

  it('info uses info roles', () => {
    assert.equal(STATUS_BADGE_STYLES.info.backgroundColor, 'var(--status-info-bg)');
    assert.equal(STATUS_BADGE_STYLES.info.color, 'var(--status-info-fg)');
    assert.equal(STATUS_BADGE_STYLES.info.borderColor, 'var(--status-info-border)');
  });

  it('muted (fallback) uses muted roles', () => {
    assert.equal(STATUS_BADGE_STYLES.muted.backgroundColor, 'hsl(var(--muted))');
    assert.equal(STATUS_BADGE_STYLES.muted.color, 'hsl(var(--muted-foreground))');
    assert.equal(STATUS_BADGE_STYLES.muted.borderColor, 'hsl(var(--border-subtle))');
  });
});
