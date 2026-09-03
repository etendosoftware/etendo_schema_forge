// Real-locale breadcrumb regression coverage (ETP-4945).
//
// GeneralLedgerConfigPage.jsx builds its breadcrumb as
// `${ui('finance')} / ${ui('glc.title')}` — a template literal, not a pure
// exported helper, so the only way to catch a real regression (a locale key
// reverting to the pre-fix "Tesorería" root, or "glc.title" reverting to the
// stale "Configuración contable") is to render the page with `useUI` backed
// by the REAL locale dictionary instead of the sibling
// GeneralLedgerConfigPage.vitest.jsx's identity mock (`(key) => key`), and
// capture what it actually passes to useSetPageMeta — same capture pattern as
// windows/custom/financial-account/__tests__/index.vitest.jsx
// ("calls useSetPageMeta with the account name in the breadcrumb").
import { render } from '@testing-library/react';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
vi.mock('@/i18n', () => ({
  useUI: () => activeUi,
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({ selectedOrg: { id: 'org-1', name: 'Test Org' } })),
}));

const setMetaMock = vi.fn();
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: (meta) => setMetaMock(meta),
}));

vi.mock('../useGeneralLedgerConfig.js', () => ({
  useGeneralLedgerConfig: vi.fn(() => ({
    general: { name: 'GL', currency: 'EUR' },
    defaults: { bankAsset: 'acct-1' },
    dimensions: [],
    orgInfo: {},
    meta: { source: 'mock' },
    catalogs: { currencies: [], accounts: [] },
    generalAccounts: { active: true },
    setGeneralField: vi.fn(),
    setDefaultField: vi.fn(),
    setDimensionField: vi.fn(),
    setGeneralAccountsField: vi.fn(),
    isDirty: false,
    save: vi.fn(),
    loading: false,
  })),
}));

vi.mock('../mockCatalogs.js', () => ({
  DEFAULTS_GROUPS: [
    { fields: [{ key: 'bankAsset', required: true }, { key: 'optional', required: false }] },
  ],
}));

vi.mock('../TabBar.jsx', () => ({ default: () => <div data-testid="tab-bar" /> }));
vi.mock('../GeneralTab.jsx', () => ({ default: () => <div data-testid="general-tab" /> }));
vi.mock('../DefaultsTab.jsx', () => ({ default: () => <div data-testid="defaults-tab" /> }));
vi.mock('../DimensionsTab.jsx', () => ({ default: () => <div data-testid="dimensions-tab" /> }));
vi.mock('../GeneralAccountsTab.jsx', () => ({ default: () => <div data-testid="general-accounts-tab" /> }));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

vi.mock('lucide-react', () => ({
  Check: (props) => <svg data-testid="icon-check" {...props} />,
}));

import GeneralLedgerConfigPage from '../GeneralLedgerConfigPage.jsx';

beforeEach(() => {
  setMetaMock.mockClear();
});

describe('GeneralLedgerConfigPage — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to "Finanzas / Esquema contable", not the stale "Tesorería / Configuración contable"', () => {
    activeUi = realUiEs;
    render(<GeneralLedgerConfigPage apiBaseUrl="/api" />);

    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finanzas / Esquema contable');
    expect(lastCall.breadcrumb).not.toContain('Tesorería');
    expect(lastCall.breadcrumb).not.toContain('Configuración contable');
    expect(lastCall.title).toBe('Esquema contable');
  });

  it('resolves the en_US breadcrumb to "Finance / General Ledger Configuration"', () => {
    activeUi = realUiEn;
    render(<GeneralLedgerConfigPage apiBaseUrl="/api" />);

    const lastCall = setMetaMock.mock.calls.at(-1)[0];
    expect(lastCall.breadcrumb).toBe('Finance / General Ledger Configuration');
  });
});
