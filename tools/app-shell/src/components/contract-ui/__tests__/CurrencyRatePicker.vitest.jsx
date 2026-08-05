// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'ctx-token' }),
}));

vi.mock('@/hooks/useNeoResource.js', () => ({
  getApiBase: () => '',
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

vi.mock('lucide-react', () => ({
  ChevronDown: (props) => <span data-testid={props['data-testid'] || 'icon-chevron'} />,
  Loader2: (props) => <span data-testid={props['data-testid'] || 'icon-loader'} />,
  Pencil: (props) => <span data-testid={props['data-testid'] || 'icon-pencil'} />,
  Check: (props) => <span data-testid={props['data-testid'] || 'icon-check'} />,
  X: (props) => <span data-testid={props['data-testid'] || 'icon-x'} />,
}));

import { CurrencyRatePicker } from '../CurrencyRatePicker.jsx';

const FIELD = { key: 'cCurrencyId', column: 'C_Currency_ID', id: 'fld-1', required: false };
const BASE_URL = 'http://localhost/sws/neo/sales-order';
const TOKEN = 'test-token';

const CURRENCIES = [
  { id: 'usd-id', isoCode: 'USD', rate: 1.2345 },
  { id: 'eur-id', isoCode: 'EUR', rate: 1 },
];

function mkFetch(currencies = CURRENCIES, sessionPrecision) {
  return vi.fn((url) => {
    if (String(url).includes('/sws/neo/session')) {
      return Promise.resolve({
        ok: true,
        json: async () => (sessionPrecision != null ? { currencyStandardPrecision: sessionPrecision } : {}),
      });
    }
    if (String(url).includes('/action/currencyOptions')) {
      return Promise.resolve({ ok: true, json: async () => currencies });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

function renderPicker(props = {}) {
  const onChange = vi.fn();
  const view = render(
    <CurrencyRatePicker
      field={FIELD}
      value="usd-id"
      displayValue="USD"
      onChange={onChange}
      formData={{ id: 'rec-1' }}
      resolvedLabel="Currency"
      token={TOKEN}
      apiBaseUrl={BASE_URL}
      {...props}
    />,
  );
  return { ...view, onChange };
}

describe('CurrencyRatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mkFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a read-only display with iso code and formatted rate', () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'new', eTGOCurrencyRate: '1.5' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        isReadOnly
        onChange={() => {}}
      />,
    );
    const container = screen.getByTestId(`field-${FIELD.key}`);
    expect(within(container).getByText('USD')).toBeInTheDocument();
    // orgPrecision defaults to 2 (useCurrencyPrecision's initial state) before its fetch resolves.
    expect(within(container).getByText('— 1.50')).toBeInTheDocument();
  });

  it('renders the placeholder when no value is selected', () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Seleccionar Currency/)).toBeInTheDocument();
    expect(screen.queryByTestId('currency-rate-pencil')).not.toBeInTheDocument();
  });

  it('renders the current currency and fetched rate, calling currencyOptions with the record id', async () => {
    renderPicker();

    expect(screen.getByText('Currency')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent('USD');
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/header/rec-1/action/currencyOptions`,
      { headers: { 'Content-Type': 'application/json' }, credentials: 'include' },
    );
  });

  it('opens the dropdown, fetches options, and lists them', async () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('USD')).toBeInTheDocument());
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('uses "new" for unsaved records and shows the empty state for non-array responses', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/action/currencyOptions')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: { unexpected: true } } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const user = userEvent.setup();
    renderPicker({ value: '', displayValue: '', formData: { id: 'new' }, entityPath: 'quotation' });

    await user.click(screen.getByTestId('currency-rate-trigger'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/quotation/new/action/currencyOptions`,
        { headers: { 'Content-Type': 'application/json' }, credentials: 'include' },
      );
    });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });

  it('shows "Sin resultados" when the search filter matches nothing', async () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('USD')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar moneda...'), { target: { value: 'zzz' } });

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('filters options by iso code as the user types', async () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('USD')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar moneda...'), { target: { value: 'eur' } });

    expect(screen.queryByText('USD')).not.toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('selecting an option stages the currency, identifier, and system rate', async () => {
    const onChange = vi.fn();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('USD')).toBeInTheDocument());

    fireEvent.click(screen.getByText('USD'));

    expect(onChange).toHaveBeenCalledWith('cCurrencyId', 'usd-id', 'C_Currency_ID');
    expect(onChange).toHaveBeenCalledWith('cCurrencyId$_identifier', 'USD');
    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 1.2345, 'EM_ETGO_Currency_Rate');
    expect(screen.queryByText('Buscar moneda...')).not.toBeInTheDocument();
  });

  it('does not stage a rate when the selected option has no rate', async () => {
    globalThis.fetch = mkFetch([{ id: 'no-rate-id', isoCode: 'XYZ', rate: null }]);
    const onChange = vi.fn();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('XYZ')).toBeInTheDocument());
    fireEvent.click(screen.getByText('XYZ'));

    expect(onChange).not.toHaveBeenCalledWith('eTGOCurrencyRate', expect.anything(), expect.anything());
  });

  it('shows the pencil icon once a currency is selected on a saved record', () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('currency-rate-pencil')).toBeInTheDocument();
  });

  it('hides the pencil when the selected currency is the org currency (rate 1)', async () => {
    // ETP-4029: CURRENCIES fixture's EUR entry has rate: 1, mirroring how
    // CurrencyOptionsHandler always returns the org's own currency with a
    // hardcoded rate of 1.0 — there is nothing to override in that case.
    renderPicker({ value: 'eur-id', displayValue: 'EUR', formData: { id: 'rec-1', eTGOCurrencyRate: '1' } });

    await waitFor(() => {
      expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent('EUR');
    });
    expect(screen.queryByTestId('currency-rate-pencil')).not.toBeInTheDocument();
  });

  it('shows the pencil again after switching from the org currency to a foreign one', async () => {
    const { rerender } = render(
      <CurrencyRatePicker
        field={FIELD}
        value="eur-id"
        displayValue="EUR"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent('EUR');
    });
    expect(screen.queryByTestId('currency-rate-pencil')).not.toBeInTheDocument();

    rerender(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('currency-rate-pencil')).toBeInTheDocument();
    });
  });

  it('supports the full manual rate override flow: pre-fill, confirm, invalid input, escape, and cancel', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ formData: { id: 'rec-1', eTGOCurrencyRate: '2.5' } });

    await user.click(await screen.findByTestId('currency-rate-pencil'));
    const input = screen.getByTestId('currency-rate-input');
    expect(input).toHaveValue(2.5);

    await user.clear(input);
    await user.type(input, '3.75');
    await user.click(screen.getByTestId('currency-rate-confirm'));
    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 3.75, 'EM_ETGO_Currency_Rate');

    await user.click(screen.getByTestId('currency-rate-pencil'));
    await user.clear(screen.getByTestId('currency-rate-input'));
    await user.type(screen.getByTestId('currency-rate-input'), '-1');
    fireEvent.keyDown(screen.getByTestId('currency-rate-input'), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalledWith('eTGOCurrencyRate', -1, 'EM_ETGO_Currency_Rate');

    await user.click(screen.getByTestId('currency-rate-pencil'));
    fireEvent.keyDown(screen.getByTestId('currency-rate-input'), { key: 'Escape' });
    expect(screen.queryByTestId('currency-rate-input')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('currency-rate-pencil'));
    await user.click(screen.getByTestId('currency-rate-cancel'));
    expect(screen.queryByTestId('currency-rate-input')).not.toBeInTheDocument();
  });

  it('confirming an invalid (non-numeric) rate does not call onChange', () => {
    const onChange = vi.fn();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-pencil'));
    fireEvent.change(screen.getByTestId('currency-rate-input'), { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByTestId('currency-rate-confirm'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('currency-rate-input')).not.toBeInTheDocument();
  });

  it('confirming a zero or negative rate does not call onChange', () => {
    const onChange = vi.fn();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-pencil'));
    fireEvent.change(screen.getByTestId('currency-rate-input'), { target: { value: '-1' } });
    fireEvent.click(screen.getByTestId('currency-rate-confirm'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('pressing Enter in the rate input confirms the override', () => {
    const onChange = vi.fn();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-pencil'));
    fireEvent.change(screen.getByTestId('currency-rate-input'), { target: { value: '3.3' } });
    fireEvent.keyDown(screen.getByTestId('currency-rate-input'), { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 3.3, 'EM_ETGO_Currency_Rate');
  });

  it('pressing Escape in the rate input cancels the override', () => {
    const onChange = vi.fn();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-pencil'));
    fireEvent.keyDown(screen.getByTestId('currency-rate-input'), { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('currency-rate-input')).not.toBeInTheDocument();
  });

  it('closes the dropdown on outside click and on Escape inside the search input', async () => {
    const user = userEvent.setup();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );

    await user.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('USD')).toBeInTheDocument());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText('Buscar moneda...')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('USD')).toBeInTheDocument());
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar moneda...'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Buscar moneda...')).not.toBeInTheDocument();
  });

  // ETP-4576 — regression guard, inverted on purpose. This used to assert that an
  // empty `token` prop suppressed the currencyOptions fetch. Under the cookie
  // session the component holds no token, so that gate made the dropdown
  // permanently empty; the request must now fire and carry no credential.
  it('fetches options with no token prop, sending the cookie and no credential header', () => {
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    const call = globalThis.fetch.mock.calls.find((c) => String(c[0]).includes('currencyOptions'));
    expect(call).toBeDefined();
    expect(call[1].credentials).toBe('include');
    expect(JSON.stringify(call[1].headers)).not.toContain('Bearer');
  });

  it('shows a required marker when the field is required', () => {
    render(
      <CurrencyRatePicker
        field={{ ...FIELD, required: true }}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('applies the fetched org precision when formatting the trigger rate', async () => {
    globalThis.fetch = mkFetch(CURRENCIES, 2);
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('— 1.23')).toBeInTheDocument());
  });

  it('renders read-only values and keeps the dropdown usable when the option fetch fails', async () => {
    const { unmount } = render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1', eTGOCurrencyRate: '4.2' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        isReadOnly
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByTestId(`field-${FIELD.key}`)).toHaveTextContent('4.20');

    unmount();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    render(
      <CurrencyRatePicker
        field={FIELD}
        value="usd-id"
        displayValue="USD"
        formData={{ id: 'rec-1' }}
        resolvedLabel="Currency"
        token={TOKEN}
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );

    await userEvent.click(screen.getByTestId('currency-rate-trigger'));
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });
});
