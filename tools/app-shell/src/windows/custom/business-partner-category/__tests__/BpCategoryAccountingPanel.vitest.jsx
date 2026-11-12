// @covers artifacts/business-partner-category/custom/BpCategoryAccountingPanel.jsx
// @covers artifacts/business-partner-category/custom/bpCategoryContactTypes.js
/**
 * Contact category — Accounting tab. One muted card per contact type (Customer, Vendor/Creditor)
 * is ALWAYS drawn, headed by that type's checkbox; a checked card lists one shared AccountSelect
 * per account of the category's single C_BP_Group_Acct row, fed by that field's NEO selector, and
 * an unchecked card collapses to its header without clearing its stored values. With no type
 * checked an info alert sits above the cards. The type checkboxes are the header fields: they read
 * the live editing record (`data`) and write through the header form's callbacks (`formBridge` of
 * the window context). The tab badge (`onCountChange`) is the number of checked types. Each
 * account pick is PATCHed on its own and tells the user when the category already has contacts.
 *
 * The shared AccountSelect and useAccountSelectorPages are the REAL ones (imported one by one
 * instead of through the heavy barrel), as are the window context and SquareCheckbox: only the
 * network, i18n and toasts are mocked.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Calculator } from '@phosphor-icons/react';

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
  const { useAccountSelectorPages } = await import('@/components/contract-ui/useAccountSelectorPages.js');
  return { AccountSelect, useAccountSelectorPages };
});

import { LOCATE_WALK_PAGE_SIZE } from '@/components/contract-ui/selectorSelection.js';
import BpCategoryAccountingPanel from '@generated/business-partner-category/custom/BpCategoryAccountingPanel.jsx';
import { BpCategoryWindowContext } from '@generated/business-partner-category/custom/bpCategoryWindowContext.js';
import {
  accountSelectorUrl, contactTypeBaseFilter, countCheckedTypes, resolveAccountSections,
} from '@generated/business-partner-category/custom/bpCategoryContactTypes.js';
import { resolveTabIcon } from '@/components/contract-ui/tabIcons.js';

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
const card = (key) => screen.getByTestId(`bp-category-accounts-${key}`);
const accountSelectsIn = (el) => within(el).queryAllByTestId(/^bp-category-acct-/);

/**
 * Mounts the panel inside the window context the wrapper provides, with a header-form bridge.
 * Returns the bridge callbacks and a `rerenderPanel(data, extra)` that keeps the same context.
 */
function renderInWindow(data, extra = {}) {
  const form = { onChange: vi.fn(), onFieldBlur: vi.fn() };
  const windowState = { formBridge: { current: form } };
  const tree = (d, e) => (
    <BpCategoryWindowContext.Provider value={windowState}>
      <BpCategoryAccountingPanel {...props(d, e)} />
    </BpCategoryWindowContext.Provider>
  );
  const { rerender } = render(tree(data, extra));
  return { form, rerenderPanel: (d, e = extra) => rerender(tree(d, e)) };
}

