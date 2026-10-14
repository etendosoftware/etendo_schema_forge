// @covers tools/app-shell/src/components/attachments/AttachmentsTable.jsx
//
// ETP-5030 — selected-row shading for the attachments table.
//
// GROUP A (Tailwind utility on the row element). Since ETP-5526 the selection is
// CONTROLLED by the caller, so these tests drive the real tick → re-render loop
// through `SelectableTable` below — a minimal stand-in for AttachmentsTab that
// owns the Set exactly as the real caller does.
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
import { useState } from 'react';
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

/**
 * Stand-in for the one caller that opts into selection (AttachmentsTab): owns the
 * `Set`, passes it down, applies the toggles. Selection is controlled since
 * ETP-5526, so the component under test cannot re-render itself.
 */
function SelectableTable(props = {}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  return (
    <AttachmentsTable
      items={ITEMS}
      loading={false}
      uploadingFiles={new Map()}
      formatBytes={(n) => `${n} B`}
      selectedIds={selectedIds}
      onToggleRow={(id) => setSelectedIds((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      })}
      onToggleAll={(ids) => setSelectedIds(new Set(ids))}
      {...props}
    />
  );
}

const renderSelectable = (props = {}) => render(<SelectableTable {...props} />);

const rowOf = (id) => screen.getByTestId(`attachment-row-${id}`);
const rowCheckbox = (id) => within(rowOf(id)).getByRole('checkbox');

describe('AttachmentsTable — ETP-5030 selected-row shading', () => {
  it('renders one row per attachment', () => {
    renderSelectable();
    expect(rowOf('a1')).toBeInTheDocument();
    expect(rowOf('a2')).toBeInTheDocument();
  });

  it('tints ONLY the ticked row and leaves the others on the default background', () => {
    renderSelectable();

    fireEvent.click(rowCheckbox('a1'));

    expect(backgroundUtilities(rowOf('a1'))).toEqual(['bg-primary/5']);
    // Negative half: the untouched row must not have picked up the tint, and it
    // must still carry TableRow's own hover background — so this cannot pass
    // just because the class list came back empty.
    expect(backgroundUtilities(rowOf('a2'))).toEqual([]);
    expect(hoverBackgroundUtilities(rowOf('a2'))).toEqual(['hover:bg-muted/50']);
  });

  it('removes the tint when the row is unticked', () => {
    renderSelectable();

    fireEvent.click(rowCheckbox('a1'));
    expect(backgroundUtilities(rowOf('a1'))).toEqual(['bg-primary/5']);

    fireEvent.click(rowCheckbox('a1'));
    expect(backgroundUtilities(rowOf('a1'))).toEqual([]);
    expect(hoverBackgroundUtilities(rowOf('a1'))).toEqual(['hover:bg-muted/50']);
  });

  it('keeps the tint under the pointer: the selected row carries hover:bg-primary/5 and TableRow\'s hover:bg-muted/50 is merged away', () => {
    renderSelectable();

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
    const { container } = renderSelectable();
    const headerCheckbox = within(container.querySelector('thead')).getByRole('checkbox');

    fireEvent.click(headerCheckbox);
    expect(backgroundUtilities(rowOf('a1'))).toEqual(['bg-primary/5']);
    expect(backgroundUtilities(rowOf('a2'))).toEqual(['bg-primary/5']);

    fireEvent.click(headerCheckbox);
    expect(backgroundUtilities(rowOf('a1'))).toEqual([]);
    expect(backgroundUtilities(rowOf('a2'))).toEqual([]);
  });
});

// ETP-5526 — selection is an opt-in capability of this shared table, and the
// header-wide bulk controls are gone from it. Both halves matter: the checkbox
// column used to render for EVERY caller, which is why SifAttachmentsSection
// (no selection, read-only) showed checkboxes that could not drive anything.
describe('AttachmentsTable — ETP-5526 selection is opt-in', () => {
  it('renders no checkbox at all for a caller that does not pass selectedIds', () => {
    const { container } = renderTable();

    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(screen.queryByTestId('attachments-select-all')).not.toBeInTheDocument();
    // Six columns, not seven — the checkbox column is absent, not merely hidden.
    expect(rowOf('a1').querySelectorAll('td')).toHaveLength(6);
  });

  it('renders the header and per-row checkboxes for a caller that does', () => {
    renderSelectable();

    expect(screen.getByTestId('attachments-select-all')).toBeInTheDocument();
    expect(screen.getByTestId('attachment-select-a1')).toBeInTheDocument();
    expect(rowOf('a1').querySelectorAll('td')).toHaveLength(7);
  });

  it('reports the toggles to the caller instead of mutating state of its own', () => {
    const onToggleRow = vi.fn();
    const onToggleAll = vi.fn();
    const { container } = renderTable({ selectedIds: new Set(), onToggleRow, onToggleAll });

    fireEvent.click(rowCheckbox('a1'));
    expect(onToggleRow).toHaveBeenCalledWith('a1');

    fireEvent.click(within(container.querySelector('thead')).getByRole('checkbox'));
    expect(onToggleAll).toHaveBeenCalledWith(['a1', 'a2']);
    // Nothing ticked by the component itself: the caller owns the Set.
    expect(backgroundUtilities(rowOf('a1'))).toEqual([]);
  });

  it('asks the caller to clear the selection when select-all is already complete', () => {
    const onToggleAll = vi.fn();
    const { container } = renderTable({ selectedIds: new Set(['a1', 'a2']), onToggleAll });

    fireEvent.click(within(container.querySelector('thead')).getByRole('checkbox'));
    expect(onToggleAll).toHaveBeenCalledWith([]);
  });
});

describe('AttachmentsTable — ETP-5526 header-wide controls', () => {
  it('never renders a delete-all control, even for a caller that still wants download-all', () => {
    renderTable({ onDownloadAll: vi.fn(), onDelete: vi.fn() });

    expect(screen.queryByTestId('attachments-delete-all')).not.toBeInTheDocument();
    expect(screen.queryByText('attachmentsDeleteAll')).not.toBeInTheDocument();
  });

  it('keeps download-all for the caller that passes it (SifAttachmentsSection)', () => {
    const onDownloadAll = vi.fn();
    renderTable({ onDownloadAll });

    fireEvent.click(screen.getByTestId('attachments-download-all'));
    expect(onDownloadAll).toHaveBeenCalled();
  });

  it('renders no header control when the caller passes neither', () => {
    renderTable();
    expect(screen.queryByTestId('attachments-download-all')).not.toBeInTheDocument();
  });
});
