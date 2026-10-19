// @covers tools/app-shell/src/components/attachments/AttachmentsTable.jsx
//
// AttachmentsTable renders the generic DataTable with its own local rows
// (ETP-5526), so the row visuals — checked-row colour, lift on hover, the row
// action cell — come from DataTable and are pinned in its own suites
// (DataTable.rowHoverStyle.vitest.jsx). What this file guards is the attachments
// wiring on top of it:
//
//   - selection is opt-in, controlled by the caller through `selectedIds` +
//     `onSelectionChange(ids)`, and kept in sync with DataTable's own checkbox
//     state when the caller clears it or a selected row disappears;
//   - upload-in-progress rows cannot be selected and carry no actions;
//   - each row action appears only when its handler is passed;
//   - the header-wide download-all control survives for SifAttachmentsSection.
//
// Conventions follow the sibling `AttachmentsTab.vitest.jsx` (identity i18n
// mocks, real UI primitives, testid-scoped queries).
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// i18n translators return the key itself, so no hardcoded English leaks in.
// DataTable also reads the label / locale hooks.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

import AttachmentsTable, { formatAttachmentDate } from '../AttachmentsTable.jsx';
import { backgroundUtilities, hoverBackgroundUtilities } from '@/test/rowShading.js';

const ITEMS = [
  { id: 'a1', name: 'contract.pdf', size: 1024, createdAt: '2026-05-10T00:00:00Z' },
  { id: 'a2', name: 'invoice.pdf', size: 2048, createdAt: '2026-05-11T00:00:00Z' },
];

const BASE = {
  items: ITEMS,
  loading: false,
  uploadingFiles: new Map(),
  formatBytes: (n) => `${n} B`,
};

const renderTable = (props = {}) => render(<AttachmentsTable {...BASE} {...props} />);

/**
 * Stand-in for the one caller that opts into selection (AttachmentsTab): owns the
 * `Set`, applies what the table reports, and can clear it — exactly the
 * contract the real caller uses. `onReport` spies on every reported selection.
 */
function SelectableTable({ onReport, ...props }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  return (
    <>
      <button type="button" data-testid="harness-clear" onClick={() => setSelectedIds(new Set())} />
      <output data-testid="harness-selection">{[...selectedIds].join(',')}</output>
      <AttachmentsTable
        {...BASE}
        selectedIds={selectedIds}
        onSelectionChange={(ids) => {
          onReport?.(ids);
          setSelectedIds(new Set(ids));
        }}
        {...props}
      />
    </>
  );
}

const renderSelectable = (props = {}) => render(<SelectableTable {...props} />);

const rowOf = (id) => screen.getByTestId(`row-${id}`);
const rowCheckbox = (id) => within(rowOf(id)).getByRole('checkbox');
const headerCheckbox = (container) => within(container.querySelector('thead')).getByRole('checkbox');
const harnessSelection = () => screen.getByTestId('harness-selection').textContent;

describe('AttachmentsTable — rows through DataTable', () => {
  it('renders one row per attachment with its name and formatted size', () => {
    renderTable();

    expect(screen.getByTestId('attachment-name-a1')).toHaveTextContent('contract.pdf');
    expect(screen.getByTestId('attachment-name-a2')).toHaveTextContent('invoice.pdf');
    expect(within(rowOf('a2')).getByText('2048 B')).toBeInTheDocument();
  });

  it('shows the attachments empty state when there are no items and no uploads', () => {
    renderTable({ items: [] });
    expect(screen.getByTestId('attachments-empty-state')).toBeInTheDocument();
  });

  // The rows have no click target, yet they must lift like every other list row
  // (rowHoverStyle="lift-always"); a plain `lift` would leave them on the tint.
  it('lifts an unselected row on hover even though rows are not clickable', () => {
    renderTable();

    const row = rowOf('a1');
    expect(row.className).toContain('hover:z-10');
    expect(hoverBackgroundUtilities(row)).toEqual(['hover:bg-card']);
    expect(row.className).not.toContain('cursor-pointer');
  });
});

