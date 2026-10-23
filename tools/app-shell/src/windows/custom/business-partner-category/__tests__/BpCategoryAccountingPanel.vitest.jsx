// @covers artifacts/business-partner-category/custom/BpCategoryAccountingPanel.jsx
// @covers artifacts/business-partner-category/custom/bpCategoryContactTypes.js
// @covers tools/app-shell/src/components/contract-ui/SectionShell.jsx
/**
 * Contact category — Accounting tab. The category's single C_BP_Group_Acct row is laid out as one
 * SectionShell per checked contact type (Customers, Vendor/Creditor), each holding one shared
 * AccountSelect per account, fed by that field's NEO selector. A section follows the header's type
 * checkbox LIVE (the unsaved editing record); an unchecked type's section is hidden and its stored
 * values are never cleared. Each account pick is PATCHed on its own and tells the user when the
 * category already has contacts.
 *
 * The shared AccountSelect, SectionShell and useAccountSelectorPages are the REAL ones (imported
 * one by one instead of through the heavy barrel): only the network, i18n and toasts are mocked.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  notify: vi.fn(),
  toastError: vi.fn(),
  ui: (key) => key,
  label: (column) => `label:${column}`,
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui, useLabel: () => mocks.label }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mocks.apiFetch }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('@/hooks/useEntity.js', () => ({ extractErrorMessage: async () => 'patch-refused' }));
vi.mock('@etendosoftware/app-shell-core/lib/recordVersions.js', () => ({ rememberRecordVersion: vi.fn() }));
vi.mock('@generated/business-partner-category/custom/useAssociatedContactsNotice.js', () => ({
  useAssociatedContactsNotice: () => mocks.notify,
}));
vi.mock('@/components/contract-ui', async () => {
  const { AccountSelect } = await import('@/components/contract-ui/AccountSelect.jsx');
  const { SectionShell } = await import('@/components/contract-ui/SectionShell.jsx');
  const { useAccountSelectorPages } = await import('@/components/contract-ui/useAccountSelectorPages.js');
  return { AccountSelect, SectionShell, useAccountSelectorPages };
});

import BpCategoryAccountingPanel from '@generated/business-partner-category/custom/BpCategoryAccountingPanel.jsx';
import { accountSelectorUrl, resolveAccountSections } from '@generated/business-partner-category/custom/bpCategoryContactTypes.js';

const API_BASE = '/sws/neo/business-partner-category';
const ACCT_ROW = {
  id: 'ACCT-1',
  customerReceivablesNo: 'VC-430', 'customerReceivablesNo$_identifier': '430 - Clientes',
  customerPrepayment: 'VC-438', 'customerPrepayment$_identifier': '438 - Anticipos de clientes',
  writeoff: 'VC-650', 'writeoff$_identifier': '650 - Pérdidas de créditos',
  vendorLiability: 'VC-400', 'vendorLiability$_identifier': '400 - Proveedores',
  vendorPrepayment: 'VC-407', 'vendorPrepayment$_identifier': '407 - Anticipos a proveedores',
};
const PICKED = { id: 'VC-NEW', _identifier: '4381 - Anticipos nuevos' };

const jsonOk = (body) => ({ ok: true, status: 200, json: async () => body });
const listResponse = (rows) => jsonOk({ response: { data: rows } });

/**
 * Routes the panel's three kinds of request: the accounting row read, the selectors and the PATCH.
 * `patch` is the PATCH answer (default: the server echoes the saved value without its label).
 */
function installApi({ rows = [ACCT_ROW], patch } = {}) {
  mocks.apiFetch.mockImplementation(async (url, opts) => {
    if (opts?.method === 'PATCH') {
      if (patch) return patch;
      const [key, value] = Object.entries(JSON.parse(opts.body))[0];
      return jsonOk({ response: { data: [{ id: ACCT_ROW.id, [key]: value }] } });
    }
    if (url.includes('/selectors/')) return jsonOk({ items: [PICKED], hasMore: false });
    return listResponse(rows);
  });
}

