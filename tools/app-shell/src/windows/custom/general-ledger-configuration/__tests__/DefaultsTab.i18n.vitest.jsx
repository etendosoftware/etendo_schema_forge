import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This test intentionally does NOT mock '@/i18n' — it renders with the real
// LocaleProvider and the real locale JSON files. A mocked useUI (identity
// passthrough, e.g. `useUI: () => (k) => k`) would have silently hidden the
// ETP-4452 follow-up bug: when DEFAULTS_GROUPS was split into separate
// product/project/warehouse/bank groups, the `glc.group.*.title/subtitle`
// keys for those groups (and the new bank-group `glc.acct.*` field keys)
// were never added to the locale files, so those labels rendered as the
// raw i18n key.
import { LocaleProvider } from '@/i18n';

import DefaultsTab from '../DefaultsTab.jsx';
import { DEFAULTS_SEED, ACCOUNT_OPTIONS, DEFAULTS_GROUPS } from '../mockCatalogs.js';

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

function renderDefaultsTab(locale) {
  return renderWithLocale(
    locale,
    <DefaultsTab
      defaults={DEFAULTS_SEED}
      accountOptions={ACCOUNT_OPTIONS}
      setDefaultField={vi.fn()}
    />,
  );
}

describe('DefaultsTab — real locale resolution (ETP-4452 follow-up)', () => {
  it('renders every group title/subtitle as translated Spanish text, not a raw key', () => {
    renderDefaultsTab('es_ES');

    for (const group of DEFAULTS_GROUPS) {
      const titleKey = `glc.group.${group.section}.title`;
      const subtitleKey = `glc.group.${group.section}.subtitle`;
      const container = screen.getByTestId(`glc-defaults-group-${group.section}`);
      expect(within(container).queryByText(titleKey)).toBeNull();
      expect(within(container).getAllByText(esES.genericLabels[titleKey]).length).toBeGreaterThan(0);
      expect(within(container).queryByText(subtitleKey)).toBeNull();
      expect(within(container).getAllByText(esES.genericLabels[subtitleKey]).length).toBeGreaterThan(0);
    }
  });

  it('renders every account field label as translated Spanish text, not a raw key', () => {
    renderDefaultsTab('es_ES');

    for (const group of DEFAULTS_GROUPS) {
      for (const field of group.fields) {
        const key = `glc.acct.${field.key}`;
        // Scope to this field's own container: some mock accounts happen to
        // share their display name with their own field's translated label
        // (e.g. customerPrepayment's assigned account is named "Anticipos de
        // clientes", same as the label), so the label text can legitimately
        // appear more than once inside a single field's badge selector.
        const container = screen.getByTestId(`glc-acct-${field.key}`);
        expect(within(container).queryByText(key)).toBeNull();
        expect(within(container).getAllByText(esES.genericLabels[key]).length).toBeGreaterThan(0);
      }
    }
  });

  it('resolves the same keys in en_US to their English translation', () => {
    renderDefaultsTab('en_US');

    const bankGroup = screen.getByTestId('glc-defaults-group-bank');
    expect(within(bankGroup).queryByText('glc.group.bank.title')).toBeNull();
    expect(within(bankGroup).getAllByText(enUS.genericLabels['glc.group.bank.title']).length).toBeGreaterThan(0);

    const bankRevaluationField = screen.getByTestId('glc-acct-bankRevaluationGain');
    expect(within(bankRevaluationField).queryByText('glc.acct.bankRevaluationGain')).toBeNull();
    expect(
      within(bankRevaluationField).getAllByText(enUS.genericLabels['glc.acct.bankRevaluationGain']).length,
    ).toBeGreaterThan(0);
  });
});

describe('DefaultsTab — inactive AD fields are never rendered (ETP-4452 follow-up)', () => {
  // These 10 fields have AD_Field.IsActive = 'N' on window 125 / tab 252
  // (C_AcctSchema_Default) — confirmed via direct DB query. Classic never
  // renders them either, which is what made the GO/Classic field-count
  // mismatch confusing in the first place. The backend still maps their DB
  // columns (DEFAULT_FIELD_MAPPINGS), so this is a display-only omission.
  const INACTIVE_IN_AD_KEYS = [
    'bankInterestRevenue',
    'bankInterestExpense',
    'bankUnidentifiedReceipts',
    'unallocatedCash',
    'bankSettlementGain',
    'bankSettlementLoss',
    'cashBookExpense',
    'cashBookReceipt',
    'projectAsset',
    'taxExpense',
  ];

  it('never renders a field for any key with AD_Field.IsActive = N', () => {
    renderDefaultsTab('es_ES');

    const renderedKeys = new Set(DEFAULTS_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
    for (const key of INACTIVE_IN_AD_KEYS) {
      expect(renderedKeys.has(key), `${key} should not be in DEFAULTS_GROUPS`).toBe(false);
      expect(screen.queryByTestId(`glc-acct-${key}`)).toBeNull();
    }
  });
});

describe('DefaultsTab — NoFieldGroupHint placement (ETP-4452 follow-up)', () => {
  it('renders the hint on exactly the fields flagged noFieldGroupInAD, and no others', () => {
    renderDefaultsTab('es_ES');

    for (const group of DEFAULTS_GROUPS) {
      for (const field of group.fields) {
        const container = screen.getByTestId(`glc-acct-${field.key}`);
        const hint = within(container).queryByTestId('glc-no-fieldgroup-hint');
        if (field.noFieldGroupInAD) {
          expect(hint, `expected ${field.key} to render NoFieldGroupHint`).not.toBeNull();
        } else {
          expect(hint, `expected ${field.key} NOT to render NoFieldGroupHint`).toBeNull();
        }
      }
    }
  });
});
