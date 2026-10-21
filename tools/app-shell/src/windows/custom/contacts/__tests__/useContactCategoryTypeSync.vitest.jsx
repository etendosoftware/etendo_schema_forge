// @covers tools/app-shell/src/windows/custom/contacts/useContactCategoryTypeSync.js
/**
 * The Contacts header form's side of "the contact category decides the contact type".
 *
 *  - Saved contact: picking another category overwrites Cliente / Proveedor-Acreedor with the
 *    category's flags; a legacy category (neither flag) or unknown flags leave them alone; only
 *    the LATEST selection may apply its flags.
 *  - Create popup opened from a document (ContactTypeRequirementContext): a category that does
 *    not grant the document's type is refused — the field keeps its value and an error is shown;
 *    a category that reached the form another way (/defaults) is cleared when incompatible.
 */
import { useCallback, useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  boundBase: null,
  toastError: vi.fn(),
  // Stable identity: the hook memoises its message builder on `ui`.
  ui: (key, params) => `${key}|${params?.category ?? ''}`,
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui }));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => { mocks.boundBase = base; return mocks.apiFetch; },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { useContactCategoryTypeSync } from '../useContactCategoryTypeSync.js';
import { ContactTypeRequirementContext } from '@/components/contract-ui/contactTypeRequirement.js';

const CAT = 'businessPartnerCategory';
const CAT_LABEL = 'businessPartnerCategory$_identifier';

const flagsResponse = (customer, vendor) => ({
  ok: true, json: async () => ({ response: { data: [{ etgoIscustomer: customer, etgoIsvendor: vendor }] } }),
});
const FLAGS = {
  'G-CLI': flagsResponse('Y', 'N'),
  'G-PRO': flagsResponse('N', 'Y'),
  'G-BOTH': flagsResponse('Y', 'Y'),
  'G-LEGACY': flagsResponse('N', 'N'),
  'G-UNKNOWN': { ok: false, json: async () => ({}) },
};
function answerFlags() {
  mocks.apiFetch.mockImplementation(async (url) => FLAGS[String(url).split('/').pop()]);
}

/** A form that applies every write, so the hook sees its own effects like in DetailView. */
function useHarness(initial, writes) {
  const [data, setData] = useState(initial);
  const onChange = useCallback((key, value) => {
    writes(key, value);
    setData((prev) => ({ ...prev, [key]: value }));
  }, [writes]);
  const sync = useContactCategoryTypeSync({ data, onChange, apiBaseUrl: '/sws/neo/contacts', enabled: true });
  return { data, ...sync };
}

function renderSync(initial, requirement = null) {
  const writes = vi.fn();
  const wrapper = ({ children }) => (
    <ContactTypeRequirementContext.Provider value={requirement}>{children}</ContactTypeRequirementContext.Provider>
  );
  const utils = renderHook(() => useHarness(initial, writes), { wrapper });
  return { ...utils, writes };
}

/** What EntityForm emits for a selector pick: the id, then its label, in the same tick. */
function pick(result, id, label) {
  act(() => {
    result.current.onChange(CAT, id);
    result.current.onChange(CAT_LABEL, label);
  });
}

const typeWrites = (writes) => writes.mock.calls.filter(([k]) => k === 'customer' || k === 'vendor');

beforeEach(() => {
  mocks.apiFetch.mockReset();
  mocks.toastError.mockReset();
  answerFlags();
});

