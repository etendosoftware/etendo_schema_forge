// ETP-5030 — selected-row shading for the TicketBAI monitor table.
//
// GROUP B (CSS rule, not a Tailwind utility). This table paints its backgrounds
// on the CELLS (`.fm-tablecard .fm-table tr:hover td`, fiscal-monitor.css), and
// a td background covers whatever the tr paints underneath — so a `bg-primary/5`
// on the <tr> would have rendered ONLY while the pointer was elsewhere, i.e.
// never at the moment the user ticks the checkbox. The fix is therefore the
// `fm-row--selected` class plus a pair of CSS rules
// (`tr.fm-row--selected td` / `tr.fm-row--selected:hover td`).
//
// IMPORTANT — every assertion in this file is a PROXY. jsdom does not apply
// stylesheets, so asserting the class proves the hook-up (the row is marked
// when, and only when, it is selected), NOT the rendered colour and NOT the CSS
// specificity that makes the tint outrank `tr:hover td`. Neither is observable
// from a unit test in this repo.
//
// This is a separate file from TbaiMonitorSection.vitest.jsx on purpose: that
// suite mocks `useFmSelection` with a permanently-empty Set, which structurally
// cannot express "tick a checkbox and watch the row change". The stub below
// keeps that file's FmPrimitives factory shape but gives `useFmSelection` a
// real, stateful implementation. Nothing is added to FmPrimitives.jsx: the five
// suites that mock it with exhaustive hand-written factories stay untouched.
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const ROWS = [
  { id: 'tbai-1', invoice: 'inv-1', 'invoice$_identifier': 'T-001 – 2026-05-10', estado: 'Recibido' },
  { id: 'tbai-2', invoice: 'inv-2', 'invoice$_identifier': 'T-002 – 2026-05-11', estado: 'Recibido' },
];

// Rows arrive through the normal list fetch, not through the `mockRows` prop:
// the section's "reset on filter change" effect runs right after the list effect
// on mount and clears `rows`, so the synchronous `mockRows` branch never
// survives to render (pre-existing behaviour, unrelated to ETP-5030 — the async
// fetch path resolves after that reset).
//
// The returned reference MUST be stable across renders (same convention, and
// same `stable*` naming, as the sibling suites): the list effect lists
// `apiFetch` in its dependency array, so a fresh vi.fn() per render would
// re-run the effect → setState → re-render forever.
const stableApiFetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: async () => ({ response: { data: ROWS, totalRows: ROWS.length } }),
}));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('../useFiscalMonitor.js', () => ({
  TBAI_SPEC: 'tbai-monitor',
  TBAI_ENTITY: 'sincronizacion',
}));
// FmPrimitives is stubbed the same way its sibling suites stub it — with ONE
// difference that is the whole point of this file: `useFmSelection` is a real,
// stateful re-implementation (identical to FmPrimitives' own) instead of a
// permanently-empty Set, so ticking a checkbox actually re-renders the row.
// Nothing is added to FmPrimitives.jsx itself.
vi.mock('../FmPrimitives.jsx', async () => {
  const { useState } = await import('react');
  return {
    StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
    NumFactura: ({ n }) => <span>{n}</span>,
    // jsdom has no IntersectionObserver; the sentinel is irrelevant here.
    ScrollSentinel: () => null,
    isErrorStatus: () => false,
    isPendingStatus: () => false,
    fmtDate: (d) => d ?? '',
    PAGE_SIZE: 20,
    ExportIcon: () => <span>export</span>,
    fetchCsvAndDownload: vi.fn(),
    useFmSelection: (rows) => {
      const [selectedIds, setSelectedIds] = useState(() => new Set());
      const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
      const someSelected = rows.some((r) => selectedIds.has(r.id)) && !allSelected;
      const handleToggleAll = () => setSelectedIds((prev) => (
        rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))
      ));
      const handleToggleRow = (id) => setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return { selectedIds, setSelectedIds, allSelected, someSelected, handleToggleAll, handleToggleRow };
    },
  };
});

import TbaiMonitorSection from '../TbaiMonitorSection.jsx';
import { classesOf } from '@/test/rowShading.js';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/tbai-monitor',
  kpis: { tbai: { sent: 2, rejected: 0 } },
};

/** The <tr> that renders the given invoice number. */
const rowOf = (docNo) => screen.getByText(docNo).closest('tr');
const checkboxIn = (row) => within(row).getByRole('checkbox');

describe('TbaiMonitorSection — ETP-5030 selected-row shading', () => {
  async function renderRows() {
    const view = render(<TbaiMonitorSection {...baseProps} />);
    await waitFor(() => expect(screen.getByText('T-001')).toBeInTheDocument());
    return view;
  }

  it('marks ONLY the ticked row as selected and leaves the others unmarked', async () => {
    await renderRows();

    // Sanity: nothing is marked before the tick, so the assertion below is a
    // real change of state and cannot pass vacuously.
    expect(classesOf(rowOf('T-001'))).toEqual([]);
    expect(classesOf(rowOf('T-002'))).toEqual([]);

    fireEvent.click(checkboxIn(rowOf('T-001')));

    expect(classesOf(rowOf('T-001'))).toEqual(['fm-row--selected']);
    // Negative half: the untouched row is still rendered (its invoice number is
    // right there in the locator) and still carries no marker.
    expect(classesOf(rowOf('T-002'))).toEqual([]);
  });

  it('removes the marker when the row is unticked', async () => {
    await renderRows();

    fireEvent.click(checkboxIn(rowOf('T-001')));
    expect(classesOf(rowOf('T-001'))).toEqual(['fm-row--selected']);

    fireEvent.click(checkboxIn(rowOf('T-001')));
    expect(classesOf(rowOf('T-001'))).toEqual([]);
  });

  it('keeps the marker on the row while it is hovered', async () => {
    await renderRows();

    fireEvent.click(checkboxIn(rowOf('T-001')));
    fireEvent.mouseOver(rowOf('T-001'));
    fireEvent.mouseEnter(rowOf('T-001'));

    // The class is unconditional — nothing in the component toggles it on
    // pointer events, which is what makes the CSS `:hover` variant reachable.
    // The guarantee that the tint actually WINS over `.fm-tablecard .fm-table
    // tr:hover td` is CSS-level (selector specificity) and is not testable
    // here: jsdom applies no stylesheets.
    expect(classesOf(rowOf('T-001'))).toEqual(['fm-row--selected']);
    expect(classesOf(rowOf('T-002'))).toEqual([]);
  });

  it('select-all marks every row, and clearing it unmarks every row', async () => {
    const { container } = await renderRows();
    const headerCheckbox = within(container.querySelector('thead')).getByRole('checkbox');

    fireEvent.click(headerCheckbox);
    expect(classesOf(rowOf('T-001'))).toEqual(['fm-row--selected']);
    expect(classesOf(rowOf('T-002'))).toEqual(['fm-row--selected']);

    fireEvent.click(headerCheckbox);
    expect(classesOf(rowOf('T-001'))).toEqual([]);
    expect(classesOf(rowOf('T-002'))).toEqual([]);
  });
});
