/**
 * Behavior-lock tests for DataTable's internal `renderCellValue`.
 *
 * Goal: lock the rendered output of EVERY branch of renderCellValue so the
 * SonarQube-driven refactor (cognitive complexity 77 → 15) can extract each
 * type-specific block into its own helper without regressing.
 *
 * The branches under lock (matching the "DE ACA / HASTA ACA" markers in
 * DataTable.jsx) are:
 *   - custom-render (col.render)
 *   - first-column-pill
 *   - enum-cell (dot | variants | plain)
 *   - status-cell (dot | StatusTag)
 *   - percent-cell (0 | partial | >=100 | NaN)
 *   - boolean-cell:
 *       - boolean-toggle
 *       - boolean-badge (colors | variants, true/false)
 *       - boolean-fallback (yes / no / em-dash)
 *   - date-cell (yyyy-MM-dd date-only | full ISO | null/empty)
 *   - amount-cell
 *   - truncated-fallback (> 30 chars | <= 30 chars)
 */

import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: (raw) => `dot-${raw ?? 'none'}`,
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  statusLabel: (raw) => `status-label-${raw}`,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => (
    <span data-testid="status-tag" data-status={status}>{label || status}</span>
  ),
}));
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, disabled, onCheckedChange, 'aria-label': ariaLabel }) => (
    <input
      type="checkbox"
      data-testid="switch"
      role="switch"
      aria-label={ariaLabel}
      checked={!!checked}
      disabled={!!disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val, currency) => `${currency ?? ''}${val != null ? String(val) : ''}`.trim(),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../InternalConsumptionProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

function renderTable(columns, data, extra = {}) {
  return render(
    <DataTable columns={columns} data={data} selectable={false} {...extra} />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// custom-render
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — custom-render', () => {
  it('uses col.render and passes ({ entity, token, apiBaseUrl })', () => {
    const render = vi.fn(() => <span data-testid="custom">custom-output</span>);
    const columns = [{ key: 'name', label: 'Name', type: 'string', render }];
    renderTable(columns, [{ id: '1', name: 'ignored' }], {
      entity: 'OrderHeader', token: 'tok', apiBaseUrl: 'http://api',
    });
    expect(screen.getByTestId('custom')).toHaveTextContent('custom-output');
    expect(render).toHaveBeenCalledWith(
      { id: '1', name: 'ignored' },
      { entity: 'OrderHeader', token: 'tok', apiBaseUrl: 'http://api' }
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// first-column-pill
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — first-column-pill', () => {
  it('renders the display value with a pill label when pill.when(row) is truthy', () => {
    const columns = [{
      key: 'name', label: 'Name', type: 'string',
      pill: { when: (row) => row.flag === true, label: 'NEW', className: 'cls' },
    }];
    renderTable(columns, [{ id: '1', name: 'Alpha', flag: true }]);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('renders only the display value when pill.when(row) is falsy', () => {
    const columns = [{
      key: 'name', label: 'Name', type: 'string',
      pill: { when: () => false, label: 'NEW' },
    }];
    renderTable(columns, [{ id: '1', name: 'Alpha' }]);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
  });

  it('does NOT apply pill logic for non-first columns or non-string types', () => {
    // Pill on 2nd column → branch skipped.
    const columns = [
      { key: 'name', label: 'Name', type: 'string' },
      {
        key: 'extra', label: 'Extra', type: 'string',
        pill: { when: () => true, label: 'SHOULD_NOT_APPEAR' },
      },
    ];
    renderTable(columns, [{ id: '1', name: 'Alpha', extra: 'plain' }]);
    expect(screen.queryByText('SHOULD_NOT_APPEAR')).not.toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// enum-cell
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — enum-cell', () => {
  it('renders plain <span> with mapped label when no display/variants', () => {
    const columns = [{
      key: 'kind', label: 'Kind', type: 'enum',
      enumLabels: { A: 'Alpha', B: 'Beta' },
    }];
    renderTable(columns, [{ id: '1', kind: 'A' }]);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders a dot variant when col.display === "dot"', () => {
    const columns = [{
      key: 'kind', label: 'Kind', type: 'enum',
      display: 'dot',
      enumLabels: { A: 'Alpha' },
    }];
    const { container } = renderTable(columns, [{ id: '1', kind: 'A' }]);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    // Dot span uses the mocked dot-* class.
    expect(container.querySelector('.dot-A')).toBeTruthy();
  });

  it('renders a Tag with the right variant when enumVariants is provided', () => {
    const columns = [{
      key: 'kind', label: 'Kind', type: 'enum',
      enumLabels: { A: 'Alpha' },
      enumVariants: { A: 'green' },
    }];
    renderTable(columns, [{ id: '1', kind: 'A' }]);
    const tag = screen.getByTestId('tag');
    expect(tag).toHaveTextContent('Alpha');
    expect(tag).toHaveAttribute('data-variant', 'green');
  });

  it('falls back to raw value as label when enumLabels has no entry', () => {
    const columns = [{ key: 'kind', label: 'Kind', type: 'enum' }];
    renderTable(columns, [{ id: '1', kind: 'unknown-key' }]);
    expect(screen.getByText('unknown-key')).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// status-cell
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — status-cell', () => {
  it('renders StatusTag by default', () => {
    const columns = [{ key: 'status', label: 'Status', type: 'status' }];
    renderTable(columns, [{ id: '1', status: 'CO' }]);
    const tag = screen.getByTestId('status-tag');
    expect(tag).toHaveAttribute('data-status', 'CO');
    expect(tag).toHaveTextContent('status-label-CO');
  });

  it('renders a dot variant when col.display === "dot"', () => {
    const columns = [{ key: 'status', label: 'Status', type: 'status', display: 'dot' }];
    const { container } = renderTable(columns, [{ id: '1', status: 'DR' }]);
    expect(screen.getByText('status-label-DR')).toBeInTheDocument();
    expect(container.querySelector('.dot-DR')).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// percent-cell
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — percent-cell', () => {
  const columns = [{ key: 'progress', label: 'Progress', type: 'percent' }];

  it('renders 0% for value 0 with slate styling', () => {
    const { container } = renderTable(columns, [{ id: '1', progress: 0 }]);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(container.querySelector('.bg-slate-200')).toBeTruthy();
  });

  it('renders partial values with amber styling', () => {
    const { container } = renderTable(columns, [{ id: '1', progress: 45 }]);
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(container.querySelector('.bg-amber-400')).toBeTruthy();
  });

  it('renders >= 100 with emerald styling', () => {
    const { container } = renderTable(columns, [{ id: '1', progress: 120 }]);
    expect(screen.getByText('120%')).toBeInTheDocument();
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy();
  });

  it('treats NaN as 0', () => {
    renderTable(columns, [{ id: '1', progress: 'not-a-number' }]);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// boolean-cell
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — boolean-cell (toggle)', () => {
  it('renders a Switch when col.toggle is true, reflecting checked state', () => {
    const columns = [{ key: 'active', label: 'Active', type: 'boolean', toggle: true }];
    renderTable(columns, [
      { id: '1', active: true },
      { id: '2', active: false },
    ]);
    const switches = screen.getAllByTestId('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]).toBeChecked();
    expect(switches[1]).not.toBeChecked();
  });

  it('disables the Switch when the raw value is neither truthy nor falsy', () => {
    const columns = [{ key: 'active', label: 'Active', type: 'boolean', toggle: true }];
    renderTable(columns, [{ id: '1', active: null }]);
    expect(screen.getByTestId('switch')).toBeDisabled();
  });
});

describe('renderCellValue — boolean-cell (badge with colors)', () => {
  const columns = [{
    key: 'done', label: 'Done', type: 'boolean',
    badge: true,
    badgeLabels: { true: 'Complete', false: 'In Process' },
    badgeColors: { true: 'bg-green', false: 'bg-amber' },
  }];

  it('renders the true badge with the true color', () => {
    const { container } = renderTable(columns, [{ id: '1', done: true }]);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(container.querySelector('.bg-green')).toBeTruthy();
  });

  it('renders the false badge with the false color', () => {
    const { container } = renderTable(columns, [{ id: '1', done: false }]);
    expect(screen.getByText('In Process')).toBeInTheDocument();
    expect(container.querySelector('.bg-amber')).toBeTruthy();
  });

  it('falls through to em-dash when value is neither truthy nor falsy', () => {
    renderTable(columns, [{ id: '1', done: null }]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('renderCellValue — boolean-cell (badge with variants)', () => {
  const columns = [{
    key: 'done', label: 'Done', type: 'boolean',
    badge: true,
    badgeLabels: { true: 'OK', false: 'KO' },
    badgeVariants: { true: 'green', false: 'red' },
  }];

  it('renders Tag with the true variant', () => {
    renderTable(columns, [{ id: '1', done: true }]);
    const tag = screen.getByTestId('tag');
    expect(tag).toHaveTextContent('OK');
    expect(tag).toHaveAttribute('data-variant', 'green');
  });

  it('renders Tag with the false variant', () => {
    renderTable(columns, [{ id: '1', done: false }]);
    const tag = screen.getByTestId('tag');
    expect(tag).toHaveTextContent('KO');
    expect(tag).toHaveAttribute('data-variant', 'red');
  });
});

describe('renderCellValue — boolean-cell (fallback yes/no/em-dash)', () => {
  const columns = [{ key: 'active', label: 'Active', type: 'boolean' }];

  it('renders "yes" with emerald color for truthy', () => {
    const { container } = renderTable(columns, [{ id: '1', active: true }]);
    expect(screen.getByText('yes')).toBeInTheDocument();
    expect(container.querySelector('.text-emerald-600')).toBeTruthy();
  });

  it('renders "no" with slate color for falsy', () => {
    const { container } = renderTable(columns, [{ id: '1', active: false }]);
    expect(screen.getByText('no')).toBeInTheDocument();
    expect(container.querySelector('.text-slate-400')).toBeTruthy();
  });

  it('renders em-dash for null / undefined / unrecognized values', () => {
    renderTable(columns, [{ id: '1', active: null }]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// date-cell
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — date-cell', () => {
  const columns = [{ key: 'd', label: 'Date', type: 'date' }];

  it('parses yyyy-MM-dd as a local date (no TZ shift)', () => {
    renderTable(columns, [{ id: '1', d: '2026-01-15' }]);
    // We can't depend on the exact locale string the user has — but the year
    // and day must always be present after local parsing.
    const cell = screen.getByTestId('cell-1-d');
    expect(cell.textContent).toMatch(/2026/);
    expect(cell.textContent).toMatch(/15/);
  });

  it('renders an em-dash when the value is null/empty', () => {
    renderTable(columns, [{ id: '1', d: null }]);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('hides the date dot when col.dot === false', () => {
    const cols = [{ key: 'd', label: 'Date', type: 'date', dot: false }];
    const { container } = renderTable(cols, [{ id: '1', d: '2026-01-15' }]);
    // No coloured dot when explicitly disabled.
    expect(container.querySelector('[class*="rounded-full"]')).toBeFalsy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// amount-cell
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — amount-cell', () => {
  it('renders formatAmount(value) inside a tabular-nums span (no currency symbol at cell level)', () => {
    const columns = [{ key: 'total', label: 'Total', type: 'amount' }];
    renderTable(columns, [
      { id: '1', total: 1234.5, 'currency$_identifier': 'USD' },
    ]);
    const cell = screen.getByTestId('cell-1-total');
    // Currency is shown at header level, not on individual line-amount cells (ETP-4027)
    expect(cell.textContent).toMatch(/1[\s,.]?234/);
    expect(cell.querySelector('span.tabular-nums')).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// truncated-fallback
// ────────────────────────────────────────────────────────────────────────────
describe('renderCellValue — truncated-fallback', () => {
  it('renders the value verbatim when 30 chars or less and the type is unspecialized', () => {
    const columns = [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'note', label: 'Note', type: 'string' },
    ];
    renderTable(columns, [{ id: '1', name: 'Alpha', note: 'short note' }]);
    expect(screen.getByText('short note')).toBeInTheDocument();
  });

  it('wraps long strings (> 30 chars) in a truncated span with title attribute', () => {
    const columns = [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'note', label: 'Note', type: 'string' },
    ];
    const long = 'x'.repeat(40);
    renderTable(columns, [{ id: '1', name: 'Alpha', note: long }]);
    const cell = screen.getByTestId('cell-1-note');
    const inner = cell.querySelector('span.truncate');
    expect(inner).toBeTruthy();
    expect(inner.getAttribute('title')).toBe(long);
    expect(inner.textContent).toBe(long);
  });
});
