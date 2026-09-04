// Vitest component tests for FmListPage.jsx
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setSessionCredentials, CREDENTIAL_MODES } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { registerApiSession, resetApiSessionForTests } from '@/auth/api.js';

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
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  EmptyState: ({ title, message, cta }) =>
    React.createElement(
      'div',
      { className: 'fm-empty-state' },
      title || message || 'empty',
      cta ?? null,
    ),
  // Forwards onClick/active (ETP-4755, click-to-filter) so tests can exercise
  // FmListPage's own filtering wiring — the rendered textContent stays just
  // `value` (unchanged) so pre-existing index-based assertions keep working.
  KpiWidget: ({ value, label, onClick, active }) =>
    React.createElement(
      'button',
      { type: 'button', className: 'test-kpi', 'data-kpi-label': label, 'data-active': String(!!active), onClick },
      value,
    ),
}));

import FmListPage from '../FmListPage.jsx';
// ETP-5030 — shared row-shading assertion helper (see @/test/rowShading.js).
import { classesOf } from '@/test/rowShading.js';

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
  // FmListPage now goes through useApiFetch (ETP-5022), which resolves its bearer
  // token from the ambient session when no AuthProvider wraps the tree (as here) —
  // not from the `token` prop directly. Registering it with the same TOKEN constant
  // keeps the "bearer token" assertions below meaningful without weakening them.
  registerApiSession({ getToken: () => TOKEN });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiSessionForTests();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('FmListPage — rendering', () => {
  // ETP-4576 — apiFetch takes the credential from the active scheme, not from an argument,
  // so a test that expects an Authorization header has to declare the scheme first.
  beforeEach(() => setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: 'test-token' }));

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
      makeDecl({ status: 'draft' }),
      makeDecl({ status: 'draft' }),
      makeDecl({ status: 'submitted' }),
    ];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    const kpis = container.querySelectorAll('.test-kpi');
    // The 2nd KPI is the pending count (index 1)
    expect(kpis[1].textContent).toBe('2');
  });
});

