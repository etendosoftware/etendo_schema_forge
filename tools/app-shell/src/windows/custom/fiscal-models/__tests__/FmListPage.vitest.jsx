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
  NewDeclModal: (props) =>
    React.createElement('div', {
      'data-testid': 'new-decl-modal',
      'data-active-models': JSON.stringify(props.activeModels ?? null),
    }),
}));
vi.mock('../FmCatalogPage.jsx', () => ({
  // Exposes onSave triggers so tests can simulate different catalog outcomes
  // (deactivate everything / activate only one model) without depending on
  // FmCatalogPage's own UI.
  default: ({ onSave }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        { 'data-testid': 'catalog-save-none', onClick: () => onSave({ '303': false, '349': false }) },
        'deactivate-all',
      ),
      React.createElement(
        'button',
        { 'data-testid': 'catalog-save-303-only', onClick: () => onSave({ '303': true, '349': false }) },
        'activate-303-only',
      ),
    ),
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
  EmptyState: ({ title, message, cta }) =>
    React.createElement(
      'div',
      { className: 'fm-empty-state' },
      title || message || 'empty',
      cta ?? null,
    ),
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

// ── New declaration modal ────────────────────────────────────────────────────

describe('FmListPage — new declaration modal', () => {
  it('passes the current activeModels state to NewDeclModal when opened', () => {
    const { container, getByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    fireEvent.click(getByText('+ Nueva declaración'));
    const modal = container.querySelector('[data-testid="new-decl-modal"]');
    expect(modal).toBeTruthy();
    expect(JSON.parse(modal.getAttribute('data-active-models'))).toEqual({ '303': true, '349': true });
  });
});

// ── Model catalog toolbar button ───────────────────────────────────────────

describe('FmListPage — model catalog moved to toolbar', () => {
  it('renders a "Catálogo de modelos" button in the toolbar with the active count', () => {
    const { getByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(getByText(/fm\.catalog\.title/)).toBeTruthy();
  });

  it('clicking the toolbar catalog button opens the catalog drawer', () => {
    const { getByText, container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    fireEvent.click(getByText(/fm\.catalog\.title/));
    expect(container.querySelector('.fm-catalog-drawer')).toBeTruthy();
  });

  it('does not list "Catálogo de modelos" inside the row kebab menu anymore', () => {
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    const kebabBtn = container.querySelector('[aria-label="Más opciones"]');
    fireEvent.click(kebabBtn);
    const menu = container.querySelector('[role="menu"]');
    expect(menu).toBeTruthy();
    expect(menu.textContent).not.toContain('fm.catalog.title');
  });

  it('the row kebab only exposes Demo and Configuración — no catalog trace at all', () => {
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    const kebabBtn = container.querySelector('[aria-label="Más opciones"]');
    fireEvent.click(kebabBtn);
    const items = container.querySelectorAll('[role="menu"] [role="menuitem"]');
    expect(items.length).toBe(2);
    const labels = Array.from(items).map(i => i.textContent);
    expect(labels.some(l => l.includes('Demo'))).toBe(true);
    expect(labels.some(l => l.includes('fm.config.title'))).toBe(true);
    // Explicit negative: no menu item references the catalog, hidden or not.
    expect(labels.some(l => l.includes('fm.catalog.title') || l.toLowerCase().includes('catálogo'))).toBe(false);
  });
});

// ── No active models: hide new-decl, show dedicated empty state ────────────

function deactivateAllModels(container, getByText) {
  fireEvent.click(getByText(/fm\.catalog\.title/));
  fireEvent.click(container.querySelector('[data-testid="catalog-save-none"]'));
}

describe('FmListPage — no active models', () => {
  it('shows "+ Nueva declaración" when at least one model is active (default)', () => {
    const { queryByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(queryByText('+ Nueva declaración')).toBeTruthy();
  });

  it('hides "+ Nueva declaración" once every model is deactivated', () => {
    const { container, getByText, queryByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    deactivateAllModels(container, getByText);
    expect(queryByText('+ Nueva declaración')).toBeFalsy();
  });

  it('shows the no-active-models empty state message instead of the generic one', () => {
    const { container, getByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    deactivateAllModels(container, getByText);
    const empty = container.querySelector('.fm-empty-state');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('fm.list.empty_no_active_models');
  });

  it('prioritizes the no-active-models message even when stale rows still match filters', () => {
    const decls = [makeDecl(), makeDecl()];
    const { container, getByText } = render(<FmListPage declarations={decls} {...defaultProps} />);
    deactivateAllModels(container, getByText);
    expect(container.querySelector('table')).toBeFalsy();
    const empty = container.querySelector('.fm-empty-state');
    expect(empty.textContent).toContain('fm.list.empty_no_active_models');
  });

  it('reactivating a model from the catalog restores "+ Nueva declaración" and the table, in the same session', () => {
    const decls = [makeDecl(), makeDecl()];
    const { container, getByText, queryByText } = render(<FmListPage declarations={decls} {...defaultProps} />);

    // Start with 0 active models: button hidden, dedicated empty state shown.
    deactivateAllModels(container, getByText);
    expect(queryByText('+ Nueva declaración')).toBeFalsy();
    expect(container.querySelector('table')).toBeFalsy();
    expect(container.querySelector('.fm-empty-state').textContent).toContain('fm.list.empty_no_active_models');

    // Reopen the catalog and activate model 303 only.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    // Empty state is gone, the CTA/no-active message no longer shows, button and table are back.
    expect(queryByText('+ Nueva declaración')).toBeTruthy();
    expect(container.querySelector('table')).toBeTruthy();
    const empty = container.querySelector('.fm-empty-state');
    expect(empty).toBeFalsy();
  });

  it('the catalog toolbar button count reflects 1 vs 2 active models correctly', () => {
    const { container, getByText } = render(<FmListPage declarations={[]} {...defaultProps} />);

    // Default state: both models active → count is 2.
    expect(getByText(/fm\.catalog\.title.*\(2\)/)).toBeTruthy();

    // Deactivate 349, keep 303 active → count is 1, "+ Nueva declaración" still shows.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    expect(getByText(/fm\.catalog\.title.*\(1\)/)).toBeTruthy();
    expect(container.querySelector('table') || container.querySelector('.fm-empty-state')).toBeTruthy();
  });

  it('does not render a CTA inside the no-active-models empty state — the toolbar button already opens the catalog', () => {
    const { container, getByText, queryByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    deactivateAllModels(container, getByText);

    // Catalog drawer auto-closes after onSave — confirm it's actually closed first.
    expect(container.querySelector('.fm-catalog-drawer')).toBeFalsy();

    // The old dedicated CTA button is gone; only the title renders in the empty state.
    expect(queryByText(/fm\.list\.empty_no_active_models_cta/)).toBeFalsy();
    const empty = container.querySelector('.fm-empty-state');
    expect(empty.textContent).toContain('fm.list.empty_no_active_models');

    // The always-visible toolbar catalog button still reopens the drawer.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    expect(container.querySelector('.fm-catalog-drawer')).toBeTruthy();
  });
});

// ── Active-models filtering (regression) ────────────────────────────────────
// Before the fix, deactivating a model in the catalog did NOT hide its
// declarations from the list/filters — activeModels was ignored by
// modelYearFiltered/filtered and by the "Todos los modelos" dropdown options.

describe('FmListPage — active-models filtering (regression)', () => {
  it('hides declarations for a model deactivated in the catalog, keeps the still-active model\'s rows', () => {
    const decls = [
      makeDecl({ id: '303-a', model: '303' }),
      makeDecl({ id: '349-a', model: '349' }),
      makeDecl({ id: '349-b', model: '349' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...defaultProps} />);

    // All 3 rows visible while both models are active (default).
    expect(container.querySelectorAll('tbody tr').length).toBe(3);

    // Deactivate 349 via the catalog drawer (activate 303 only).
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    const badges = Array.from(container.querySelectorAll('.fm-model-badge')).map(b => b.textContent);
    expect(badges).toContain('303');
    expect(badges).not.toContain('349');
  });

  it('excludes the deactivated model from the "Todos los modelos" filter dropdown options', () => {
    const decls = [
      makeDecl({ id: '303-a', model: '303' }),
      makeDecl({ id: '349-a', model: '349' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...defaultProps} />);

    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    // Open the "Todos los modelos" dropdown (2nd filter pill).
    const pills = container.querySelectorAll('.fm-toolbar__pill');
    fireEvent.click(pills[1]);
    const options = container.querySelectorAll('[role="option"]');
    const optionTexts = Array.from(options).map(o => o.textContent);

    expect(optionTexts.some(t => t.includes('303'))).toBe(true);
    expect(optionTexts.some(t => t.includes('349'))).toBe(false);
  });

  it('drives the KPI row from the same activeModels-filtered set (not the raw declarations)', () => {
    const decls = [
      makeDecl({ id: '303-a', model: '303', status: 'pending' }),
      makeDecl({ id: '349-a', model: '349', status: 'pending' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...defaultProps} />);

    // Both pending → KPI "pending" count is 2 while both models are active.
    let kpis = container.querySelectorAll('.test-kpi');
    expect(kpis[1].textContent).toBe('2');

    // Deactivate 349 → only the 303 declaration should count.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    kpis = container.querySelectorAll('.test-kpi');
    expect(kpis[1].textContent).toBe('1');
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
