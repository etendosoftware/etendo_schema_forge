// @covers tools/app-shell/src/windows/custom/general-ledger-configuration/GeneralAccountsTab.jsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Every toggle on, so every paired account selector is rendered (ETP-5682).
const ALL_TOGGLES_ON = {
  ...GENERAL_ACCOUNTS_SEED,
  suspenseBalancingUse: true,
  suspenseErrorUse: true,
  currencyBalancingUse: true,
};

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
        generalAccounts={ALL_TOGGLES_ON}
        accountOptions={ACCOUNT_OPTIONS}
        setGeneralAccountsField={vi.fn()}
      />,
    );

    const RAW_KEYS = [
      'glc.toggle.suspenseBalancingUse',
      'glc.toggle.suspenseErrorUse',
      'glc.acct.suspenseBalancing',
      'glc.acct.suspenseError',
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

// ETP-5682: each account selector follows its own toggle (AD display logic
// @UseSuspenseBalancing@ / @UseSuspenseError@ / @UseCurrencyBalancing@ = 'Y').
const PAIRS = [
  ['glc-toggle-suspense-balancing-use', 'glc-acct-suspenseBalancing'],
  ['glc-toggle-suspense-error-use', 'glc-acct-suspenseError'],
  ['glc-toggle-currency-balancing-use', 'glc-acct-currencyBalancingAcct'],
];

function StatefulTab({ initial }) {
  const [generalAccounts, setGeneralAccounts] = useState(initial);
  return (
    <GeneralAccountsTab
      generalAccounts={generalAccounts}
      accountOptions={ACCOUNT_OPTIONS}
      setGeneralAccountsField={(field, value) => setGeneralAccounts((g) => ({ ...g, [field]: value }))}
    />
  );
}

function toggleSwitch(testId) {
  const root = screen.getByTestId(testId);
  fireEvent.click(root.querySelector('button[role="switch"]') ?? root);
}

describe('GeneralAccountsTab — account selectors follow their toggles (ETP-5682)', () => {
  it('hides every paired account selector while its toggle is off', () => {
    renderWithLocale('es_ES', <StatefulTab initial={GENERAL_ACCOUNTS_SEED} />);
    for (const [, accountId] of PAIRS) {
      expect(screen.queryByTestId(accountId)).toBeNull();
    }
  });

  it('shows every paired account selector while its toggle is on', () => {
    renderWithLocale('es_ES', <StatefulTab initial={ALL_TOGGLES_ON} />);
    for (const [, accountId] of PAIRS) {
      expect(screen.getByTestId(accountId)).toBeInTheDocument();
    }
  });

  it.each(PAIRS)('toggling %s shows and hides only %s, without saving', (toggleId, accountId) => {
    const setField = vi.fn();
    function Spy() {
      const [ga, setGa] = useState(GENERAL_ACCOUNTS_SEED);
      return (
        <GeneralAccountsTab
          generalAccounts={ga}
          accountOptions={ACCOUNT_OPTIONS}
          setGeneralAccountsField={(field, value) => {
            setField(field, value);
            setGa((g) => ({ ...g, [field]: value }));
          }}
        />
      );
    }
    renderWithLocale('es_ES', <Spy />);

    toggleSwitch(toggleId);
    expect(screen.getByTestId(accountId)).toBeInTheDocument();
    for (const [otherToggle, otherAccount] of PAIRS) {
      if (otherToggle !== toggleId) expect(screen.queryByTestId(otherAccount)).toBeNull();
    }

    toggleSwitch(toggleId);
    expect(screen.queryByTestId(accountId)).toBeNull();
    // Only the toggle field changes: hiding a selector never clears its stored account.
    expect(setField.mock.calls.every(([field]) => field.endsWith('Use'))).toBe(true);
  });

  it('keeps the stored account when its toggle is turned off and on again', () => {
    const accountId = ACCOUNT_OPTIONS[0].id;
    renderWithLocale(
      'es_ES',
      <StatefulTab initial={{ ...ALL_TOGGLES_ON, suspenseError: accountId }} />,
    );
    const before = screen.getByTestId('glc-acct-suspenseError').textContent;

    toggleSwitch('glc-toggle-suspense-error-use');
    expect(screen.queryByTestId('glc-acct-suspenseError')).toBeNull();
    toggleSwitch('glc-toggle-suspense-error-use');

    expect(screen.getByTestId('glc-acct-suspenseError').textContent).toBe(before);
  });
});

describe('GeneralLedgerConfigPage — tab label resolution (ETP-4452 follow-up)', () => {
  it('renders the "General accounts" tab label translated, not as glc.tab.generalAccounts', () => {
    renderWithLocale('es_ES', <GeneralLedgerConfigPage apiBaseUrl="/mock" />);

    expect(screen.queryByText('glc.tab.generalAccounts')).toBeNull();
    expect(screen.getByText(esES.genericLabels['glc.tab.generalAccounts'])).toBeInTheDocument();
  });
});
