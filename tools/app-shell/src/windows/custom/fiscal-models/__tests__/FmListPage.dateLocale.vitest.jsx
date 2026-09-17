// Real-locale `updatedAt` date-formatting coverage (ETP-5338).
//
// `normDecl()` used to hardcode `toLocaleDateString('es-ES')` regardless of the
// active UI locale. The fix reads the locale from `useLocaleSwitch()` and builds
// the BCP-47 tag it needs ('en_US' -> 'en-US', 'es_ES' -> 'es-ES'). `normDecl`
// only runs on data that comes back from the `fiscal303/declarations` fetch (or
// the "create declaration" response) — NOT on the `declarations` prop passed
// directly by the caller — so this exercises the fetch path with a mocked
// `fetch`, and asserts the two locales genuinely render different date text
// (not just that the hook is called).
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { registerApiSession, resetApiSessionForTests } from '@/auth/api.js';

let activeLocale = 'es_ES';
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: activeLocale }),
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
vi.mock('../FmOverlays.jsx', () => ({ NewDeclModal: () => null }));
vi.mock('../FmCatalogPage.jsx', () => ({ default: () => null }));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: () => null,
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
  EmptyState: () => React.createElement('div', { className: 'fm-empty-state' }, 'empty'),
  KpiWidget: () => null,
}));

import FmListPage from '../FmListPage.jsx';

const TOKEN = 'test-token';
const API_BASE_URL = '/api/window';

const declRows = [{
  id: 'decl-1', model: '303', year: 2026, period: 'T1', type: 'ord', status: 'pending',
  nif: 'B12345678', result: null, incidents: { blocking: 0, warning: 0 },
  updatedAt: '2026-01-05T00:00:00.000Z',
}];

function mockFetch(rows, activeModels = { '303': true, '349': true }) {
  return vi.fn((url) => {
    const u = String(url);
    if (u.includes('fiscal-models-catalog')) {
      return Promise.resolve({ ok: true, json: async () => activeModels });
    }
    if (u.includes('fiscal303/declarations')) {
      return Promise.resolve({ ok: true, json: async () => rows });
    }
    return Promise.reject(new Error(`unmocked fetch: ${url}`));
  });
}

const defaultProps = {
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  onComputeUpdate: vi.fn(),
  token: TOKEN,
  apiBaseUrl: API_BASE_URL,
};

beforeEach(() => {
  vi.clearAllMocks();
  registerApiSession({ getToken: () => TOKEN });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiSessionForTests();
});

describe('FmListPage — updatedAt date formatting follows the active UI locale (ETP-5338)', () => {
  it('renders the es_ES-formatted date under the Spanish locale', async () => {
    activeLocale = 'es_ES';
    globalThis.fetch = mockFetch(declRows);
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);

    await waitFor(() => expect(container.querySelector('.fm-date')).toBeTruthy());

    const expected = new Date(declRows[0].updatedAt).toLocaleDateString('es-ES');
    expect(container.querySelector('.fm-date').textContent).toBe(expected);
  });

  it('renders the en_US-formatted date under the English locale, different from es_ES', async () => {
    activeLocale = 'en_US';
    globalThis.fetch = mockFetch(declRows);
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);

    await waitFor(() => expect(container.querySelector('.fm-date')).toBeTruthy());

    const expectedEn = new Date(declRows[0].updatedAt).toLocaleDateString('en-US');
    const expectedEs = new Date(declRows[0].updatedAt).toLocaleDateString('es-ES');
    // Sanity check that the two locales actually disagree on this date — if the
    // test environment ever normalized both to the same string, the assertion
    // below would be a false positive.
    expect(expectedEn).not.toBe(expectedEs);
    expect(container.querySelector('.fm-date').textContent).toBe(expectedEn);
  });
});