// Figma date format: abbreviated weekday (capitalized), day, abbreviated month, in the
// UI locale and the viewer's LOCAL day; the year only when it is not the current one.
// TZ is pinned so the near-midnight case (23:30Z = 01:30 next day in Madrid) is
// deterministic, and `now` is fixed so "current year" does not depend on the clock.
describe('formatAttachmentDate', () => {
  let previousTz;
  beforeAll(() => { previousTz = process.env.TZ; process.env.TZ = 'Europe/Madrid'; });
  afterAll(() => { process.env.TZ = previousTz; });

  const NOW_2026 = new Date(2026, 5, 15, 12, 0);

  it.each([
    ['2026-04-30T10:00:00Z', 'es_ES', 'Jue 30 abr'],
    ['2026-04-30T10:00:00Z', 'en_US', 'Thu Apr 30'],
    ['2026-01-05T08:00:00Z', 'es_ES', 'Lun 5 ene'],
    ['2026-01-05T08:00:00Z', 'en_US', 'Mon Jan 5'],
    // Local day, not the UTC one: 2 Sep 23:30Z is already 3 Sep in Madrid.
    ['2025-09-02T23:30:00Z', 'es_ES', 'Mié 3 sept 2025'],
    ['2025-09-02T23:30:00Z', 'en_US', 'Wed Sep 3 2025'],
    // Another year carries the year; the current one does not.
    ['2024-04-30T10:00:00Z', 'es_ES', 'Mar 30 abr 2024'],
    ['2024-04-30T10:00:00Z', 'en_US', 'Tue Apr 30 2024'],
  ])('formats %s in %s as "%s"', (value, locale, expected) => {
    expect(formatAttachmentDate(value, locale, NOW_2026)).toBe(expected);
  });

  it('drops the year once `now` moves into that year', () => {
    expect(formatAttachmentDate('2025-09-02T23:30:00Z', 'es_ES', new Date(2025, 11, 31, 12))).toBe('Mié 3 sept');
  });

  it.each([null, undefined, '', 'not-a-date'])('renders a dash for %j', (value) => {
    expect(formatAttachmentDate(value, 'es_ES', NOW_2026)).toBe('—');
  });
});

describe('AttachmentsTable — date columns', () => {
  // The cell shows the formatted label, but the sort must use the raw ISO value:
  // these labels sort alphabetically as Mon < Thu < Tue, chronologically as
  // Jan 5 < Mar 3 < Apr 30.
  const DATED = [
    { id: 'jan', name: 'jan.pdf', size: 1, uploadedAt: '2026-01-05T10:00:00Z' },
    { id: 'apr', name: 'apr.pdf', size: 1, uploadedAt: '2026-04-30T10:00:00Z' },
    { id: 'mar', name: 'mar.pdf', size: 1, uploadedAt: '2026-03-03T10:00:00Z' },
  ];
  const rowOrder = () => [...document.querySelectorAll('tbody tr[data-testid^="row-"]')]
    .map((tr) => tr.getAttribute('data-testid'));

  it('renders the upload date through formatAttachmentDate', () => {
    renderTable({ items: DATED });
    expect(screen.getByTestId('cell-apr-uploadedAt'))
      .toHaveTextContent(formatAttachmentDate('2026-04-30T10:00:00Z', 'en_US'));
  });

  it('sorts the upload date chronologically on the raw value, not on the label', () => {
    renderTable({ items: DATED });

    fireEvent.click(within(screen.getByTestId('column-header-uploadedAt')).getByRole('button'));

    expect(rowOrder()).toEqual(['row-jan', 'row-mar', 'row-apr']);
  });
});

describe('AttachmentsTable — selected-row shading (ETP-5030)', () => {
  it('paints only the ticked row, keeps that colour under the pointer, and clears it on untick', () => {
    renderSelectable();

    fireEvent.click(rowCheckbox('a1'));

    // Exactly one resting and one hover background on the checked row: a second
    // utility would race it by stylesheet order (the original ETP-5030 bug).
    expect(backgroundUtilities(rowOf('a1'))).toHaveLength(1);
    expect(hoverBackgroundUtilities(rowOf('a1'))).toEqual([
      `hover:${backgroundUtilities(rowOf('a1'))[0]}`,
    ]);
    expect(backgroundUtilities(rowOf('a2'))).toEqual([]);

    fireEvent.click(rowCheckbox('a1'));
    expect(backgroundUtilities(rowOf('a1'))).toEqual([]);
  });
});

