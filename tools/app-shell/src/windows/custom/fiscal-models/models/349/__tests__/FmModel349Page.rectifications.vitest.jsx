// ETP-4404 — FmModel349Page "Rectificaciones" tab: KPI, tab badge, table and
// compute-path refresh. Mocking conventions follow FmModel349Page.render.vitest.jsx
// (the Tabs mock here additionally surfaces each tab badge for assertions).
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Echoes the key, except for the handful of PARAMETERIZED keys under test here,
// which resolve to their real es_ES copy so the assertion is about the sentence
// the user reads rather than about a key name. Inlined in the factory because
// `vi.mock` is hoisted above module-scope consts.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const copy = { 'fm.m349.rectificative_period': 'Rectificativa {period}' };
    const raw = copy[key] ?? key;
    return Object.keys(params ?? {}).reduce((acc, p) => acc.replace(`{${p}}`, params[p]), raw);
  },
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue(false),
}));
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({
    pdfUrl: null,
    loading: false,
    generatePdf: vi.fn().mockResolvedValue(null),
    clearPdf: vi.fn(),
  }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div',
    { className: 'test-kpi349', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi349-label' }, label),
    React.createElement('span', { className: 'test-kpi349-value' }, value)
  ),
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      {
        key: t.id, role: 'tab', 'aria-selected': String(t.id === active),
        'data-badge': t.badge == null ? '' : String(t.badge),
        onClick: () => onSelect(t.id),
      },
      t.label
    ))
  ),
  Banner: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal: () => null,
}));
vi.mock('../../../../../../components/contract-ui/DocumentPreview.jsx', () => ({
  DocumentPreview: () => null,
}));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  Download: () => null, FileDown: () => null, CircleCheck: () => null, Search: () => null,
  RefreshCw: () => null, Globe: () => null, Eye: () => null, MoreVertical: () => null,
  ChevronDown: () => null, ChevronRight: () => null, Users: () => null, FileEdit: () => null,
  Clock: () => null, TriangleAlert: () => null, Folder: () => null, ReceiptText: () => null,
  Calculator: () => null, PenLine: () => null, ShieldAlert: () => null, Info: () => null,
  OctagonAlert: () => null, ArrowLeft: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';
import { compute349Operators } from '../../../fiscalModelsUtils.js';

const RECTIF_ROW = {
  ref: 'NC-01',
  date: '2026-05-05',
  type: 'Venta',
  party: 'Acme Corp',
  nifIva: 'IT12345678901',
  originalRef: '10000067',
  declaredYear: '2025',
  declaredPeriod: '1T',
  baseProducts: '1500.00',
  baseServices: '250.50',
};

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: [],
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

const rectifKpiValue = () =>
  document.querySelector('.test-kpi349[data-kpi-label="fm.m349.kpi.rectif"] .test-kpi349-value')?.textContent;

const rectifTab = () =>
  screen.getAllByRole('tab').find(b => b.textContent === 'fm.m349.tab.rectif');

beforeEach(() => vi.clearAllMocks());

// ── (a) precomputed rectifications ──────────────────────────────────────────

describe('FmModel349Page — rectifications from _precomputed', () => {
  it('KPI value and tab badge show the rectification count', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { rectifications: [RECTIF_ROW] } })}
        {...defaultProps}
      />
    );

    expect(rectifKpiValue()).toBe('1');
    expect(rectifTab()).toHaveAttribute('data-badge', '1');
  });

  it('clicking the Rectificaciones tab renders the full detail row', () => {
    const { container } = render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { rectifications: [RECTIF_ROW] } })}
        {...defaultProps}
      />
    );

    fireEvent.click(rectifTab());

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    const text = rows[0].textContent;
    expect(text).toContain('2026-05-05');
    expect(text).toContain('NC-01');
    expect(text).toContain('Venta');
    expect(text).toContain('Acme Corp');
    expect(text).toContain('IT12345678901');
    expect(text).toContain('10000067');
    // Declared period is formatted "YYYY / PP"
    expect(text).toContain('2025 / 1T');
    // Both base amounts pass through formatAmount (mocked as String)
    expect(text).toContain('1500.00');
    expect(text).toContain('250.50');
  });

  it('a row without declaredYear renders the em-dash placeholder for the declared period', () => {
    const { container } = render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            rectifications: [{ ...RECTIF_ROW, declaredYear: '', declaredPeriod: '' }],
          },
        })}
        {...defaultProps}
      />
    );

    fireEvent.click(rectifTab());
    const row = container.querySelector('tbody tr');
    expect(row.textContent).not.toContain('2025 / 1T');
    expect(row.textContent).toContain('—');
  });
});