// countCheckedTypes (the Accounting tab badge) is the number of checked sections of the same record.
describe('resolveAccountSections / countCheckedTypes', () => {
  const shape = ({ noType, sections }) => ({ noType, sections: sections.map((s) => s.key) });

  it.each([
    ['both checked', { etgoIscustomer: true, etgoIsvendor: 'Y' }, false, ['customer', 'vendor']],
    ['customer only', { etgoIscustomer: 'true', etgoIsvendor: 'N' }, false, ['customer']],
    ['vendor only', { etgoIscustomer: false, etgoIsvendor: 'Y' }, false, ['vendor']],
    ['neither', { etgoIscustomer: 'N', etgoIsvendor: false }, true, []],
    ['no record yet', null, true, []],
  ])('%s', (_label, record, noType, sections) => {
    expect(shape(resolveAccountSections(record))).toEqual({ noType, sections });
    expect(countCheckedTypes(record)).toBe(sections.length);
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

describe('contactTypeBaseFilter', () => {
  const decode = (filter) => JSON.parse(decodeURIComponent(filter.replace(/^criteria=/, '')));

  it.each([
    ['customer', 'etgoIscustomer'],
    ['vendor', 'etgoIsvendor'],
  ])('%s -> a server-side criteria on %s = Y', (code, fieldName) => {
    const filter = contactTypeBaseFilter(code);
    expect(filter).toMatch(/^criteria=/);
    expect(decode(filter)).toEqual([{ fieldName, operator: 'equals', value: 'Y' }]);
  });

  it.each([
    ['all contacts (null)', null],
    ['undefined', undefined],
    ['an unknown code', 'employee'],
  ])('%s -> no filter', (_label, code) => {
    expect(contactTypeBaseFilter(code)).toBeNull();
  });
});

describe('BpCategoryAccountingPanel', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.notify.mockReset();
    mocks.toastError.mockReset();
  });

  it.each([
    ['both checked', BOTH, 'true', 'true'],
    ['customer only', { etgoIscustomer: true, etgoIsvendor: false }, 'true', 'false'],
    ['neither', { etgoIscustomer: 'N', etgoIsvendor: 'N' }, 'false', 'false'],
  ])('always draws both type cards, data-checked following the record (%s)', async (_label, data, customer, vendor) => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(data)} />);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalled());
    expect(card('customer')).toHaveAttribute('data-checked', customer);
    expect(card('vendor')).toHaveAttribute('data-checked', vendor);
    expect(within(card('customer')).getByTestId('field-etgoIscustomer').checked).toBe(customer === 'true');
    expect(within(card('vendor')).getByTestId('field-etgoIsvendor').checked).toBe(vendor === 'true');
    // The info alert is there exactly while no type is checked.
    expect(screen.queryByTestId('bp-category-accounts-no-type') !== null).toBe(customer === 'false' && vendor === 'false');
  });

  // The two vendor accounts are renamed in this tab only (a `useUI` key); every other account, and
  // these same columns in any other window, keep the AD column label (`useLabel`).
  it.each([
    ['customer', 'customerReceivablesNo', 'C_Receivable_Acct', 'label:C_Receivable_Acct', true],
    ['customer', 'customerPrepayment', 'C_Prepayment_Acct', 'label:C_Prepayment_Acct', false],
    ['customer', 'writeoff', 'WriteOff_Acct', 'label:WriteOff_Acct', true],
    ['vendor', 'vendorLiability', 'V_Liability_Acct', 'bpCategoryVendorLiability', true],
    ['vendor', 'vendorPrepayment', 'V_Prepayment_Acct', 'bpCategoryVendorPrepayment', false],
  ])('%s section: %s shows its label, its stored account and required', async (section, key, column, label, required) => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    const field = within(await screen.findByTestId(`bp-category-accounts-${section}`))
      .getByTestId(`bp-category-acct-${key}`);

    expect(within(field).getByText(label)).toBeInTheDocument();
    if (label !== `label:${column}`) expect(within(field).queryByText(`label:${column}`)).toBeNull();
    expect(trigger(key)).toHaveTextContent(ACCT_ROW[`${key}$_identifier`]);
    // A required account draws the asterisk and offers no way to clear it.
    expect(within(field).queryByText('*') !== null).toBe(required);
    expect(screen.queryByTestId(`field-bp-category-acct-${key}-clear`) === null).toBe(required);
  });

  it('an unchecked card collapses to its header and gets its values back when re-checked, without reloading', async () => {
    installApi();
    const { rerenderPanel } = renderInWindow({ etgoIscustomer: true, etgoIsvendor: false });

    expect(await screen.findByTestId('bp-category-acct-customerReceivablesNo')).toBeInTheDocument();
    expect(accountSelectsIn(card('vendor'))).toHaveLength(0);

    rerenderPanel({ etgoIscustomer: false, etgoIsvendor: true });
    expect(card('customer')).toBeInTheDocument();
    expect(accountSelectsIn(card('customer'))).toHaveLength(0);
    expect(trigger('vendorLiability')).toHaveTextContent('400 - Proveedores');

    rerenderPanel(BOTH);
    expect(trigger('customerReceivablesNo')).toHaveTextContent('430 - Clientes');
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.apiFetch.mock.calls[0][0]).toMatch(/^\/accounting\?parentId=G-1&/);
  });

  it('no type checked: an info alert sits above the two cards', async () => {
    installApi();
    render(<BpCategoryAccountingPanel {...props({ etgoIscustomer: false, etgoIsvendor: false })} />);
    const alert = await screen.findByTestId('bp-category-accounts-no-type');
    expect(alert).toHaveTextContent('bpCategoryNoTypeAccounts');
    expect(alert.compareDocumentPosition(card('customer')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(accountSelectsIn(screen.getByTestId('bp-category-accounting-panel'))).toHaveLength(0);
  });

  it.each([
    ['a category not saved yet', { isNew: true, recordId: null }, null, 'bp-category-accounts-save-first'],
    ['the accounting row cannot be read', {}, { ok: false, json: async () => ({}) }, 'bp-category-accounts-load-error'],
    ['the category has no accounting row', {}, listResponse([]), 'bp-category-accounts-no-row'],
  ])('the checked card explains instead of showing accounts when %s', async (_label, extra, response, testId) => {
    mocks.apiFetch.mockResolvedValue(response ?? listResponse([ACCT_ROW]));
    render(<BpCategoryAccountingPanel {...props({ etgoIscustomer: true, etgoIsvendor: false }, extra)} />);
    const message = await within(card('customer')).findByTestId(testId);
    expect(message).toBeInTheDocument();
    expect(accountSelectsIn(card('customer'))).toHaveLength(0);
    // The unchecked card stays a bare header: the message belongs to the checked one only.
    expect(within(card('vendor')).queryByTestId(testId)).toBeNull();
    // A category that does not exist yet has no accounting row to read.
    if (extra.isNew) expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  // The type checkboxes ARE the header fields: a toggle is the form's own onChange (field, flipped
  // value, AD column), then its blur hook — the same autosave as a checkbox of the form.
  it.each([
    ['checking Customer', { etgoIscustomer: false, etgoIsvendor: true }, 'etgoIscustomer', true, 'EM_Etgo_Iscustomer'],
    ['unchecking Vendor/Creditor', BOTH, 'etgoIsvendor', false, 'EM_Etgo_Isvendor'],
  ])('%s writes through the header form bridge', async (_label, data, field, next, column) => {
    installApi();
    const { form } = renderInWindow(data);
    fireEvent.click(screen.getByTestId(`field-${field}`));
    expect(form.onChange).toHaveBeenCalledTimes(1);
    expect(form.onChange).toHaveBeenCalledWith(field, next, column);
    await waitFor(() => expect(form.onFieldBlur).toHaveBeenCalledWith(field));
  });

  it('read-only role: the type checkboxes are disabled and never write', async () => {
    installApi();
    const { form } = renderInWindow(BOTH, { editing: false });
    const box = screen.getByTestId('field-etgoIscustomer');
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(form.onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['neither', { etgoIscustomer: 'N', etgoIsvendor: 'N' }, 0],
    ['one', { etgoIscustomer: 'Y', etgoIsvendor: 'N' }, 1],
    ['both', BOTH, 2],
  ])('reports the checked-type count to the tab badge (%s)', async (_label, data, count) => {
    installApi();
    const onCountChange = vi.fn();
    render(<BpCategoryAccountingPanel {...props(data, { onCountChange })} />);
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(count));
  });

  it('gives its tab the calculator icon instead of the generic one', () => {
    expect(resolveTabIcon('customLines', BpCategoryAccountingPanel.tabIcon)).toBe(Calculator);
  });

  it('each account searches its own field selector, paged and by query', async () => {
    installApi();
    render(<BpCategoryAccountingPanel {...props(BOTH)} />);
    fireEvent.click(await screen.findByTestId('field-bp-category-acct-writeoff'));
    await screen.findByTestId('bp-category-acct-writeoff-popup-option-VC-NEW');

    const [firstUrl, firstOpts] = selectorCalls()[0];
    expect(firstUrl).toMatch(new RegExp(`^${API_BASE}/accounting/selectors/WriteOff_Acct\\?`));
    // The account already holds a value, so the first page is the bigger locate page (ETP-6103).
    expect(firstUrl).toContain(`limit=${LOCATE_WALK_PAGE_SIZE}`);
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