// Selection is an opt-in capability of this shared table: the checkbox column
// used to render for EVERY caller, which is why SifAttachmentsSection (no
// selection, read-only) showed checkboxes that could not drive anything.
describe('AttachmentsTable — selection is opt-in and caller-owned (ETP-5526)', () => {
  it('renders no checkbox at all for a caller that does not pass selectedIds', () => {
    const { container } = renderTable();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it('renders the header and per-row checkboxes for a caller that does', () => {
    const { container } = renderSelectable();

    expect(headerCheckbox(container)).toBeInTheDocument();
    expect(rowCheckbox('a1')).not.toBeChecked();
    expect(rowCheckbox('a2')).not.toBeChecked();
  });

  it('reports the whole selection as ids on every change', () => {
    const onReport = vi.fn();
    const { container } = renderSelectable({ onReport });

    fireEvent.click(rowCheckbox('a1'));
    expect(onReport).toHaveBeenLastCalledWith(['a1']);

    fireEvent.click(headerCheckbox(container));
    expect(onReport).toHaveBeenLastCalledWith(['a1', 'a2']);

    // Select-all on an already-complete selection clears it.
    fireEvent.click(headerCheckbox(container));
    expect(onReport).toHaveBeenLastCalledWith([]);
  });

  it('unticks every checkbox when the caller clears its selection', () => {
    const { container } = renderSelectable();

    fireEvent.click(headerCheckbox(container));
    expect(rowCheckbox('a1')).toBeChecked();
    expect(rowCheckbox('a2')).toBeChecked();

    fireEvent.click(screen.getByTestId('harness-clear'));

    expect(rowCheckbox('a1')).not.toBeChecked();
    expect(rowCheckbox('a2')).not.toBeChecked();
    expect(headerCheckbox(container)).not.toBeChecked();
  });

  it('prunes a selected row that disappears from items and keeps the survivor ticked', () => {
    const onReport = vi.fn();
    const { container, rerender } = render(<SelectableTable onReport={onReport} />);

    fireEvent.click(headerCheckbox(container));
    expect(harnessSelection()).toBe('a1,a2');

    rerender(<SelectableTable onReport={onReport} items={[ITEMS[1]]} />);

    expect(onReport).toHaveBeenLastCalledWith(['a2']);
    expect(harnessSelection()).toBe('a2');
    expect(rowCheckbox('a2')).toBeChecked();
  });

  it('does not prune while the list is reloading', () => {
    const onReport = vi.fn();
    const { container, rerender } = render(<SelectableTable onReport={onReport} />);

    fireEvent.click(headerCheckbox(container));
    onReport.mockClear();

    rerender(<SelectableTable onReport={onReport} items={[]} loading />);

    expect(onReport).not.toHaveBeenCalled();
    expect(harnessSelection()).toBe('a1,a2');
  });
});

describe('AttachmentsTable — upload-in-progress rows', () => {
  const UPLOADING = new Map([['u1', { name: 'pending.pdf', size: 512 }]]);

  it('renders the uploading row with its spinner, no actions and a disabled checkbox', () => {
    const onReport = vi.fn();
    const { container } = renderSelectable({
      uploadingFiles: UPLOADING, onDownload: vi.fn(), onDelete: vi.fn(), onReport,
    });

    const row = rowOf('uploading:u1');
    expect(within(row).getByTestId('attachment-uploading-uploading:u1')).toHaveTextContent('pending.pdf');
    expect(screen.queryByTestId('attachment-actions-uploading:u1')).not.toBeInTheDocument();
    // A persisted row still gets its actions next to it.
    expect(screen.getByTestId('attachment-actions-a1')).toBeInTheDocument();

    // DataTable keeps the checkbox cell for column alignment, but disables it
    // (isRowSelectable): the upload has no id the bulk actions could use yet.
    expect(within(row).getByRole('checkbox')).toBeDisabled();

    // Select-all only ever selects persisted rows.
    fireEvent.click(headerCheckbox(container));
    expect(onReport).toHaveBeenLastCalledWith(['a1', 'a2']);
  });

  it('shows the uploading row instead of the empty state while the list is still empty', () => {
    renderTable({ items: [], loading: true, uploadingFiles: UPLOADING });

    expect(screen.getByTestId('attachment-uploading-uploading:u1')).toBeInTheDocument();
    expect(screen.queryByTestId('attachments-empty-state')).not.toBeInTheDocument();
  });
});

describe('AttachmentsTable — row actions', () => {
  it('passes the original attachment to download and delete', () => {
    const onDownload = vi.fn();
    const onDelete = vi.fn();
    renderTable({ onDownload, onDelete });

    fireEvent.click(screen.getByTestId('attachment-download-a2'));
    fireEvent.click(screen.getByTestId('attachment-delete-a1'));

    expect(onDownload).toHaveBeenCalledWith(ITEMS[1]);
    expect(onDelete).toHaveBeenCalledWith(ITEMS[0]);
  });

  it.each([
    ['read-only (no onDelete)', { onDownload: vi.fn() }, true, false],
    ['download-less (no onDownload)', { onDelete: vi.fn() }, false, true],
  ])('renders only the action whose handler is passed: %s', (_label, props, hasDownload, hasDelete) => {
    renderTable(props);

    expect(!!screen.queryByTestId('attachment-download-a1')).toBe(hasDownload);
    expect(!!screen.queryByTestId('attachment-delete-a1')).toBe(hasDelete);
  });

  it('renders no action cell when neither handler is passed', () => {
    renderTable();
    expect(screen.queryByTestId('attachment-actions-a1')).not.toBeInTheDocument();
  });
});

describe('AttachmentsTable — header-wide controls (ETP-5526)', () => {
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