// ── (b) empty state ──────────────────────────────────────────────────────────

describe('FmModel349Page — rectifications empty state', () => {
  it('KPI shows 0, tab has no badge and the tab shows the empty-state text', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);

    expect(rectifKpiValue()).toBe('0');
    expect(rectifTab()).toHaveAttribute('data-badge', '');

    fireEvent.click(rectifTab());
    expect(screen.getByText('fm.m349.rectif.empty')).toBeInTheDocument();
    expect(document.querySelector('tbody tr')).toBeNull();
  });
});

// ── (c) compute path ─────────────────────────────────────────────────────────

describe('FmModel349Page — compute result refreshes the rectifications tab', () => {
  it('Calcular applies compute349Operators().rectifications to KPI, badge and table', async () => {
    compute349Operators.mockResolvedValue({
      operators: [],
      invoices: [],
      rectifications: [RECTIF_ROW, { ...RECTIF_ROW, ref: 'NC-02', originalRef: '10000068' }],
    });
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(rectifKpiValue()).toBe('0');

    // The mount-time auto-compute (ETP-4755) already fires `compute349Operators`
    // once on mount (this declaration has no precomputed data). Wait for it to
    // settle back to idle before finding+clicking the button ourselves, so this
    // test's own click is a deliberate SECOND call verifying that clicking
    // Calcular again refreshes the tab.
    await waitFor(() => {
      const btn = Array.from(container.querySelectorAll('button'))
        .find(b => b.textContent === 'fm.action.compute');
      expect(btn).toBeTruthy();
    });
    expect(compute349Operators).toHaveBeenCalledTimes(1);

    const recalc = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.compute'));
    fireEvent.click(recalc);

    await waitFor(() => expect(compute349Operators).toHaveBeenCalledTimes(2));
    expect(rectifKpiValue()).toBe('2');
    expect(rectifTab()).toHaveAttribute('data-badge', '2');

    fireEvent.click(rectifTab());
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('NC-02');
  });
});

// ── ETP-5027 — rectificative operator rows + separate subtotal ───────────────
//
// The operators endpoint now returns corrective rows inside `operators` (ordered
// after the regular ones, each carrying `rectificative: true`) plus a
// `rectificativeSummary`. Their amounts are SIGNED deltas and are usually
// NEGATIVE. They must stay out of the regular totals and out of the
// Rectificaciones KPI, which is fed exclusively by `rectifications`.

const REGULAR_OP = {
  bpId: 'bp-1', nif: 'IT12345678901', name: 'Bramini Vino S.r.l.',
  key: 'E', base: '1000.00', vies: 'valid', rectificative: false,
};
const CORRECTIVE_OP = {
  bpId: 'bp-1', nif: 'IT12345678901', name: 'Bramini Vino S.r.l.',
  key: 'E', base: '-30.00', vies: 'valid', rectificative: true,
};
// ETP-5027 (QA F1): no `total` key — E/S are sales and A/I are purchases, so the
// backend deliberately emits no grand total for either subtotal object.
const RECTIF_SUMMARY = {
  totalE: '-30.00', totalS: '0.00', totalA: '0.00', totalI: '0.00',
};

// ETP-5027 (QA F4) — two corrections to the SAME operator and key, differing only
// by the period they rectify. The backend groups corrective rows by
// (BPId, TaxKey, Year, Period), so this is what one declaration correcting a
// partner's 2025/T1 and 2025/T2 sales of goods actually returns.
const CORRECTIVE_OP_T1 = {
  ...CORRECTIVE_OP, base: '-30.00', declaredYear: '2025', declaredPeriod: '1T',
};
const CORRECTIVE_OP_T2 = {
  ...CORRECTIVE_OP, base: '-50.00', declaredYear: '2025', declaredPeriod: '2T',
};

const totalOpsKpiValue = () =>
  document.querySelector('.test-kpi349[data-kpi-label="fm.m349.kpi.total_ops"] .test-kpi349-value')?.textContent;

const operatorsKpiValue = () =>
  document.querySelector('.test-kpi349[data-kpi-label="fm.m349.kpi.operators"] .test-kpi349-value')?.textContent;

