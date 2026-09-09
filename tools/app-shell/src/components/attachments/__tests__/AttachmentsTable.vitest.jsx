// ETP-5030 — selected-row shading for the attachments table.
//
// GROUP A (Tailwind utility on the row element). AttachmentsTable owns its
// selection state internally, so these tests drive the real tick → re-render
// loop through the row checkbox.
//
// The row is a `TableRow`, whose own base class is `hover:bg-muted/50` and which
// merges through `cn` (tailwind-merge). That merge is load-bearing: without the
// `hover:bg-primary/5` half of the fix the base hover survives and repaints over
// the tint at exactly the moment the pointer is on the row — i.e. while the user
// is clicking the checkbox. That is the reported bug, so the hover assertion
// here is the one that actually locks it.
//
// There was no test file for this component before; it follows the conventions
// of its sibling `AttachmentsTab.vitest.jsx` (identity `useUI` mock, real UI
// primitives, testid-scoped queries).
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// i18n translator returns the key itself, so no hardcoded English leaks in.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import AttachmentsTable from '../AttachmentsTable.jsx';
// Shared row-shading assertion helpers — see @/test/rowShading.js for why
// "exactly one background utility" is the assertion that matters here.
import {
  backgroundUtilities,
  hoverBackgroundUtilities,
  countBackgroundUtilities,
} from '@/test/rowShading.js';

const ITEMS = [
  { id: 'a1', name: 'contract.pdf', size: 1024, createdAt: '2026-05-10T00:00:00Z' },
  { id: 'a2', name: 'invoice.pdf', size: 2048, createdAt: '2026-05-11T00:00:00Z' },
];

function renderTable(props = {}) {
  return render(
    <AttachmentsTable
      items={ITEMS}
      loading={false}
      uploadingFiles={new Map()}
      formatBytes={(n) => `${n} B`}
      {...props}
    />,
  );
}

const rowOf = (id) => screen.getByTestId(`attachment-row-${id}`);
const rowCheckbox = (id) => within(rowOf(id)).getByRole('checkbox');

describe('AttachmentsTable — ETP-5030 selected-row shading', () => {
  it('renders one row per attachment', () => {
    renderTable();
    expect(rowOf('a1')).toBeInTheDocument();
    expect(rowOf('a2')).toBeInTheDocument();
  });

  it('tints ONLY the ticked row and leaves the others on the default background', () => {
    renderTable();

    fireEvent.click(rowCheckbox('a1'));

    expect(backgroundUtilities(rowOf('a1'))).toEqual(['bg-primary/5']);
    // Negative half: the untouched row must not have picked up the tint, and it
    // must still carry TableRow's own hover background — so this cannot pass
    // just because the class list came back empty.
    expect(backgroundUtilities(rowOf('a2'))).toEqual([]);
    expect(hoverBackgroundUtilities(rowOf('a2'))).toEqual(['hover:bg-muted/50']);
  });

  it('removes the tint when the row is unticked', () => {
    renderTable();

    fireEvent.click(rowCheckbox('a1'));
    expect(backgroundUtilities(rowOf('a1'))).toEqual(['bg-primary/5']);

    fireEvent.click(rowCheckbox('a1'));
    expect(backgroundUtilities(rowOf('a1'))).toEqual([]);
    expect(hoverBackgroundUtilities(rowOf('a1'))).toEqual(['hover:bg-muted/50']);
  });

  it('keeps the tint under the pointer: the selected row carries hover:bg-primary/5 and TableRow\'s hover:bg-muted/50 is merged away', () => {
    renderTable();

    fireEvent.click(rowCheckbox('a1'));

    const row = rowOf('a1');
    // Exactly one hover background, and it is the tint. `hover:bg-muted/50`
    // surviving here would reproduce the reported bug verbatim: the row would
    // look unchanged for as long as the pointer stayed on it.
    expect(hoverBackgroundUtilities(row)).toEqual(['hover:bg-primary/5']);
    expect(row.className).not.toContain('hover:bg-muted/50');
    // And exactly one resting background — no second utility to race with.
    expect(countBackgroundUtilities(row)).toBe(1);
  });

  it('select-all tints every row, and clearing it untints every row', () => {
    const { container } = renderTable();
    const headerCheckbox = within(container.querySelector('thead')).getByRole('checkbox');

    fireEvent.click(headerCheckbox);
    expect(backgroundUtilities(rowOf('a1'))).toEqual(['bg-primary/5']);
    expect(backgroundUtilities(rowOf('a2'))).toEqual(['bg-primary/5']);

    fireEvent.click(headerCheckbox);
    expect(backgroundUtilities(rowOf('a1'))).toEqual([]);
    expect(backgroundUtilities(rowOf('a2'))).toEqual([]);
  });
});
