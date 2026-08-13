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
import { SourcesTab, IncidentsTab, FilesTab, HistoryTab } from '../FmTabContent.jsx';

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
});

// ── FilesTab ────────────────────────────────────────────────────────────────

describe('FilesTab', () => {
  it('shows empty state when no file', () => {
    render(<FilesTab decl={{ file: null }} t={t} onGenerate={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.files.empty');
  });

  it('shows generate button when no file', () => {
    const onGenerate = vi.fn();
    render(<FilesTab decl={{ file: null }} t={t} onGenerate={onGenerate} />);
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent.includes('fm.action.generate_file'));
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onGenerate).toHaveBeenCalled();
  });

  it('shows file info when file exists', () => {
    const decl = {
      file: { name: '303_T2_2026.txt', size: '1.2 KB', generatedAt: '2026-06-01' },
    };
    render(<FilesTab decl={decl} t={t} onGenerate={vi.fn()} />);
    expect(document.body.textContent).toContain('303_T2_2026.txt');
  });

  it('uses custom genLabel when provided', () => {
    render(<FilesTab decl={{ file: null }} t={t} onGenerate={vi.fn()} genLabel="Custom Label" />);
    expect(document.body.textContent).toContain('Custom Label');
  });
});

// ── HistoryTab ──────────────────────────────────────────────────────────────

describe('HistoryTab', () => {
  it('shows empty state when no history', () => {
    render(<HistoryTab decl={{ history: [] }} t={t} />);
    expect(document.body.textContent).toContain('fm.list.empty');
  });

  it('renders timeline events', () => {
    const decl = {
      history: [
        { at: '2026-01-10', text: 'Created draft', who: 'admin', icon: '+' },
        { at: '2026-01-15', text: 'Submitted', who: 'admin', icon: '>' },
      ],
    };
    render(<HistoryTab decl={decl} t={t} />);
    expect(document.body.textContent).toContain('Created draft');
    expect(document.body.textContent).toContain('Submitted');
  });
});
