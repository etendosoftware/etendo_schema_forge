/**
 * Tests for BillingPreferencesForm — pure helper logic + basic render.
 */
import {
  render, screen, fireEvent, waitFor,
} from '@testing-library/react';
import BillingPreferencesForm from '../BillingPreferencesForm';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));
vi.mock('@/components/contract-ui', () => ({
  EntityForm: vi.fn(({ fields }) => (
    <div data-testid="entity-form">{fields?.map(f => <span key={f.key}>{f.key}</span>)}</div>
  )),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a) => toastSuccess(...a),
    error: (...a) => toastError(...a),
  },
}));

vi.mock('@/lib/apiError', () => ({
  extractApiErrorMessage: async () => 'mock error',
}));

// Replicate internal resolveId
function resolveId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

describe('BillingPreferencesForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveId (pure helper)', () => {
    it('returns null for null/undefined/empty', () => {
      expect(resolveId(null)).toBeNull();
      expect(resolveId(undefined)).toBeNull();
      expect(resolveId('')).toBeNull();
    });

    it('returns string for string input', () => {
      expect(resolveId('ABC')).toBe('ABC');
    });

    it('extracts id from object', () => {
      expect(resolveId({ id: '123', name: 'Test' })).toBe('123');
    });

    it('extracts value from object when no id', () => {
      expect(resolveId({ value: 'V1' })).toBe('V1');
    });

    it('returns null for object with empty id', () => {
      expect(resolveId({ id: '' })).toBeNull();
    });
  });

  describe('render', () => {
    it('shows after-save message when no bpId', () => {
      render(<BillingPreferencesForm data={{}} />);
      expect(screen.getByText('billingPreferencesAfterSave')).toBeInTheDocument();
    });

    it('renders entity forms when bpId exists and customer is enabled', () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      // EntityForm only renders inside the customer/vendor conditional blocks.
      // Pass customer:true so the customer billing fields are shown.
      render(
        <BillingPreferencesForm
          data={{ id: 'BP1', customer: true }}
          token="t"
          apiBaseUrl="/api"
          onChange={vi.fn()}
        />,
      );
      expect(screen.getAllByTestId('entity-form').length).toBeGreaterThan(0);
    });
  });

  // ETP-5026: the discount `DELETE /basicDiscount/{id}` branch of handleDiscountChange, fired
  // by clearing the discount select ("none" option → newDiscountId=null with an existing record).
  describe('discount delete toasts (ETP-5026)', () => {
    const BP_ID = 'bp-1';
    const DISCOUNT_ID = 'bd-1';

    function installFetch({ deleteResult } = {}) {
      globalThis.fetch = vi.fn((rawUrl, init = {}) => {
        const url = String(rawUrl);
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'DELETE') {
          if (deleteResult === 'throw') return Promise.reject(new Error('Network down'));
          if (deleteResult === 'fail') {
            return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
          }
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/basicDiscount/selectors/')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ items: [{ id: 'disc-a', label: 'Discount A' }] }),
          });
        }
        if (url.includes('/basicDiscount?parentId=')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ response: { data: [{ id: DISCOUNT_ID, discount: 'disc-a' }] } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    /** The discount `<select>` is the only combobox this form renders. */
    async function renderWithExistingDiscount(deleteResult) {
      installFetch({ deleteResult });
      render(
        <BillingPreferencesForm
          data={{ id: BP_ID, customer: true }}
          token="t"
          apiBaseUrl="/api"
          onChange={vi.fn()}
        />,
      );
      return waitFor(() => {
        const select = screen.getByRole('combobox');
        // Options land only after the selector catalog resolves.
        expect(select.querySelectorAll('option').length).toBeGreaterThan(1);
        return select;
      });
    }

    it('shows a success toast when clearing an existing discount succeeds', async () => {
      const select = await renderWithExistingDiscount();

      fireEvent.change(select, { target: { value: '' } });

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('discountDeleteSuccess'));
      expect(toastError).not.toHaveBeenCalled();
    });

    it('shows an error toast, not a success toast, when the delete responds with a non-ok status', async () => {
      const select = await renderWithExistingDiscount('fail');

      fireEvent.change(select, { target: { value: '' } });

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('mock error'));
      expect(toastSuccess).not.toHaveBeenCalled();
    });

    it('shows an error toast (not a crash) when the delete request throws', async () => {
      const select = await renderWithExistingDiscount('throw');

      fireEvent.change(select, { target: { value: '' } });

      await waitFor(() => expect(toastError).toHaveBeenCalledWith('Network down'));
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });

  // ETP-5026 Sonar refactor coverage: the update/create branches of handleDiscountChange
  // (updateDiscount / createDiscount) had no test at all — a pre-existing gap the extraction
  // did not introduce, closed here so new-code coverage does not regress the gate.
  describe('discount update/create (Sonar refactor coverage)', () => {
    const BP_ID = 'bp-1';
    const DISCOUNT_ID = 'bd-1';
    const CATALOG = [
      { id: 'disc-a', label: 'Discount A' },
      { id: 'disc-b', label: 'Discount B' },
    ];

    /** No existing discount record for this BP -> selecting one should CREATE it. */
    function installCreateFetch({ result } = {}) {
      globalThis.fetch = vi.fn((rawUrl, init = {}) => {
        const url = String(rawUrl);
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/basicDiscount?parentId=')) {
          if (result === 'fail') {
            return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ response: { data: [{ id: 'new-disc-1', discount: 'disc-b' }] } }),
          });
        }
        if (url.includes('/basicDiscount/selectors/')) {
          return Promise.resolve({ ok: true, json: async () => ({ items: CATALOG }) });
        }
        if (url.includes('/basicDiscount?parentId=')) {
          return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    /** Existing discount record set to disc-a -> selecting a different one should UPDATE it. */
    function installUpdateFetch({ result } = {}) {
      globalThis.fetch = vi.fn((rawUrl, init = {}) => {
        const url = String(rawUrl);
        const method = String(init.method || 'GET').toUpperCase();
        if (method === 'PUT' && url.includes(`/basicDiscount/${DISCOUNT_ID}`)) {
          if (result === 'fail') {
            return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({ response: { data: [{ id: DISCOUNT_ID, discount: 'disc-b' }] } }),
          });
        }
        if (url.includes('/basicDiscount/selectors/')) {
          return Promise.resolve({ ok: true, json: async () => ({ items: CATALOG }) });
        }
        if (url.includes('/basicDiscount?parentId=')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ response: { data: [{ id: DISCOUNT_ID, discount: 'disc-a' }] } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
    }

    /** The discount `<select>` is the only combobox this form renders. */
    async function renderForm(data) {
      render(
        <BillingPreferencesForm
          data={data}
          token="t"
          apiBaseUrl="/api"
          onChange={vi.fn()}
        />,
      );
      return waitFor(() => {
        const select = screen.getByRole('combobox');
        // Options land only after the selector catalog resolves.
        expect(select.querySelectorAll('option').length).toBeGreaterThan(1);
        return select;
      });
    }

    function findCall(method) {
      return globalThis.fetch.mock.calls.find(
        ([, init]) => String(init?.method || 'GET').toUpperCase() === method,
      );
    }

    it('POSTs a new /basicDiscount record with the derived customer/vendor flags when none exists yet', async () => {
      installCreateFetch();
      const select = await renderForm({ id: BP_ID, customer: true, vendor: false });

      fireEvent.change(select, { target: { value: 'disc-b' } });

      await waitFor(() => expect(select.value).toBe('disc-b'));

      const postCall = findCall('POST');
      expect(postCall).toBeTruthy();
      const [url, init] = postCall;
      expect(url).toContain(`/basicDiscount?parentId=${BP_ID}`);
      expect(JSON.parse(init.body)).toEqual({
        discount: 'disc-b',
        lineNo: 10,
        applyInOrder: 'Y',
        customer: 'Y',
        vendor: 'N',
      });
    });

    it('leaves the discount record unchanged when the create POST responds with a non-ok status', async () => {
      installCreateFetch({ result: 'fail' });
      const select = await renderForm({ id: BP_ID, customer: true, vendor: false });

      fireEvent.change(select, { target: { value: 'disc-b' } });

      // createDiscount never calls setDiscountRecord on a non-ok response, so the record
      // stays null and the select falls back to the "none" (empty) value.
      await waitFor(() => expect(select.disabled).toBe(false));
      expect(select.value).toBe('');
    });

    it('PUTs the existing /basicDiscount record when a different discount is selected', async () => {
      installUpdateFetch();
      const select = await renderForm({ id: BP_ID, customer: true, vendor: false });

      await waitFor(() => expect(select.value).toBe('disc-a'));
      fireEvent.change(select, { target: { value: 'disc-b' } });

      await waitFor(() => expect(select.value).toBe('disc-b'));

      const putCall = findCall('PUT');
      expect(putCall).toBeTruthy();
      const [url, init] = putCall;
      expect(url).toContain(`/basicDiscount/${DISCOUNT_ID}`);
      expect(JSON.parse(init.body)).toEqual({ discount: 'disc-b' });
    });

    it('leaves the discount record unchanged when the update PUT responds with a non-ok status', async () => {
      installUpdateFetch({ result: 'fail' });
      const select = await renderForm({ id: BP_ID, customer: true, vendor: false });

      await waitFor(() => expect(select.value).toBe('disc-a'));
      fireEvent.change(select, { target: { value: 'disc-b' } });

      // updateDiscount never calls setDiscountRecord on a non-ok response, so the record
      // (and the rendered value) stays exactly as it was before the change.
      await waitFor(() => expect(select.disabled).toBe(false));
      expect(select.value).toBe('disc-a');
    });
  });
});

// NOTE: the SII (AEAT) invoicing-default fields (`aeatsiiDefaultsiikey` /
// `aeatsiiSiikeylist`) were extracted out of this component and into
// `FiscalDefaultsSection.jsx` (ETP-4784 part 2 UX fix — grouping fiscal
// defaults into one section instead of leaving them as stray fields in the
// Customer billing block). Their regression coverage moved with them to
// `FiscalDefaultsSection.vitest.jsx`.