describe('useContactCategoryTypeSync — saved contact', () => {
  it.each([
    ['a customer-only category makes it customer only', 'G-CLI', [['customer', true], ['vendor', false]]],
    ['a both-types category ticks the missing type', 'G-BOTH', [['customer', true]]],
    ['a legacy category with neither flag leaves the types alone', 'G-LEGACY', []],
    ['an unreadable category leaves the types alone', 'G-UNKNOWN', []],
  ])('%s', async (_label, categoryId, expectedTypeWrites) => {
    const { result, writes } = renderSync({ id: 'BP-1', [CAT]: 'G-PRO', customer: false, vendor: true });
    pick(result, categoryId, 'Nueva');

    // Without a requirement the category is applied immediately, label included.
    expect(result.current.data[CAT]).toBe(categoryId);
    expect(result.current.data[CAT_LABEL]).toBe('Nueva');
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(`/businessPartnerCategory/${categoryId}`));
    await waitFor(() => expect(typeWrites(writes)).toEqual(expectedTypeWrites));
    expect(mocks.boundBase).toBe('/sws/neo/business-partner-category');
  });

  it('applies only the latest selection when an earlier read answers last', async () => {
    let releaseSlow;
    mocks.apiFetch.mockImplementation((url) => (String(url).endsWith('/G-CLI')
      ? new Promise((resolve) => { releaseSlow = () => resolve(FLAGS['G-CLI']); })
      : Promise.resolve(FLAGS['G-PRO'])));
    const { result, writes } = renderSync({ id: 'BP-1', [CAT]: 'G-BOTH', customer: true, vendor: true });

    pick(result, 'G-CLI', 'Cliente');
    pick(result, 'G-PRO', 'Proveedor');
    await waitFor(() => expect(typeWrites(writes)).toEqual([['customer', false]]));
    await act(async () => { releaseSlow(); });

    expect(typeWrites(writes)).toEqual([['customer', false]]);
    expect(result.current.data).toMatchObject({ [CAT]: 'G-PRO', customer: false, vendor: true });
  });

  it('does not read the category of a contact that is not saved yet', () => {
    const { result, writes } = renderSync({ name: 'Nuevo' });
    pick(result, 'G-CLI', 'Cliente');
    expect(result.current.data[CAT]).toBe('G-CLI');
    expect(mocks.apiFetch).not.toHaveBeenCalled();
    expect(typeWrites(writes)).toEqual([]);
  });
});

describe('useContactCategoryTypeSync — create popup from a purchase (vendor required)', () => {
  const VENDOR = { requiredType: 'vendor' };

  it.each([
    ['a customer-only category is refused', 'G-CLI', false],
    ['a vendor category is applied', 'G-PRO', true],
    ['a both-types category is applied', 'G-BOTH', true],
    ['a legacy category with neither flag is let through', 'G-LEGACY', true],
    ['an unreadable category is let through', 'G-UNKNOWN', true],
  ])('%s', async (_label, categoryId, applied) => {
    const { result, writes } = renderSync({ name: 'Nuevo', [CAT]: 'G-BOTH', [CAT_LABEL]: 'Ambos' }, VENDOR);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith('/businessPartnerCategory/G-BOTH'));
    pick(result, categoryId, 'Elegida');

    // Held until the flags are known: nothing reaches the form in the meantime.
    expect(result.current.data[CAT]).toBe('G-BOTH');
    if (applied) {
      await waitFor(() => expect(result.current.data[CAT]).toBe(categoryId));
      expect(result.current.data[CAT_LABEL]).toBe('Elegida');
      expect(result.current.categoryError).toBeNull();
      expect(mocks.toastError).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(result.current.categoryError).toBe('contactCategoryNotVendor|Elegida'));
      expect(mocks.toastError).toHaveBeenCalledWith('contactCategoryNotVendor|Elegida');
      expect(result.current.data).toMatchObject({ [CAT]: 'G-BOTH', [CAT_LABEL]: 'Ambos' });
      expect(writes.mock.calls.some(([k]) => k === CAT)).toBe(false);
    }
  });

  it.each([
    ['an incompatible /defaults category is cleared with the error under the field', 'G-CLI', true],
    ['a compatible one is kept', 'G-PRO', false],
  ])('%s', async (_label, categoryId, cleared) => {
    const { result } = renderSync({ name: 'Nuevo', [CAT]: categoryId, [CAT_LABEL]: 'Por defecto' }, VENDOR);
    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledWith(`/businessPartnerCategory/${categoryId}`));
    if (cleared) {
      await waitFor(() => expect(result.current.data[CAT]).toBeNull());
      expect(result.current.data[CAT_LABEL]).toBe('');
      expect(result.current.categoryError).toBe('contactCategoryNotVendor|Por defecto');
    } else {
      // Give the read a chance to settle, then nothing must have changed.
      await act(async () => {});
      expect(result.current.data[CAT]).toBe(categoryId);
      expect(result.current.categoryError).toBeNull();
    }
  });
});
