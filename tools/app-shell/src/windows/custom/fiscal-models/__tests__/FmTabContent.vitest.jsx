// Vitest render tests for FmTabContent.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('lucide-react', () => ({
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

  it('renders warning banner', () => {
    const decl = {
      incidents: {
        items: [{ origin: 'Box', severity: 'warn', message: 'Check this' }],
      },
    };
    render(<IncidentsTab decl={decl} blocking={0} warning={1} t={t} />);
    expect(document.body.textContent).toContain('fm.incidents.block_sub');
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
    expect(screen.getByText('fm.incidents.block_sub')).toBeInTheDocument();

    fireEvent.click(findCloseButton());

    expect(screen.queryByText('fm.incidents.block_sub')).not.toBeInTheDocument();
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
