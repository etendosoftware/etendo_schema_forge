import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This test intentionally does NOT mock '@/i18n' — it renders with the real
// LocaleProvider and the real locale JSON files. A mocked useUI (identity
// passthrough) would silently hide missing translations — see
// docs/superpowers/specs/2026-07-07-glc-defaults-ad-driven-grouping-design.md.
import { LocaleProvider } from '@/i18n';

import DefaultsTab from '../DefaultsTab.jsx';
import { DEFAULTS_SEED, ACCOUNT_OPTIONS, DEFAULTS_GROUPS } from '../mockCatalogs.js';
import contract from '@generated/general-ledger-configuration/contract.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', '..', '..', '..', 'locales');
const esES = JSON.parse(readFileSync(join(localesDir, 'es_ES.json'), 'utf8'));
const enUS = JSON.parse(readFileSync(join(localesDir, 'en_US.json'), 'utf8'));

const DICTIONARIES = { es_ES: esES, en_US: enUS };
const contractFields = contract.frontendContract.entities['Valores por defecto'].fields;

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

describe('DefaultsTab — non-editable AD fields are never rendered (ETP-4452 follow-up)', () => {
  it('never renders a field whose contract.json visibility is not "editable"', () => {
    renderDefaultsTab('es_ES');

    const nonEditable = contractFields.filter((f) => f.visibility !== 'editable');
    // sanity: resolve-curated.js/generate-contract.js already strips discarded/system fields out of
    // this entity's fields array entirely, so contract.json never carries a non-editable entry here —
    // this loop is a no-op defensive check, not the primary regression test for exclusion (that's
    // covered by buildDefaultsGroups' own unit tests in mockCatalogs.buildDefaultsGroups.vitest.js
    // using synthetic fixtures).
    expect(nonEditable.length).toBe(0);
    for (const field of nonEditable) {
      expect(screen.queryByTestId(`glc-acct-${field.apiKey}`)).toBeNull();
    }
  });

  it('renders every field whose contract.json visibility is "editable"', () => {
    renderDefaultsTab('es_ES');

    const editable = contractFields.filter((f) => f.visibility === 'editable');
    for (const field of editable) {
      expect(screen.getByTestId(`glc-acct-${field.apiKey}`)).toBeInTheDocument();
    }
  });
});

describe('DefaultsTab — fields with no AD Field Group land in "Otras cuentas" (ETP-4452 follow-up)', () => {
  it('renders disposalGain and disposalLoss under the "other" group, not "assets"', () => {
    renderDefaultsTab('es_ES');

    const otherGroup = screen.getByTestId('glc-defaults-group-other');
    expect(within(otherGroup).getByTestId('glc-acct-disposalGain')).toBeInTheDocument();
    expect(within(otherGroup).getByTestId('glc-acct-disposalLoss')).toBeInTheDocument();

    const assetsGroup = screen.getByTestId('glc-defaults-group-assets');
    expect(within(assetsGroup).queryByTestId('glc-acct-disposalGain')).toBeNull();
    expect(within(assetsGroup).queryByTestId('glc-acct-disposalLoss')).toBeNull();
  });
});
