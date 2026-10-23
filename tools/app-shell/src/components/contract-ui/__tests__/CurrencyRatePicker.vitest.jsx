// @vitest-environment jsdom
// @covers tools/app-shell/src/components/contract-ui/CurrencyRatePicker.jsx
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

// ETP-5840 — the picker's strings now go through useUI(); resolve them against the Spanish
// catalog so the assertions below keep reading the text a user actually sees.
vi.mock('@/i18n', async (importOriginal) => {
  const actual = await importOriginal();
  const es = (await import('../../../locales/es_ES.json')).default.genericLabels;
  const ui = (key, params) => String(es[key] ?? key)
    .replace(/\{(\w+)\}/g, (m, name) => (params?.[name] ?? m));
  return { ...actual, useUI: () => ui };
});

vi.mock('lucide-react', () => ({
  ChevronDown: (props) => <span data-testid={props['data-testid'] || 'icon-chevron'} />,
  Loader2: (props) => <span data-testid={props['data-testid'] || 'icon-loader'} />,
  Pencil: (props) => <span data-testid={props['data-testid'] || 'icon-pencil'} />,
  Check: (props) => <span data-testid={props['data-testid'] || 'icon-check'} />,
  X: (props) => <span data-testid={props['data-testid'] || 'icon-x'} />,
}));

import { CurrencyRatePicker, resolveRateDateField } from '../CurrencyRatePicker.jsx';

const FIELD = { key: 'cCurrencyId', column: 'C_Currency_ID', id: 'fld-1', required: false };
const BASE_URL = 'http://localhost/sws/neo/sales-order';
const TOKEN = 'test-token';