// ── KPI cards as click-to-filter (ETP-4755) ───────────────────────────────────
// Kpi index order (KpiCardsRow): [0] "Por vencer" (upcoming), [1] "Pendientes"
// (pending/draft), [2] "Incidencias" (incidents). Four declarations, each
// unambiguously matching (at most) one of the three predicates — draft/ready/
// submitted statuses and far-past/far-future years so the "upcoming deadline"
// check is never date-flaky — so a click always narrows to an exact, known set.
describe('FmListPage — KPI cards as click-to-filter', () => {
  const pendingOnlyDecl   = makeDecl({ id: 'p1', status: 'draft',     year: 2000, period: 'T1', incidents: { blocking: 0, warning: 0 } });
  // "Por vencer" is now a rolling 7-day window (ETP-4755), not "any day in the future" — this
  // fixture's deadline must be pinned relative to a fake "now" (see the test below), not a
  // far-future year that would fall outside the window against the real current date.
  const upcomingOnlyDecl  = makeDecl({ id: 'u1', status: 'ready', model: '349', year: 2026, period: '09', incidents: { blocking: 0, warning: 0 } });
  const incidentsOnlyDecl = makeDecl({ id: 'i1', status: 'submitted', year: 2000, period: 'T1', incidents: { blocking: 1, warning: 0 } });
  const neutralDecl       = makeDecl({ id: 'n1', status: 'submitted', year: 2000, period: 'T2', incidents: { blocking: 0, warning: 0 } });
  const allDecls = [pendingOnlyDecl, upcomingOnlyDecl, incidentsOnlyDecl, neutralDecl];

  it('clicking "Pendientes" filters the list to exactly the draft declaration', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelectorAll('tbody tr').length).toBe(4);

    const kpis = container.querySelectorAll('.test-kpi');
    fireEvent.click(kpis[1]); // Pendientes
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('T1'); // pendingOnlyDecl's period
  });

  it('clicking "Incidencias" filters the list to exactly the declaration with incidents', async () => {
    // FmListPage refetches real per-declaration incidents on mount (ETP-4755
    // fix) and overwrites the `incidents` field the prop was seeded with — the
    // fixture's incidents only "stick" if the real fetch reports them too.
    globalThis.fetch = mockCatalogAndIncidentsFetch({ incidentsByDeclId: { i1: [{ code: 'X', message: 'm', severity: 'block' }] } });
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const kpis = container.querySelectorAll('.test-kpi');
    fireEvent.click(kpis[2]); // Incidencias
    // Wait for both the real per-declaration incidents fetch to land AND the
    // filter to apply — either order, this converges once both have happened.
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).not.toContain('fm.incidents.none');
    });
  });

  it('clicking "Por vencer" filters the list to exactly the declaration with an upcoming deadline', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    // Pin "now" so upcomingOnlyDecl's deadline (349, year 2026, period '09' → October 20, 2026)
    // falls within the 7-day "Por vencer" window. Faked only after the mount-time catalog fetch
    // has already resolved, so waitForCatalogLoad's real-timer polling above is unaffected.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 15)); // October 15, 2026

      const kpis = container.querySelectorAll('.test-kpi');
      fireEvent.click(kpis[0]); // Por vencer
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('2026');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the clicked card as active via data-active', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const kpis = container.querySelectorAll('.test-kpi');
    expect(kpis[1].getAttribute('data-active')).toBe('false');
    fireEvent.click(kpis[1]);
    expect(kpis[1].getAttribute('data-active')).toBe('true');
    expect(kpis[0].getAttribute('data-active')).toBe('false');
    expect(kpis[2].getAttribute('data-active')).toBe('false');
  });

  it('clicking the same active card again clears the filter', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const kpis = container.querySelectorAll('.test-kpi');
    fireEvent.click(kpis[1]); // Pendientes — filters to 1 row
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
    fireEvent.click(container.querySelectorAll('.test-kpi')[1]); // click again — clears
    expect(container.querySelectorAll('tbody tr').length).toBe(4);
    expect(container.querySelectorAll('.test-kpi')[1].getAttribute('data-active')).toBe('false');
  });

  it('clicking a different card while one is active replaces it (mutual exclusion)', async () => {
    globalThis.fetch = mockCatalogAndIncidentsFetch({ incidentsByDeclId: { i1: [{ code: 'X', message: 'm', severity: 'block' }] } });
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(container.querySelectorAll('.test-kpi')[1]); // Pendientes active
    expect(container.querySelectorAll('tbody tr').length).toBe(1);

    fireEvent.click(container.querySelectorAll('.test-kpi')[2]); // switch to Incidencias
    expect(container.querySelectorAll('.test-kpi')[1].getAttribute('data-active')).toBe('false');
    expect(container.querySelectorAll('.test-kpi')[2].getAttribute('data-active')).toBe('true');
    await waitFor(() => {
      const rows = container.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).not.toContain('fm.incidents.none');
    });
  });

  it('combines (AND) with an existing status filter rather than replacing it', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(<FmListPage declarations={allDecls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    // Apply the "Borrador" status filter (draft only) via the toolbar dropdown.
    const pills = container.querySelectorAll('.fm-toolbar__pill');
    fireEvent.click(pills[2]); // status filter pill
    const options = container.querySelectorAll('[role="option"]');
    const borradorOpt = Array.from(options).find(o => o.textContent.includes('Borrador'));
    fireEvent.click(borradorOpt);
    expect(container.querySelectorAll('tbody tr').length).toBe(1); // only pendingOnlyDecl (draft)

    // Now click "Incidencias" — pendingOnlyDecl has no incidents, and the only
    // declaration WITH incidents (incidentsOnlyDecl) is 'submitted', not draft —
    // the AND of both filters must yield zero rows, not the KPI's own 1 result.
    fireEvent.click(container.querySelectorAll('.test-kpi')[2]);
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
    expect(container.querySelector('.fm-empty-state')).toBeTruthy();
  });

  it('renders the existing empty state when a KPI filter matches zero rows', async () => {
    globalThis.fetch = mockCatalogFetch();
    // Only the neutral declaration — matches none of the 3 KPI predicates.
    const { container } = render(<FmListPage declarations={[neutralDecl]} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelectorAll('tbody tr').length).toBe(1);

    fireEvent.click(container.querySelectorAll('.test-kpi')[1]); // Pendientes
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
    expect(container.querySelector('.fm-empty-state')).toBeTruthy();
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
      makeDecl({ id: '303-a', model: '303', status: 'draft' }),
      makeDecl({ id: '349-a', model: '349', status: 'draft' }),
    ];
    const { container, getByText } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    // Both draft → KPI "pending" count is 2 while both models are active.
    let kpis = container.querySelectorAll('.test-kpi');
    expect(kpis[1].textContent).toBe('2');

    // Deactivate 349 → only the 303 declaration should count.
    fireEvent.click(getByText(/fm\.catalog\.title/));
    fireEvent.click(container.querySelector('[data-testid="catalog-save-303-only"]'));

    kpis = container.querySelectorAll('.test-kpi');
    expect(kpis[1].textContent).toBe('1');
  });
});

