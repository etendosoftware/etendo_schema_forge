// ETP-5393 Bug A — SourcesTab must key each row by the invoice's own id, not by `ref`
// (documentno). AR and AP invoice numbering sequences are independent, so two different
// invoices (one sales, one purchase) can legitimately share the same documentno — confirmed
// live in org "Pruebas Localizacion": both REC-1000000. Keying by `ref` alone produced a
// genuine React duplicate-key warning. `FmTabContent.jsx` line ~93 now keys on `r.id ?? r.ref`.
//
// React does not expose the `key` prop to test assertions directly, so this test proves the
// fix behaviorally: rendering two rows that share the same `ref` but have distinct `id`s must
// NOT trigger React's "two children with the same key" console.error, and both rows must be
// present in the rendered output (a collision would have silently dropped one row instead).
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';

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

import { render, screen } from '@testing-library/react';
import { SourcesTab } from '../FmTabContent.jsx';

const t = (key) => key;

describe('SourcesTab — row key collision (ETP-5393 Bug A)', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('does not warn about duplicate keys when two invoices share the same documentno', () => {
    const decl = {
      sources: [
        {
          id: 'AR-INVOICE-ID-1', ref: 'REC-1000000', date: '2026-09-01', type: 'Venta',
          party: 'Cliente A', base: 1000, vat: 210, total: 1210, boxes: '07',
        },
        {
          id: 'AP-INVOICE-ID-2', ref: 'REC-1000000', date: '2026-09-02', type: 'Compra',
          party: 'Proveedor B', base: 500, vat: 105, total: 605, boxes: '33',
        },
      ],
      incidents: { items: [] },
    };

    render(<SourcesTab decl={decl} t={t} />);

    const duplicateKeyWarning = errorSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('same key'),
    );
    expect(duplicateKeyWarning).toBe(false);

    // Both rows must render — a key collision silently drops one row from the DOM.
    expect(screen.getAllByText('Cliente A').length).toBe(1);
    expect(screen.getAllByText('Proveedor B').length).toBe(1);
  });

  it('falls back to `ref` as key when a row has no id (backend not yet redeployed)', () => {
    const decl = {
      sources: [
        { ref: 'REC-9999999', date: '2026-09-01', type: 'Venta', party: 'Solo', base: 0, total: 0, boxes: '' },
      ],
      incidents: { items: [] },
    };

    render(<SourcesTab decl={decl} t={t} />);

    expect(screen.getByText('Solo')).toBeTruthy();
  });
});