const props = (data, extra = {}) => ({ recordId: 'G-1', data, apiBaseUrl: API_BASE, ...extra });
const BOTH = { etgoIscustomer: true, etgoIsvendor: true };
const trigger = (key) => screen.getByTestId(`field-bp-category-acct-${key}`);
const patchCalls = () => mocks.apiFetch.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
const selectorCalls = () => mocks.apiFetch.mock.calls.filter(([url]) => url.includes('/selectors/'));

describe('resolveAccountSections', () => {
  const shape = ({ noType, sections }) => ({ noType, sections: sections.map((s) => s.key) });

  it.each([
    ['both checked', { etgoIscustomer: true, etgoIsvendor: 'Y' }, false, ['customer', 'vendor']],
    ['customer only', { etgoIscustomer: 'true', etgoIsvendor: 'N' }, false, ['customer']],
    ['vendor only', { etgoIscustomer: false, etgoIsvendor: 'Y' }, false, ['vendor']],
    ['neither', { etgoIscustomer: 'N', etgoIsvendor: false }, true, []],
    ['no record yet', null, true, []],
  ])('%s', (_label, record, noType, sections) => {
    expect(shape(resolveAccountSections(record))).toEqual({ noType, sections });
  });
});

describe('accountSelectorUrl', () => {
  it.each([
    ['the field selector under the window base', API_BASE, `${API_BASE}/accounting/selectors/C_Receivable_Acct`],
    ['null without a base URL', undefined, null],
  ])('%s', (_label, base, expected) => {
    expect(accountSelectorUrl(base, 'accounting', { column: 'C_Receivable_Acct' })).toBe(expected);
  });
});

