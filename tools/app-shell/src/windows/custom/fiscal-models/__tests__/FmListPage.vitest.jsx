// Vitest component tests for FmListPage.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@etendosoftware/app-shell-core', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('../useFiscalAutoCompute.js', () => ({
  default: vi.fn(() => ({ computedMap: {} })),
}));
vi.mock('../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    checkModified303: vi.fn(),
    checkModified349: vi.fn(),
    compute349Operators: vi.fn(),
  };
});
vi.mock('../FmOverlays.jsx', () => ({
  ConfigDrawer: () => null,
  NewDeclModal: () => null,
}));
vi.mock('../FmCatalogPage.jsx', () => ({
  default: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) =>
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange: onChange ?? (() => {}) }),
}));
vi.mock('lucide-react', () => ({
  LayoutGrid: () => null, Settings: () => null, ListFilter: () => null,
  ArrowUpDown: () => null, ChevronDown: () => null, MoreHorizontal: () => null,
  MoreVertical: () => null, Calendar: () => null, Clock: () => null,
  TriangleAlert: () => null, OctagonAlert: () => null, ArrowUpRight: () => null,
  Search: () => null, Play: () => null, Check: () => null,
}));
vi.mock('../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  ResultPill: () => null,
  EmptyState: () => React.createElement('div', { className: 'fm-empty-state' }, 'empty'),
  KpiWidget: ({ value }) => React.createElement('span', { className: 'test-kpi' }, value),
}));

import FmListPage from '../FmListPage.jsx';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const makeDecl = (overrides = {}) => ({
  id: `decl-${Math.random()}`,
  model: '303',
  year: 2026,
  period: 'T1',
  type: 'ord',
  status: 'pending',
  nif: 'B12345678',
  result: null,
  incidents: { blocking: 0, warning: 0 },
  updatedAt: '2026-01-20',
  ...overrides,
});

const defaultProps = {
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  onComputeUpdate: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('FmListPage — rendering', () => {
  it('renders without crashing with empty declarations', () => {
    render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('renders the title key', () => {
    render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.list.title');
  });

  it('shows declaration count badge', () => {
    const decls = [makeDecl(), makeDecl()];
    render(<FmListPage declarations={decls} {...defaultProps} />);
    expect(document.body.textContent).toContain('2');
  });

  it('renders the table when declarations exist', () => {
    const decls = [makeDecl()];
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders EmptyState when no declarations match filters', () => {
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(container.querySelector('.fm-empty-state')).toBeTruthy();
  });

  it('renders one row per declaration', () => {
    const decls = [makeDecl(), makeDecl(), makeDecl()];
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });
});

// ── Filtering ─────────────────────────────────────────────────────────────────

describe('FmListPage — model filter', () => {
  const decls = [
    makeDecl({ id: '1', model: '303' }),
    makeDecl({ id: '2', model: '349' }),
    makeDecl({ id: '3', model: '303' }),
  ];

  it('shows all rows when model filter is "all"', () => {
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('filters to only 303 rows when 303 filter is selected', () => {
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    // Open the "Todos los modelos" dropdown (2nd filter pill)
    const pills = container.querySelectorAll('.fm-toolbar__pill');
    fireEvent.click(pills[1]); // 2nd pill = model filter
    // Click the 303 option
    const options = container.querySelectorAll('[role="option"]');
    const opt303 = Array.from(options).find(o => o.textContent.includes('303'));
    if (opt303) {
      fireEvent.click(opt303);
      expect(container.querySelectorAll('tbody tr').length).toBe(2);
    }
  });
});

describe('FmListPage — status filter', () => {
  const decls = [
    makeDecl({ id: '1', status: 'pending' }),
    makeDecl({ id: '2', status: 'draft' }),
    makeDecl({ id: '3', status: 'submitted' }),
  ];

  it('shows all rows with no status filter', () => {
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('filters to only submitted when "presentado" is selected', () => {
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    const pills = container.querySelectorAll('.fm-toolbar__pill');
    fireEvent.click(pills[2]); // 3rd pill = status filter
    const options = container.querySelectorAll('[role="option"]');
    const presentadoOpt = Array.from(options).find(o => o.textContent.includes('Presentado'));
    if (presentadoOpt) {
      fireEvent.click(presentadoOpt);
      expect(container.querySelectorAll('tbody tr').length).toBe(1);
    }
  });
});

// ── Row selection ─────────────────────────────────────────────────────────────

describe('FmListPage — row click', () => {
  it('calls onSelect when a row is clicked', () => {
    const onSelect = vi.fn();
    const decl = makeDecl({ id: 'row-1' });
    const { container } = render(
      <FmListPage
        declarations={[decl]}
        onSelect={onSelect}
        onStatusChange={vi.fn()}
        onComputeUpdate={vi.fn()}
      />
    );
    const row = container.querySelector('tbody tr');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' }));
  });
});

// ── Checkbox selection ────────────────────────────────────────────────────────

describe('FmListPage — checkbox selection', () => {
  it('toggles individual row selection when checkbox is clicked', () => {
    const decl = makeDecl({ id: 'chk-1' });
    const { container } = render(<FmListPage declarations={[decl]} {...defaultProps} />);
    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
    fireEvent.change(checkboxes[0], { target: { checked: true } });
    expect(checkboxes[0].checked).toBe(true);
  });

  it('header checkbox is not checked initially when no rows are selected', () => {
    const decls = [makeDecl({ id: 'a' }), makeDecl({ id: 'b' })];
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    const headerCheckbox = container.querySelector('thead input[type="checkbox"]');
    expect(headerCheckbox.checked).toBe(false);
  });
});

// ── KPI cards ────────────────────────────────────────────────────────────────

describe('FmListPage — KPI cards row', () => {
  it('renders KpiWidget elements', () => {
    const { container } = render(<FmListPage declarations={[makeDecl()]} {...defaultProps} />);
    expect(container.querySelectorAll('.test-kpi').length).toBeGreaterThan(0);
  });

  it('shows pending count in KPI', () => {
    const decls = [
      makeDecl({ status: 'pending' }),
      makeDecl({ status: 'pending' }),
      makeDecl({ status: 'submitted' }),
    ];
    const { container } = render(<FmListPage declarations={decls} {...defaultProps} />);
    const kpis = container.querySelectorAll('.test-kpi');
    // The 2nd KPI is the pending count (index 1)
    expect(kpis[1].textContent).toBe('2');
  });
});

// ── Column headers ────────────────────────────────────────────────────────────

describe('FmListPage — column headers', () => {
  it('renders model and period column headers', () => {
    const { container } = render(<FmListPage declarations={[makeDecl()]} {...defaultProps} />);
    const headers = container.querySelectorAll('thead th');
    const headerText = Array.from(headers).map(h => h.textContent).join(' ');
    expect(headerText).toContain('fm.col.model');
    expect(headerText).toContain('fm.col.period');
  });

  it('renders status column header', () => {
    const { container } = render(<FmListPage declarations={[makeDecl()]} {...defaultProps} />);
    const headerText = Array.from(container.querySelectorAll('thead th'))
      .map(h => h.textContent).join(' ');
    expect(headerText).toContain('fm.col.status');
  });
});
