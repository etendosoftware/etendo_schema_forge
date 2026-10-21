// @covers artifacts/business-partner-category/custom/BpCategoryAccountingPanel.jsx
// @covers artifacts/business-partner-category/custom/bpCategoryContactTypes.js
/**
 * Contact category — Accounting tab. The category's single C_BP_Group_Acct row is laid out in
 * a Customers section and a Vendor/Creditor section, each following the header's type checkbox
 * LIVE (the unsaved editing record). An unchecked type's section is hidden; its stored
 * values are never cleared. Each account pick is
 * PATCHed on its own and tells the user when the category already has contacts.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  notify: vi.fn(),
  toastError: vi.fn(),
  ui: (key) => key,
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mocks.apiFetch }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('@/hooks/useEntity.js', () => ({ extractErrorMessage: async () => 'patch-refused' }));
vi.mock('@etendosoftware/app-shell-core/lib/recordVersions.js', () => ({ rememberRecordVersion: vi.fn() }));
vi.mock('@generated/business-partner-category/custom/useAssociatedContactsNotice.js', () => ({
  useAssociatedContactsNotice: () => mocks.notify,
}));
// The shared form is not under test: it shows which accounts a section renders and offers a
// button to pick an account.
vi.mock('@/components/contract-ui', () => ({
  EntityForm: ({ fields, data, onChange }) => (
    <div data-testid={`form-${fields.map((f) => f.key).join(',')}`}>
      {fields.map((f) => (
        <button key={f.key} type="button" data-testid={`pick-${f.key}`} onClick={() => onChange(f.key, 'ACC-NEW')}>
          {String(data?.[f.key] ?? '')}
        </button>
      ))}
    </div>
  ),
}));

import BpCategoryAccountingPanel from '@generated/business-partner-category/custom/BpCategoryAccountingPanel.jsx';
import { resolveAccountSections } from '@generated/business-partner-category/custom/bpCategoryContactTypes.js';

const ACCT_ROW = { id: 'ACCT-1', customerReceivablesNo: 'ACC-430', vendorLiability: 'ACC-400' };
const listResponse = (rows) => ({ ok: true, json: async () => ({ response: { data: rows } }) });

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

describe('BpCategoryAccountingPanel', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.notify.mockReset();
    mocks.toastError.mockReset();
  });

  const props = (data, extra = {}) => ({ recordId: 'G-1', data, apiBaseUrl: '/sws/neo/business-partner-category', ...extra });

  it('shows the sections of the types checked in the unsaved header, without reloading', async () => {
    mocks.apiFetch.mockResolvedValue(listResponse([ACCT_ROW]));
    const { rerender } = render(<BpCategoryAccountingPanel {...props({ etgoIscustomer: true, etgoIsvendor: false })} />);

    expect(await screen.findByTestId('bp-category-accounts-customer')).toBeInTheDocument();
    expect(screen.queryByTestId('bp-category-accounts-vendor')).toBeNull();

    rerender(<BpCategoryAccountingPanel {...props({ etgoIscustomer: true, etgoIsvendor: true })} />);
    expect(screen.getByTestId('bp-category-accounts-vendor')).toBeInTheDocument();
    // The hidden section's stored value is still there once shown again.
    expect(screen.getByTestId('pick-vendorLiability')).toHaveTextContent('ACC-400');
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.apiFetch.mock.calls[0][0]).toMatch(/^\/accounting\?parentId=G-1&/);
  });

  it.each([
    ['no type checked', { etgoIscustomer: false, etgoIsvendor: false }, {}, null, 'bp-category-accounts-no-type'],
    ['a category not saved yet', { etgoIscustomer: true }, { isNew: true, recordId: null }, null, 'bp-category-accounts-save-first'],
    ['the accounting row cannot be read', { etgoIscustomer: true }, {}, { ok: false, json: async () => ({}) }, 'bp-category-accounts-load-error'],
  ])('explains instead of showing accounts when %s', async (_label, data, extra, response, testId) => {
    mocks.apiFetch.mockResolvedValue(response ?? listResponse([ACCT_ROW]));
    render(<BpCategoryAccountingPanel {...props(data, extra)} />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId('bp-category-accounting-panel')).toBeNull();
    // A category that does not exist yet has no accounting row to read.
    if (extra.isNew) expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['saved: PATCHes only that account and runs the contacts notice', true],
    ['refused: shows the error, restores the value, no notice', false],
  ])('picking an account — %s', async (_label, ok) => {
    mocks.apiFetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'PATCH') {
        return ok
          ? { ok: true, json: async () => ({ response: { data: [{ ...ACCT_ROW, customerPrepayment: 'ACC-NEW' }] } }) }
          : { ok: false, json: async () => ({}) };
      }
      return listResponse([ACCT_ROW]);
    });
    const user = userEvent.setup();
    render(<BpCategoryAccountingPanel {...props({ etgoIscustomer: true })} />);
    await user.click(await screen.findByTestId('pick-customerPrepayment'));

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/accounting/ACCT-1', {
      method: 'PATCH', body: JSON.stringify({ customerPrepayment: 'ACC-NEW' }),
    }));
    if (ok) {
      await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('G-1'));
      expect(screen.getByTestId('pick-customerPrepayment')).toHaveTextContent('ACC-NEW');
    } else {
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('patch-refused'));
      expect(screen.getByTestId('pick-customerPrepayment')).toHaveTextContent('');
      expect(mocks.notify).not.toHaveBeenCalled();
    }
  });
});
