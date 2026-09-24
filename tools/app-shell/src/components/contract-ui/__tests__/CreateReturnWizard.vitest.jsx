// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// CreateReturnWizard uses the Radix-backed @/components/ui/dialog (re-exported from
// app-shell-core), NOT the hand-rolled createPortal-to-document.body modal
// ImportLinesModal.jsx implements. Mocking it to plain divs is the SAME convention the
// existing sibling wrapper test already uses (goods-receipt/__tests__/PurchaseReturnWizard.
// vitest.jsx) — it sidesteps Radix Portal/Focus-trap plumbing that jsdom cannot exercise,
// so there is no createPortal-to-document.body assertion here (unlike ImportLinesModal's
// suite): the portal itself is mocked away, not exercised.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div data-testid="dialog-title">{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toast } from 'sonner';
import CreateReturnWizard from '../CreateReturnWizard.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';

// --- Fixtures ---

const LINES = [
  { id: 'line-1', product: 'p1', 'product$_identifier': 'Product A', movementQuantity: 5 },
  { id: 'line-2', product: 'p2', 'product$_identifier': 'Product B', movementQuantity: 3 },
];

const SOURCE = { id: 'src-1', documentNo: 'DOC-001', 'businessPartner$_identifier': 'Acme Inc' };

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  sourceData: SOURCE,
  lines: LINES,
  base: '/sws/neo',
  headers: {},
  onSuccess: vi.fn(),
  onError: vi.fn(),
  titleKey: 'createReturnTitle',
  refLabelKey: 'refLabel',
  docTypeLabelKey: 'docTypeLabel',
  docTypeDescriptionKey: 'docTypeDescription',
  createActionUrl: (base, id) => `${base}/some-spec/entity/${id}/action/createReturn`,
};

function renderWizard(overrides = {}) {
  const props = { ...defaultProps, ...overrides };
  return { ...render(<CreateReturnWizard {...props} />), props };
}

// A line's quantity input, scoped to its own row (there is one <input type="number"> per row).
function qtyInputFor(productLabel) {
  const row = screen.getByText(productLabel).closest('tr');
  return within(row).getByRole('spinbutton');
}

function checkboxFor(productLabel) {
  const row = screen.getByText(productLabel).closest('tr');
  return within(row).getByRole('checkbox');
}

async function goToStep2() {
  fireEvent.click(screen.getByText('next').closest('button'));
  await waitFor(() => expect(screen.getByText('docTypeLabel')).toBeInTheDocument());
}

// formatCurrency() joins the amount and the symbol with a literal NBSP (U+00A0, matching what
// Intl's currencyDisplay:'narrowSymbol' inserts) — see its own doc comment. RTL's default text
// normalizer collapses \s (which DOES include NBSP) in the DOM's textContent when matching, but
// does NOT apply that same normalization to a plain-string matcher argument, so comparing a
// `formatCurrency(...)`-built expected string against `screen.getByText` byte-for-byte fails on
// that exact NBSP-vs-normalized-space mismatch. Normalizing both sides here — instead of
// hardcoding a decimal-separator-and-symbol-side-specific literal — keeps the assertion honest
// about what formatCurrency actually returned without re-deriving its formatting rules by hand.
function findByNormalizedText(expected) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  return screen.getByText((_, el) => el?.textContent != null && norm(el.textContent) === norm(expected));
}

