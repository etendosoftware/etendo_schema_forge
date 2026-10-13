// @covers tools/app-shell/src/windows/custom/shared/SifSendMenuItem.jsx
// @covers tools/app-shell/src/windows/custom/shared/SifSendModalHost.jsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const useFiscalConfigMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG_1' }, token: 'tok', logout: () => {} }),
}));

const apiFetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => apiFetchMock,
}));

import SifSendMenuItem from '../SifSendMenuItem.jsx';
import SifSendModalHost from '../SifSendModalHost.jsx';
import { requestSifSendModal } from '../sifSending.js';

const COMPLETED_INVOICE = {
  id: 'INV_85',
  documentStatus: 'CO',
  processed: 'Y',
  aeatsiiIssent: false,
  accountingDate: '2026-10-09',
  invoiceDate: '2026-10-09',
};

describe('SifSendMenuItem — form kebab entry (ETP-5700)', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReturnValue({
      profile: 'sii',
      tbaiRecord: null,
      earliestSiiCutoverDate: '2026-10-09',
      earliestTbaiCutoverDate: null,
    });
  });

  // Repro: the kebab entry used to ask the topbar SendToSifButton to open the modal.
  // On a completed invoice that button is not rendered, so the click did nothing.
  it('opens the send modal when the topbar SendToSifButton is NOT rendered', () => {
    const onClose = vi.fn();
    render(
      <>
        <SifSendModalHost apiBaseUrl="/sws/neo/sales-invoice" recordId="INV_85" data-testid="host" />
        <SifSendMenuItem
          data={COMPLETED_INVOICE}
          recordId="INV_85"
          apiBaseUrl="/sws/neo/sales-invoice"
          onClose={onClose}
          data-testid="item" />
      </>,
    );

    fireEvent.click(screen.getByTestId('menu-action-sendToSif'));

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'sendToSifTitle' })).toBeInTheDocument();
    expect(screen.getByText('sendToSifBodySii')).toBeInTheDocument();
  });

  it('keeps the modal open after the menu content unmounts (the kebab closes on click)', () => {
    const { rerender } = render(
      <>
        <SifSendModalHost apiBaseUrl="/sws/neo/sales-invoice" recordId="INV_85" data-testid="host" />
        <SifSendMenuItem
          data={COMPLETED_INVOICE}
          recordId="INV_85"
          apiBaseUrl="/sws/neo/sales-invoice"
          onClose={() => {}}
          data-testid="item" />
      </>,
    );
    fireEvent.click(screen.getByTestId('menu-action-sendToSif'));

    rerender(<SifSendModalHost apiBaseUrl="/sws/neo/sales-invoice" recordId="INV_85" data-testid="host" />);

    expect(screen.getByRole('dialog', { name: 'sendToSifTitle' })).toBeInTheDocument();
  });

  it('labels the entry with the pending system', () => {
    render(
      <SifSendMenuItem
        data={COMPLETED_INVOICE}
        recordId="INV_85"
        apiBaseUrl="/sws/neo/sales-invoice"
        onClose={() => {}}
        data-testid="item" />,
    );
    expect(screen.getByTestId('menu-action-sendToSif')).toHaveTextContent('sendToSifLabelSii');
  });

  it('renders nothing when the invoice is not completed', () => {
    render(
      <SifSendMenuItem
        data={{ ...COMPLETED_INVOICE, documentStatus: 'DR', processed: 'N' }}
        recordId="INV_85"
        apiBaseUrl="/sws/neo/sales-invoice"
        onClose={() => {}}
        data-testid="item" />,
    );
    expect(screen.queryByTestId('menu-action-sendToSif')).not.toBeInTheDocument();
  });
  it('renders nothing for a voided invoice even with SII pending', () => {
    render(
      <SifSendMenuItem
        data={{ ...COMPLETED_INVOICE, documentStatus: 'VO' }}
        recordId="INV_85"
        apiBaseUrl="/sws/neo/sales-invoice"
        onClose={() => {}}
        data-testid="item" />,
    );
    expect(screen.queryByTestId('menu-action-sendToSif')).not.toBeInTheDocument();
  });

  it('renders nothing for a completed invoice already sent to SII', () => {
    render(
      <SifSendMenuItem
        data={{ ...COMPLETED_INVOICE, aeatsiiIssent: 'Y' }}
        recordId="INV_85"
        apiBaseUrl="/sws/neo/sales-invoice"
        onClose={() => {}}
        data-testid="item" />,
    );
    expect(screen.queryByTestId('menu-action-sendToSif')).not.toBeInTheDocument();
  });

  it('renders nothing for a completed invoice dated before the adoption date', () => {
    render(
      <SifSendMenuItem
        data={{ ...COMPLETED_INVOICE, accountingDate: '2026-10-08' }}
        recordId="INV_85"
        apiBaseUrl="/sws/neo/sales-invoice"
        onClose={() => {}}
        data-testid="item" />,
    );
    expect(screen.queryByTestId('menu-action-sendToSif')).not.toBeInTheDocument();
  });
});

describe('SifSendModalHost — send request handling', () => {
  const SPEC = 'sales-invoice';
  const SII_ONLY = { sendSii: true, sendTbai: false };
  let updates;
  const onUpdated = (e) => updates.push(e.detail);

  beforeEach(() => {
    updates = [];
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    window.addEventListener(`${SPEC}:invoice-updated`, onUpdated);
  });

  afterEach(() => {
    window.removeEventListener(`${SPEC}:invoice-updated`, onUpdated);
  });

  function renderHost(recordId = 'INV_85') {
    return render(<SifSendModalHost apiBaseUrl={`/sws/neo/${SPEC}`} recordId={recordId} data-testid="host" />);
  }

  function request(specName, recordId, pendingTargets) {
    act(() => { requestSifSendModal(specName, recordId, pendingTargets); });
  }

  it('fires invoice-updated with the invoice id after a successful send and close', async () => {
    renderHost();
    request(SPEC, 'INV_85', SII_ONLY);
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));
    await screen.findByText('sendToSifSuccessSii', {}, { timeout: 3000 });
    expect(updates).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(updates).toEqual([{ invoiceId: 'INV_85' }]);
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/sales-invoice/header/INV_85/action/Em_aeatsii_send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not fire invoice-updated after a failed send', async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve({
      ok: false, status: 500, json: () => Promise.resolve({ message: 'AEAT down' }),
    }));
    renderHost();
    request(SPEC, 'INV_85', SII_ONLY);
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));
    await screen.findByText('AEAT down', {}, { timeout: 3000 });

    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(updates).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not fire invoice-updated when closed without sending', () => {
    renderHost();
    request(SPEC, 'INV_85', SII_ONLY);
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

    expect(updates).toEqual([]);
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a request for another record', () => {
    renderHost();
    request(SPEC, 'INV_OTHER', SII_ONLY);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a request for another window spec', () => {
    renderHost();
    request('purchase-invoice', 'INV_85', SII_ONLY);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a request with no pending targets', () => {
    renderHost();
    request(SPEC, 'INV_85', { sendSii: false, sendTbai: false });
    request(SPEC, 'INV_85', undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens for a request addressed to its record and spec', () => {
    renderHost();
    request(SPEC, 'INV_85', SII_ONLY);
    expect(screen.getByRole('dialog', { name: 'sendToSifTitle' })).toBeInTheDocument();
  });
});
