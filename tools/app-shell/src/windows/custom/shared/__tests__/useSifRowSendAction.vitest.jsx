// @covers tools/app-shell/src/windows/custom/shared/useSifRowSendAction.jsx
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const useFiscalConfigMock = vi.fn();

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG_1' } }),
}));

// Stub the modal: what matters here is which record/targets it is opened for and
// what the hook does with its onAfterSend / onClose callbacks.
vi.mock('../SifSendingModal.jsx', () => ({
  default: ({ pendingTargets, bodyKey, base, specName, recordId, onClose, onAfterSend }) => (
    <div
      data-testid="sif-modal"
      data-record={recordId}
      data-body={bodyKey}
      data-base={base}
      data-spec={specName}
      data-sii={String(pendingTargets.sendSii)}
      data-tbai={String(pendingTargets.sendTbai)}>
      <button type="button" data-testid="sif-modal-ok" onClick={() => onAfterSend({ sii: { ok: true } })} />
      <button type="button" data-testid="sif-modal-ko" onClick={() => onAfterSend({ sii: { ok: false } })} />
      <button type="button" data-testid="sif-modal-close" onClick={onClose} />
    </div>
  ),
}));

import { buildSifRowMenuAction, useSifRowSendAction } from '../useSifRowSendAction.jsx';

const SII_CONFIG = {
  profile: 'sii',
  tbaiRecord: null,
  earliestSiiCutoverDate: '2026-10-09',
  earliestTbaiCutoverDate: null,
};

const BOTH_CONFIG = {
  profile: 'sii+tbai',
  tbaiRecord: { etsgSifTerritory: 'BIZKAIA', tbaisystemdate: '2026-10-09' },
  earliestSiiCutoverDate: '2026-10-09',
  earliestTbaiCutoverDate: '2026-10-09',
};

const TBAI_CONFIG = {
  profile: 'tbai',
  tbaiRecord: { etsgSifTerritory: 'BIZKAIA', tbaisystemdate: '2026-10-09' },
  earliestSiiCutoverDate: null,
  earliestTbaiCutoverDate: '2026-10-09',
};

const ROW = {
  id: 'INV_1',
  documentStatus: 'CO',
  accountingDate: '2026-10-09',
  invoiceDate: '2026-10-09',
  aeatsiiIssent: false,
  tbaiIssent: false,
};

function build(overrides = {}) {
  return buildSifRowMenuAction({
    row: ROW,
    specName: 'sales-invoice',
    fiscalConfig: SII_CONFIG,
    onSend: vi.fn(),
    ...overrides,
  });
}

describe('buildSifRowMenuAction — gate', () => {
  it('returns null when the document is not completed', () => {
    expect(build({ row: { ...ROW, documentStatus: 'DR' } })).toBeNull();
  });

  it('returns null for a voided document even with SII pending', () => {
    expect(build({ row: { ...ROW, documentStatus: 'VO' } })).toBeNull();
  });

  it('returns null when the row has no id', () => {
    expect(build({ row: { ...ROW, id: undefined } })).toBeNull();
  });

  it('returns null for a missing row', () => {
    expect(build({ row: undefined })).toBeNull();
  });

  it('returns null when SII is already sent', () => {
    expect(build({ row: { ...ROW, aeatsiiIssent: 'Y' } })).toBeNull();
  });

  it('returns null when both SII and TBAI are already sent', () => {
    expect(build({ fiscalConfig: BOTH_CONFIG, row: { ...ROW, aeatsiiIssent: true, tbaiIssent: true } })).toBeNull();
  });

  it('returns null when the document predates the adoption date', () => {
    expect(build({ row: { ...ROW, accountingDate: '2026-10-08' } })).toBeNull();
  });

  it('returns null when there is no fiscal config at all', () => {
    expect(build({ fiscalConfig: undefined })).toBeNull();
  });

  it('offers the send on the adoption day itself', () => {
    expect(build()).not.toBeNull();
  });
});

describe('buildSifRowMenuAction — label key', () => {
  it.each([
    ['sales-invoice', 'sii', 'sendToSifLabelSii'],
    ['sales-invoice', 'tbai', 'sendToSifLabelTbai'],
    ['sales-invoice', 'sii+tbai', 'sendToSifLabelBoth'],
    ['purchase-invoice', 'sii', 'sendToSifLabelSii'],
    ['purchase-invoice', 'tbai', 'sendToSifLabelTbaiPurchase'],
    ['purchase-invoice', 'sii+tbai', 'sendToSifLabelBothPurchase'],
  ])('%s with profile %s -> %s', (specName, profile, labelKey) => {
    const fiscalConfig = { sii: SII_CONFIG, tbai: TBAI_CONFIG, 'sii+tbai': BOTH_CONFIG }[profile];
    const action = build({ specName, fiscalConfig });
    expect(action).toMatchObject({ key: 'sendToSif', labelKey });
  });

  it('names only SII when TBAI was already sent', () => {
    expect(build({ fiscalConfig: BOTH_CONFIG, row: { ...ROW, tbaiIssent: 'Y' } }).labelKey).toBe('sendToSifLabelSii');
  });

  it('offers no TBAI on a purchase invoice outside Bizkaia', () => {
    const fiscalConfig = { ...TBAI_CONFIG, tbaiRecord: { etsgSifTerritory: 'GIPUZKOA', tbaisystemdate: '2026-10-09' } };
    expect(build({ specName: 'purchase-invoice', fiscalConfig })).toBeNull();
  });
});

