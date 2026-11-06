// @covers artifacts/remittance/generated/web/remittance/RemittancePage.jsx
//
// Guards what the generated remittance page hands to the shared views — the header processes
// («Procesar» / «Reactivar»), the custom slots and the «Todas / Cobros / Pagos» list tabs — as
// declared in artifacts/remittance/decisions.json. ListView and DetailView are captured stubs;
// the process visibility and routing are run through DetailView's real helpers
// (evalDisplayLogicRaw / dispatchProcessAction), with the same two filters DetailView applies
// (displayLogicRaw, then requiresLines).
let mockTier = 'full';
const mockCaptured = {};

vi.mock('@/components/contract-ui/ListView.jsx', () => ({
  ListView: (props) => { mockCaptured.list = props; return <div data-testid="list-view" />; },
}));
vi.mock('@/components/contract-ui/DetailView.jsx', () => ({
  DetailView: (props) => {
    mockCaptured.detail = props;
    return <div data-testid="detail-view">{props.headerContent?.({ id: 'rem-1', remittanceStatus: 'PE' })}</div>;
  },
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useWindowAccess: () => mockTier,
  WindowAccessGuard: () => <div data-testid="window-access-guard" />,
}));
vi.mock('@/components/attachments', () => ({ AttachmentsTab: () => null }));
vi.mock('@generated/remittance/generated/web/remittance/RemittanceTable', () => ({ default: () => null }));
vi.mock('@generated/remittance/generated/web/remittance/RemittanceForm', () => ({ default: () => null }));
vi.mock('@generated/remittance/generated/web/remittance/LinesTable', () => ({ default: () => null }));
vi.mock('@generated/remittance/generated/web/remittance/LinesForm', () => ({ default: () => null }));
vi.mock('@generated/remittance/custom/RemittanceBottomPanel', () => ({ default: function MockBottomPanel() { return null; } }));
vi.mock('@generated/remittance/custom/RemittanceProcessConfirmModal', () => ({ default: function MockConfirmModal() { return null; } }));
vi.mock('@generated/remittance/custom/RemittanceStatusBanner', () => ({
  default: ({ data }) => <div data-testid="status-banner-stub" data-status={data?.remittanceStatus} />,
}));

import { render, screen } from '@testing-library/react';
import RemittancePage from '@generated/remittance/generated/web/remittance/RemittancePage.jsx';
import RemittanceBottomPanel from '@generated/remittance/custom/RemittanceBottomPanel';
import RemittanceProcessConfirmModal from '@generated/remittance/custom/RemittanceProcessConfirmModal';
import { evalDisplayLogicRaw, dispatchProcessAction } from '@/components/contract-ui/detailViewHelpers.jsx';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

const LOCALES = [['en_US', enUS], ['es_ES', esES], ['es_AR', esAR]];

beforeEach(() => {
  mockTier = 'full';
  delete mockCaptured.list;
  delete mockCaptured.detail;
});

function detailProps() {
  render(<RemittancePage windowName="remittance" recordId="rem-1" />);
  return mockCaptured.detail;
}

function listProps() {
  render(<RemittancePage windowName="remittance" />);
  return mockCaptured.list;
}

// DetailView's process filter (DetailView.jsx, process buttons): the display logic first, then
// `requiresLines` against the loaded lines.
const visibleProcessNames = (processes, data, lines) => processes
  .filter((p) => (p.displayLogicRaw ? evalDisplayLogicRaw(p.displayLogicRaw, data) : true))
  .filter((p) => !p.requiresLines || lines.length > 0)
  .map((p) => p.name);

const ONE_LINE = [{ id: 'line-1' }];

