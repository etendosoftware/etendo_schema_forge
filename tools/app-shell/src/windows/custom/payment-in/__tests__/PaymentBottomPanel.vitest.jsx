// @covers artifacts/payment-in/custom/PaymentBottomPanel.jsx
/**
 * PaymentBottomPanel — the "Datos" block (DatosSection / FieldItem).
 *
 * Every value goes through the shared `TruncatedText` (ellipsis + tooltip only when clipped),
 * except the date, which must never be cut: it renders as a plain no-wrap span in a cell that
 * cannot shrink below its content. An empty value shows "—" and has no tooltip.
 *
 * jsdom does no layout, so `scrollWidth` / `clientWidth` are 0 everywhere; the overflow tests
 * stamp the pair onto the value span, which is exactly what TruncatedText reads.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));
vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));

import PaymentBottomPanel from '@generated/payment-in/custom/PaymentBottomPanel';

const LONG_CUSTOMER = 'Distribuciones Comerciales del Norte y Levante Sociedad Limitada Unipersonal';

const DATA = {
  id: 'pay-1',
  status: 'RPR',
  documentNo: 'PAY-0001',
  'businessPartner$_identifier': LONG_CUSTOMER,
  paymentDate: '2026-08-10',
  'paymentMethod$_identifier': 'Transferencia',
  'account$_identifier': 'Banco Santander - Cuenta Principal',
  'currency$_identifier': 'EUR',
  referenceNo: 'REF-42',
};

const TRUNCATED_FIELDS = [
  ['docNo', 'PAY-0001'],
  ['customer', LONG_CUSTOMER],
  ['method', 'Transferencia'],
  ['depositTo', 'Banco Santander - Cuenta Principal'],
  ['currency', 'EUR'],
  ['reference', 'REF-42'],
];

const fieldId = (id) => `PaymentBottomPanel__field-${id}`;

const setMetrics = (el, scrollWidth, clientWidth) => {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
};

function renderPanel(data = DATA) {
  // No apiBaseUrl: the lines section skips its fetch, so only the Datos block is exercised.
  return render(<PaymentBottomPanel data={data} />);
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('PaymentBottomPanel — Datos values', () => {
  it.each(TRUNCATED_FIELDS)('renders %s through TruncatedText with its -value test id', (id, text) => {
    renderPanel();
    const value = screen.getByTestId(`${fieldId(id)}-value`);
    expect(value).toHaveTextContent(text);
    // TruncatedText's own span: `block w-full truncate`.
    expect(value.className.split(/\s+/)).toEqual(expect.arrayContaining(['truncate', 'w-full']));
    expect(screen.getByTestId(fieldId(id))).toContainElement(value);
  });

  it('formats the date and never truncates it', () => {
    renderPanel();
    const cell = screen.getByTestId(fieldId('date'));
    const value = screen.getByTestId(`${fieldId('date')}-value`);
    expect(value).toHaveTextContent('10/08/2026');
    expect(value.className).not.toContain('truncate');
    expect(value.style.whiteSpace).toBe('nowrap');
    expect(cell.style.minWidth).toBe('max-content');
  });

  it('lets the truncatable cells shrink (minWidth 0) while the date cell does not', () => {
    renderPanel();
    expect(screen.getByTestId(fieldId('customer')).style.minWidth).toBe('0px');
    expect(screen.getByTestId(fieldId('date')).style.minWidth).toBe('max-content');
  });

  it('shows "—" with no value span and no tooltip when a value is empty', async () => {
    renderPanel({ ...DATA, referenceNo: '' });
    const cell = screen.getByTestId(fieldId('reference'));
    expect(cell).toHaveTextContent('—');
    expect(screen.queryByTestId(`${fieldId('reference')}-value`)).toBeNull();

    const user = userEvent.setup();
    await user.hover(screen.getByText('—'));
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByTestId(`${fieldId('reference')}-value-tooltip`)).toBeNull();
  });

  it('shows "—" for an empty date as well', () => {
    renderPanel({ ...DATA, paymentDate: null });
    expect(screen.getByTestId(fieldId('date'))).toHaveTextContent('—');
    expect(screen.queryByTestId(`${fieldId('date')}-value`)).toBeNull();
  });

  it('falls back to EUR when the currency is missing', () => {
    renderPanel({ ...DATA, 'currency$_identifier': undefined });
    expect(screen.getByTestId(`${fieldId('currency')}-value`)).toHaveTextContent('EUR');
  });
});

describe('PaymentBottomPanel — tooltip only when the value is clipped', () => {
  it('reveals the full value on hover when it overflows', async () => {
    const user = userEvent.setup();
    renderPanel();
    const value = screen.getByTestId(`${fieldId('customer')}-value`);
    setMetrics(value, 640, 200);

    await user.hover(value);

    await waitFor(() => {
      expect(screen.getAllByTestId(`${fieldId('customer')}-value-tooltip`)[0]).toHaveTextContent(LONG_CUSTOMER);
    });
  });

  it('shows no tooltip on hover when the value fits', async () => {
    const user = userEvent.setup();
    renderPanel();
    const value = screen.getByTestId(`${fieldId('docNo')}-value`);
    setMetrics(value, 80, 200);

    await user.hover(value);
    await new Promise((r) => setTimeout(r, 300));

    expect(screen.queryByTestId(`${fieldId('docNo')}-value-tooltip`)).toBeNull();
  });
});
