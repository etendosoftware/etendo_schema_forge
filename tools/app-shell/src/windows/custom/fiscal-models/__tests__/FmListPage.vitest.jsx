// Vitest component tests for FmListPage.jsx
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  NewDeclModal: (props) =>
    React.createElement('div', {
      'data-testid': 'new-decl-modal',
      'data-active-models': JSON.stringify(props.activeModels ?? null),
    }),
}));
vi.mock('../FmCatalogPage.jsx', () => ({
  // Exposes onSave triggers so tests can simulate different catalog outcomes
  // (deactivate everything / activate only one model) without depending on
  // FmCatalogPage's own UI. Wrapped in a `.fm-catalog-drawer` div to mirror
  // the real component's self-contained overlay/drawer markup (FmCatalogPage
  // now owns its own wrapper — FmListPage no longer renders one externally).
  default: ({ onSave }) =>
    React.createElement(
      'div',
      { className: 'fm-catalog-drawer' },
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

// FmListPage now fetches the active-models catalog from the backend on mount
// when `token`/`apiBaseUrl` are present (see FmListPage.jsx). Without them,
// `activeModels` starts empty and stays empty — there is no more in-memory
// default of "303 and 349 active". Tests that need non-empty activeModels
// (row rendering, filtering, KPI counts, "+ Nueva declaración" visibility,
// etc.) must supply these props and mock `fetch`.
const TOKEN = 'test-token';
const API_BASE_URL = '/api/window';
// Mirrors FmListPage's `base = apiBaseUrl.replace(/\/[^/]+$/, '')`.
const BASE = '/api';

const withCatalogProps = { ...defaultProps, token: TOKEN, apiBaseUrl: API_BASE_URL };

// Mocks GET/PUT `{BASE}/fiscal-models-catalog`. Any other fetch (e.g. the
// `fiscal303/declarations` GET also triggered on mount when token/apiBaseUrl
// are present) is rejected — FmListPage swallows that via `.catch(() => {})`
// and keeps using the `declarations` prop, which is what these tests assert on.
function mockCatalogFetch(activeModels = { '303': true, '349': true }) {
  return vi.fn((url) => {
    if (String(url).includes('fiscal-models-catalog')) {
      return Promise.resolve({ ok: true, json: async () => activeModels });
    }
    return Promise.reject(new Error(`unmocked fetch: ${url}`));
  });
}

// Waits out the mount-time catalog fetch (catalogLoaded flips true in the
// effect's `.finally()`) by waiting for the "loading" EmptyState (mocked
// useUI() echoes the i18n key literally, so the rendered text is 'loading',
// not the real Spanish "Cargando…" translation) to go away.
async function waitForCatalogLoad() {
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('fetch not mocked for this test')));
});

afterEach(() => {
  vi.restoreAllMocks();
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
    // The count badge reflects raw `decls.length`, unaffected by activeModels.
    const decls = [makeDecl(), makeDecl()];
    render(<FmListPage declarations={decls} {...defaultProps} />);
    expect(document.body.textContent).toContain('2');
  });

  it('renders the table when declarations exist', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [makeDecl()];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders EmptyState when no declarations match filters', () => {
    // No token/apiBaseUrl → catalogLoaded starts true, activeModels stays {},
    // so this hits the "no active models" EmptyState variant — still a
    // `.fm-empty-state` div, which is all this test asserts on.
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(container.querySelector('.fm-empty-state')).toBeTruthy();
  });

  it('renders one row per declaration', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [makeDecl(), makeDecl(), makeDecl()];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });
});

// ── Catalog fetch (no token/apiBaseUrl) ─────────────────────────────────────

describe('FmListPage — catalog fetch skipped without token/apiBaseUrl', () => {
  it('starts with activeModels={} synchronously and never shows "loading" when token/apiBaseUrl are absent', () => {
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('loading');
    expect(container.querySelector('.fm-empty-state').textContent).toContain('fm.list.empty_no_active_models');
  });
});

