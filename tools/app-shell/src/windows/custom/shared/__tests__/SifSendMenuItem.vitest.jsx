// @covers tools/app-shell/src/windows/custom/shared/SifSendMenuItem.jsx
// @covers tools/app-shell/src/windows/custom/shared/SifSendModalHost.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

import SifSendMenuItem from '../SifSendMenuItem.jsx';
import SifSendModalHost from '../SifSendModalHost.jsx';

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
});
