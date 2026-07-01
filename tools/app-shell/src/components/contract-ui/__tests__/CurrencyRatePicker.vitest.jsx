// @vitest-environment jsdom
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'ctx-token' }),
}));

vi.mock('@/hooks/useNeoResource.js', () => ({
  getApiBase: () => '',
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CurrencyRatePicker', () => {
  it('renders a read-only display with iso code and formatted rate', () => {
    globalThis.fetch = mkFetch();
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
    globalThis.fetch = mkFetch();
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

  it('opens the dropdown, fetches options, and lists them', async () => {
    globalThis.fetch = mkFetch();
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

  it('shows "Sin resultados" when the search filter matches nothing', async () => {
    globalThis.fetch = mkFetch();
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

    const searchInput = screen.getByPlaceholderText('Buscar moneda...');
    fireEvent.change(searchInput, { target: { value: 'zzz' } });

    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });

  it('filters options by iso code as the user types', async () => {
    globalThis.fetch = mkFetch();
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
    globalThis.fetch = mkFetch();
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
    globalThis.fetch = mkFetch();
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

  it('clicking the pencil opens rate editing pre-filled with the current rate', () => {
    globalThis.fetch = mkFetch();
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
    fireEvent.click(screen.getByTestId('currency-rate-pencil'));
    expect(screen.getByTestId('currency-rate-input')).toHaveValue(1.2345);
  });

  it('confirming a valid rate override calls onChange and exits edit mode', () => {
    globalThis.fetch = mkFetch();
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
    fireEvent.change(screen.getByTestId('currency-rate-input'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('currency-rate-confirm'));

    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 2.5, 'EM_ETGO_Currency_Rate');
    expect(screen.queryByTestId('currency-rate-input')).not.toBeInTheDocument();
  });

  it('confirming an invalid (non-numeric) rate does not call onChange', () => {
    globalThis.fetch = mkFetch();
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
    globalThis.fetch = mkFetch();
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

  it('cancelling rate edit discards the input without calling onChange', () => {
    globalThis.fetch = mkFetch();
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
    fireEvent.change(screen.getByTestId('currency-rate-input'), { target: { value: '9.9' } });
    fireEvent.click(screen.getByTestId('currency-rate-cancel'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId('currency-rate-input')).not.toBeInTheDocument();
  });

  it('pressing Enter in the rate input confirms the override', () => {
    globalThis.fetch = mkFetch();
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
    globalThis.fetch = mkFetch();
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

  it('closes the dropdown when clicking outside of it', async () => {
    globalThis.fetch = mkFetch();
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

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Buscar moneda...')).not.toBeInTheDocument();
  });

  it('pressing Escape in the search box closes the dropdown', async () => {
    globalThis.fetch = mkFetch();
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

    fireEvent.keyDown(screen.getByPlaceholderText('Buscar moneda...'), { key: 'Escape' });

    expect(screen.queryByText('Buscar moneda...')).not.toBeInTheDocument();
  });

  it('does not fetch options when the component token prop is missing', () => {
    globalThis.fetch = mkFetch();
    render(
      <CurrencyRatePicker
        field={FIELD}
        value=""
        formData={{ id: 'new' }}
        resolvedLabel="Currency"
        token=""
        apiBaseUrl={BASE_URL}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    // useCurrencyPrecision reads its own token from the (mocked) AuthContext, so a
    // /sws/neo/session call still fires — only the component's own currencyOptions
    // fetch must be gated on the token PROP.
    const calledUrls = globalThis.fetch.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('currencyOptions'))).toBe(false);
  });

  it('shows a required marker when the field is required', () => {
    globalThis.fetch = mkFetch();
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
});
