import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useFiscalConfigMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/windows/custom/fiscal-config/useFiscalConfig.js', () => ({
  useFiscalConfig: (...args) => useFiscalConfigMock(...args),
}));

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ selectedOrg: { id: 'ORG_1' }, token: 'tok', logout: () => {} }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => (path, options = {}) => global.fetch(`${base}${path}`, options),
}));

import SendToSifButton from '../SendToSifButton.jsx';

function renderButton(overrides = {}) {
  const defaults = {
    data: {
      aeatsiiIssent: false,
      tbaiIssent: false,
    },
    recordId: 'INV_1',
    apiBaseUrl: '/sws/neo/sales-invoice',
    status: 'CO',
  };
  return render(<SendToSifButton {...defaults} {...overrides} />);
}

describe('SendToSifButton', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReturnValue({ profile: 'sii+tbai' });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders for completed invoices with pending fiscal targets', async () => {
    renderButton();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'sendToSif' })).toBeInTheDocument();
    });
  });

  it('does not render for completed invoices when all targets were already sent', () => {
    renderButton({
      data: { aeatsiiIssent: true, tbaiIssent: true },
    });
    expect(screen.queryByRole('button', { name: 'sendToSif' })).not.toBeInTheDocument();
  });

  it('shows the combined confirmation copy when both SII and TBAI are pending', () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
    expect(screen.getByText('sendToSifBodyBoth')).toBeInTheDocument();
  });

  it('renders the modal with dialog semantics', () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
    expect(screen.getByRole('dialog', { name: 'sendToSifTitle' })).toBeInTheDocument();
  });

  it('supports partial retry by calling only the failed target endpoint', async () => {
    renderButton({
      data: { aeatsiiIssent: true, tbaiIssent: false },
    });

    fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
    expect(screen.getByText('sendToSifBodyTbai')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/sws/neo/sales-invoice/header/INV_1/action/Em_Tbai_Xmlgenerator',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('dispatches the invoice-updated event only after the user closes the results modal', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderButton({
      data: { aeatsiiIssent: true, tbaiIssent: false },
    });

    fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await screen.findByText('sendToSifSuccessTbai');

    // The event must NOT be dispatched while results are still showing
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sales-invoice:invoice-updated' }),
    );

    // Close the modal — NOW the event fires
    fireEvent.click(screen.getByRole('button', { name: 'close' }));

    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sales-invoice:invoice-updated',
      detail: { invoiceId: 'INV_1' },
    }));
  });

  it('shows per-target results when one send fails and the other succeeds', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'SII failed' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
    fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

    await screen.findByText('SII failed');
    expect(screen.getByText('sendToSifSuccessTbai')).toBeInTheDocument();
  });
});
