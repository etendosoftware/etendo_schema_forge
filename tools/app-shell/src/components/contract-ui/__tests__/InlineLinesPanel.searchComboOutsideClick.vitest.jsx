/**
 * InlineLinesPanel — outside-pointerdown row-exit handling for a REAL
 * InlineSearchCombo cell (ETP-4600 ARIA follow-up).
 *
 * InlineLinesPanel.vitest.jsx (and every sibling suite in this directory)
 * stubs `InlineSearchCombo.jsx` with a plain `<span>`, so it can never exercise
 * the panel's own outside-click handler against InlineSearchCombo's real
 * portaled dropdown. This file intentionally does NOT mock it.
 *
 * Context: the row's outside-pointerdown handler (InlineLinesPanel.jsx, the
 * `portalSelectors` ignore-list ~line 762) already ignored `[role="listbox"]`
 * targets — but InlineSearchCombo's dropdown panel did not carry that role
 * before ETP-4600 added full ARIA wiring. So selecting an option from this
 * combo inside an editing row used to be misclassified as "clicked outside
 * the row" and closed edit mode right after the pick. Now that the panel has
 * `role="listbox"`, selecting an option must leave the row in edit mode.
 */
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import React, { createRef } from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => {
    const idKey = `${key}$_identifier`;
    return row[idKey] || row[key] || '';
  },
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
}));

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

// NOTE: InlineSearchCombo.jsx is intentionally left UNMOCKED here — this
// suite exists specifically to exercise its real portaled dropdown.
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

const COLUMNS = [
  { key: 'tax', label: 'Tax', type: 'selector', column: 'C_Tax_ID' },
];

const ROWS = [
  { id: 'L1', tax: 'iva10', 'tax$_identifier': 'IVA 10%' },
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

describe('InlineLinesPanel — outside-click handling for a real InlineSearchCombo cell (ETP-4600)', () => {
  beforeEach(() => {
    // renderInlineSearchCell always passes options=[] and relies on the server-side
    // search (selectorUrl + token) for real data — mock the fetch it debounces on focus.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'iva10', label: 'IVA 10%' },
          { id: 'iva21', label: 'IVA 21%' },
        ],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays in edit mode after selecting an option from the InlineSearchCombo dropdown', async () => {
    const onUpdateRow = vi.fn().mockResolvedValue();
    renderPanel({ onUpdateRow });

    const row = screen.getByTestId('line-row-L1');
    await act(async () => {
      await userEvent.hover(row);
    });
    const actions = within(row).getByTestId('line-actions');
    const editBtn = within(actions).getAllByRole('button')[0];
    await act(async () => {
      await userEvent.click(editBtn);
    });

    // The 'tax' column renders InlineSearchCombo in edit mode — with a committed
    // value it starts as a chip; click it to enter the actual search UI.
    const chip = within(row).getByTestId('inline-add-field-tax-chip');
    await act(async () => {
      fireEvent.click(chip);
    });
    const comboInput = await waitFor(() => within(row).getByTestId('inline-add-field-tax'));

    // Open the dropdown — this kicks off the debounced (300ms) server search.
    await act(async () => {
      fireEvent.focus(comboInput);
    });

    // Wait past the debounce for the mocked fetch to resolve and the options to render.
    const panel = await waitFor(
      () => screen.getByTestId('inline-add-options-tax'),
      { timeout: 2000 },
    );
    // The dropdown is portaled to document.body, outside the row DOM node —
    // this is exactly the outside-pointerdown scenario under test.
    expect(panel).toHaveAttribute('role', 'listbox');
    expect(row.contains(panel)).toBe(false);
    // Pick the OTHER option (iva21, not the already-committed iva10) so
    // commitField's unchanged-value skip doesn't mask a broken onUpdateRow call.
    const option = await waitFor(() => screen.getByTestId('inline-add-option-tax-iva21'));

    // Select an option. Mirrors a real click: pointerdown fires first (what
    // InlineLinesPanel's outside-click handler listens for, in the capture phase),
    // then mousedown (InlineSearchCombo's own onMouseDown-based select handler).
    await act(async () => {
      fireEvent.pointerDown(option);
      fireEvent.mouseDown(option);
      // Flush the deferred setTimeout(0) the outside-pointerdown handler uses to
      // close edit mode, if it (incorrectly) decided this was an outside click.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onUpdateRow).toHaveBeenCalledWith(
      ROWS[0],
      'tax',
      'iva21',
      expect.objectContaining({ column: 'C_Tax_ID', identifier: 'IVA 21%' }),
    );

    // Row must STILL be in edit mode. InlineSearchCombo itself closes back to its
    // own chip right after a selection (independent of the row's editingRowId), and
    // this minimal harness never mutates `data`, so the chip label reverts to the
    // stale prop value — that's expected here, not a signal of anything. The
    // meaningful signal is that the cell is still rendered by EditCell (which only
    // mounts InlineSearchCombo, and therefore this `-chip` testid, while `isEditing`
    // is true) — NOT by ReadCell, which never produces an `inline-add-field-*-chip`
    // testid at all. If the outside-click handler had (incorrectly) exited edit mode,
    // this chip testid would disappear entirely, replaced by ReadCell's plain span.
    const rowAfter = screen.getByTestId('line-row-L1');
    expect(within(rowAfter).getByTestId('inline-add-field-tax-chip')).toBeInTheDocument();

    // Re-entering edit UI on that chip must still work — proves the cell is a live
    // EditCell/InlineSearchCombo instance, not a frozen leftover from before the
    // (incorrectly triggered) row-exit would have unmounted it.
    await act(async () => {
      fireEvent.click(within(rowAfter).getByTestId('inline-add-field-tax-chip'));
    });
    expect(await waitFor(() => within(rowAfter).getByTestId('inline-add-field-tax'))).toBeInTheDocument();
  });
});