// ── Filtering ─────────────────────────────────────────────────────────────────

describe('FmListPage — model filter', () => {
  const decls = [
    makeDecl({ id: '1', model: '303' }),
    makeDecl({ id: '2', model: '349' }),
    makeDecl({ id: '3', model: '303' }),
  ];

  it('shows all rows when model filter is "all"', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('filters to only 303 rows when 303 filter is selected', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
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

  it('shows all rows with no status filter', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('filters to only submitted when "presentado" is selected', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
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
  it('calls onSelect when a row is clicked', async () => {
    globalThis.fetch = mockCatalogFetch();
    const onSelect = vi.fn();
    const decl = makeDecl({ id: 'row-1' });
    const { container } = render(
      <FmListPage
        declarations={[decl]}
        onSelect={onSelect}
        onStatusChange={vi.fn()}
        onComputeUpdate={vi.fn()}
        token={TOKEN}
        apiBaseUrl={API_BASE_URL}
      />
    );
    await waitForCatalogLoad();
    const row = container.querySelector('tbody tr');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'row-1' }));
  });
});

// ── Checkbox selection ────────────────────────────────────────────────────────

describe('FmListPage — checkbox selection', () => {
  it('toggles individual row selection when checkbox is clicked', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'chk-1' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const checkboxes = container.querySelectorAll('tbody input[type="checkbox"]');
    fireEvent.change(checkboxes[0], { target: { checked: true } });
    expect(checkboxes[0].checked).toBe(true);
  });

  it('header checkbox is not checked initially when no rows are selected', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [makeDecl({ id: 'a' }), makeDecl({ id: 'b' })];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const headerCheckbox = container.querySelector('thead input[type="checkbox"]');
    expect(headerCheckbox.checked).toBe(false);
  });
});

// ── KPI cards ────────────────────────────────────────────────────────────────

describe('FmListPage — KPI cards row', () => {
  it('renders KpiWidget elements', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={[makeDecl()]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelectorAll('.test-kpi').length).toBeGreaterThan(0);
  });

  it('shows pending count in KPI', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ status: 'pending' }),
      makeDecl({ status: 'pending' }),
      makeDecl({ status: 'submitted' }),
    ];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const kpis = container.querySelectorAll('.test-kpi');
    // The 2nd KPI is the pending count (index 1)
    expect(kpis[1].textContent).toBe('2');
  });
});

// ── New declaration modal ────────────────────────────────────────────────────

describe('FmListPage — new declaration modal', () => {
  it('passes the current activeModels state to NewDeclModal when opened', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    fireEvent.click(getByText('+ Nueva declaración'));
    const modal = container.querySelector('[data-testid="new-decl-modal"]');
    expect(modal).toBeTruthy();
    expect(JSON.parse(modal.getAttribute('data-active-models'))).toEqual({ '303': true, '349': true });
  });
});

// ── Model catalog toolbar button ───────────────────────────────────────────
// These don't depend on activeModels state (the button and drawer always
// render, independent of catalogLoaded/activeCount), so they keep the plain
// no-token props.

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

  it('no longer renders the row-level "Más opciones" kebab button — it was removed entirely', () => {
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(container.querySelector('[aria-label="Más opciones"]')).toBeFalsy();
    // Not just hidden — there is no menu to open at all.
    expect(container.querySelector('[role="menu"]')).toBeFalsy();
  });

  it('renders no trace of the removed "Demo" / "Configuración" row actions anywhere on the page', () => {
    const { queryByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    expect(queryByText('Demo')).toBeFalsy();
    expect(queryByText(/fm\.config\.title/)).toBeFalsy();
  });
});

// ── No active models: hide new-decl, show dedicated empty state ────────────
// This whole block now exercises the real fetch-backed flow: catalog starts
// with both models active (mocked GET), then transitions are driven through
// the same onSave path used in production.