describe('buildSifRowMenuAction — onClick', () => {
  it('hands the row and its pending targets to onSend and reports success', () => {
    const onSend = vi.fn();
    const action = build({ fiscalConfig: BOTH_CONFIG, onSend });
    expect(action.onClick()).toEqual({ success: true });
    expect(onSend).toHaveBeenCalledWith(ROW, { sendSii: true, sendTbai: true });
  });
});

describe('useSifRowSendAction', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReset();
    useFiscalConfigMock.mockReturnValue(SII_CONFIG);
  });

  it('loads the fiscal config of the selected org', () => {
    renderHook(() => useSifRowSendAction({ specName: 'sales-invoice', apiBaseUrl: '/sws/neo/sales-invoice' }));
    expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG_1', '/sws/neo/sales-invoice');
  });

  it('skips the fiscal-config fetch when loadConfig is false', () => {
    renderHook(() => useSifRowSendAction({
      specName: 'sales-invoice', apiBaseUrl: '/sws/neo/sales-invoice', loadConfig: false,
    }));
    expect(useFiscalConfigMock).toHaveBeenCalledWith(null, '/sws/neo/sales-invoice');
  });

  it('returns no menu action when disabled (read-only tier)', () => {
    const { result } = renderHook(() => useSifRowSendAction({
      specName: 'sales-invoice', apiBaseUrl: '/sws/neo/sales-invoice', enabled: false,
    }));
    expect(result.current.sifMenuActions(ROW)).toBeNull();
  });

  it('returns no menu action for a row with nothing pending', () => {
    const { result } = renderHook(() => useSifRowSendAction({
      specName: 'sales-invoice', apiBaseUrl: '/sws/neo/sales-invoice',
    }));
    expect(result.current.sifMenuActions({ ...ROW, aeatsiiIssent: true })).toBeNull();
  });

  it('renders no modal until an entry is clicked', () => {
    const { result } = renderHook(() => useSifRowSendAction({
      specName: 'sales-invoice', apiBaseUrl: '/sws/neo/sales-invoice',
    }));
    expect(result.current.sifModal).toBeNull();
  });

  function Harness({ onRefresh, specName = 'sales-invoice' }) {
    const { sifMenuActions, sifModal } = useSifRowSendAction({
      specName, apiBaseUrl: `/sws/neo/${specName}`, onRefresh,
    });
    const action = sifMenuActions(ROW);
    return (
      <>
        {action && (
          <button type="button" data-testid="row-send" onClick={() => action.onClick()}>{action.labelKey}</button>
        )}
        {sifModal}
      </>
    );
  }

  it('opens the modal for the clicked row with its targets, body and base', () => {
    useFiscalConfigMock.mockReturnValue(BOTH_CONFIG);
    render(<Harness specName="purchase-invoice" />);
    expect(screen.getByTestId('row-send')).toHaveTextContent('sendToSifLabelBothPurchase');

    fireEvent.click(screen.getByTestId('row-send'));

    const modal = screen.getByTestId('sif-modal');
    expect(modal).toHaveAttribute('data-record', 'INV_1');
    expect(modal).toHaveAttribute('data-spec', 'purchase-invoice');
    expect(modal).toHaveAttribute('data-body', 'sendToSifBodyBothPurchase');
    expect(modal).toHaveAttribute('data-base', '/sws/neo');
    expect(modal).toHaveAttribute('data-sii', 'true');
    expect(modal).toHaveAttribute('data-tbai', 'true');
  });

  it('refreshes the list on close after a successful send', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId('row-send'));
    fireEvent.click(screen.getByTestId('sif-modal-ok'));
    expect(onRefresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('sif-modal-close'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sif-modal')).not.toBeInTheDocument();
  });

  it('does not refresh the list when the send failed', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId('row-send'));
    fireEvent.click(screen.getByTestId('sif-modal-ko'));
    fireEvent.click(screen.getByTestId('sif-modal-close'));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh the list when the modal is closed without sending', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId('row-send'));
    fireEvent.click(screen.getByTestId('sif-modal-close'));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not carry a previous success over to the next opening', () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    fireEvent.click(screen.getByTestId('row-send'));
    fireEvent.click(screen.getByTestId('sif-modal-ok'));
    fireEvent.click(screen.getByTestId('sif-modal-close'));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => { fireEvent.click(screen.getByTestId('row-send')); });
    fireEvent.click(screen.getByTestId('sif-modal-close'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