describe('BpCategoryAccountingPanel', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.notify.mockReset();
    mocks.toastError.mockReset();
  });

  it('renders one section per checked type, the first one without the divider', async () => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    const customer = await screen.findByTestId('bp-category-accounts-customer');
    const vendor = screen.getByTestId('bp-category-accounts-vendor');

    expect(within(customer).getByText('bpCategoryCustomersSection')).toBeInTheDocument();
    expect(within(customer).getByText('bpCategoryCustomersSectionSubtitle')).toBeInTheDocument();
    expect(within(vendor).getByText('bpCategoryVendorsSection')).toBeInTheDocument();
    expect(customer.className).not.toMatch(/\bborder-t\b/);
    expect(vendor.className).toMatch(/\bborder-t\b/);
  });

  it.each([
    ['customer', 'customerReceivablesNo', 'C_Receivable_Acct', true],
    ['customer', 'customerPrepayment', 'C_Prepayment_Acct', false],
    ['customer', 'writeoff', 'WriteOff_Acct', true],
    ['vendor', 'vendorLiability', 'V_Liability_Acct', true],
    ['vendor', 'vendorPrepayment', 'V_Prepayment_Acct', false],
  ])('%s section: %s shows its AD label, its stored account and required=%s', async (section, key, column, required) => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    const field = within(await screen.findByTestId(`bp-category-accounts-${section}`))
      .getByTestId(`bp-category-acct-${key}`);

    expect(within(field).getByText(`label:${column}`)).toBeInTheDocument();
    expect(trigger(key)).toHaveTextContent(ACCT_ROW[`${key}$_identifier`]);
    // A required account draws the asterisk and offers no way to clear it.
    expect(within(field).queryByText('*') !== null).toBe(required);
    expect(screen.queryByTestId(`field-bp-category-acct-${key}-clear`) === null).toBe(required);
  });

  it('follows the unsaved header type checkboxes, keeping the hidden section values, without reloading', async () => {
    installApi();
    const { rerender } = render(<BpCategoryAccountingPanel {...props({ etgoIscustomer: true, etgoIsvendor: false })} />);

    expect(await screen.findByTestId('bp-category-accounts-customer')).toBeInTheDocument();
    expect(screen.queryByTestId('bp-category-accounts-vendor')).toBeNull();

    rerender(<BpCategoryAccountingPanel {...props({ etgoIscustomer: false, etgoIsvendor: true })} />);
    expect(screen.queryByTestId('bp-category-accounts-customer')).toBeNull();
    expect(trigger('vendorLiability')).toHaveTextContent('400 - Proveedores');

    rerender(<BpCategoryAccountingPanel {...props(BOTH)} />);
    expect(trigger('customerReceivablesNo')).toHaveTextContent('430 - Clientes');
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.apiFetch.mock.calls[0][0]).toMatch(/^\/accounting\?parentId=G-1&/);
  });

  it.each([
    ['no type checked', { etgoIscustomer: false, etgoIsvendor: false }, {}, null, 'bp-category-accounts-no-type'],
    ['a category not saved yet', { etgoIscustomer: true }, { isNew: true, recordId: null }, null, 'bp-category-accounts-save-first'],
    ['the accounting row cannot be read', { etgoIscustomer: true }, {}, { ok: false, json: async () => ({}) }, 'bp-category-accounts-load-error'],
    ['the category has no accounting row', { etgoIscustomer: true }, {}, listResponse([]), 'bp-category-accounts-no-row'],
  ])('explains instead of showing accounts when %s', async (_label, data, extra, response, testId) => {
    mocks.apiFetch.mockResolvedValue(response ?? listResponse([ACCT_ROW]));
    render(<BpCategoryAccountingPanel {...props(data, extra)} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId('bp-category-accounting-panel')).toBeNull();
    // A category that does not exist yet has no accounting row to read.
    if (extra.isNew) expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('each account searches its own field selector, paged and by query', async () => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    fireEvent.click(await screen.findByTestId('field-bp-category-acct-writeoff'));
    await screen.findByTestId('bp-category-acct-writeoff-popup-option-VC-NEW');

    const [firstUrl, firstOpts] = selectorCalls()[0];
    expect(firstUrl).toMatch(new RegExp(`^${API_BASE}/accounting/selectors/WriteOff_Acct\\?`));
    expect(firstUrl).toContain('limit=30');
    expect(firstUrl).toContain('offset=0');
    expect(firstUrl).not.toContain('q=');
    expect(firstOpts).toEqual(expect.objectContaining({ baseUrl: '' }));

    fireEvent.change(screen.getByTestId('bp-category-acct-writeoff-popup-input'), { target: { value: '650' } });
    await waitFor(() => expect(selectorCalls().some(([url]) => url.includes('q=650'))).toBe(true));
  });

  it.each([
    ['saved: PATCHes only that account, shows the picked label and runs the contacts notice', null],
    ['refused: shows the error, restores the previous account, no notice', { ok: false, status: 409, json: async () => ({}) }],
  ])('picking an account — %s', async (_label, patch) => {
    installApi({ patch });
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    fireEvent.click(await screen.findByTestId('field-bp-category-acct-customerPrepayment'));
    fireEvent.click(await screen.findByTestId('bp-category-acct-customerPrepayment-popup-option-VC-NEW'));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0]).toEqual(['/accounting/ACCT-1', {
      method: 'PATCH', body: JSON.stringify({ customerPrepayment: 'VC-NEW' }),
    }]);
    if (patch) {
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('patch-refused'));
      await waitFor(() => expect(trigger('customerPrepayment')).toHaveTextContent('438 - Anticipos de clientes'));
      expect(mocks.notify).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('G-1'));
      expect(trigger('customerPrepayment')).toHaveTextContent('4381 - Anticipos nuevos');
      expect(mocks.toastError).not.toHaveBeenCalled();
    }
  });

  it('clearing an optional account PATCHes null and empties its label', async () => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    fireEvent.click(await screen.findByTestId('field-bp-category-acct-vendorPrepayment-clear'));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    expect(patchCalls()[0][1].body).toBe(JSON.stringify({ vendorPrepayment: null }));
    await waitFor(() => expect(trigger('vendorPrepayment')).toHaveTextContent('selectAccount'));
    expect(screen.queryByTestId('field-bp-category-acct-vendorPrepayment-clear')).toBeNull();
  });
});