describe('FmModel349Page — rectificative operator rows (ETP-5027)', () => {
  it('badges the corrective row and leaves the regular row unbadged', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { operators: [REGULAR_OP, CORRECTIVE_OP] } })}
        {...defaultProps}
      />
    );

    // Exactly one badge for two rows describing the same operator+key.
    expect(screen.getAllByTestId('badge__rectificative')).toHaveLength(1);
    const rows = document.querySelectorAll('.fm-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-rectificative')).toBeNull();
    expect(rows[1].getAttribute('data-rectificative')).toBe('true');
    // The badge is the ONLY row-level marker: the amber row tint was removed
    // after the owner reviewed it on screen (too heavy across a full-width table).
    expect(rows[1].className).not.toContain('fm-349-row--rectificative');
  });

  it('renders the negative delta as-is, never absolute', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { operators: [REGULAR_OP, CORRECTIVE_OP] } })}
        {...defaultProps}
      />
    );
    const rows = document.querySelectorAll('.fm-table tbody tr');
    expect(rows[1].textContent).toContain('-30');
    expect(rows[1].querySelector('.fm-349-amount--negative')).not.toBeNull();
  });

  it('renders rectificativeSummary as its own subtotal card with the negative per-key delta', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            operators: [REGULAR_OP, CORRECTIVE_OP],
            rectificativeSummary: RECTIF_SUMMARY,
          },
        })}
        {...defaultProps}
      />
    );

    const card = screen.getByTestId('card__rectificativeSubtotal');
    expect(card).toBeInTheDocument();
    expect(card.textContent).toContain('fm.m349.rectif_subtotal.title');
    expect(screen.getByTestId('amount__rectifSubtotal_E').textContent).toBe('-30');
    expect(screen.queryByTestId('amount__rectifSubtotal_total')).not.toBeInTheDocument();
  });

  // ETP-5027 (QA F1) — a "Total rectificativas" row used to sum E+S+A+I, i.e. sales
  // plus purchases. A -30 sales correction offset by a +30 purchase correction then
  // rendered "0", hiding two real corrections. The row is gone; both survive per key.
  it('never sums sales and purchase corrections into a single grand total', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            operators: [REGULAR_OP, CORRECTIVE_OP],
            rectificativeSummary: {
              totalE: '-30.00', totalS: '0.00', totalA: '30.00', totalI: '0.00',
            },
          },
        })}
        {...defaultProps}
      />
    );

    expect(screen.getByTestId('amount__rectifSubtotal_E').textContent).toBe('-30');
    expect(screen.getByTestId('amount__rectifSubtotal_A').textContent).toBe('30');
    expect(screen.queryByTestId('amount__rectifSubtotal_total')).not.toBeInTheDocument();
    expect(screen.getByTestId('card__rectificativeSubtotal').textContent)
      .not.toContain('rectif_subtotal.total');
  });

  // A stale/cached payload can still carry the old `total` key. It must be ignored,
  // never rendered.
  it('ignores a legacy `total` key on rectificativeSummary', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            operators: [REGULAR_OP, CORRECTIVE_OP],
            rectificativeSummary: { ...RECTIF_SUMMARY, total: '-30.00' },
          },
        })}
        {...defaultProps}
      />
    );
    expect(screen.queryByTestId('amount__rectifSubtotal_total')).not.toBeInTheDocument();
  });

  it('does not render the subtotal card when there is no rectificativeSummary', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { operators: [REGULAR_OP] } })}
        {...defaultProps}
      />
    );
    expect(screen.queryByTestId('card__rectificativeSubtotal')).not.toBeInTheDocument();
  });

  it('keeps corrective deltas OUT of the regular totals card and the total-ops KPI', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            operators: [REGULAR_OP, CORRECTIVE_OP],
            rectificativeSummary: RECTIF_SUMMARY,
          },
        })}
        {...defaultProps}
      />
    );

    // 1000, not 970 — the -30 delta must not net off against the regular base.
    expect(totalOpsKpiValue()).toBe('1000');
    const totalsCard = document.querySelector('.fm-349-totals__card');
    expect(totalsCard.textContent).toContain('1000');
    expect(totalsCard.textContent).not.toContain('970');
  });

  it('REGRESSION: corrective operator rows do not change the Rectificaciones KPI', () => {
    // The KPI counts `rectifications` only. Corrective rows live in `operators`,
    // so counting them here would double-count the same business event.
    const { unmount } = render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { operators: [REGULAR_OP], rectifications: [RECTIF_ROW] } })}
        {...defaultProps}
      />
    );
    expect(rectifKpiValue()).toBe('1');
    unmount();

    render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            operators: [REGULAR_OP, CORRECTIVE_OP],
            rectifications: [RECTIF_ROW],
            rectificativeSummary: RECTIF_SUMMARY,
          },
        })}
        {...defaultProps}
      />
    );
    // Still 1 — adding a corrective operator row must not bump the count.
    expect(rectifKpiValue()).toBe('1');
  });

  // ETP-5027 (owner correction): this originally asserted `2` — the KPI counted
  // table ROWS, so an operator's own correction inflated the "Operadores" figure.
  // The owner overruled that call: the card answers "how many counterparties are
  // in this declaration", which is a DISTINCT count. Do not flip this back to a
  // row count; the row count still lives on the Operadores TAB BADGE.
  it('the Operadores KPI counts DISTINCT operators, so a corrective row for the same operator does NOT add one', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { operators: [REGULAR_OP, CORRECTIVE_OP] } })}
        {...defaultProps}
      />
    );
    // Same bpId on both rows → one counterparty, two rows.
    expect(operatorsKpiValue()).toBe('1');
  });

  it('picks up rectificativeSummary from the compute() response', async () => {
    compute349Operators.mockResolvedValueOnce({
      operators: [REGULAR_OP, CORRECTIVE_OP],
      rectificativeSummary: RECTIF_SUMMARY,
    });
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId('card__rectificativeSubtotal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('amount__rectifSubtotal_E').textContent).toBe('-30');
  });

  it('the existing key filter picks corrective rows up for free', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: {
            operators: [
              REGULAR_OP,
              { ...REGULAR_OP, bpId: 'bp-2', key: 'A', base: '500.00' },
              CORRECTIVE_OP,
            ],
          },
        })}
        {...defaultProps}
      />
    );
    expect(document.querySelectorAll('.fm-table tbody tr')).toHaveLength(3);

    // Filter to key E via the real dropdown: the regular E row AND the corrective
    // E row survive, the A row is dropped — no filter change was needed for this
    // to work, the corrective rows flow through the existing predicate untouched.
    fireEvent.click(screen.getByRole('button', { name: /fm.m349.filter.all_keys/ }));
    const option = screen.getAllByRole('button')
      .find(b => b.className.includes('fm-status-select__item') && b.textContent.includes('fm.m349.key.E'));
    fireEvent.click(option);
    const rows = document.querySelectorAll('.fm-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('badge__rectificative')).toHaveLength(1);
  });
});