// ── submissionMethod sub-label (ETP-4755) ───────────────────────────────────
// StatusText renders a compact sub-label under the status badge — only when
// submissionMethod is present AND the row's status is one that can actually
// carry one (submitted / submitted_ack). Never for submitted_ext (predates the
// column) and never for a legacy row with no submissionMethod at all.

describe('FmListPage — submissionMethod sub-label (ETP-4755)', () => {
  it('renders the sub-label for a submitted_ack row with submissionMethod present', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'sm-1', status: 'submitted_ack', submissionMethod: 'manual_ack' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const statusCell = container.querySelector('tbody tr').querySelectorAll('td')[4];
    expect(statusCell.textContent).toContain('fm.present.method.manual_ack');
  });

  it('renders the sub-label for a submitted row with submissionMethod present', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'sm-2', status: 'submitted', submissionMethod: 'manual_no_receipt' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const statusCell = container.querySelector('tbody tr').querySelectorAll('td')[4];
    expect(statusCell.textContent).toContain('fm.present.method.manual_no_receipt');
  });

  it('renders the aeat_telematic sub-label for a submitted_ack row set server-side', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'sm-3', status: 'submitted_ack', submissionMethod: 'aeat_telematic' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const statusCell = container.querySelector('tbody tr').querySelectorAll('td')[4];
    expect(statusCell.textContent).toContain('fm.present.method.aeat_telematic');
  });

  it('does NOT render a sub-label for a submitted_ext row, even with submissionMethod present', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'sm-4', status: 'submitted_ext', submissionMethod: 'manual_ack' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const statusCell = container.querySelector('tbody tr').querySelectorAll('td')[4];
    expect(statusCell.textContent).not.toContain('fm.present.method');
  });

  it('does NOT render a sub-label for a legacy row with no submissionMethod', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'sm-5', status: 'submitted_ack', submissionMethod: undefined });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const statusCell = container.querySelector('tbody tr').querySelectorAll('td')[4];
    expect(statusCell.textContent).not.toContain('fm.present.method');
    // Still shows the bare status badge, unchanged — submitted_ack collapses onto the
    // 'submitted' i18n key (status-badge unification, ETP-4755); this file's useUI mock is
    // an identity passthrough, so the badge literally renders the untranslated key.
    expect(statusCell.textContent).toContain('fm.status.submitted');
  });
});

// NOTE: a render-level "Resultado draft-vs-non-draft map selection" test does
// NOT belong in this file — useFiscalAutoCompute.js is mocked wholesale at
// the top of this file (a constant `{ computedMap: {} }` for every call), so
// the real map-selection logic can never be exercised here. See
// FmListPageAutoCompute.vitest.jsx instead, which mocks the hook with a
// decls-aware implementation specifically to cover that behavior.

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
      expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES' } })
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
          headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
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
          headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' },
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

// ── Incidencias column — real per-declaration refresh (ETP-4755) ──────────────
// GET /fiscal303/declarations never carries real blocking/warning counts, so
// normDecl() defaults every row's incidents to {blocking:0, warning:0}. FmListPage
// must then fetch the real counts per declaration via fetchDeclarationIncidents
// and merge them into `decls`, regardless of the declaration's status.

function mockCatalogAndIncidentsFetch({ activeModels = { '303': true, '349': true }, incidentsByDeclId = {} } = {}) {
  return vi.fn((url) => {
    const urlStr = String(url);
    if (urlStr.includes('fiscal-models-catalog')) {
      return Promise.resolve({ ok: true, json: async () => activeModels });
    }
    const incidentsMatch = urlStr.match(/\/incidents\?id=([^&]+)/);
    if (incidentsMatch) {
      const id = decodeURIComponent(incidentsMatch[1]);
      const data = incidentsByDeclId[id] ?? [];
      return Promise.resolve({ ok: true, json: async () => ({ data }) });
    }
    return Promise.reject(new Error(`unmocked fetch: ${urlStr}`));
  });
}

