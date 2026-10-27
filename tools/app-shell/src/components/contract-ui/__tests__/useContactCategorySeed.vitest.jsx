// @covers tools/app-shell/src/components/contract-ui/useContactCategorySeed.js
// @covers tools/app-shell/src/components/contract-ui/useCreateContactModal.jsx
// @covers tools/app-shell/src/components/copilot/ocr/CreateContactModalAdapter.jsx
/**
 * ETP-5654 — a contact created from a PURCHASE document starts in "Proveedor", not the
 * default "Cliente", in BOTH entry points (the document's Contacto selector and the OCR
 * "Crear nuevo contacto" popup). The category id is per client, so it is looked up before the
 * popup mounts; the embedded Contacts window reads its seed once, on mount.
 *
 * The popup cases run with the `contact-category-type` flag ON (the category decides the type:
 * no `customer` / `vendor` seeded, a create check). The flag-OFF popup is covered at its toggle
 * point, useContactCreateTypeGate.vitest.jsx.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => apiFetchMock }));
vi.mock('@/auth/api.js', () => ({ buildHeaders: () => ({}) }));
// Stable identity: the hooks memoise their create check on `ui`.
const ui = (key, params) => `${key}|${params?.category ?? ''}`;
vi.mock('@/i18n', () => ({ useUI: () => ui }));
vi.mock('@/lib/flags', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, useFeatureFlag: (key) => key === original.CONTACT_CATEGORY_TYPE };
});

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
/** After the popup opened: the category read of the create check answers these flags. */
const categoryFlags = (row) => apiFetchMock.mockImplementation(async (url) => (
  String(url).startsWith('/businessPartnerCategory/')
    ? { ok: true, json: async () => ({ response: { data: [row] } }) }
    : { ok: true, json: async () => ({ items: GROUPS }) }));

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

describe('useCreateContactModal (manual document flow, contact-category-type ON)', () => {
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

  it('mounts the popup only after the lookup, seeding Proveedor and the name but no customer/vendor', async () => {
    answer(GROUPS);
    render(<Host documentType="purchase" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { initialData } = modalProps.mock.calls.at(-1)[0];
    expect(initialData).toMatchObject({
      name: 'ACME',
      businessPartnerCategory: 'G-PRO',
      'businessPartnerCategory$_identifier': 'Proveedor',
    });
    // The type comes from the category: a seeded key would reach the POST and disable the
    // backend's inheritance of customer/vendor from it.
    expect(initialData).not.toHaveProperty('vendor');
    expect(initialData).not.toHaveProperty('customer');
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
    expect(initialData).not.toHaveProperty('vendor');
  });

  // The fallback form of RecordCreateModal never runs the Contacts window's own check, so the
  // target carries it: from a purchase, a customer-only category is refused before the POST.
  it('hands the popup a create check that refuses a category not granting the document type', async () => {
    answer(GROUPS);
    render(<Host documentType="purchase" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { target } = modalProps.mock.calls.at(-1)[0];
    expect(target.createOmitUntouched).toEqual(['customer', 'vendor']);
    categoryFlags({ etgoIscustomer: 'Y', etgoIsvendor: 'N' });
    await expect(target.validateBeforeCreate({
      businessPartnerCategory: 'G-CLI', 'businessPartnerCategory$_identifier': 'Cliente',
    })).resolves.toBe('contactCategoryNotVendor|Cliente');
  });

  it('still opens the popup when the lookup throws', async () => {
    apiFetchMock.mockRejectedValue(new Error('down'));
    render(<Host documentType="purchase" />);
    await act(async () => { screen.getByText('open').click(); });
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    expect(modalProps.mock.calls.at(-1)[0].initialData).not.toHaveProperty('businessPartnerCategory');
  });
});

describe('CreateContactModalAdapter (OCR flow, contact-category-type ON)', () => {
  const item = { payload: { documentType: 'purchase', prefilled: { name: 'ACME', taxID: 'B123' } } };

  it('seeds Proveedor together with the OCR prefill', async () => {
    answer(GROUPS);
    render(<CreateContactModalAdapter
      item={item} apiBaseUrl="/sws/neo/purchase-invoice" token="t" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { initialData } = modalProps.mock.calls.at(-1)[0];
    expect(initialData).toMatchObject({ name: 'ACME', taxID: 'B123', businessPartnerCategory: 'G-PRO' });
    expect(initialData).not.toHaveProperty('vendor');
    expect(initialData).not.toHaveProperty('customer');
  });

  it.each([
    ['a purchase extraction refuses a customer-only category', 'purchase', 'contactCategoryNotVendor|Cliente'],
    ['a sale extraction accepts it', 'sale', null],
  ])('create check: %s', async (_label, documentType, expected) => {
    answer(GROUPS);
    render(<CreateContactModalAdapter
      item={{ payload: { ...item.payload, documentType } }}
      apiBaseUrl="/sws/neo/purchase-invoice" token="t" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    categoryFlags({ etgoIscustomer: 'Y', etgoIsvendor: 'N' });
    const { target } = modalProps.mock.calls.at(-1)[0];
    await expect(target.validateBeforeCreate({
      businessPartnerCategory: 'G-CLI', 'businessPartnerCategory$_identifier': 'Cliente',
    })).resolves.toBe(expected);
  });

  it('carries no create check when the extraction has no document nature', async () => {
    render(<CreateContactModalAdapter
      item={{ payload: { prefilled: { name: 'ACME' } } }}
      apiBaseUrl="/sws/neo/purchase-invoice" token="t" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    expect(modalProps.mock.calls.at(-1)[0].target.validateBeforeCreate).toBeUndefined();
  });

  it('opens with the OCR prefill and no category when the lookup fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('down'));
    render(<CreateContactModalAdapter
      item={item} apiBaseUrl="/sws/neo/purchase-invoice" token="t" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('modal-open')).toBeTruthy());
    const { initialData } = modalProps.mock.calls.at(-1)[0];
    expect(initialData).toMatchObject({ name: 'ACME' });
    expect(initialData).not.toHaveProperty('vendor');
    expect(initialData).not.toHaveProperty('businessPartnerCategory');
  });
});
