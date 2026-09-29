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
      invoiceDate: '2026-06-15',
      // ETP-5432 #3: SII books by accountingDate, not invoiceDate — see
      // sifSending.js's getPendingSifTargets. Mirrors invoiceDate here so
      // pre-existing tests (written before this gate existed) keep passing.
      accountingDate: '2026-06-15',
    },
    recordId: 'INV_1',
    apiBaseUrl: '/sws/neo/sales-invoice',
    status: 'CO',
  };
  return render(<SendToSifButton {...defaults} {...overrides} />);
}

describe('SendToSifButton', () => {
  beforeEach(() => {
    useFiscalConfigMock.mockReturnValue({
      profile: 'sii+tbai',
      // Far-past adoption/cutover dates + Bizkaia territory: no gate interferes
      // by default, so pre-existing tests (written before any of these gates
      // existed) keep passing. Tests exercising a gate override this explicitly.
      tbaiRecord: { tbaisystemdate: '2020-01-01T00:00:00.000Z', etsgSifTerritory: 'BIZKAIA' },
      earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
    });
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when isDocumentReadOnly is true, even with pending SII/TBAI targets (ETP-5205)', () => {
    renderButton({ isDocumentReadOnly: true });
    expect(screen.queryByRole('button', { name: 'sendToSif' })).not.toBeInTheDocument();
  });

  it('regression: renders when isDocumentReadOnly is false/absent (existing behavior)', () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'sendToSif' })).toBeInTheDocument();
  });

  it('renders for completed invoices with pending fiscal targets', async () => {
    renderButton();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'sendToSif' })).toBeInTheDocument();
    });
  });

  it('does not render for completed invoices when all targets were already sent', () => {
    renderButton({
      data: { aeatsiiIssent: true, tbaiIssent: true, invoiceDate: '2026-06-15' },
    });
    expect(screen.queryByRole('button', { name: 'sendToSif' })).not.toBeInTheDocument();
  });

  // ETP-5122 — TicketBAI must not be offered on an invoice dated before the
  // org's TBAI adoption date, even though SII may still have a pending target.
  it('does not render at all when the invoice predates TBAI adoption and SII is already sent', () => {
    renderButton({
      data: { aeatsiiIssent: true, tbaiIssent: false, invoiceDate: '2019-06-15' },
    });
    expect(screen.queryByRole('button', { name: 'sendToSif' })).not.toBeInTheDocument();
  });

  it('shows only the SII confirmation copy when the invoice predates TBAI adoption', () => {
    renderButton({
      data: {
        aeatsiiIssent: false, tbaiIssent: false, invoiceDate: '2019-06-15',
        accountingDate: '2019-06-15',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
    expect(screen.getByText('sendToSifBodySii')).toBeInTheDocument();
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
      data: { aeatsiiIssent: true, tbaiIssent: false, invoiceDate: '2026-06-15' },
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
      data: { aeatsiiIssent: true, tbaiIssent: false, invoiceDate: '2026-06-15' },
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

  // ETP-5087: purchase-invoice TBAI eligibility follows the active TBAI config's territory.
  describe('territory gating for purchase invoices (ETP-5087)', () => {
    it('offers TBAI (via the SII+Batuz copy) for a purchase invoice when the TBAI territory is Bizkaia', async () => {
      // ETP-5027: a purchase invoice's TBAI is always Batuz specifically, so the
      // combined-targets copy must be the purchase-specific key, never the
      // generic "SII + TicketBAI" wording sales invoices use.
      useFiscalConfigMock.mockReturnValue({
        profile: 'sii+tbai',
        tbaiRecord: { tbaisystemdate: '2020-01-01T00:00:00.000Z', etsgSifTerritory: 'BIZKAIA' },
        earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
      });
      renderButton({ apiBaseUrl: '/sws/neo/purchase-invoice' });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      expect(screen.getByText('sendToSifBodyBothPurchase')).toBeInTheDocument();
      expect(screen.queryByText('sendToSifBodyBoth')).not.toBeInTheDocument();
    });

    it('only offers SII (never TBAI) for a purchase invoice when the TBAI territory is Alava', async () => {
      useFiscalConfigMock.mockReturnValue({
        profile: 'sii+tbai',
        tbaiRecord: { tbaisystemdate: '2020-01-01T00:00:00.000Z', etsgSifTerritory: 'ARABA' },
        earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
      });
      renderButton({ apiBaseUrl: '/sws/neo/purchase-invoice' });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      expect(screen.getByText('sendToSifBodySii')).toBeInTheDocument();
      expect(screen.queryByText('sendToSifBodyTbai')).not.toBeInTheDocument();
      expect(screen.queryByText('sendToSifBodyBoth')).not.toBeInTheDocument();
    });

    it('does not break when no TBAI config exists (tbaiRecord undefined) — territory falls back to null', async () => {
      useFiscalConfigMock.mockReturnValue({
        profile: 'sii+tbai',
        tbaiRecord: undefined,
        earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
      });
      renderButton({ apiBaseUrl: '/sws/neo/purchase-invoice' });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      expect(screen.getByText('sendToSifBodySii')).toBeInTheDocument();
    });

    // ETP-5122 + ETP-5087 combined: territory and date are independent gates,
    // ANDed together for TBAI.
    it('only offers SII for a Bizkaia purchase invoice dated before the org TBAI adoption date', async () => {
      useFiscalConfigMock.mockReturnValue({
        profile: 'sii+tbai',
        tbaiRecord: { tbaisystemdate: '2026-01-01T00:00:00.000Z', etsgSifTerritory: 'BIZKAIA' },
        earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
      });
      renderButton({
        apiBaseUrl: '/sws/neo/purchase-invoice',
        data: {
          aeatsiiIssent: false, tbaiIssent: false, invoiceDate: '2025-12-31',
          accountingDate: '2025-12-31',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      expect(screen.getByText('sendToSifBodySii')).toBeInTheDocument();
      expect(screen.queryByText('sendToSifBodyBothPurchase')).not.toBeInTheDocument();
    });
  });

  // ETP-5087 follow-up: fiscal config must be keyed by the INVOICE's own org
  // (data.adOrgId), not the top-nav org selector — a mismatch used to silently
  // fetch the wrong TBAI/SII config (and territory).
  describe('org resolution (ETP-5087 follow-up)', () => {
    it('resolves fiscal config using the invoice record adOrgId, not the selected org', () => {
      renderButton({ data: { aeatsiiIssent: false, tbaiIssent: false, adOrgId: 'ORG_INVOICE' } });
      expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG_INVOICE', '/sws/neo/sales-invoice');
    });

    it('falls back to the selected org when the invoice record has no adOrgId (legacy/unrefreshed record)', () => {
      renderButton({ data: { aeatsiiIssent: false, tbaiIssent: false } });
      expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG_1', '/sws/neo/sales-invoice');
    });

    it('still resolves territory/targets correctly when the invoice org differs from the selected org', async () => {
      useFiscalConfigMock.mockReturnValue({
        profile: 'sii+tbai',
        tbaiRecord: { tbaisystemdate: '2020-01-01T00:00:00.000Z', etsgSifTerritory: 'BIZKAIA' },
        earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
      });
      renderButton({
        apiBaseUrl: '/sws/neo/purchase-invoice',
        data: {
          aeatsiiIssent: false, tbaiIssent: false, adOrgId: 'ORG_INVOICE', invoiceDate: '2026-06-15',
          accountingDate: '2026-06-15',
        },
      });
      expect(useFiscalConfigMock).toHaveBeenCalledWith('ORG_INVOICE', '/sws/neo/purchase-invoice');
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      // ETP-5027: purchase-invoice always resolves to the Batuz-specific copy.
      expect(screen.getByText('sendToSifBodyBothPurchase')).toBeInTheDocument();
    });
  });

  // ETP-5272 follow-up: onSave/isDirty must reach SifSendingModal unchanged, so a
  // dirty header is flushed before the SII/TBAI process actions run.
  describe('flushes pending header edits before sending (ETP-5272)', () => {
    it('saves before sending when the header is dirty', async () => {
      const callOrder = [];
      const onSave = vi.fn(async () => {
        callOrder.push('save');
        return { id: 'INV_1' };
      });
      global.fetch = vi.fn(() => {
        callOrder.push('send');
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      // Only SII pending (aeatsiiIssent: true means TBAI is already sent), so a
      // single process action fires and callOrder stays unambiguous.
      renderButton({
        onSave,
        isDirty: true,
        data: {
          aeatsiiIssent: false, tbaiIssent: true, invoiceDate: '2026-06-15',
          accountingDate: '2026-06-15',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['save', 'send']);
    });

    it('does not call onSave when the header is clean', async () => {
      const onSave = vi.fn(async () => ({ id: 'INV_1' }));

      renderButton({
        onSave,
        isDirty: false,
        data: {
          aeatsiiIssent: false, tbaiIssent: true, invoiceDate: '2026-06-15',
          accountingDate: '2026-06-15',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledTimes(1);
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    it('blocks the send and surfaces an error when the save fails', async () => {
      const onSave = vi.fn(async () => null);

      renderButton({ onSave, isDirty: true });
      fireEvent.click(screen.getByRole('button', { name: 'sendToSif' }));
      fireEvent.click(screen.getByRole('button', { name: 'sendToSifConfirm' }));

      await screen.findByText('sendToSifSaveError');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ETP-5432 QA sweep — item #1 (cutover-date consistency across call sites).
  //
  // getPendingSifTargets' SII branch was fixed in THIS ticket (#3) to take
  // `earliestSiiCutoverDate` — the earliest cutover across ALL of the org's config rows,
  // active or deactivated (useFiscalConfig.js's earliestCutoverDate()) — instead of a single
  // row's own date, precisely because an org that changed its SII config ("Change SIF") could
  // otherwise hide a genuinely-eligible older invoice behind the NEW active row's later
  // cutover. The TBAI branch right next to it in the SAME function was never given the
  // equivalent `earliestTbaiCutoverDate` — it still compares against `tbaiRecord?.tbaisystemdate`,
  // i.e. the CURRENTLY ACTIVE tbai_config row's own date (see sifSending.js). useFiscalStatus.js
  // (the invoice-preview badge) already receives and uses `earliestTbaiCutoverDate` correctly,
  // so after a TBAI "Change SIF" the badge and this button can disagree on the same invoice.
  //
  // This test currently FAILS: SendToSifButton.jsx destructures `tbaiRecord` from
  // useFiscalConfig() but never `earliestTbaiCutoverDate`, so getPendingSifTargets has no way
  // to apply the earliest-cutover rule to TBAI. Fix by threading `earliestTbaiCutoverDate`
  // through the same way `earliestSiiCutoverDate` already is.
  it('BUG (ETP-5432 QA): TBAI gate must use the earliest-ever cutover, not the active config row\'s own date', async () => {
    useFiscalConfigMock.mockReturnValue({
      profile: 'sii+tbai',
      // The org changed its TBAI config: the OLD (now inactive) row enrolled it in TBAI back
      // in 2020 (earliestTbaiCutoverDate), but the CURRENTLY ACTIVE row's own tbaisystemdate is
      // much later than this invoice.
      tbaiRecord: { tbaisystemdate: '2026-08-01T00:00:00.000Z', etsgSifTerritory: 'BIZKAIA' },
      earliestTbaiCutoverDate: '2020-01-01T00:00:00.000Z',
      earliestSiiCutoverDate: '2000-01-01T00:00:00.000Z',
    });
    renderButton({
      data: {
        aeatsiiIssent: true, // SII already sent — isolates the assertion to TBAI alone
        tbaiIssent: false,
        invoiceDate: '2026-06-15', // after the org's real (earliest) TBAI enrollment...
        accountingDate: '2026-06-15', // ...but before the currently active config's own date
      },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'sendToSif' })).toBeInTheDocument();
    });
  });
});
