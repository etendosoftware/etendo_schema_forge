// ETP-5087: the SIF result copy must follow the same purchase/sales split the
// confirmation copy already applies.
//
// The bug: `SifSendingModal` rendered `ui('sendToSifSuccessTbai')`
// unconditionally, so a PURCHASE invoice the user had just confirmed sending to
// **Batuz** reported back "Enviado a TicketBAI correctamente." — contradicting
// the confirmation dialog it had shown seconds earlier (`getSifBodyKey` already
// returned the Batuz wording there). Same for the error copy.
//
// These tests render the real modal against the REAL es_ES dictionary (a mocked
// `useUI: (key) => key` would happily pass while the user still reads the wrong
// scheme name), so they assert the exact string a user sees.
import { render, screen, fireEvent } from '@testing-library/react';
import { loadLocaleDictionary, makeRealUI } from './testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const realUI = makeRealUI(esES);

vi.mock('@/i18n', () => ({ useUI: () => realUI }));

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => (...args) => apiFetchMock(...args),
}));

import SifSendingModal from '../SifSendingModal.jsx';

function renderModal(specName, overrides = {}) {
  return render(
    <SifSendingModal
      pendingTargets={{ sendSii: false, sendTbai: true }}
      bodyKey="sendToSifBodyTbai"
      base="/sws/neo"
      specName={specName}
      recordId="INV_1"
      onClose={() => {}}
      {...overrides}
    />,
  );
}

async function sendAndAwaitResults(specName, overrides = {}) {
  renderModal(specName, overrides);
  fireEvent.click(screen.getByRole('button', { name: esES.genericLabels.sendToSifConfirm }));
  await screen.findByRole('button', { name: esES.genericLabels.close }, { timeout: 3000 });
}

describe('SifSendingModal — TBAI result copy is purchase/sales aware (ETP-5087)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  describe('successful TBAI send', () => {
    it('reports Batuz for a purchase invoice, never TicketBAI', async () => {
      await sendAndAwaitResults('purchase-invoice');

      expect(screen.getByText('Enviado a Batuz correctamente.')).toBeInTheDocument();
      expect(screen.queryByText(/TicketBAI/)).not.toBeInTheDocument();
    });

    it('keeps the TicketBAI wording for a sales invoice', async () => {
      await sendAndAwaitResults('sales-invoice');

      expect(screen.getByText('Enviado a TicketBAI correctamente.')).toBeInTheDocument();
      expect(screen.queryByText(/Batuz/)).not.toBeInTheDocument();
    });
  });

  describe('failed TBAI send (backend gave no message, so the generic copy is used)', () => {
    beforeEach(() => {
      // An empty-message rejection is what makes the modal fall back to the
      // translated error key instead of echoing the backend message verbatim.
      apiFetchMock.mockRejectedValue(new Error(''));
    });

    it('reports Batuz for a purchase invoice, never TicketBAI', async () => {
      await sendAndAwaitResults('purchase-invoice');

      expect(screen.getByText('Error al enviar a Batuz.')).toBeInTheDocument();
      expect(screen.queryByText(/TicketBAI/)).not.toBeInTheDocument();
    });

    it('keeps the TicketBAI wording for a sales invoice', async () => {
      await sendAndAwaitResults('sales-invoice');

      expect(screen.getByText('Error al enviar a TicketBAI.')).toBeInTheDocument();
      expect(screen.queryByText(/Batuz/)).not.toBeInTheDocument();
    });
  });

  // SII is SII in both directions — the split must not leak into the SII copy.
  it('leaves the SII result copy untouched for a purchase invoice', async () => {
    await sendAndAwaitResults('purchase-invoice', {
      pendingTargets: { sendSii: true, sendTbai: false },
      bodyKey: 'sendToSifBodySii',
    });

    expect(screen.getByText('Enviado al SII correctamente.')).toBeInTheDocument();
  });
});

describe('SIF Batuz result keys exist in every locale (ETP-5087)', () => {
  const expected = {
    en_US: {
      sendToSifSuccessTbaiPurchase: 'Sent to Batuz successfully.',
      sendToSifErrorTbaiPurchase: 'Error sending to Batuz.',
    },
    es_ES: {
      sendToSifSuccessTbaiPurchase: 'Enviado a Batuz correctamente.',
      sendToSifErrorTbaiPurchase: 'Error al enviar a Batuz.',
    },
    es_AR: {
      sendToSifSuccessTbaiPurchase: 'Enviado a Batuz correctamente.',
      sendToSifErrorTbaiPurchase: 'Error al enviar a Batuz.',
    },
  };

  Object.entries(expected).forEach(([locale, keys]) => {
    it(`${locale} carries the purchase-specific TBAI result copy`, () => {
      const labels = loadLocaleDictionary(locale).genericLabels;
      Object.entries(keys).forEach(([key, text]) => {
        expect(labels[key]).toBe(text);
        expect(labels[key]).not.toMatch(/TicketBAI/);
      });
    });

    // ETP-5027 added the purchase CONFIRMATION copy to en_US/es_ES only; es_AR
    // was left behind. Result and confirmation copy must ship together in all three.
    it(`${locale} carries the purchase-specific TBAI confirmation copy`, () => {
      const labels = loadLocaleDictionary(locale).genericLabels;
      expect(labels.sendToSifBodyTbaiPurchase).toMatch(/Batuz/);
      expect(labels.sendToSifBodyBothPurchase).toMatch(/Batuz/);
    });
  });
});
