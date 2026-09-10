import { render, screen, fireEvent } from '@testing-library/react';
import { resolveLabel } from '@etendosoftware/app-shell-core/i18n';

/**
 * ETP-5106 — the "Ordenar por" menu must resolve labels through the host window's
 * `labelOverrides`, exactly like the column header does.
 *
 * `ListSortPopover.vitest.jsx` stubs `useLabel` as `() => () => null` to exercise the
 * `col.labels` / `col.label` fallback branches, which makes it structurally unable to cover this:
 * a translator that ignores its argument cannot show whether the argument arrives. So this suite
 * keeps its own mock, wired to the REAL `resolveLabel` and to a mutable dictionary + locale, and
 * asserts the whole chain end to end.
 *
 * The bug it pins: the popover called `useLabel()` with no arguments, so every renamed column
 * listed its raw AD label here while the grid header showed the override — "Total Pendiente" in
 * the menu beside a "Saldo pendiente" column.
 */

const i18nState = { locale: 'es_ES', dictionary: { fields: {} } };

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: i18nState.locale }),
  // Mirrors the real hook: it narrows the override map by locale, then delegates to resolveLabel.
  useLabel: (labelOverrides) => (columnName) =>
    resolveLabel(i18nState.dictionary, columnName, labelOverrides?.[i18nState.locale] ?? null),
}));

const { ListSortPopover } = await import('../ListSortPopover.jsx');

const OUTSTANDING_KEY = 'outstandingAmount';
const AD_LABEL_ES = 'Total Pendiente';
const AD_LABEL_EN = 'Total Outstanding';
const OVERRIDE_ES = 'Saldo pendiente';
const OVERRIDE_EN = 'Outstanding Amount';

// Shaped like the real invoice header tables: an AD column with no pinned `col.labels`, so the
// dictionary/override branch of resolveColumnLabel is the one under test.
const COLUMNS = [
  { key: OUTSTANDING_KEY, column: 'OutstandingAmt', label: 'pendingPaymentColumn' },
];

const LABEL_OVERRIDES = {
  es_ES: { OutstandingAmt: OVERRIDE_ES },
  en_US: { OutstandingAmt: OVERRIDE_EN },
};

function renderPopover(over = {}) {
  return render(
    <ListSortPopover
      columns={COLUMNS}
      sortColumn={null}
      sortDirection="asc"
      onSelect={vi.fn()}
      onClear={vi.fn()}
      isDefaultSort
      {...over}
    />,
  );
}

function openAndReadOption() {
  fireEvent.click(screen.getByTestId('list-sort-toggle'));
  return screen.getByTestId(`list-sort-option-${OUTSTANDING_KEY}`);
}

beforeEach(() => {
  i18nState.locale = 'es_ES';
  i18nState.dictionary = {
    fields: { OutstandingAmt: { label: AD_LABEL_ES } },
  };
});

describe('ETP-5106 — ListSortPopover honours labelOverrides', () => {
  it('shows the override instead of the AD label for the active locale', () => {
    renderPopover({ labelOverrides: LABEL_OVERRIDES });

    const option = openAndReadOption();
    expect(option).toHaveTextContent(OVERRIDE_ES);
    expect(option).not.toHaveTextContent(AD_LABEL_ES);
  });

  it('follows the active locale when it changes', () => {
    i18nState.locale = 'en_US';
    i18nState.dictionary = { fields: { OutstandingAmt: { label: AD_LABEL_EN } } };
    renderPopover({ labelOverrides: LABEL_OVERRIDES });

    expect(openAndReadOption()).toHaveTextContent(OVERRIDE_EN);
  });

  it('falls back to the AD label for a locale the overrides do not cover', () => {
    i18nState.locale = 'pt_BR';
    renderPopover({ labelOverrides: LABEL_OVERRIDES });

    expect(openAndReadOption()).toHaveTextContent(AD_LABEL_ES);
  });

  // The five hosts that pass no overrides (financial-account's four toolbars, ListModalWindow)
  // must resolve exactly as they did before the prop existed.
  it('resolves from the dictionary alone when no overrides are passed', () => {
    renderPopover();

    expect(openAndReadOption()).toHaveTextContent(AD_LABEL_ES);
  });

  it('still falls through to col.label when neither overrides nor dictionary answer', () => {
    i18nState.dictionary = { fields: {} };
    renderPopover();

    expect(openAndReadOption()).toHaveTextContent('pendingPaymentColumn');
  });
});
