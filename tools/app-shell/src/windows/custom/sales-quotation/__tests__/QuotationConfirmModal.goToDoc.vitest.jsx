// ETP-5378 — regression for handleGoToDoc's basePath computation, imported via the
// @generated alias like the window wrapper does (artifacts/sales-quotation/custom/
// isn't inside vitest's src/** include, so this lives here instead — no behavioral
// coverage would otherwise ever run for it).
//
// This modal used to be reachable ONLY from the form (QuotationTopbarActions,
// mounted at /sales-quotation/{recordId}), so `window.location.pathname.replace(
// /\/sales-quotation\/.*$/, '')` always had a trailing "/something" to strip. Once
// the row-hover Confirmar entry started opening this SAME modal from the LIST route
// (/sales-quotation, no trailing segment), that regex matched nothing there, so
// basePath stayed "/sales-quotation" and "Ver pedido" built a doubled, dead URL:
// /sales-quotation/sales-order/{id} instead of /sales-order/{id} — reported live.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuotationConfirmModal from '@generated/sales-quotation/custom/QuotationConfirmModal';

const ORDER_ROW = {
  id: 'order-1', documentNo: '1000005', documentStatus: 'DR', grandTotalAmount: 15.14,
};

async function confirmAndReachSuccess({ pathname }) {
  Object.defineProperty(window, 'location', {
    value: { pathname, href: '' },
    writable: true,
    configurable: true,
  });

  vi.stubGlobal('fetch', vi.fn((url) => {
    if (url.includes('/action/Convertquotation')) return jsonResponse({ response: { data: {} } });
    if (url.includes('/sales-order/header')) return jsonResponse({ response: { data: [ORDER_ROW] } });
    return jsonResponse({});
  }));

  render(
    <QuotationConfirmModal
      quotationId="q-1"
      data={{ id: 'q-1', documentNo: '1000002', grandTotalAmount: 15.14, summedLineAmount: 12 }}
      token="tkn"
      apiBaseUrl="/sws/neo/sales-quotation"
      onClose={vi.fn()} />,
  );

  // Default selection is already "order" (Recomendado) — just confirm.
  await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
  await screen.findByText('sqOrderCreated');
}

describe('QuotationConfirmModal — handleGoToDoc basePath (ETP-5378)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds /sales-order/{id} when opened from the FORM path (/sales-quotation/{recordId})', async () => {
    await confirmAndReachSuccess({ pathname: '/sales-quotation/q-1' });
    fireEvent.click(screen.getByText(/sqViewOrder/));
    expect(window.location.href).toBe('/sales-order/order-1');
  });

  it('builds /sales-order/{id} — not /sales-quotation/sales-order/{id} — when opened from the LIST path (/sales-quotation)', async () => {
    await confirmAndReachSuccess({ pathname: '/sales-quotation' });
    fireEvent.click(screen.getByText(/sqViewOrder/));
    expect(window.location.href).toBe('/sales-order/order-1');
  });
});