// Mocked useUI()/t() echoes i18n keys literally (see the module mock above), so
// the "no incidents" fallback text renders as the raw key, not the Spanish label.
const INCIDENTS_NONE_KEY = 'fm.incidents.none';

describe('FmListPage — real incidents refresh (regression, ETP-4755)', () => {
  it('replaces the stale zero-incidents default with the real count fetched from /fiscal303/incidents', async () => {
    globalThis.fetch = mockCatalogAndIncidentsFetch({
      incidentsByDeclId: {
        'decl-real-1': [{ code: 'AVISO01', message: 'Possible mismatch in box 88', severity: 'warn' }],
      },
    });
    const decl = makeDecl({ id: 'decl-real-1', status: 'submitted' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    await waitFor(() => {
      const row = container.querySelector('tbody tr');
      const incidentsCell = row.querySelectorAll('td')[6]; // 7th column = Incidencias
      expect(incidentsCell.textContent).not.toBe(INCIDENTS_NONE_KEY);
      expect(incidentsCell.textContent).toContain('1');
    });
  });

  it('fetches and shows real incidents for a "draft" declaration too', async () => {
    globalThis.fetch = mockCatalogAndIncidentsFetch({
      incidentsByDeclId: {
        'decl-draft-1': [
          { code: 'EDID065', message: 'IBAN not allowed', severity: 'block' },
          { code: 'AVISO01', message: 'Late submission', severity: 'warn' },
        ],
      },
    });
    const decl = makeDecl({ id: 'decl-draft-1', status: 'draft' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    await waitFor(() => {
      const row = container.querySelector('tbody tr');
      const incidentsCell = row.querySelectorAll('td')[6];
      expect(incidentsCell.textContent).not.toBe(INCIDENTS_NONE_KEY);
      // One blocking + one warning badge, each rendering its own "1" count.
      expect(incidentsCell.textContent.match(/1/g)?.length).toBe(2);
    });
  });

  it('leaves a declaration with truly no incidents showing "Sin incidencias"', async () => {
    globalThis.fetch = mockCatalogAndIncidentsFetch({
      incidentsByDeclId: { 'decl-clean-1': [] },
    });
    const decl = makeDecl({ id: 'decl-clean-1', status: 'submitted' });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    await waitFor(() => {
      const row = container.querySelector('tbody tr');
      const incidentsCell = row.querySelectorAll('td')[6];
      expect(incidentsCell.textContent).toBe(INCIDENTS_NONE_KEY);
    });
  });

  it('calls GET {base}/fiscal303/incidents?id=<declId> with the bearer token for each visible declaration', async () => {
    globalThis.fetch = mockCatalogAndIncidentsFetch({});
    const decl = makeDecl({ id: 'decl-url-check' });
    render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE}/fiscal303/incidents?id=decl-url-check`,
        expect.objectContaining({ headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES' } })
      );
    });
  });

  // NOTE: a dedicated assertion that the incidents effect does NOT refire when only
  // a declaration's `status` changes (same id set) is intentionally omitted here.
  // Nothing in the current render tree changes a declaration's `status` — there is
  // no row-level status control wired up yet, so there's no way to exercise this path
  // through the public component API without reaching into internals. The
  // `declIdsKey` (not `decls`) dependency array in the source is the mechanism that
  // guards against this; once a real status-change trigger exists in the UI, this
  // test should be added here.
});

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

// ── ETP-5030 — selected-row shading ───────────────────────────────────────────
// GROUP B (CSS rule, not a Tailwind utility). This table paints its backgrounds
// on the CELLS (`.fm-table tbody tr:hover td`, fiscal-models.css), and a td
// background covers whatever the tr paints underneath — so a `bg-primary/5` on
// the <tr> would have rendered ONLY while the pointer was elsewhere, i.e. never
// at the moment the user ticks the checkbox. The fix is therefore the
// `fm-row--selected` class plus a pair of CSS rules
// (`tr.fm-row--selected td` / `tr.fm-row--selected:hover td`) in
// fiscal-models.css.
//
// IMPORTANT — these assertions are a PROXY. jsdom does not apply stylesheets, so
// asserting the class proves the hook-up (the row is marked when, and only when,
// it is selected), NOT the rendered colour and NOT the CSS specificity that
// makes the tint outrank `tbody tr:hover td`. Neither of those is observable
// from a unit test in this repo.
describe('FmListPage — ETP-5030 selected-row shading', () => {
  /** The <tr> whose period cell matches `period`. */
  function rowByPeriod(container, period) {
    return [...container.querySelectorAll('tbody tr')]
      .find((tr) => tr.querySelector('.fm-period')?.textContent === period);
  }

  /** Row checkbox inside the given <tr>. */
  const checkboxIn = (row) => row.querySelector('input[type="checkbox"]');

  /** The row-state classes that compete for the same td background. */
  const selectionClasses = (row) => classesOf(row)
    .filter((c) => c === 'fm-row--selected' || c === 'fm-table__row--current');

  async function renderDecls(decls) {
    globalThis.fetch = mockCatalogFetch();
    const view = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    return view;
  }

  it('marks ONLY the ticked row as selected and leaves the others unmarked', async () => {
    const { container } = await renderDecls([
      makeDecl({ id: 'r1', period: 'T1' }),
      makeDecl({ id: 'r2', period: 'T2' }),
    ]);

    const row1 = rowByPeriod(container, 'T1');
    const row2 = rowByPeriod(container, 'T2');
    // Sanity: neither row is marked before the tick, so the assertion below is
    // a real change of state and cannot pass vacuously.
    expect(row1.className).not.toContain('fm-row--selected');
    expect(row2.className).not.toContain('fm-row--selected');

    fireEvent.click(checkboxIn(row1));

    expect(rowByPeriod(container, 'T1').className).toContain('fm-row--selected');
    expect(rowByPeriod(container, 'T2').className).not.toContain('fm-row--selected');
  });

  it('removes the marker when the row is unticked', async () => {
    const { container } = await renderDecls([makeDecl({ id: 'r1', period: 'T1' })]);

    fireEvent.click(checkboxIn(rowByPeriod(container, 'T1')));
    expect(rowByPeriod(container, 'T1').className).toContain('fm-row--selected');

    fireEvent.click(checkboxIn(rowByPeriod(container, 'T1')));
    expect(rowByPeriod(container, 'T1').className).not.toContain('fm-row--selected');
  });

  it('keeps the marker on the row while it is hovered', async () => {
    const { container } = await renderDecls([makeDecl({ id: 'r1', period: 'T1' })]);

    const row = rowByPeriod(container, 'T1');
    fireEvent.click(checkboxIn(row));
    fireEvent.mouseOver(row);
    fireEvent.mouseEnter(row);

    // The class is unconditional — nothing in the component toggles it on
    // pointer events, which is what makes the CSS `:hover` variant reachable.
    // The guarantee that the tint actually WINS over `tbody tr:hover td` is
    // CSS-level (selector specificity) and is not testable here: jsdom applies
    // no stylesheets.
    expect(rowByPeriod(container, 'T1').className).toContain('fm-row--selected');
  });

  it('collision — selected + current declaration: selection wins and exactly one row-state class paints', async () => {
    const { container } = await renderDecls([
      makeDecl({ id: 'cur-1', period: 'T1', current: true }),
      makeDecl({ id: 'oth-1', period: 'T2' }),
    ]);

    const currentRow = rowByPeriod(container, 'T1');
    // Sanity: the current-declaration marker is what the row carried BEFORE the
    // fix, and it is still what an unselected current row carries.
    expect(selectionClasses(currentRow)).toEqual(['fm-table__row--current']);

    fireEvent.click(checkboxIn(currentRow));

    // Both classes paint the same td background, so emitting both would leave
    // the winner to stylesheet order — the trap this ticket is about.
    expect(selectionClasses(rowByPeriod(container, 'T1'))).toEqual(['fm-row--selected']);
    // The non-current sibling is unaffected.
    expect(selectionClasses(rowByPeriod(container, 'T2'))).toEqual([]);
  });

  it('collision — unticking a current declaration falls back to the current-declaration marker', async () => {
    const { container } = await renderDecls([makeDecl({ id: 'cur-1', period: 'T1', current: true })]);

    fireEvent.click(checkboxIn(rowByPeriod(container, 'T1')));
    expect(selectionClasses(rowByPeriod(container, 'T1'))).toEqual(['fm-row--selected']);

    fireEvent.click(checkboxIn(rowByPeriod(container, 'T1')));
    expect(selectionClasses(rowByPeriod(container, 'T1'))).toEqual(['fm-table__row--current']);
  });
});