const CURRENCIES = [
  { id: 'usd-id', isoCode: 'USD', rate: 1.2345 },
  { id: 'eur-id', isoCode: 'EUR', rate: 1, isOrgCurrency: true },
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

describe('resolveRateDateField', () => {
  const ACCT = { key: 'accountingDate', column: 'DateAcct' };
  const INVOICE_DATE = { key: 'invoiceDate', column: 'DateInvoiced' };
  it.each([
    ['the DateAcct-bound field wins over the document date', [INVOICE_DATE, ACCT], 'invoiceDate', 'accountingDate'],
    ['the document date when no field is bound to DateAcct', [INVOICE_DATE], 'orderDate', 'orderDate'],
    ['null when there is no DateAcct field and no document date', [INVOICE_DATE], undefined, null],
    ['the document date when the fields are not an array', null, 'orderDate', 'orderDate'],
  ])('returns %s', (_label, fields, documentDateField, expected) => {
    expect(resolveRateDateField(fields, documentDateField)).toBe(expected);
  });
});

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
    // ETP-5107: the decimal separator comes from getCurrencyFormatConfig(), which defaults to
    // the es-ES-style ',' until /sws/neo/currency-format resolves.
    expect(within(container).getByText('— 1,50')).toBeInTheDocument();
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
      { credentials: 'include', signal: expect.any(AbortSignal), headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES' } },
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
        { credentials: 'include', signal: expect.any(AbortSignal), headers: { Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES' } },
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

  // Rewritten: a currency with no conversion range on the reference date used to stage nothing,
  // so the previous currency's (or a manual) rate survived the change. It is now a legal choice
  // that clears the rate and shows «—» until the user types one.
  it('lists a currency without a rate on the date as «—» and selecting it clears the staged rate', async () => {
    globalThis.fetch = mkFetch([{ id: 'no-rate-id', isoCode: 'XYZ', rate: null }]);
    const onChange = vi.fn();
    const props = {
      field: FIELD, resolvedLabel: 'Currency', token: TOKEN, apiBaseUrl: BASE_URL, onChange,
    };
    const { rerender } = render(
      <CurrencyRatePicker {...props} value="" formData={{ id: 'new', eTGOCurrencyRate: 2.5 }} />,
    );
    fireEvent.click(screen.getByTestId('currency-rate-trigger'));
    await waitFor(() => expect(screen.getByText('XYZ')).toBeInTheDocument());
    expect(screen.getByTestId('currency-rate-option-missing')).toHaveTextContent('—');
    fireEvent.click(screen.getByText('XYZ'));

    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', null, 'EM_ETGO_Currency_Rate');

    // The staged null renders as «—» on the trigger — never as some other date's rate.
    rerender(<CurrencyRatePicker {...props} value="no-rate-id" formData={{ id: 'new', eTGOCurrencyRate: null }} />);
    expect(await screen.findByTestId('currency-rate-missing')).toBeInTheDocument();
    expect(screen.getByTestId('currency-rate-trigger')).not.toHaveTextContent(/\d/);
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

  it('hides the pencil when the selected currency is the org currency (isOrgCurrency)', async () => {
    // ETP-5840: the org currency is identified by the option's `isOrgCurrency` flag returned by
    // CurrencyOptionsHandler, not by the old rate === 1 sentinel — there is nothing to override.
    renderPicker({ value: 'eur-id', displayValue: 'EUR', formData: { id: 'rec-1', eTGOCurrencyRate: '1' } });

    await waitFor(() => {
      expect(screen.queryByTestId('currency-rate-pencil')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent('EUR');
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
      expect(screen.queryByTestId('currency-rate-pencil')).not.toBeInTheDocument();
    });

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

  // The pencil used to require a saved record; a new document can carry a manual rate too.
  it.each([
    ['shows', 'a foreign currency', 'usd-id', true],
    ['hides', 'the org currency', 'eur-id', false],
  ])('%s the pencil on a new document for %s', async (_verb, _what, value, visible) => {
    renderPicker({ value, displayValue: '', formData: { id: 'new' } });
    await waitFor(() => expect(screen.getByTestId('currency-rate-trigger')).toHaveTextContent(/USD|EUR/));
    await waitFor(() => {
      expect(screen.queryByTestId('currency-rate-pencil') !== null).toBe(visible);
    });
  });

  it('scopes the options by the form reference date and organization, refetching when either changes', async () => {
    const props = {
      field: FIELD, value: 'usd-id', displayValue: 'USD', resolvedLabel: 'Currency',
      token: TOKEN, apiBaseUrl: BASE_URL, onChange: () => {}, rateDateField: 'orderDate',
    };
    const optionUrls = () => globalThis.fetch.mock.calls
      .map(([u]) => String(u)).filter((u) => u.includes('/action/currencyOptions'));
    const { rerender } = render(
      <CurrencyRatePicker {...props} formData={{ id: 'rec-1', orderDate: '2026-01-15', organization: { id: 'org-1' } }} />,
    );
    await waitFor(() => expect(optionUrls()).toContain(
      `${BASE_URL}/header/rec-1/action/currencyOptions?date=2026-01-15&organization=org-1`));

    // Unsaved edits of the date and the org (here a plain id string) drive a new fetch.
    rerender(<CurrencyRatePicker {...props} formData={{ id: 'rec-1', orderDate: '2026-02-01', organization: 'org-2' }} />);
    await waitFor(() => expect(optionUrls()).toContain(
      `${BASE_URL}/header/rec-1/action/currencyOptions?date=2026-02-01&organization=org-2`));
  });

  it('supports the full manual rate override flow: pre-fill, confirm, invalid input, escape, and cancel', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker({ formData: { id: 'rec-1', eTGOCurrencyRate: '2.5' } });

    await user.click(await screen.findByTestId('currency-rate-pencil'));
    const input = screen.getByTestId('currency-rate-input');
    // ETP-5107: the editor is seeded in the same convention the rate is displayed in, so on a
    // comma-decimal instance the user is handed '2,5' (a string — the input is text, not number)
    // rather than a period they cannot retype.
    expect(input).toHaveValue('2,5');

    await user.clear(input);
    await user.type(input, '3.75');
    await user.click(screen.getByTestId('currency-rate-confirm'));
    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 3.75, 'EM_ETGO_Currency_Rate');

    // ETP-5107 positive path: a rate typed the way it is displayed (comma) must COMMIT, not be
    // silently discarded. A bare parseFloat('2,5') returns 2 here and a bare parseFloat('0,86')
    // returns 0, which the `> 0` guard then drops with no feedback.
    await user.click(screen.getByTestId('currency-rate-pencil'));
    await user.clear(screen.getByTestId('currency-rate-input'));
    await user.type(screen.getByTestId('currency-rate-input'), '2,5');
    await user.click(screen.getByTestId('currency-rate-confirm'));
    expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 2.5, 'EM_ETGO_Currency_Rate');

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

  // ETP-4576 — inverted: the picker must still load its options with no token prop, since
  // under the cookie scheme nothing hands it one.
  it('still fetches options when the component token prop is missing', () => {
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
    expect(calledUrls.some((u) => u.includes('currencyOptions'))).toBe(true);
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
    await waitFor(() => expect(screen.getByText('— 1,23')).toBeInTheDocument());
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
    expect(screen.getByTestId(`field-${FIELD.key}`)).toHaveTextContent('4,20');

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

  describe('ETP-5107 — comma-decimal rates', () => {
    function renderEditing(props = {}) {
      const onChange = vi.fn();
      const { unmount } = render(
        <CurrencyRatePicker
          field={FIELD}
          value="usd-id"
          displayValue="USD"
          formData={{ id: 'rec-1', eTGOCurrencyRate: '1.2345' }}
          resolvedLabel="Currency"
          token={TOKEN}
          apiBaseUrl={BASE_URL}
          onChange={onChange}
          {...props}
        />,
      );
      fireEvent.click(screen.getByTestId('currency-rate-pencil'));
      return { input: screen.getByTestId('currency-rate-input'), onChange, unmount };
    }

    it('renders the rate editor as a text input with a decimal keypad, never a native number input', () => {
      // A native `type="number"` rejects the comma keystroke outright, so on a comma-decimal
      // instance the rate could not be typed the way it is displayed. `inputMode="decimal"` keeps
      // the numeric keypad on touch devices without that restriction.
      const { input } = renderEditing();
      expect(input).not.toHaveAttribute('type', 'number');
      expect(input).toHaveAttribute('type', 'text');
      expect(input).toHaveAttribute('inputmode', 'decimal');
      // step/min are inert on a text input — the real `> 0` check lives in handleRateConfirm.
      expect(input).not.toHaveAttribute('step');
      expect(input).not.toHaveAttribute('min');
    });

    it('keeps the org precision when formatting a rate instead of collapsing it to two decimals', async () => {
      // A careless "just route it through formatCurrency" fix would force exactly two decimals and
      // silently truncate a 4-decimal rate to 1,23.
      globalThis.fetch = mkFetch(CURRENCIES, 4);
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
      await waitFor(() => expect(screen.getByText('— 1,2345')).toBeInTheDocument());
      expect(screen.queryByText('— 1,23')).not.toBeInTheDocument();
    });

    it('localizes the decimal separator of every rate listed in the dropdown', async () => {
      // The reported symptom: "EUR — 1.00", "GBP 0.86", "USD 1.47" in an otherwise
      // comma-decimal UI.
      globalThis.fetch = mkFetch([
        { id: 'gbp-id', isoCode: 'GBP', rate: 0.86 },
        { id: 'usd-id', isoCode: 'USD', rate: 1.47 },
      ], 2);
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

      await waitFor(() => expect(screen.getByText('0,86')).toBeInTheDocument());
      expect(screen.getByText('1,47')).toBeInTheDocument();
      expect(screen.queryByText('0.86')).not.toBeInTheDocument();
      expect(screen.queryByText('1.47')).not.toBeInTheDocument();
    });

    it('commits the same number whether the rate is typed with a comma or a period', () => {
      const withComma = renderEditing();
      fireEvent.change(withComma.input, { target: { value: '0,86' } });
      fireEvent.click(screen.getByTestId('currency-rate-confirm'));
      expect(withComma.onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 0.86, 'EM_ETGO_Currency_Rate');
      withComma.unmount();

      const withPeriod = renderEditing();
      fireEvent.change(withPeriod.input, { target: { value: '0.86' } });
      fireEvent.click(screen.getByTestId('currency-rate-confirm'));
      expect(withPeriod.onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 0.86, 'EM_ETGO_Currency_Rate');
    });

    it('reads a rate like 1.500 as 1.5, never as 1500', () => {
      // Why handleRateConfirm uses parseLocaleNumber and NOT the grouping-aware parseAmountInput:
      // a rate of 1.500 legitimately means one-and-a-half, which a grouping rule reads as 1500.
      const { input, onChange } = renderEditing();
      fireEvent.change(input, { target: { value: '1.500' } });
      fireEvent.click(screen.getByTestId('currency-rate-confirm'));

      expect(onChange).toHaveBeenCalledWith('eTGOCurrencyRate', 1.5, 'EM_ETGO_Currency_Rate');
      expect(onChange).not.toHaveBeenCalledWith('eTGOCurrencyRate', 1500, 'EM_ETGO_Currency_Rate');
    });
  });
});
