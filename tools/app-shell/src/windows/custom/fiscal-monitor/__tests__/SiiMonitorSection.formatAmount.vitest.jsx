// Real formatAmount() coverage for SiiMonitorSection — the main
// SiiMonitorSection.vitest.jsx suite mocks '@/lib/formatAmount.js' as a
// passthrough (String(v)) for every test there, so it never exercises the real
// implementation. This file deliberately does NOT mock it, to catch the
// missing-grouping / hardcoded-locale bug at this consumer too.

const stableApiFetch = vi.fn();
const stableSetSelectedIds = vi.fn();
const stableToggleAll = vi.fn();
const stableToggleRow = vi.fn();
const stableSelectedIds = new Set();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => stableApiFetch }));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('lucide-react', () => ({ FileUp: () => null, FileDown: () => null }));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => {})} />,
}));
vi.mock('../FmPrimitives.jsx', () => ({
  StatusPill: ({ estado }) => <span data-testid="status-pill">{estado}</span>,
  NumFactura: ({ n }) => <span>{n}</span>,
  ScrollSentinel: () => null,
  isErrorStatus: () => false,
  isPendingStatus: () => false,
  fmtDate: (d) => d ?? '',
  PAGE_SIZE: 20,
  ExportIcon: () => <span>export</span>,
  useFmSelection: () => ({
    selectedIds: stableSelectedIds,
    setSelectedIds: stableSetSelectedIds,
    handleToggleAll: stableToggleAll,
    handleToggleRow: stableToggleRow,
  }),
  selectedRowClassName: (selectedIds, id) => (selectedIds.has(id) ? 'fm-row--selected' : undefined),
}));
vi.mock('../useFiscalMonitor.js', () => ({
  SII_SPEC: 'sii-monitor',
  SII_EMITIDAS_ENTITY: 'issuedInvoices',
  SII_RECIBIDAS_ENTITY: 'receivedInvoices',
  SII_EMITIDAS_ANT_ENTITY: 'issuedInvoices(previousPeriod)',
  SII_RECIBIDAS_ANT_ENTITY: 'receivedInvoices(previousPeriod)',
}));

import { render, screen, waitFor } from '@testing-library/react';
import SiiMonitorSection from '../SiiMonitorSection.jsx';

const baseProps = {
  orgId: 'org-1',
  apiBaseUrl: '/sws/neo/sii-monitor',
  parentId: 'parent-1',
  kpis: { sii: { issued: 3, received: 2, issuedPrevious: 1, receivedPrevious: 0 } },
};

describe('SiiMonitorSection — real formatAmount (grouping/locale)', () => {
  it('groups thousands and formats in es-ES, never en-US, for the grandTotalAmount column', async () => {
    stableApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [{ id: 'inv-1', documentNo: '10000001', grandTotalAmount: 1355.2, 'currency$_identifier': 'EUR' }],
          totalRows: 1,
        },
      }),
    });

    render(<SiiMonitorSection {...baseProps} />);

    await waitFor(() => expect(screen.getByText('10000001')).toBeInTheDocument());
    expect(screen.getByText('1.355,20 €')).toBeInTheDocument();
    expect(screen.queryByText('1,355.20 €')).toBeNull();
  });
});
