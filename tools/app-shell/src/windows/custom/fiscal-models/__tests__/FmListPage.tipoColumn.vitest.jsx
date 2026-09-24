// "Tipo" column derivation regression coverage (ETP-5338).
//
// FmListPage.jsx's "Tipo" list column used to render `decl.type === 'ord' ? 'Ordinaria' :
// 'Complementaria'` — always "Ordinaria" in practice, since no UI flow ever sets
// DECL_TYPE to 'com'. It now derives from the same rectificativa flag the 303
// detail page's "Autoliquidación Rectificativa" checkbox writes:
// `decl.manualData?.identification?.rectificativa`. See
// docs/generated-custom-windows/fiscal-models.md, "Tipo column derivation
// (ETP-5338)" for the full rationale.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { registerApiSession, resetApiSessionForTests } from '@/auth/api.js';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

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
  NewDeclModal: () => null,
}));
vi.mock('../FmCatalogPage.jsx', () => ({
  default: () => null,
}));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: ({ checked, onToggle }) =>
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange: e => onToggle?.(e.target.checked) }),
}));
vi.mock('lucide-react', () => ({
  LayoutGrid: () => null, Settings: () => null, ListFilter: () => null,
  ArrowUpDown: () => null, ChevronDown: () => null, MoreHorizontal: () => null,
  MoreVertical: () => null, Calendar: () => null, Clock: () => null,
  TriangleAlert: () => null, OctagonAlert: () => null, ArrowUpRight: () => null,
  Search: () => null, Play: () => null, Check: () => null,
  Pencil: () => null, Trash2: () => null, Loader2: () => null, RotateCcw: () => null,
}));
vi.mock('../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  EmptyState: ({ title, message, cta }) =>
    React.createElement('div', { className: 'fm-empty-state' }, title || message || 'empty', cta ?? null),
  KpiWidget: ({ value, label, onClick, active }) =>
    React.createElement(
      'button',
      { type: 'button', className: 'test-kpi', 'data-kpi-label': label, 'data-active': String(!!active), onClick },
      value,
    ),
}));

import FmListPage from '../FmListPage.jsx';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Matches FmListPage.vitest.jsx's makeDecl exactly (fixture shape parity).

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

const TOKEN = 'test-token';
const API_BASE_URL = '/api/window';
const BASE = '/api';
const withCatalogProps = { ...defaultProps, token: TOKEN, apiBaseUrl: API_BASE_URL };

function mockCatalogFetch(activeModels = { '303': true, '349': true }) {
  return vi.fn((url) => {
    if (String(url).includes('fiscal-models-catalog')) {
      return Promise.resolve({ ok: true, json: async () => activeModels });
    }
    return Promise.reject(new Error(`unmocked fetch: ${url}`));
  });
}

async function waitForCatalogLoad() {
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
}

// Tipo is the 4th <td> in each row (0: checkbox, 1: model, 2: period, 3: Tipo).
function tipoCellOf(row) {
  return row.querySelectorAll('td')[3];
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('fetch not mocked for this test')));
  registerApiSession({ getToken: () => TOKEN });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiSessionForTests();
});

