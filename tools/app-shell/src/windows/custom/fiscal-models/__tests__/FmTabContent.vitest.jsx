// @covers tools/app-shell/src/windows/custom/fiscal-models/FmTabContent.jsx
// Vitest render tests for FmTabContent.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('lucide-react', () => ({
  ReceiptText: () => null,
  TriangleAlert: (p) => <span data-testid="icon-warn" {...p} />,
  OctagonAlert: (p) => <span data-testid="icon-block" {...p} />,
  CircleCheck: (p) => <span data-testid="icon-check" {...p} />,
  ChevronRight: (p) => <span {...p} />,
  Download: (p) => <span {...p} />,
  FileText: (p) => <span {...p} />,
}));

vi.mock('../FmCommon.jsx', () => ({
  Banner: ({ tone, title }) => <div data-testid="banner">{title}</div>,
  EmptyState: ({ title }) => <div data-testid="empty-state">{title}</div>,
}));

vi.mock('../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, fireEvent } from '@testing-library/react';
import { SourcesTab, IncidentsTab } from '../FmTabContent.jsx';
import esES from '@/locales/es_ES.json';
import enUS from '@/locales/en_US.json';

// ── Helpers ─────────────────────────────────────────────────────────────────

const t = (key) => key;

// ── SourcesTab ──────────────────────────────────────────────────────────────

describe('SourcesTab', () => {
  const baseDecl = { sources: [], incidents: { items: [] } };

  it('renders empty state when no sources', () => {
    render(<SourcesTab decl={baseDecl} t={t} />);
    expect(document.body.textContent).toContain('fm.sources.empty');
  });

  it('renders a table when sources exist', () => {
    const decl = {
      sources: [
        { ref: 'INV-001', date: '2026-01-15', type: 'Compra', party: 'Acme', regime: 'General', base: 1000, vat: 210, total: 1210, boxes: '07' },
      ],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    expect(document.querySelector('table')).toBeTruthy();
    expect(document.body.textContent).toContain('INV-001');
  });

  it('renders date formatted as dd/mm/yyyy', () => {
    const decl = {
      sources: [{ ref: 'R1', date: '2026-03-05', type: 'V', party: 'P', base: 0, total: 0, boxes: '' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    expect(document.body.textContent).toContain('05/03/2026');
  });

  it('shows incident filter button when rows have incidents', () => {
    const decl = {
      sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '07' }],
      incidents: { items: [{ origin: 'Casilla 07', severity: 'warn', message: 'Test' }] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    expect(document.body.textContent).toContain('fm.sources.filter.incidents');
  });

  it('highlights rows with blocking incidents', () => {
    const decl = {
      sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '07' }],
      incidents: { items: [{ origin: 'Casilla 07', severity: 'block', message: 'Blocking' }] },
    };
    const { container } = render(<SourcesTab decl={decl} t={t} />);
    expect(container.querySelector('.fm-dtable__row--block')).toBeTruthy();
  });

  // ── accountingDate column (ETP-5338) ─────────────────────────────────────

  it('renders the invoice-date column header using the (relabeled) i18n key', () => {
    const decl = { sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '' }], incidents: { items: [] } };
    render(<SourcesTab decl={decl} t={t} />);
    const headers = Array.from(document.querySelectorAll('thead th')).map(th => th.textContent);
    expect(headers).toContain('fm.sources.col.date');
  });

  it('renders a new "Fecha Contable" column header right after the invoice date one', () => {
    const decl = { sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '' }], incidents: { items: [] } };
    render(<SourcesTab decl={decl} t={t} />);
    const headers = Array.from(document.querySelectorAll('thead th')).map(th => th.textContent);
    const dateIdx = headers.indexOf('fm.sources.col.date');
    expect(dateIdx).toBeGreaterThanOrEqual(0);
    expect(headers[dateIdx + 1]).toBe('fm.sources.col.accountingDate');
  });

  it('renders the accountingDate cell formatted as dd/mm/yyyy for a populated row', () => {
    const decl = {
      sources: [{ ref: 'R1', date: '2026-03-05', accountingDate: '2026-03-10', type: 'V', party: 'P', base: 0, total: 0, boxes: '' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    expect(document.body.textContent).toContain('05/03/2026');
    expect(document.body.textContent).toContain('10/03/2026');
  });

  it('renders "—" for a row with a null accountingDate, without throwing or showing "Invalid Date"', () => {
    const decl = {
      sources: [{ ref: 'R1', date: '2026-03-05', accountingDate: null, type: 'V', party: 'P', base: 0, total: 0, boxes: '' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    expect(document.body.textContent).not.toContain('Invalid Date');
    const row = document.querySelector('tbody tr');
    expect(row.cells[1].textContent).toBe('—');
  });

  it('renders "—" for a row missing the accountingDate field entirely', () => {
    const decl = {
      sources: [{ ref: 'R1', date: '2026-03-05', type: 'V', party: 'P', base: 0, total: 0, boxes: '' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    const row = document.querySelector('tbody tr');
    expect(row.cells[1].textContent).toBe('—');
  });

  it('bumps the empty-state colSpan to 9 to match the new column count', () => {
    // Force the "visible.length === 0" branch: start with an incident on R1's box so the
    // "Con incidencias" filter toggle is shown, click it, then re-render with the incident
    // resolved (items: []) while `onlyIncidents` state persists — this filters `sources`
    // down to zero without ever hitting the outer "Sin facturas" (sources.length===0) branch.
    const declWithIncident = {
      sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '07' }],
      incidents: { items: [{ origin: 'Casilla 07', severity: 'warn', message: 'x' }] },
    };
    const { rerender } = render(<SourcesTab decl={declWithIncident} t={t} />);
    fireEvent.click(screen.getByText('fm.sources.filter.incidents'));

    const declResolved = {
      sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '07' }],
      incidents: { items: [] },
    };
    rerender(<SourcesTab decl={declResolved} t={t} />);

    const headerCount = document.querySelectorAll('thead th').length;
    expect(headerCount).toBe(9);
    const emptyCell = document.querySelector('tbody tr td');
    expect(emptyCell).toBeTruthy();
    expect(emptyCell.getAttribute('colspan')).toBe('9');
  });

  // ── showTaxColumns (ETP-5597) — 349 hides Cuota/Total/Casillas ───────────

  // ETP-5597 — opt-in key column (349 "Facturas origen"); 303 never passes it.
  describe('keyColumn', () => {
    const decl = {
      sources: [
        { id: 'inv-1', ref: 'F-1', key: 'E', type: 'Venta', base: 300 },
        { id: 'inv-1', ref: 'F-1', key: 'S', type: 'Venta', base: 50 },
        { id: 'inv-2', ref: 'F-2', type: 'Venta', base: 10 },
      ],
      incidents: { items: [] },
    };
    const headers = () => Array.from(document.querySelectorAll('thead th')).map(th => th.textContent);

    it('is absent by default (303 table unchanged)', () => {
      render(<SourcesTab decl={decl} t={t} />);
      expect(headers()).toEqual([
        'fm.sources.col.date', 'fm.sources.col.accountingDate', 'fm.sources.col.ref', 'fm.sources.col.type',
        'fm.sources.col.party', 'fm.sources.col.base', 'fm.sources.col.vat', 'fm.sources.col.total', 'fm.sources.col.boxes',
      ]);
    });

    it('renders the caller-supplied header and cell right after Tipo, one per row', () => {
      render(
        <SourcesTab decl={decl} t={t} showTaxColumns={false}
          keyColumn={{ label: 'Clave', render: r => r.key ?? '—' }} />,
      );
      expect(headers()[4]).toBe('Clave');
      const keyCells = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.children[4].textContent);
      expect(keyCells).toEqual(['E', 'S', '—']);
    });

    // ETP-5597 round 8 — 349 hides "Tipo" (its key already tells a purchase from a sale).
    it('hiddenColumns=["type"] drops the Tipo header and cells; the key column takes its place', () => {
      render(
        <SourcesTab decl={decl} t={t} showTaxColumns={false} hiddenColumns={['type']}
          keyColumn={{ label: 'Clave', render: r => r.key ?? '—' }} />,
      );
      expect(headers()).toEqual([
        'fm.sources.col.date', 'fm.sources.col.accountingDate', 'fm.sources.col.ref', 'Clave',
        'fm.sources.col.party', 'fm.sources.col.base',
      ]);
      expect(document.body.textContent).not.toContain('Venta');
      const keyCells = Array.from(document.querySelectorAll('tbody tr')).map(tr => tr.children[3].textContent);
      expect(keyCells).toEqual(['E', 'S', '—']);
    });

    it('the empty-filter row spans exactly the visible columns', () => {
      const withIncident = {
        sources: [{ id: 'x', ref: 'F-X', key: 'E', base: 1, boxes: '01' }],
        incidents: { items: [] },
      };
      render(
        <SourcesTab decl={withIncident} t={t} showTaxColumns={false} hiddenColumns={['type']}
          keyColumn={{ label: 'Clave', render: r => r.key }} />,
      );
      expect(document.querySelectorAll('thead th')).toHaveLength(6);
    });
  });

  describe('showTaxColumns', () => {
    const decl = {
      sources: [{ id: 'r1', ref: 'REC-1', date: '', type: 'Venta', party: 'ACME', base: 100, vat: 21, total: 121, boxes: '07' }],
      incidents: { items: [] },
    };

    it('renders Cuota/Total/Casillas by default (303)', () => {
      render(<SourcesTab decl={decl} t={t} />);
      const headers = Array.from(document.querySelectorAll('thead th')).map(th => th.textContent);
      expect(headers).toEqual(expect.arrayContaining(['fm.sources.col.vat', 'fm.sources.col.total', 'fm.sources.col.boxes']));
      expect(document.querySelector('tbody tr').cells).toHaveLength(9);
    });

    it('omits Cuota/Total/Casillas headers and cells when false (349)', () => {
      render(<SourcesTab decl={decl} t={t} showTaxColumns={false} />);
      const headers = Array.from(document.querySelectorAll('thead th')).map(th => th.textContent);
      expect(headers).toHaveLength(6);
      for (const k of ['fm.sources.col.vat', 'fm.sources.col.total', 'fm.sources.col.boxes']) {
        expect(headers).not.toContain(k);
      }
      expect(headers).toContain('fm.sources.col.party');
      expect(headers).toContain('fm.sources.col.ref');
      const cells = document.querySelector('tbody tr').cells;
      expect(cells).toHaveLength(6);
      expect(cells[5].textContent).toBe('100');
      expect(document.body.textContent).not.toContain('121');
    });

    it('the empty-row colSpan follows the column count (6 when tax columns are hidden)', () => {
      const withIncident = {
        sources: [{ ref: 'R1', date: '', type: '', party: '', base: 0, total: 0, boxes: '07' }],
        incidents: { items: [{ origin: 'Casilla 07', severity: 'warn', message: 'x' }] },
      };
      const { rerender } = render(<SourcesTab decl={withIncident} t={t} showTaxColumns={false} />);
      fireEvent.click(screen.getByText('fm.sources.filter.incidents'));
      rerender(<SourcesTab decl={{ ...withIncident, incidents: { items: [] } }} t={t} showTaxColumns={false} />);
      expect(document.querySelector('tbody tr td').getAttribute('colspan')).toBe('6');
    });
  });

  // ETP-5597 — column labels "Contacto" / "N° documento".
  it('the party/ref column labels read "Contacto" and "N° documento" in Spanish', () => {
    expect(esES.genericLabels['fm.sources.col.party']).toBe('Contacto');
    expect(esES.genericLabels['fm.sources.col.ref']).toBe('N° documento');
    expect(enUS.genericLabels['fm.sources.col.party']).toBe('Contact');
    expect(enUS.genericLabels['fm.sources.col.ref']).toBe('Document No.');
  });

  // ── row-per-side "type" label (ETP-5456) ─────────────────────────────────

  it('translates the "accrued" machine key via the i18n hook', () => {
    const decl = {
      sources: [{ id: 'r1', ref: 'REC-1', date: '', type: 'accrued', party: '', base: 0, total: 0, boxes: '10,11' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    const row = document.querySelector('tbody tr');
    // `t` here is the identity mock `(key) => key`, so the translated cell shows the key itself.
    expect(row.cells[3].textContent).toBe('fm.sources.type.accrued');
  });

  it('translates the "deductible" machine key via the i18n hook', () => {
    const decl = {
      sources: [{ id: 'r1', ref: 'REC-1', date: '', type: 'deductible', party: '', base: 0, total: 0, boxes: '36,37' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    const row = document.querySelector('tbody tr');
    expect(row.cells[3].textContent).toBe('fm.sources.type.deductible');
  });

  it('falls back to the raw value for a row from a backend that predates the accrued/deductible keys', () => {
    const decl = {
      sources: [{ id: 'r1', ref: 'REC-1', date: '', type: 'Compra', party: '', base: 0, total: 0, boxes: '07' }],
      incidents: { items: [] },
    };
    render(<SourcesTab decl={decl} t={t} />);
    const row = document.querySelector('tbody tr');
    expect(row.cells[3].textContent).toBe('Compra');
  });
});

// ── IncidentsTab ────────────────────────────────────────────────────────────

describe('IncidentsTab', () => {
  const baseDecl = { incidents: { items: [] } };

  it('renders empty message when no incidents', () => {
    render(<IncidentsTab decl={baseDecl} blocking={0} warning={0} t={t} />);
    expect(document.body.textContent).toContain('fm.incidents.empty');
  });

  it('renders incident table when blocking > 0', () => {
    const decl = {
      incidents: {
        items: [
          { origin: 'Casilla 07', severity: 'block', message: 'Missing data', suggestion: 'Fix it' },
        ],
      },
    };
    render(<IncidentsTab decl={decl} blocking={1} warning={0} t={t} />);
    expect(document.querySelector('table')).toBeTruthy();
    expect(document.body.textContent).toContain('Missing data');
  });

  // ETP-5597 — the banner follows the real severity: warnings only → amber, non-blocking text.
  it('renders the amber, non-blocking banner when there are only warnings', () => {
    const decl = {
      incidents: {
        items: [{ origin: 'Box', severity: 'warn', message: 'Check this' }],
      },
    };
    render(<IncidentsTab decl={decl} blocking={0} warning={1} t={t} />);
    const text = screen.getByText('fm.incidents.warn_sub');
    expect(text.style.color).toBe('var(--status-warning-fg)');
    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();
  });

  it('renders the destructive "resolve before generating" banner when there is a blocking incident', () => {
    const decl = { incidents: { items: [{ origin: 'Box', severity: 'block', message: 'Broken' }] } };
    render(<IncidentsTab decl={decl} blocking={1} warning={0} t={t} />);
    const text = screen.getByText('fm.incidents.block_sub');
    expect(text.style.color).toBe('hsl(var(--destructive))');
    expect(screen.queryByText('fm.incidents.warn_sub')).not.toBeInTheDocument();
  });

  it('blocking wins over warnings: blocking + warnings shows the destructive banner', () => {
    const decl = {
      incidents: {
        items: [
          { origin: 'Box', severity: 'block', message: 'Broken' },
          { origin: 'Box2', severity: 'warn', message: 'Hmm' },
        ],
      },
    };
    render(<IncidentsTab decl={decl} blocking={1} warning={1} t={t} />);
    expect(screen.getByText('fm.incidents.block_sub')).toBeInTheDocument();
    expect(screen.queryByText('fm.incidents.warn_sub')).not.toBeInTheDocument();
  });

  it('the warn_sub key is translated in both locales', () => {
    expect(esES.genericLabels['fm.incidents.warn_sub']).toBeTruthy();
    expect(enUS.genericLabels['fm.incidents.warn_sub']).toBeTruthy();
  });

  it('shows go-to-sources link for casilla incidents', () => {
    const onGoToSources = vi.fn();
    const decl = {
      incidents: {
        items: [{ origin: 'Casilla 07', severity: 'block', message: 'Error' }],
      },
    };
    render(<IncidentsTab decl={decl} blocking={1} warning={0} t={t} onGoToSources={onGoToSources} />);
    const link = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('fm.sources.title'));
    expect(link).toBeTruthy();
    fireEvent.click(link);
    expect(onGoToSources).toHaveBeenCalled();
  });

  // ── Dismissible warning banner (ETP-5229 item #11) ──────────────────────

  function findCloseButton() {
    return screen.getByLabelText('fm.action.close');
  }

  it('is absent entirely (not just dismissed) when blocking === 0 && warning === 0', () => {
    render(<IncidentsTab decl={baseDecl} blocking={0} warning={0} t={t} />);
    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('fm.action.close')).not.toBeInTheDocument();
    // The dedicated empty-state branch renders instead.
    expect(document.body.textContent).toContain('fm.incidents.empty');
  });

  it('clicking the close button hides the banner', () => {
    const decl = { incidents: { items: [{ origin: 'Box', severity: 'warn', message: 'Check this' }] } };
    render(<IncidentsTab decl={decl} blocking={0} warning={1} t={t} />);
    expect(screen.getByText('fm.incidents.warn_sub')).toBeInTheDocument();

    fireEvent.click(findCloseButton());

    expect(screen.queryByText('fm.incidents.warn_sub')).not.toBeInTheDocument();
  });

  it('keeps the banner hidden across a re-render with the same blocking/warning counts', () => {
    const decl = { incidents: { items: [{ origin: 'Box', severity: 'block', message: 'Still there' }] } };
    const { rerender } = render(<IncidentsTab decl={decl} blocking={2} warning={0} t={t} />);
    fireEvent.click(findCloseButton());
    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();

    // Same counts, same decl reference — dismissal must persist.
    rerender(<IncidentsTab decl={decl} blocking={2} warning={0} t={t} />);
    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();
  });

  it('re-shows the banner when the blocking count increases after dismissal (new incident)', () => {
    const decl = { incidents: { items: [{ origin: 'Box', severity: 'block', message: 'One' }] } };
    const { rerender } = render(<IncidentsTab decl={decl} blocking={1} warning={0} t={t} />);
    fireEvent.click(findCloseButton());
    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();

    const decl2 = {
      incidents: {
        items: [
          { origin: 'Box', severity: 'block', message: 'One' },
          { origin: 'Box2', severity: 'block', message: 'Two' },
        ],
      },
    };
    rerender(<IncidentsTab decl={decl2} blocking={2} warning={0} t={t} />);
    expect(screen.getByText('fm.incidents.block_sub')).toBeInTheDocument();
  });

  it('re-shows the banner when the blocking count decreases (but not to zero) after dismissal', () => {
    const decl = {
      incidents: {
        items: [
          { origin: 'Box', severity: 'block', message: 'One' },
          { origin: 'Box2', severity: 'block', message: 'Two' },
        ],
      },
    };
    const { rerender } = render(<IncidentsTab decl={decl} blocking={2} warning={0} t={t} />);
    fireEvent.click(findCloseButton());
    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();

    // One incident resolved (2 -> 1), but not down to zero — the banner branch
    // still applies (a drop to 0 would hit the separate empty-state branch instead).
    const decl2 = { incidents: { items: [{ origin: 'Box', severity: 'block', message: 'One' }] } };
    rerender(<IncidentsTab decl={decl2} blocking={1} warning={0} t={t} />);
    expect(screen.getByText('fm.incidents.block_sub')).toBeInTheDocument();
  });
});
