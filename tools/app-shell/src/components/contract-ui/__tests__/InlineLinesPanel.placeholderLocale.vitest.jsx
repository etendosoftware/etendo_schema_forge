/**
 * InlineLinesPanel — inline selector/search cell placeholder must translate
 * by locale, mirroring the column HEADER's own label resolution (ETP-5023).
 *
 * Bug: `renderInlineSearchCell` (InlineLinesPanel.jsx) passed the raw,
 * always-English `col.label` straight through to InlineSearchCombo's
 * `placeholder` prop, instead of resolving it through
 * `resolveColumnLabel(col, locale, t)` like the header cell two lines below
 * already does. So a Spanish-locale user editing an empty Tax cell (before
 * any value is committed) saw the placeholder "Tax" instead of "Impuesto",
 * even though the header column and every other translated string on the
 * same screen were correctly in Spanish.
 *
 * This suite intentionally leaves `resolveColumnLabel.js` UNMOCKED (it is a
 * trivial pure function) and `InlineSearchCombo.jsx` UNMOCKED (its `<input
 * placeholder>` is the actual DOM node under test) so the assertions exercise
 * the real resolution path end to end, not a test double that could mask a
 * regression. `useLabel`/`useLocaleSwitch` are mocked with a tiny per-locale
 * dictionary — parity with the small inline translation maps used by sibling
 * suites in this directory (e.g. InlineLinesPanel.vitest.jsx).
 */
import { render, screen, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import React, { createRef } from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mutable so each `it` can select a different locale before rendering —
// the mock factory itself only runs once, but the functions it returns
// re-read this variable on every call.
let currentLocale = 'en_US';

// Mirrors the real per-field dictionary entries (en_US.json / es_ES.json):
// dictionary.fields["C_Tax_ID"].label = "Tax" (en) / "Impuesto" (es).
const FIELD_LABEL_BY_LOCALE = {
  en_US: { C_Tax_ID: 'Tax' },
  es_ES: { C_Tax_ID: 'Impuesto' },
};

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => FIELD_LABEL_BY_LOCALE[currentLocale]?.[key] ?? key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: currentLocale, setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => {
    const idKey = `${key}$_identifier`;
    return row[idKey] || row[key] || '';
  },
}));

// resolveColumnLabel.js is intentionally NOT mocked here — it is the real
// production resolution logic (col.labels[locale] -> col.labels.en_US ->
// translate(col.column) -> col.label -> col.key) and is what this suite
// verifies both the header and the placeholder now go through identically.

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

// InlineSearchCombo.jsx is intentionally left UNMOCKED — its <input
// placeholder> attribute is the DOM node this suite asserts against.
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('./quickActionsStyle.js', () => ({
  QUICK_ACTIONS_PILL_CLASS: 'pill',
}));

// No `labels` per-locale override on the column — matches the real generated
// contract (artifacts/sales-order/generated/web/sales-order/HeaderPage.jsx,
// artifacts/sales-invoice equivalent): `label: 'Tax'` is the raw AD/English
// fallback, translation must come from the i18n dictionary via `t(col.column)`.
const COLUMNS = [
  { key: 'tax', label: 'Tax', type: 'selector', column: 'C_Tax_ID' },
];

// Row starts with NO committed tax value, so InlineSearchCombo renders its
// <input> directly (showChip=false) instead of the committed-value chip —
// the placeholder text is only visible in that uncommitted state.
const ROWS = [
  { id: 'L1', tax: '', 'tax$_identifier': '' },
];

function renderPanel(props = {}) {
  const ref = createRef();
  const result = render(
    <InlineLinesPanel
      ref={ref}
      columns={COLUMNS}
      data={ROWS}
      entity="lines"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...props}
    />,
  );
  return { ...result, ref };
}

async function enterEditMode(row) {
  await act(async () => {
    await userEvent.hover(row);
  });
  const actions = within(row).getByTestId('line-actions');
  const editBtn = within(actions).getAllByRole('button')[0];
  await act(async () => {
    await userEvent.click(editBtn);
  });
}

describe('InlineLinesPanel — inline selector cell placeholder translates by locale (ETP-5023)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the English label as placeholder under en_US locale', async () => {
    currentLocale = 'en_US';
    renderPanel();

    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = await waitFor(() => within(row).getByTestId('inline-add-field-tax'));
    expect(input).toHaveAttribute('placeholder', 'Tax');

    // Same resolution the column HEADER uses — the fix's whole point is that
    // both now agree, instead of the header being translated and the
    // placeholder staying hardcoded English.
    const header = screen.getByTestId('column-header-tax');
    expect(header).toHaveTextContent('Tax');
  });

  it('shows the Spanish label as placeholder under es_ES locale', async () => {
    currentLocale = 'es_ES';
    renderPanel();

    const row = screen.getByTestId('line-row-L1');
    await enterEditMode(row);

    const input = await waitFor(() => within(row).getByTestId('inline-add-field-tax'));
    expect(input).toHaveAttribute('placeholder', 'Impuesto');

    const header = screen.getByTestId('column-header-tax');
    expect(header).toHaveTextContent('Impuesto');
  });
});