describe('RemittancePage — header processes', () => {
  it('declares exactly «process» and «reactivate»', () => {
    expect(detailProps().processes.map((p) => p.name)).toEqual(['process', 'reactivate']);
  });

  it.each([
    ['a pending remittance with lines', { processed: false }, ONE_LINE, ['process']],
    ['a pending remittance (Y/N) with lines', { processed: 'N' }, ONE_LINE, ['process']],
    ['a pending remittance without lines', { processed: false }, [], []],
    ['a processed remittance with lines', { processed: true }, ONE_LINE, ['reactivate']],
    ['a processed remittance (Y/N) with lines', { processed: 'Y' }, ONE_LINE, ['reactivate']],
    ['a processed remittance without lines', { processed: true }, [], ['reactivate']],
  ])('on %s shows %#', (_label, data, lines, expected) => {
    const { processes } = detailProps();
    expect(visibleProcessNames(processes, { id: 'rem-1', ...data }, lines)).toEqual(expected);
  });

  it('«process» is the primary action and asks for the grouping, default P', () => {
    const process = detailProps().processes.find((p) => p.name === 'process');
    expect(process.style).toBe('positive');
    expect(process.requiresLines).toBe(true);
    expect(process.params).toEqual([{
      key: 'grouping',
      type: 'select',
      label: 'remittanceGrouping',
      required: true,
      defaultValue: 'P',
      options: [
        { value: 'P', label: 'remittanceGroupingNone' },
        { value: 'GGPD', label: 'remittanceGroupingByBpAndDueDate' },
      ],
    }]);
  });

  it('«process» opens the parameter dialog, not the confirmation and not a direct run', () => {
    const { processes, processConfirmModal } = detailProps();
    const ctx = { processConfirmModal, setConfirmProcess: vi.fn(), setParamDialogProcess: vi.fn(), handleProcess: vi.fn() };
    const process = processes.find((p) => p.name === 'process');
    dispatchProcessAction(process, ctx);
    expect(ctx.setParamDialogProcess).toHaveBeenCalledWith(process);
    expect(ctx.setConfirmProcess).not.toHaveBeenCalled();
    expect(ctx.handleProcess).not.toHaveBeenCalled();
  });

  it('«reactivate» is a danger action routed to the window’s confirmation modal', () => {
    const { processes, processConfirmModal } = detailProps();
    const reactivate = processes.find((p) => p.name === 'reactivate');
    expect(reactivate.style).toBe('primary-danger');
    expect(reactivate.params).toBeUndefined();
    const ctx = { processConfirmModal, setConfirmProcess: vi.fn(), setParamDialogProcess: vi.fn(), handleProcess: vi.fn() };
    dispatchProcessAction(reactivate, ctx);
    expect(ctx.setConfirmProcess).toHaveBeenCalledWith(reactivate);
    expect(ctx.setParamDialogProcess).not.toHaveBeenCalled();
    expect(ctx.handleProcess).not.toHaveBeenCalled();
  });

  it.each(LOCALES)('every process and parameter label is translated in %s', (_loc, json) => {
    const keys = ['process', 'reactivate', 'remittanceGrouping', 'remittanceGroupingNone', 'remittanceGroupingByBpAndDueDate',
      'remittanceReactivateConfirmTitle', 'remittanceReactivateConfirmBody'];
    for (const key of keys) expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
  });
});

describe('RemittancePage — detail slots', () => {
  it('wires the bottom panel, the confirmation modal and the status banner', () => {
    const props = detailProps();
    expect(props.bottomSection).toBe(RemittanceBottomPanel);
    expect(props.processConfirmModal).toBe(RemittanceProcessConfirmModal);
    expect(screen.getByTestId('status-banner-stub')).toHaveAttribute('data-status', 'PE');
  });

  it('orders the lines by line number and titles the record by its name', () => {
    const props = detailProps();
    expect(props.detailSortBy).toBe('lineNo asc');
    expect(props.titleField).toBe('name');
    expect(props.statusField).toBe('remittanceStatus');
  });

  it('marks the window read-only for a read-only access tier', () => {
    mockTier = 'read-only';
    expect(detailProps().window).toEqual({ readOnly: true });
  });

  it('renders the access guard instead of the views when access is none', () => {
    mockTier = 'none';
    render(<RemittancePage windowName="remittance" recordId="rem-1" />);
    expect(screen.getByTestId('window-access-guard')).toBeInTheDocument();
    expect(mockCaptured.detail).toBeUndefined();
  });
});

describe('RemittancePage — «Todas / Cobros / Pagos» list tabs', () => {
  const criteriaOf = (subset) => (subset.filter
    ? JSON.parse(new URLSearchParams(subset.filter).get('criteria'))
    : null);

  it('offers the three tabs in order, «Todas» first (the default) and unfiltered', () => {
    const { subsetFilters } = listProps();
    expect(subsetFilters.map((s) => s.label)).toEqual(['remittanceTabAll', 'remittanceTabCollections', 'remittanceTabPayments']);
    expect(subsetFilters[0].filter).toBeUndefined();
  });

  it('«Cobros» filters on the payment method allowing pay-ins, with a real boolean', () => {
    const collections = listProps().subsetFilters.find((s) => s.label === 'remittanceTabCollections');
    expect(criteriaOf(collections)).toEqual([
      { fieldName: 'remittanceType$paymentMethod$payinAllow', operator: 'equals', value: true },
    ]);
  });

  it('«Pagos» filters on the payment method allowing pay-outs, with a real boolean', () => {
    const payments = listProps().subsetFilters.find((s) => s.label === 'remittanceTabPayments');
    expect(criteriaOf(payments)).toEqual([
      { fieldName: 'remittanceType$paymentMethod$payoutAllow', operator: 'equals', value: true },
    ]);
  });

  it('sends the criteria as a single URL-encoded `criteria` parameter', () => {
    for (const subset of listProps().subsetFilters.filter((s) => s.filter)) {
      expect([...new URLSearchParams(subset.filter).keys()]).toEqual(['criteria']);
    }
  });

  it('sorts the list by transaction date, newest first', () => {
    expect(listProps().listSortBy).toBe('transactionDate desc');
  });

  it.each(LOCALES)('every tab label is translated in %s', (_loc, json) => {
    for (const key of ['remittanceTabAll', 'remittanceTabCollections', 'remittanceTabPayments']) {
      expect(json.genericLabels[key], key).toEqual(expect.stringMatching(/\S/));
    }
  });
});