describe('CreateReturnWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: { id: 'return-1' } } }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when open is false', () => {
    renderWizard({ open: false });
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('renders step 1 with every line and the source document reference', () => {
    renderWizard();
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
    expect(screen.getByText(/DOC-001/)).toBeInTheDocument();
  });

  describe('auto-selection and defensive quantity seeding on open', () => {
    it('auto-selects every line as soon as the dialog opens', () => {
      renderWizard();
      expect(checkboxFor('Product A').getAttribute('aria-checked')).toBe('true');
      expect(checkboxFor('Product B').getAttribute('aria-checked')).toBe('true');
    });

    it('seeds the quantity from Math.abs(Number(movementQuantity)) for a negative source value', () => {
      const NEG_LINE = { id: 'line-neg', product: 'p3', 'product$_identifier': 'Product C', movementQuantity: -7 };
      renderWizard({ lines: [NEG_LINE] });
      expect(qtyInputFor('Product C').value).toBe('7');
    });

    it('seeds the quantity from Math.abs(Number(movementQuantity)) for a string source value', () => {
      const STR_LINE = { id: 'line-str', product: 'p4', 'product$_identifier': 'Product D', movementQuantity: '4' };
      renderWizard({ lines: [STR_LINE] });
      expect(qtyInputFor('Product D').value).toBe('4');
    });

    it('seeds a zero quantity (not NaN) when movementQuantity is missing/non-numeric', () => {
      const BAD_LINE = { id: 'line-bad', product: 'p5', 'product$_identifier': 'Product E', movementQuantity: undefined };
      renderWizard({ lines: [BAD_LINE] });
      expect(qtyInputFor('Product E').value).toBe('0');
    });
  });

  describe('quantity draft input — free typing, validated on blur only', () => {
    it('never clamps mid-edit across multiple keystrokes, even typing past maxQty', () => {
      renderWizard();
      const qtyInput = qtyInputFor('Product A'); // maxQty 5

      fireEvent.change(qtyInput, { target: { value: '1' } });
      expect(qtyInput.value).toBe('1');

      fireEvent.change(qtyInput, { target: { value: '15' } });
      expect(qtyInput.value).toBe('15');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('commits a valid value on blur, with no toast', () => {
      renderWizard();
      const qtyInput = qtyInputFor('Product A');

      fireEvent.change(qtyInput, { target: { value: '3' } });
      fireEvent.blur(qtyInput);

      expect(qtyInput.value).toBe('3');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('round-trips a decimal quantity through draft -> commit', () => {
      renderWizard();
      const qtyInput = qtyInputFor('Product A');

      fireEvent.change(qtyInput, { target: { value: '2.5' } });
      fireEvent.blur(qtyInput);

      expect(qtyInput.value).toBe('2.5');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows the qtyMaxAllowed toast (not qtyMustBePositive) and reverts when blurred above maxQty', () => {
      renderWizard();
      const qtyInput = qtyInputFor('Product A'); // maxQty 5

      fireEvent.change(qtyInput, { target: { value: '15' } });
      fireEvent.blur(qtyInput);

      expect(qtyInput.value).toBe('5'); // reverts to the initial committed value (maxQty default)
      expect(toast.error).toHaveBeenCalledWith('qtyMaxAllowed:{"max":5}');
      expect(toast.error).not.toHaveBeenCalledWith('qtyMustBePositive');
    });

    it.each(['0', ''])(
      'shows the qtyMustBePositive toast (not qtyMaxAllowed) and reverts when blurred with %j',
      (invalidValue) => {
        renderWizard();
        const qtyInput = qtyInputFor('Product A');

        fireEvent.change(qtyInput, { target: { value: invalidValue } });
        fireEvent.blur(qtyInput);

        expect(qtyInput.value).toBe('5');
        expect(toast.error).toHaveBeenCalledWith('qtyMustBePositive');
        expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('qtyMaxAllowed'));
      },
    );

    it('shows the qtyMustBePositive toast and reverts when blurred with a non-numeric draft', () => {
      renderWizard();
      const qtyInput = qtyInputFor('Product A');

      fireEvent.change(qtyInput, { target: { value: 'abc' } });
      fireEvent.blur(qtyInput);

      expect(qtyInput.value).toBe('5');
      expect(toast.error).toHaveBeenCalledWith('qtyMustBePositive');
    });
  });

  describe('step navigation and canProceed gating', () => {
    it('advances to step 2 on Next and returns to step 1 on Back', async () => {
      renderWizard();
      await goToStep2();
      expect(screen.getByText('Product A')).toBeInTheDocument(); // still shown in the step-2 summary

      fireEvent.click(screen.getByText('back').closest('button'));
      expect(qtyInputFor('Product A')).toBeInTheDocument(); // step-1-only element (the editable input)
    });

    it('disables Next when a selected line has a zero committed quantity', () => {
      const ZERO_LINE = { id: 'line-zero', product: 'p6', 'product$_identifier': 'Product Zero', movementQuantity: 0 };
      const OK_LINE = LINES[0];
      renderWizard({ lines: [ZERO_LINE, OK_LINE] });

      expect(screen.getByText('next').closest('button')).toBeDisabled();
    });

    it('re-enables Next once the zero-quantity line is deselected', () => {
      const ZERO_LINE = { id: 'line-zero', product: 'p6', 'product$_identifier': 'Product Zero', movementQuantity: 0 };
      const OK_LINE = LINES[0];
      renderWizard({ lines: [ZERO_LINE, OK_LINE] });

      fireEvent.click(checkboxFor('Product Zero'));

      expect(screen.getByText('next').closest('button')).not.toBeDisabled();
    });

    it('disables Next when no line is selected', () => {
      renderWizard();
      // Deselect both lines individually.
      fireEvent.click(checkboxFor('Product A'));
      fireEvent.click(checkboxFor('Product B'));

      expect(screen.getByText('next').closest('button')).toBeDisabled();
    });
  });

  describe('showAmountColumn (step 2 summary)', () => {
    it('shows no Amount column/total when showAmountColumn is false (default)', async () => {
      renderWizard();
      await goToStep2();

      expect(screen.queryByText('amount')).not.toBeInTheDocument();
    });

    it('shows the Amount column and computes qty * unitPrice per line + total when showAmountColumn is true', async () => {
      const fetchPrices = vi.fn().mockResolvedValue({
        priceMap: { p1: 10, p2: 20 },
        currency: 'EUR',
      });
      renderWizard({ showAmountColumn: true, fetchPrices });

      await waitFor(() => expect(fetchPrices).toHaveBeenCalledWith({ base: defaultProps.base, sourceData: SOURCE }));
      await goToStep2();

      expect(screen.getByText('amount')).toBeInTheDocument();
      // line-1: qty 5 * price 10 = 50; line-2: qty 3 * price 20 = 60; total = 110
      await waitFor(() => {
        expect(findByNormalizedText(formatCurrency('EUR', 50))).toBeInTheDocument();
        expect(findByNormalizedText(formatCurrency('EUR', 60))).toBeInTheDocument();
        expect(findByNormalizedText(formatCurrency('EUR', 110))).toBeInTheDocument();
      });
    });

    it('does not call fetchPrices at all when showAmountColumn is false, even if fetchPrices is provided', () => {
      const fetchPrices = vi.fn().mockResolvedValue({ priceMap: {}, currency: 'EUR' });
      renderWizard({ fetchPrices });
      expect(fetchPrices).not.toHaveBeenCalled();
    });
  });

  describe('handleConfirm', () => {
    async function confirmFromStep2(overrides = {}) {
      const utils = renderWizard(overrides);
      await goToStep2();
      fireEvent.click(screen.getByText('createReturn').closest('button'));
      return utils;
    }

    it('POSTs to createActionUrl(base, sourceData.id) with the selected lines and reason, then calls onClose + onSuccess with the response data', async () => {
      const { props } = await confirmFromStep2();

      await waitFor(() => expect(props.onSuccess).toHaveBeenCalled());

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = globalThis.fetch.mock.calls[0];
      expect(url).toBe('/sws/neo/some-spec/entity/src-1/action/createReturn');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body).toEqual({
        lines: [
          { lineId: 'line-1', returnQuantity: 5 },
          { lineId: 'line-2', returnQuantity: 3 },
        ],
        reason: '',
      });

      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onSuccess).toHaveBeenCalledWith({ id: 'return-1' });
    });

    // The real bug found live in production (409 conflict): the backend's actual error envelope
    // is `{ error: { message, status } }`. Before the fix, handleConfirm's message-parsing chain
    // did not recognise this shape and the user only ever saw the generic
    // "Request failed (409)" fallback, never the real backend sentence explaining the conflict.
    it('extracts the real backend message from the {error:{message,status}} envelope instead of falling back to the generic message (ETP-5429 regression)', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: { message: 'A return already exists for shipment: DOC-001', status: 409 } }),
      }));

      const { props } = await confirmFromStep2();

      await waitFor(() => expect(props.onError).toHaveBeenCalled());
      expect(props.onError).toHaveBeenCalledWith('A return already exists for shipment: DOC-001');
      expect(props.onError).not.toHaveBeenCalledWith(expect.stringContaining('Request failed'));
      expect(props.onSuccess).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('falls back to the generic "Request failed (status)" message when the body carries no recognised error shape', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }));

      const { props } = await confirmFromStep2();

      await waitFor(() => expect(props.onError).toHaveBeenCalled());
      expect(props.onError).toHaveBeenCalledWith('Request failed (500)');
    });

    it('falls back to the generic message (does not throw) when res.json() itself rejects on a failed response', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not valid json')),
      }));

      const { props } = await confirmFromStep2();

      await waitFor(() => expect(props.onError).toHaveBeenCalled());
      expect(props.onError).toHaveBeenCalledWith('Request failed (500)');
      expect(props.onSuccess).not.toHaveBeenCalled();
    });

    it('reads other known backend error envelopes too (response.error.message)', async () => {
      globalThis.fetch = vi.fn(() => Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ response: { error: { message: 'Nested response error message' } } }),
      }));

      const { props } = await confirmFromStep2();

      await waitFor(() => expect(props.onError).toHaveBeenCalled());
      expect(props.onError).toHaveBeenCalledWith('Nested response error message');
    });
  });
});