// ── ETP-5027 (QA F4) — corrective rows for several corrected periods ─────────
//
// Correcting more than one prior period in a single declaration is ordinary AEAT
// 349 usage. Those rows share (bpId, key, rectificative), so the old
// `bpId|key|R` row key was identical for all of them: duplicate React keys, and —
// because `selected` is keyed by that same string — ticking one row's checkbox
// ticked every sibling. The declared period is the discriminator.
describe('FmModel349Page — several corrected periods for one operator (QA F4)', () => {
  function renderTwoPeriods() {
    return render(
      <FmModel349Page
        decl={makeDecl({
          _precomputed: { operators: [REGULAR_OP, CORRECTIVE_OP_T1, CORRECTIVE_OP_T2] },
        })}
        {...defaultProps}
      />
    );
  }

  const rowCheckboxes = () =>
    Array.from(document.querySelectorAll('.fm-table tbody tr input[type="checkbox"]'));

  it('renders one row per corrected period, each with its own amount', () => {
    renderTwoPeriods();
    const rows = document.querySelectorAll('.fm-table tbody tr');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('-30');
    expect(rows[2].textContent).toContain('-50');
  });

  // Without this the two rows are visually identical and the user cannot tell which
  // correction is which.
  it('names the corrected period on each badge so the rows are distinguishable', () => {
    renderTwoPeriods();
    const badges = screen.getAllByTestId('badge__rectificative');
    expect(badges).toHaveLength(2);
    expect(badges[0].textContent).toBe('Rectificativa 1T 2025');
    expect(badges[1].textContent).toBe('Rectificativa 2T 2025');
  });

  // The regression the row key exists for.
  it('ticking one corrective row does NOT tick the other', () => {
    renderTwoPeriods();
    const boxes = rowCheckboxes();
    expect(boxes).toHaveLength(3);

    fireEvent.click(boxes[1]);

    expect(rowCheckboxes()[1].checked).toBe(true);
    expect(rowCheckboxes()[2].checked).toBe(false);
    expect(rowCheckboxes()[0].checked).toBe(false);
  });

  it('selecting all then one still leaves the two corrective rows independent', () => {
    renderTwoPeriods();
    fireEvent.click(rowCheckboxes()[2]);

    expect(rowCheckboxes()[2].checked).toBe(true);
    expect(rowCheckboxes()[1].checked).toBe(false);
  });

  // A corrective row that predates the backend emitting the discriminator still
  // renders the plain badge rather than a dangling "Rectificativa undefined".
  it('falls back to the plain badge when the backend sent no declared period', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ _precomputed: { operators: [REGULAR_OP, CORRECTIVE_OP] } })}
        {...defaultProps}
      />
    );
    const badge = screen.getByTestId('badge__rectificative');
    expect(badge.textContent).toBe('fm.m349.rectificative');
  });
});
