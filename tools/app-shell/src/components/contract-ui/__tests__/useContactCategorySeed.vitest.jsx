// @covers tools/app-shell/src/components/contract-ui/useContactCategorySeed.js
// @covers tools/app-shell/src/components/contract-ui/useCreateContactModal.jsx
// @covers tools/app-shell/src/components/copilot/ocr/CreateContactModalAdapter.jsx
/**
 * ETP-5654 — a contact created from a PURCHASE document starts in "Proveedor", not the
 * default "Cliente", in BOTH entry points (the document's Contacto selector and the OCR
 * "Crear nuevo contacto" popup). The category id is per client, so it is looked up before the
 * popup mounts; the embedded Contacts window reads its seed once, on mount.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));
vi.mock('@/auth/api.js', () => ({ buildHeaders: () => ({}) }));

const modalProps = vi.fn();
vi.mock('../RecordCreateModal.jsx', () => ({
  default: (props) => {
    modalProps(props);
    return <div data-testid="modal-open" />;
  },
}));

import { useContactCategorySeed } from '../useContactCategorySeed.js';
import { useCreateContactModal } from '../useCreateContactModal.jsx';
import CreateContactModalAdapter from '../../copilot/ocr/CreateContactModalAdapter.jsx';

const GROUPS = [
  { id: 'G-CLI', label: 'Cliente' },
  { id: 'G-PRO', label: 'Proveedor' },
];
const answer = items => apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ items }) });

beforeEach(() => {
  apiFetchMock.mockReset();
  modalProps.mockReset();
});

describe('useContactCategorySeed', () => {
  it('is not ready until the lookup settles, then exposes the seed', async () => {
    answer(GROUPS);
    const { result } = renderHook(() => useContactCategorySeed({
      contactsApiBaseUrl: '/sws/neo/contacts', documentType: 'purchase', active: true,
    }));
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.categorySeed.businessPartnerCategory).toBe('G-PRO');
  });

  it('is ready with an empty seed, without querying, when the document type needs none', async () => {
    const { result } = renderHook(() => useContactCategorySeed({
      contactsApiBaseUrl: '/sws/neo/contacts', documentType: null, active: true,
    }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.categorySeed).toEqual({});
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('still becomes ready (empty seed) when the lookup fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useContactCategorySeed({
      contactsApiBaseUrl: '/sws/neo/contacts', documentType: 'purchase', active: true,
    }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.categorySeed).toEqual({});
  });

  it('does nothing while inactive', () => {
    const { result } = renderHook(() => useContactCategorySeed({
      contactsApiBaseUrl: '/sws/neo/contacts', documentType: 'purchase', active: false,
    }));
    expect(result.current.ready).toBe(false);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('useCreateContactModal (manual document flow)', () => {
  function Host({ documentType }) {
    const { contactPortal, createContactCtxValue } = useCreateContactModal({
      apiBaseUrl: '/sws/neo/purchase-invoice', token: 't', documentType,
    });
    return (
      <>
        <button type="button" onClick={() => createContactCtxValue.onOpen('ACME', vi.fn())}>open</button>
        {contactPortal}
      </>
    );
  }

  it('mounts the popup only after the lookup, seeding Proveedor alongside vendor and name', async () => {
    answer(GROUPS);
    render(<Host documentType="purchase" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { initialData } = modalProps.mock.calls.at(-1)[0];
    expect(initialData).toMatchObject({
      name: 'ACME',
      vendor: true,
      businessPartnerCategory: 'G-PRO',
      'businessPartnerCategory$_identifier': 'Proveedor',
    });
    // Never mounted with a half-resolved seed: the window would read it once and lose it.
    expect(modalProps.mock.calls.every(([p]) => p.initialData.businessPartnerCategory === 'G-PRO')).toBe(true);
  });

  it('seeds Cliente for a sale document', async () => {
    answer(GROUPS);
    render(<Host documentType="sale" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    expect(modalProps.mock.calls.at(-1)[0].initialData.businessPartnerCategory).toBe('G-CLI');
  });

  it('opens with no category key when the group is missing, so the default is kept', async () => {
    answer([]);
    render(<Host documentType="purchase" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { initialData } = modalProps.mock.calls.at(-1)[0];
    expect(initialData).not.toHaveProperty('businessPartnerCategory');
    expect(initialData.vendor).toBe(true);
  });

  it('still opens the popup when the lookup throws', async () => {
    apiFetchMock.mockRejectedValue(new Error('down'));
    render(<Host documentType="purchase" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    expect(modalProps.mock.calls.at(-1)[0].initialData).not.toHaveProperty('businessPartnerCategory');
  });
});

describe('CreateContactModalAdapter (OCR flow)', () => {
  const item = { payload: { documentType: 'purchase', prefilled: { name: 'ACME', taxID: 'B123' } } };

  it('seeds Proveedor together with the OCR prefill', async () => {
    answer(GROUPS);
    render(<CreateContactModalAdapter
      item={item} apiBaseUrl="/sws/neo/purchase-invoice" token="t" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    expect(modalProps.mock.calls.at(-1)[0].initialData).toMatchObject({
      name: 'ACME', taxID: 'B123', vendor: true, businessPartnerCategory: 'G-PRO',
    });
  });

  it('opens with the OCR prefill and no category when the lookup fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('down'));
    render(<CreateContactModalAdapter
      item={item} apiBaseUrl="/sws/neo/purchase-invoice" token="t" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { initialData } = modalProps.mock.calls.at(-1)[0];
    expect(initialData).toMatchObject({ name: 'ACME', vendor: true });
    expect(initialData).not.toHaveProperty('businessPartnerCategory');
  });
});
