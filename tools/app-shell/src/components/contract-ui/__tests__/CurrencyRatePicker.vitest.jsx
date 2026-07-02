import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/hooks/useCurrencyPrecision.js', () => ({
  useCurrencyPrecision: () => 3,
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

const field = {
  id: 'currency-field',
  key: 'currency',
  column: 'C_Currency_ID',
  required: true,
};

const options = [
  { id: 'eur', isoCode: 'EUR', rate: 1.23456 },
  { id: 'usd', isoCode: 'USD', rate: 0.98765 },
];

function mockCurrencyOptionsFetch(list = options) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ response: { data: list } }),
  });
}

function renderPicker(props = {}) {
  const onChange = vi.fn();
  const view = render(
    <CurrencyRatePicker
      field={field}
      value="eur"
      displayValue="Euro"
      onChange={onChange}
      formData={{ id: 'order-1' }}
      resolvedLabel="Currency"
      token="token-1"
      apiBaseUrl="/sws/neo/sales-order"
      {...props}
    />,
  );
  return { ...view, onChange };
}

describe('CurrencyRatePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrencyOptionsFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the current currency and fetched rate using org precision', async () => {
    renderPicker();

    expect(screen.getByText('Currency')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent('EUR');
      expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent('1.235');
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/sws/neo/sales-order/header/order-1/action/currencyOptions',
      { headers: { Authorization: 'Bearer token-1' } },
    );
  });

  it('opens the dropdown, filters currencies, and stages the selected currency and rate', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByTestId('currency-rate-trigger'));
    expect(screen.getByPlaceholderText('Buscar moneda...')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar moneda...'), 'usd');
    const dropdown = screen.getByPlaceholderText('Buscar moneda...').closest('.absolute');
    expect(within(dropdown).queryByText('EUR')).not.toBeInTheDocument();
    await user.click(within(dropdown).getByText('USD'));

    expect(onChange).toHaveBeenCalledWith('currency', 'usd', 'C_Currency_ID');
    expect(onChange).toHaveBeenCalledWith('currency$_identifier', 'USD');
    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 0.98765, 'EM_ETGO_Currency_Rate');
    expect(screen.queryByPlaceholderText('Buscar moneda...')).not.toBeInTheDocument();
  });

  it('uses "new" for unsaved records and shows the empty state for non-array responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { unexpected: true } } }),
    });

    const user = userEvent.setup();
    renderPicker({ value: '', displayValue: '', formData: { id: 'new' }, entityPath: 'quotation' });

    await user.click(screen.getByTestId('currency-rate-trigger'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/sws/neo/sales-order/quotation/new/action/currencyOptions',
        { headers: { Authorization: 'Bearer token-1' } },
      );
    });
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });

  it('supports manual rate confirmation, invalid input, escape cancel, and click cancel', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ formData: { id: 'order-1', eTGOCurrencyRate: '2.5' } });

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

  it('closes on outside click and escape inside the search input', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByTestId('currency-rate-trigger'));
    expect(screen.getByPlaceholderText('Buscar moneda...')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText('Buscar moneda...')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('currency-rate-trigger'));
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar moneda...'), { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Buscar moneda...')).not.toBeInTheDocument();
  });

  it('renders read-only values and handles failed option fetches without blocking the dropdown', async () => {
    const { unmount } = renderPicker({
      isReadOnly: true,
      formData: { id: 'order-1', eTGOCurrencyRate: '4.2' },
    });

    expect(screen.getByText('Euro')).toBeInTheDocument();
    expect(screen.getByTestId('field-currency')).toHaveTextContent('4.200');

    unmount();
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    renderPicker();

    await userEvent.click(screen.getByTestId('currency-rate-trigger'));
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });
});