describe('FmListPage — "Tipo" column derivation (ETP-5338)', () => {
  it('renders the rectificative label when manualData.identification.rectificativa is true', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({
      id: 'rect-1',
      manualData: { identification: { rectificativa: true } },
    });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.rectificative');
  });

  it('renders the ordinary label when manualData.identification.rectificativa is false', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({
      id: 'ord-1',
      manualData: { identification: { rectificativa: false } },
    });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.ordinary');
  });

  it('falls back to "ordinary" and does not throw when manualData is entirely absent', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'no-manual-data-1' });
    delete decl.manualData;

    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.ordinary');
  });

  it('falls back to "ordinary" when manualData.identification is absent', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'no-identification-1', manualData: {} });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.ordinary');
  });

  it('falls back to "ordinary" when manualData.identification.rectificativa is undefined', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({
      id: 'undefined-flag-1',
      manualData: { identification: { someOtherField: 'x' } },
    });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.ordinary');
  });

  it('a Modelo 349 row with no manualData.identification renders "ordinary" and does not throw (349 has no rectificativa concept)', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: '349-1', model: '349' });
    delete decl.manualData;

    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.ordinary');
  });

  // ETP-5456 — "Tipo" also derives 349's "Sustitutiva" flag, the same way it already
  // derives 303's "rectificativa": `manualData.identification.sustitutiva`, persisted by
  // FmModel349Page.jsx's SubstitutiveSection. The two flags are mutually exclusive by
  // construction (only 303 sets `rectificativa`, only 349 sets `sustitutiva`).
  it('renders the substitutive label for a 349 row with manualData.identification.sustitutiva === true', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({
      id: '349-sust-1', model: '349',
      manualData: { identification: { sustitutiva: true } },
    });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.substitutive');
  });

  it('also renders the substitutive label when sustitutiva is the legacy string "Y"', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({
      id: '349-sust-2', model: '349',
      manualData: { identification: { sustitutiva: 'Y' } },
    });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.substitutive');
  });

  it('renders "ordinary" for a 349 row with sustitutiva explicitly false', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({
      id: '349-sust-3', model: '349',
      manualData: { identification: { sustitutiva: false } },
    });
    const { container } = render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const row = container.querySelector('tbody tr');
    expect(tipoCellOf(row).textContent).toBe('fm.type.ordinary');
  });

  it('never renders "fm.type.complementary" — that key stays unused by this column', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ id: 'a', manualData: { identification: { rectificativa: true } } }),
      makeDecl({ id: 'b', manualData: { identification: { rectificativa: false } } }),
      makeDecl({ id: 'c' }),
    ];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    expect(container.textContent).not.toContain('fm.type.complementary');
  });
});

// ── Real-locale resolution (all 3 locale files) ─────────────────────────────
// Mirrors FmListPage.breadcrumb.i18n.vitest.jsx's pattern: mocks '@/i18n' (the
// path FmListPage.jsx actually imports useUI from) with a real-dictionary
// resolver, so this exercises the genuine translated strings, not the raw key.

describe('FmListPage — "Tipo" column real-locale i18n (ETP-5338)', () => {
  const locales = {
    en_US: { ordinary: 'Ordinary', rectificative: 'Rectificative' },
    es_ES: { ordinary: 'Ordinaria', rectificative: 'Rectificativa' },
    es_AR: { ordinary: 'Ordinaria', rectificative: 'Rectificativa' },
  };

  it.each(Object.entries(locales))(
    'resolves fm.type.ordinary and fm.type.rectificative to real, non-placeholder strings in %s',
    (locale, expected) => {
      const dict = loadLocaleDictionary(locale);
      const ui = makeRealUI(dict);
      expect(ui('fm.type.ordinary')).toBe(expected.ordinary);
      expect(ui('fm.type.rectificative')).toBe(expected.rectificative);
      // Not the raw key (i.e. the key actually resolved to a translation).
      expect(ui('fm.type.ordinary')).not.toBe('fm.type.ordinary');
      expect(ui('fm.type.rectificative')).not.toBe('fm.type.rectificative');
    },
  );

  // ETP-5456 — fm.type.substitutive was added ONLY to en_US/es_ES. es_AR is a
  // deprecated locale (see project memory: never add new i18n keys there) — it
  // deliberately does NOT get this key, so a real (unmocked) es_AR viewer would
  // see the raw key fall through here, not a translation. That's an accepted,
  // pre-existing consequence of the deprecation, not a regression to fix.
  const substitutiveLocales = {
    en_US: 'Substitutive',
    es_ES: 'Sustitutiva',
  };

  it.each(Object.entries(substitutiveLocales))(
    'resolves fm.type.substitutive to a real, non-placeholder string in %s',
    (locale, expected) => {
      const ui = makeRealUI(loadLocaleDictionary(locale));
      expect(ui('fm.type.substitutive')).toBe(expected);
      expect(ui('fm.type.substitutive')).not.toBe('fm.type.substitutive');
    },
  );
});
