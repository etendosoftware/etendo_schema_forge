import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This test intentionally does NOT mock '@/i18n' — it renders with the real
// LocaleProvider and the real locale JSON files. A mocked useUI (identity
// passthrough, e.g. `useUI: () => (k) => k`) would have silently hidden the
// ETP-4452 follow-up bug: `glc.tab.generalAccounts`, `glc.section.suspense.*`,
// `glc.toggle.*` and `glc.acct.*` keys used by GeneralAccountsTab were never
// added to the locale files, so every label rendered as the raw i18n key.
import { LocaleProvider } from '@/i18n';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' } }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => vi.fn()),
}));

import GeneralAccountsTab from '../GeneralAccountsTab.jsx';
import GeneralLedgerConfigPage from '../GeneralLedgerConfigPage.jsx';
import { GENERAL_ACCOUNTS_SEED, ACCOUNT_OPTIONS } from '../mockCatalogs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', '..', '..', '..', 'locales');
const esES = JSON.parse(readFileSync(join(localesDir, 'es_ES.json'), 'utf8'));
const enUS = JSON.parse(readFileSync(join(localesDir, 'en_US.json'), 'utf8'));

const DICTIONARIES = { es_ES: esES, en_US: enUS };

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

function renderWithLocale(locale, ui) {
  return render(
    <LocaleProvider locale={locale} dictionaries={DICTIONARIES}>
      {ui}
    </LocaleProvider>,
  );
}

describe('GeneralAccountsTab — real locale resolution (ETP-4452 follow-up)', () => {
  it('renders section titles/subtitles as translated Spanish text, not raw keys', () => {
    renderWithLocale(
      'es_ES',
      <GeneralAccountsTab
        generalAccounts={GENERAL_ACCOUNTS_SEED}
        accountOptions={ACCOUNT_OPTIONS}
        setGeneralAccountsField={vi.fn()}
      />,
    );

    expect(screen.queryByText('glc.section.suspense.title')).toBeNull();
    expect(screen.getByText(esES.genericLabels['glc.section.suspense.title'])).toBeInTheDocument();

    expect(screen.queryByText('glc.section.currencyBalancing.title')).toBeNull();
    expect(screen.getByText(esES.genericLabels['glc.section.currencyBalancing.title'])).toBeInTheDocument();

    expect(screen.queryByText('glc.section.closing.title')).toBeNull();
    expect(screen.getByText(esES.genericLabels['glc.section.closing.title'])).toBeInTheDocument();
  });

  it('renders toggle and account labels as translated Spanish text, not raw keys', () => {
    renderWithLocale(
      'es_ES',
      <GeneralAccountsTab
        generalAccounts={GENERAL_ACCOUNTS_SEED}
        accountOptions={ACCOUNT_OPTIONS}
        setGeneralAccountsField={vi.fn()}
      />,
    );

    const RAW_KEYS = [
      'glc.toggle.suspenseBalancingUse',
      'glc.toggle.suspenseErrorUse',
      'glc.acct.suspenseBalancing',
      'glc.toggle.currencyBalancingUse',
      'glc.acct.currencyBalancingAccount',
      'glc.acct.retainedEarning',
      'glc.acct.incomeSummary',
      'glc.acct.cfsOrderAccount',
      'glc.toggle.reversePermanentBalances',
    ];
    for (const key of RAW_KEYS) {
      expect(screen.queryByText(key)).toBeNull();
      expect(screen.getByText(esES.genericLabels[key])).toBeInTheDocument();
    }
  });

  it('resolves the same keys in en_US to their English translation', () => {
    renderWithLocale(
      'en_US',
      <GeneralAccountsTab
        generalAccounts={GENERAL_ACCOUNTS_SEED}
        accountOptions={ACCOUNT_OPTIONS}
        setGeneralAccountsField={vi.fn()}
      />,
    );

    expect(screen.queryByText('glc.section.suspense.title')).toBeNull();
    expect(screen.getByText(enUS.genericLabels['glc.section.suspense.title'])).toBeInTheDocument();
  });
});

describe('GeneralLedgerConfigPage — tab label resolution (ETP-4452 follow-up)', () => {
  it('renders the "General accounts" tab label translated, not as glc.tab.generalAccounts', () => {
    renderWithLocale('es_ES', <GeneralLedgerConfigPage apiBaseUrl="/mock" />);

    expect(screen.queryByText('glc.tab.generalAccounts')).toBeNull();
    expect(screen.getByText(esES.genericLabels['glc.tab.generalAccounts'])).toBeInTheDocument();
  });
});