function deactivateAllModels(container, getByText) {
  fireEvent.click(getByText(/fm\.catalog\.title/));
  fireEvent.click(container.querySelector('[data-testid="catalog-save-none"]'));
}

describe('FmListPage — no active models', () => {
  it('shows "+ Nueva declaración" when at least one model is active (default)', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { queryByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(queryByText('+ Nueva declaración')).toBeTruthy();
  });

  it('hides "+ Nueva declaración" once every model is deactivated', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText, queryByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    deactivateAllModels(container, getByText);
    expect(queryByText('+ Nueva declaración')).toBeFalsy();
  });

  it('shows the no-active-models empty state message instead of the generic one', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    deactivateAllModels(container, getByText);
    const empty = container.querySelector('.fm-empty-state');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('fm.list.empty_no_active_models');
  });

  it('prioritizes the no-active-models message even when stale rows still match filters', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [makeDecl(), makeDecl()];
    const { container, getByText } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelector('table')).toBeTruthy();
    deactivateAllModels(container, getByText);
    expect(container.querySelector('table')).toBeFalsy();
    const empty = container.querySelector('.fm-empty-state');
    expect(empty.textContent).toContain('fm.list.empty_no_active_models');
  });

  it('reactivating a model from the catalog restores "+ Nueva declaración" and the table, in the same session', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [makeDecl(), makeDecl()];
    const { container, getByText, queryByText } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    // Start with both models active: button shown, table shown.
    expect(queryByText('+ Nueva declaración')).toBeTruthy();
    expect(container.querySelector('table')).toBeTruthy();

    // Deactivate everything: button hidden, dedicated empty state shown.
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

  it('the catalog toolbar button count reflects 1 vs 2 active models correctly', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    // Default state: both models active → count is 2.
    expect(getByText(/fm\.catalog\.title.*\(2\)/)).toBeTruthy();

    // Deactivate 349, keep 303 active → count is 1, "+ Nueva declaración" still shows.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    expect(getByText(/fm\.catalog\.title.*\(1\)/)).toBeTruthy();
    expect(container.querySelector('table') || container.querySelector('.fm-empty-state')).toBeTruthy();
  });

  it('does not render a CTA inside the no-active-models empty state — the toolbar button already opens the catalog', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText, queryByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
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
  it('hides declarations for a model deactivated in the catalog, keeps the still-active model\'s rows', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ id: '303-a', model: '303' }),
      makeDecl({ id: '349-a', model: '349' }),
      makeDecl({ id: '349-b', model: '349' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

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

  it('excludes the deactivated model from the "Todos los modelos" filter dropdown options', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ id: '303-a', model: '303' }),
      makeDecl({ id: '349-a', model: '349' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

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

  it('drives the KPI row from the same activeModels-filtered set (not the raw declarations)', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ id: '303-a', model: '303', status: 'pending' }),
      makeDecl({ id: '349-a', model: '349', status: 'pending' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

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
// The table (and its headers) only renders when activeCount > 0, so these
// need an active-models catalog too — this was a downstream symptom of the
// same root cause, not a separate issue.

describe('FmListPage — column headers', () => {
  it('renders model and period column headers', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={[makeDecl()]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const headers = container.querySelectorAll('thead th');
    const headerText = Array.from(headers).map(h => h.textContent).join(' ');
    expect(headerText).toContain('fm.col.model');
    expect(headerText).toContain('fm.col.period');
  });

  it('renders status column header', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={[makeDecl()]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const headerText = Array.from(container.querySelectorAll('thead th'))
      .map(h => h.textContent).join(' ');
    expect(headerText).toContain('fm.col.status');
  });
});

// ── fiscal-models-catalog backend integration ───────────────────────────────
// Covers the new fetch-backed flow directly: GET on mount, activeModels
// reflecting the response, the "loading" gate, and the PUT fired
// on catalog save.

describe('FmListPage — fiscal-models-catalog backend integration', () => {
  it('calls GET {base}/fiscal-models-catalog with the bearer token on mount when token+apiBaseUrl are present', async () => {
    globalThis.fetch = mockCatalogFetch({ '303': true, '349': true });
    render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE}/fiscal-models-catalog`,
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}` } })
    );
  });

  it('activeModels reflects the fetched response — catalog count matches a partial active map', async () => {
    globalThis.fetch = mockCatalogFetch({ '303': true, '349': false });
    const { getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(getByText(/fm\.catalog\.title.*\(1\)/)).toBeTruthy();
  });

  it('starts with 0 active models when the catalog GET returns an empty object (nothing saved yet)', async () => {
    globalThis.fetch = mockCatalogFetch({});
    const { getByText, container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(getByText(/fm\.catalog\.title.*\(0\)/)).toBeTruthy();
    expect(container.querySelector('.fm-empty-state').textContent).toContain('fm.list.empty_no_active_models');
  });

  it('shows "loading" while the catalog fetch is pending and hides it once resolved', async () => {
    let resolveFetch;
    const pending = new Promise((resolve) => { resolveFetch = resolve; });
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('fiscal-models-catalog')) {
        return pending.then(() => ({ ok: true, json: async () => ({ '303': true, '349': true }) }));
      }
      return Promise.reject(new Error(`unmocked fetch: ${url}`));
    });

    const { container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    expect(container.textContent).toContain('loading');

    resolveFetch();
    await waitForCatalogLoad();
    expect(container.textContent).not.toContain('loading');
  });

  it('PUTs the new active-models map with the bearer token when a catalog save happens', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE}/fiscal-models-catalog`,
        expect.objectContaining({
          method: 'PUT',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ '303': true, '349': false }),
        })
      );
    });
  });

  it('PUTs an all-false map when every model is deactivated', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-none"]'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE}/fiscal-models-catalog`,
        expect.objectContaining({
          method: 'PUT',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ '303': false, '349': false }),
        })
      );
    });
  });

  it('does not PUT the catalog when token/apiBaseUrl are absent — local state still updates', () => {
    const { container, getByText, queryByText } = render(<FmListPage declarations={[]} {...defaultProps} />);
    // Without token/apiBaseUrl, catalogLoaded starts true and activeModels {} —
    // reactivating 303 must still work locally without hitting the network.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(queryByText('+ Nueva declaración')).toBeTruthy();
  });
});

