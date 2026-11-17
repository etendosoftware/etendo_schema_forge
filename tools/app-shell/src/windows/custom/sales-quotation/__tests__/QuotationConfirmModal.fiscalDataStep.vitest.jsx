// @covers artifacts/sales-quotation/custom/QuotationConfirmModal.jsx
// ETP-6179 — «Facturar directamente» creates AND completes the invoice in one call, so it goes
// through the mandatory "Datos fiscales" step first (only when a fiscal system is active).
// «Crear pedido» creates no invoice and never asks for the preview.
//
// Lives next to QuotationConfirmModal.goToDoc.vitest.jsx (artifacts/ is outside vitest's include);
// that file pins the order path's navigation, this one the invoice path's fiscal step.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuotationConfirmModal from '@generated/sales-quotation/custom/QuotationConfirmModal';

const ENTITY = '/sws/neo/sales-quotation/quotation/q-1';
const PREVIEW = {
  systems: ['SII'],
  rectificative: false,
  fields: { etsgDateOperation: '2026-11-10', aeatsiiDescripcionSii: 'Venta' },
  fieldSpecs: [
    { name: 'etsgDateOperation', system: 'SII', type: 'date' },
    { name: 'aeatsiiDescripcionSii', system: 'SII', type: 'text' },
  ],
  siiAuthorizationAvailable: false,
};

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

let sifAnswer;
let fetchMock;

function renderModal(props = {}) {
  const onClose = vi.fn();
  render(
    <QuotationConfirmModal
      quotationId="q-1"
      data={{ id: 'q-1', documentNo: '1000002', grandTotalAmount: 15.14, summedLineAmount: 12 }}
      token="tkn"
      apiBaseUrl="/sws/neo/sales-quotation"
      onClose={onClose}
      {...props} />,
  );
  return { onClose };
}

const callsTo = (action) => fetchMock.mock.calls.filter(([u]) => String(u).includes(`/action/${action}`));

async function chooseInvoiceAndContinue() {
  fireEvent.click(screen.getByTestId('confirm-option-invoice'));
  await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
}

describe('QuotationConfirmModal — fiscal data step (ETP-6179)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/sales-quotation/q-1', href: '' }, writable: true, configurable: true,
    });
    sifAnswer = () => jsonResponse({ response: { data: PREVIEW } });
    fetchMock = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/action/sifDefaults')) return sifAnswer();
      if (u.includes('/action/createDraftInvoice')) {
        return jsonResponse({ response: { data: { id: 'inv-1', documentNo: 'FV-1', documentStatus: 'CO' } } });
      }
      if (u.includes('/action/Convertquotation')) return jsonResponse({ response: { data: {} } });
      if (u.includes('/sales-order/header')) return jsonResponse({ response: { data: [] } });
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('«Facturar directamente» shows the step and creates nothing yet', async () => {
    renderModal();
    await chooseInvoiceAndContinue();

    await screen.findByTestId('invoice-sif-step-modal');
    expect(String(callsTo('sifDefaults')[0][0])).toBe(`${ENTITY}/action/sifDefaults`);
    expect(callsTo('createDraftInvoice')).toHaveLength(0);
  });

  it('the final confirm sends the edited values as sifFields', async () => {
    renderModal();
    await chooseInvoiceAndContinue();
    await screen.findByTestId('invoice-sif-step-modal');
    fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Editada' } });
    await act(async () => { fireEvent.click(screen.getByTestId('invoice-sif-step-modal-confirm')); });

    await screen.findByTestId('confirm-result-card-0');
    const [, init] = callsTo('createDraftInvoice')[0];
    expect(JSON.parse(init.body)).toEqual({ sifFields: { ...PREVIEW.fields, aeatsiiDescripcionSii: 'Editada' } });
  });

  it('Atrás returns to the choice and keeps the edits', async () => {
    renderModal();
    await chooseInvoiceAndContinue();
    await screen.findByTestId('invoice-sif-step-modal');
    fireEvent.change(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii'), { target: { value: 'Editada' } });

    fireEvent.click(screen.getByTestId('invoice-sif-step-modal-back'));
    expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull();
    expect(screen.getByTestId('action-confirm-modal')).toBeInTheDocument();

    await chooseInvoiceAndContinue();
    await screen.findByTestId('invoice-sif-step-modal');
    expect(screen.getByTestId('Input__sifstep_aeatsiiDescripcionSii')).toHaveValue('Editada');
    expect(callsTo('sifDefaults')).toHaveLength(1);
    expect(callsTo('createDraftInvoice')).toHaveLength(0);
  });

  it.each([
    ['Cancelar', 'invoice-sif-step-modal-cancel'],
    ['×', 'invoice-sif-step-modal-close'],
  ])('%s on the step closes without creating the invoice', async (_label, testId) => {
    const { onClose } = renderModal();
    await chooseInvoiceAndContinue();
    await screen.findByTestId('invoice-sif-step-modal');
    fireEvent.click(screen.getByTestId(testId));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(callsTo('createDraftInvoice')).toHaveLength(0);
  });

  it('«Crear pedido» never asks for the fiscal preview', async () => {
    renderModal();
    await act(async () => { fireEvent.click(screen.getByTestId('action-confirm-modal')); });
    await screen.findByTestId('confirm-result-card-0');

    expect(callsTo('Convertquotation')).toHaveLength(1);
    expect(callsTo('sifDefaults')).toHaveLength(0);
  });

  it('with no fiscal system active, invoices straight away without sifFields', async () => {
    sifAnswer = () => jsonResponse({ response: { data: { systems: [], fields: {}, fieldSpecs: [] } } });
    renderModal();
    await chooseInvoiceAndContinue();
    await screen.findByTestId('confirm-result-card-0');

    expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull();
    expect(JSON.parse(callsTo('createDraftInvoice')[0][1].body)).toEqual({});
  });

  it('fails open: a preview that fails invoices without the step', async () => {
    sifAnswer = () => jsonResponse({ error: 'boom' }, false, 500);
    renderModal();
    await chooseInvoiceAndContinue();
    await waitFor(() => expect(callsTo('createDraftInvoice')).toHaveLength(1));

    expect(screen.queryByTestId('invoice-sif-step-modal')).toBeNull();
    expect(JSON.parse(callsTo('createDraftInvoice')[0][1].body)).toEqual({});
  });
});