// ── fiscal-models-catalog — error / malformed-response edge cases ──────────
// The mount-time GET must never leave the UI stuck on "loading": the
// `.catch(() => {})` + `.finally(() => setCatalogLoaded(true))` chain in
// FmListPage.jsx has to flip `catalogLoaded` regardless of how the fetch
// settles (network reject, non-2xx status, or a resolved-but-unexpected body).

describe('FmListPage — fiscal-models-catalog error and malformed-response handling', () => {
  it('clears the "loading" gate when the catalog GET resolves with a non-200 status (500)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('fiscal-models-catalog')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.reject(new Error(`unmocked fetch: ${url}`));
    });
    const { container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    // Falls back to the default empty activeModels — "no active models" empty state, not stuck loading.
    expect(container.textContent).not.toContain('loading');
    expect(container.querySelector('.fm-empty-state').textContent).toContain('fm.list.empty_no_active_models');
  });

  it('clears the "loading" gate when the catalog GET rejects outright (network error)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('fiscal-models-catalog')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.reject(new Error(`unmocked fetch: ${url}`));
    });
    const { container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.textContent).not.toContain('loading');
  });

  it('falls back to an empty catalog (0 active models) when the GET body is `null`', async () => {
    globalThis.fetch = mockCatalogFetch(null);
    const { getByText, container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(getByText(/fm\.catalog\.title.*\(0\)/)).toBeTruthy();
    expect(container.querySelector('.fm-empty-state').textContent).toContain('fm.list.empty_no_active_models');
  });

  it('does not crash and shows 0 active models when the GET body is an array instead of an object', async () => {
    // `data ?? {}` only guards null/undefined — a truthy non-object body (like `[]`)
    // is kept as-is. Document current behavior: indexing an array by '303'/'349'
    // yields `undefined`, so every consumer (modelOptions, activeCount, activeDecls)
    // degrades to "nothing active" rather than throwing.
    globalThis.fetch = mockCatalogFetch([]);
    const { getByText, container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(getByText(/fm\.catalog\.title.*\(0\)/)).toBeTruthy();
    expect(container.querySelector('.fm-empty-state').textContent).toContain('fm.list.empty_no_active_models');
  });

  it('BUG: a non-empty string GET body produces a nonsensical positive active-models count', async () => {
    // Object.values('abc') → ['a','b','c'] (all truthy) so `activeCount` reports
    // 3 "active" models even though modelOptions/activeDecls correctly see none
    // (string indexing by '303'/'349' is `undefined`). Consequences, both visible
    // in this test: (1) the toolbar shows a misleading "(3)" and the
    // "+ Nueva declaración" CTA becomes visible, AND (2) because `activeCount`
    // (not `modelOptions.length`) gates the table-vs-empty-state branch, the UI
    // skips the intended "no active models, configure from the Catálogo" empty
    // state and instead falls through to the plain/generic empty table — an
    // inconsistent, unhelpful state for a case that should read as "nothing
    // active". See FmListPage.jsx `setActiveModels(data ?? {})` and the
    // `activeCount === 0 ? ... : filtered.length === 0 ? <EmptyState /> ...` branch.
    globalThis.fetch = mockCatalogFetch('abc');
    const { getByText, container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(getByText(/fm\.catalog\.title.*\(3\)/)).toBeTruthy();
    expect(getByText('+ Nueva declaración')).toBeTruthy();
    // Falls through to the generic/plain empty state, NOT the "no active models" one.
    expect(container.querySelector('.fm-empty-state').textContent).toBe('empty');
  });
});

// ── fiscal-models-catalog — concurrent save / unmount safety ───────────────

describe('FmListPage — fiscal-models-catalog concurrent save and unmount safety', () => {
  it('fires two independent PUT requests when the catalog is saved twice in quick succession, with no local-state race', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container, getByText } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));
    // Drawer closes itself on save; reopen to fire a second save before the
    // first PUT's promise (mocked as already-resolved, but not yet awaited by
    // the component) has been observed by any assertion below.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-none"]'));

    await waitFor(() => {
      const calls = globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('fiscal-models-catalog') );
      const puts = calls.filter(([, opts]) => opts?.method === 'PUT');
      expect(puts.length).toBe(2);
    });
    // Local UI state reflects the LAST click synchronously — unaffected by
    // network resolve order, since the PUT response is fire-and-forget
    // (no `.then` writes activeModels back from the server).
    expect(getByText(/fm\.catalog\.title.*\(0\)/)).toBeTruthy();
  });

  it('does not throw or warn when the component unmounts while the catalog GET is still pending', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveFetch;
    const pending = new Promise((resolve) => { resolveFetch = resolve; });
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('fiscal-models-catalog')) {
        return pending.then(() => ({ ok: true, json: async () => ({ '303': true, '349': true }) }));
      }
      return Promise.reject(new Error(`unmocked fetch: ${url}`));
    });

    const { unmount } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    unmount();
    // Resolve the fetch AFTER unmount — the effect's setState calls fire
    // against an unmounted component. React 18 silently no-ops this (no
    // dev-mode warning like React 16/17), but the crucial guarantee is it
    // must not throw synchronously nor log a React error boundary crash.
    resolveFetch();
    await pending;
    await new Promise((r) => setTimeout(r, 0));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
