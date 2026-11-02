// @covers tools/app-shell/src/components/contract-ui/InlineCreateSelector.jsx
// @covers tools/app-shell/src/hooks/useCanCreateInSpec.js
// @covers tools/app-shell/src/components/contract-ui/InlineCreateModal.jsx
// ---------------------------------------------------------------------------
// Unit tests for the inline-create helpers in InlineCreateSelector.jsx (ETP-4099).
//
// `buildCreateUrl` derives an FK target's own NEO W endpoint from the host window's
// apiBaseUrl (swapping the spec segment); `createLookupRecord` POSTs { name } there
// and returns the created { id, name }, throwing on a non-ok response or missing id
// so the create modal can surface the error.
//
// Pure-logic tests — no rendering. i18n is mocked (the module transitively imports it)
// and global.fetch is stubbed like the sibling CreatableSearchSelect.vitest.jsx suite.
// ---------------------------------------------------------------------------

// i18n returns the key, except `backendError.*` keys, which render the REAL es_ES text with its
// params: the shared translator (translateBackendError) treats a key echoed back as untranslated,
// so the payment-term refusals it owns are asserted in the Spanish the user reads.
const uiSpy = vi.hoisted(() => vi.fn());
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => uiSpy,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// The rendered InlineCreateSelector cases (ETP-5826) send their create through the component's
// `useApiFetch()`; the pure createLookupRecord cases use the core default and are unaffected.
const { mockApiFetch, selectProbe } = vi.hoisted(() => ({ mockApiFetch: vi.fn(), selectProbe: { props: null } }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

// The create gate (useCanCreateInSpec) runs for real against menu.json; only the session it reads
// is supplied here. payment-term is backed by window 141, transaction-type by none.
const session = vi.hoisted(() => ({ windowAccess: {}, capabilities: {} }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useWindowAccessSafe: () => session.windowAccess,
  useCapabilitiesSafe: () => session.capabilities,
}));

// The selector itself is stubbed: these cases guard what InlineCreateSelector does around it —
// the props it forwards (`sortOptions`) and what it hands back through `onCreated`.
vi.mock('../CreatableSearchSelect.jsx', () => ({
  CreatableSearchSelect: (props) => {
    selectProbe.props = props;
    return (
      <div data-testid="select-stub">
        {props.createLabel && props.onCreateRequest && (
          <button
            type="button"
            data-testid="select-stub-create"
            onClick={() => props.onCreateRequest(selectProbe.query ?? '', selectProbe.onCreated)}
          >
            {props.createLabel}
          </button>
        )}
      </div>
    );
  },
}));

// The real modal renders; the wrapper only records the props the selector hands it.
const modalProbe = vi.hoisted(() => ({ props: null }));
vi.mock('../InlineCreateModal.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    InlineCreateModal: (props) => {
      modalProbe.props = props;
      return <actual.InlineCreateModal {...props} />;
    },
  };
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NetworkError } from '@etendosoftware/app-shell-core/auth';
import esES from '@/locales/es_ES.json';

uiSpy.mockImplementation((key, params = {}) => {
  if (!key.startsWith('backendError.')) return key;
  let text = esES.genericLabels[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, value);
  return text;
});
import { buildCreateUrl, createLookupRecord, InlineCreateSelector } from '../InlineCreateSelector.jsx';
import { comparePaymentTermOptions } from '@/lib/paymentTermDays.js';

const API_BASE = '/sws/neo/match-rule';
const TOKEN = 'test-token';
const base = { apiBaseUrl: API_BASE, createSpec: 'transaction-type', createEntity: 'transactionType', token: TOKEN };

function okResponse(json) {
  return { ok: true, json: async () => json };
}

describe('buildCreateUrl', () => {
  it('swaps the host spec segment for the target spec + entity', () => {
    expect(buildCreateUrl('/sws/neo/match-rule', 'transaction-type', 'transactionType'))
      .toBe('/sws/neo/transaction-type/transactionType');
  });
});

describe('createLookupRecord', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs { name } to the FK target endpoint with the bearer token and returns the created record', async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { data: [{ id: 'TT-1', name: 'Bank fee' }] } }));

    const created = await createLookupRecord({ ...base, name: 'Bank fee' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/sws/neo/transaction-type/transactionType');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`, 'Accept-Language': 'es_ES',
    });
    expect(JSON.parse(opts.body)).toEqual({ name: 'Bank fee' });
    expect(created).toEqual({ id: 'TT-1', name: 'Bank fee' });
  });

  it('falls back to the supplied name when the envelope omits one', async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { data: [{ id: 'TT-2' }] } }));

    const created = await createLookupRecord({ ...base, name: 'Deposit' });

    expect(created).toEqual({ id: 'TT-2', name: 'Deposit' });
  });

  it('surfaces the backend error message on a non-ok response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ response: { error: { message: 'Duplicate key' } } }),
    });

    await expect(createLookupRecord({ ...base, name: 'Bank fee' })).rejects.toThrow('Duplicate key');
  });

  it('throws when the response carries no id', async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { data: [{ name: 'No id' }] } }));

    await expect(createLookupRecord({ ...base, name: 'No id' })).rejects.toThrow(/no id/i);
  });
});

describe('createLookupRecord — explicit request and body', () => {
  it('POSTs the supplied body through the supplied request instead of { name }', async () => {
    const request = vi.fn().mockResolvedValue(okResponse({ response: { data: [{ id: 'PT-1', name: '12 Días' }] } }));

    const created = await createLookupRecord({
      apiBaseUrl: '/sws/neo/contacts', createSpec: 'payment-term', createEntity: 'header',
      token: TOKEN, name: '12', body: { overduePaymentDaysRule: 12 }, request,
    });

    expect(request).toHaveBeenCalledTimes(1);
    const [url, opts] = request.mock.calls[0];
    expect(url).toBe('/sws/neo/payment-term/header');
    expect(opts).toMatchObject({ method: 'POST', baseUrl: '' });
    expect(JSON.parse(opts.body)).toEqual({ overduePaymentDaysRule: 12 });
    // The backend derives the name; the one in the response wins over the typed value.
    expect(created).toEqual({ id: 'PT-1', name: '12 Días' });
  });

  it('a failed create carries the HTTP status and the backend messageKeys', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ response: { error: { message: 'Ya existe' }, messageKeys: ['ETGO_PaymentTermDuplicate'] } }),
    });

    const error = await createLookupRecord({ ...base, name: 'x', request }).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Ya existe');
    expect(error.status).toBe(409);
    expect(error.messageKeys).toEqual(['ETGO_PaymentTermDuplicate']);
  });

  it('a failed create carries the backend messageParams', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        response: {
          error: { message: 'Ya existe' },
          messageKeys: ['ETGO_PaymentTermDaysDuplicate'],
          messageParams: { paymentTermName: '30 Días', paymentTermActive: false },
        },
      }),
    });

    const error = await createLookupRecord({ ...base, name: 'x', request }).catch((e) => e);

    expect(error.messageKeys).toEqual(['ETGO_PaymentTermDaysDuplicate']);
    expect(error.messageParams).toEqual({ paymentTermName: '30 Días', paymentTermActive: false });
  });

  it('a non-JSON error body still carries the status, with a generic message', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });

    const error = await createLookupRecord({ ...base, name: 'x', request }).catch((e) => e);

    expect(error.message).toBe('Request failed (500)');
    expect(error.status).toBe(500);
    expect(error.messageKeys).toBeUndefined();
    expect(error.messageParams).toBeUndefined();
  });
});

describe('InlineCreateSelector — create flow per createSpec variant', () => {
  const field = { key: 'paymentTerms' };

  function renderSelector(props) {
    selectProbe.onCreated = vi.fn();
    render(
      <InlineCreateSelector
        field={field}
        apiBaseUrl="/sws/neo/contacts"
        token={TOKEN}
        createLabel="+ create"
        createTitle="Create title"
        namePlaceholder="placeholder"
        {...props}
      />,
    );
    return { onCreated: selectProbe.onCreated };
  }

  function openModalAndSubmit(value) {
    fireEvent.click(screen.getByTestId('select-stub-create'));
    fireEvent.change(screen.getByTestId('inline-create-name'), { target: { value } });
    fireEvent.click(screen.getByTestId('inline-create-submit'));
  }

  beforeEach(() => {
    mockApiFetch.mockReset();
    selectProbe.props = null;
    selectProbe.query = '';
    // A role that may write Payment Term, so the create row is offered.
    session.windowAccess = { 141: 'full' };
    session.capabilities = {};
  });

  it('payment-term: POSTs { overduePaymentDaysRule } and selects the name the backend returned', async () => {
    mockApiFetch.mockResolvedValue(okResponse({ response: { data: [{ id: 'PT-12', name: '12 Días' }] } }));
    const { onCreated } = renderSelector({ createSpec: 'payment-term', createEntity: 'header' });

    openModalAndSubmit('12');

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('PT-12', '12 Días'));
    const [url, opts] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/sws/neo/payment-term/header');
    expect(JSON.parse(opts.body)).toEqual({ overduePaymentDaysRule: 12 });
    await waitFor(() => expect(screen.queryByTestId('inline-create-modal')).not.toBeInTheDocument());
  });

  it('payment-term: a non-digit value is refused as it is typed, with the translated key and no request', () => {
    const { onCreated } = renderSelector({ createSpec: 'payment-term', createEntity: 'header' });

    fireEvent.click(screen.getByTestId('select-stub-create'));
    const input = screen.getByTestId('inline-create-name');
    fireEvent.change(input, { target: { value: '7,5' } });

    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('paymentTermDaysNotInteger');
    expect(input).toHaveValue('');
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('payment-term: an out-of-range value that fits the input is refused on submit, before any request', () => {
    renderSelector({ createSpec: 'payment-term', createEntity: 'header' });

    openModalAndSubmit('366');

    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('paymentTermDaysOutOfRange');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('payment-term: forwards the digits-only restriction and the translated rejected message to the modal', () => {
    renderSelector({ createSpec: 'payment-term', createEntity: 'header' });

    expect(modalProbe.props.inputPattern).toBeInstanceOf(RegExp);
    expect(modalProbe.props.inputPattern.test('123')).toBe(true);
    expect(modalProbe.props.inputPattern.test('1.5')).toBe(false);
    expect(modalProbe.props.maxLength).toBe(3);
    expect(modalProbe.props.rejectedMessage).toBe('paymentTermDaysNotInteger');
    expect(modalProbe.props.inputMode).toBe('numeric');
  });

  it('payment-term: text typed in the selector that is not a number opens the modal empty', () => {
    selectProbe.query = 'Inme';
    renderSelector({ createSpec: 'payment-term', createEntity: 'header' });

    fireEvent.click(screen.getByTestId('select-stub-create'));

    expect(screen.getByTestId('inline-create-name')).toHaveValue('');
  });

  it('transaction-type (no variant): no input restriction and no rejected message', () => {
    renderSelector({ apiBaseUrl: API_BASE, createSpec: 'transaction-type', createEntity: 'transactionType' });

    expect(modalProbe.props.inputPattern).toBeUndefined();
    expect(modalProbe.props.maxLength).toBeUndefined();
    expect(modalProbe.props.rejectedMessage).toBeUndefined();
    expect(modalProbe.props.inputMode).toBeUndefined();
  });

  /** Submits '30' against a failing create and returns the shown error and the onCreated spy. */
  async function failCreateWith(failure) {
    if (failure instanceof Error) mockApiFetch.mockRejectedValue(failure);
    else mockApiFetch.mockResolvedValue(failure);
    const { onCreated } = renderSelector({ createSpec: 'payment-term', createEntity: 'header' });
    openModalAndSubmit('30');
    const error = await screen.findByTestId('inline-create-error');
    // On every failure the modal stays open and nothing is selected.
    expect(screen.getByTestId('inline-create-modal')).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    return error;
  }

  const failure = (status, body) => ({ ok: false, status, json: async () => body });

  it('payment-term: a key-less 409 (name unique constraint) shows paymentTermNameDuplicate, not the backend text', async () => {
    const error = await failCreateWith(failure(409, {
      response: { error: { message: 'duplicate key value violates unique constraint "c_paymentterm_name"' } },
    }));

    expect(error).toHaveTextContent('paymentTermNameDuplicate');
    expect(error).not.toHaveTextContent('unique constraint');
  });

  it.each([
    ['days, active', 'ETGO_PaymentTermDaysDuplicate', { paymentTermName: '30 Días', paymentTermActive: true },
      'Ya existe la condición de pago «30 Días» con esos días'],
    ['days, inactive', 'ETGO_PaymentTermDaysDuplicate', { paymentTermName: '30 Días', paymentTermActive: false },
      'Ya existe la condición de pago «30 Días» con esos días, pero está desactivada. Reactívala en Condiciones de pago'],
    ['name, active', 'ETGO_PaymentTermNameDuplicate', { paymentTermName: '30 Días', paymentTermActive: true },
      'Ya existe una condición de pago llamada «30 Días» en esta organización'],
    ['name, inactive', 'ETGO_PaymentTermNameDuplicate', { paymentTermName: '30 Días', paymentTermActive: 'N' },
      'Ya existe una condición de pago llamada «30 Días» en esta organización, pero está desactivada. Reactívala en Condiciones de pago'],
  ])('payment-term: a keyed 409 (%s) shows the shared translation naming the existing term', async (_label, key, messageParams, expected) => {
    const error = await failCreateWith(failure(409, {
      response: { error: { message: 'raw backend text' }, messageKeys: [key], messageParams },
    }));

    expect(error).toHaveTextContent(expected);
    expect(error).not.toHaveTextContent('raw backend text');
  });

  it('payment-term: a 500 carrying raw SQL shows genericError, never the raw text', async () => {
    const error = await failCreateWith(failure(500, {
      response: { error: { message: 'ERROR: null value in column "netdays" violates not-null constraint' } },
    }));

    expect(error).toHaveTextContent('genericError');
    expect(error).not.toHaveTextContent('netdays');
  });

  it('payment-term: an error without a status ("Created record has no id") shows genericError', async () => {
    const error = await failCreateWith({ ok: true, json: async () => ({ response: { data: [{ name: '30 Días' }] } }) });

    expect(error).toHaveTextContent('genericError');
    expect(error).not.toHaveTextContent('no id');
  });

  it('payment-term: an untranslated 4xx keeps the backend text', async () => {
    const error = await failCreateWith(failure(400, { response: { error: { message: 'Días fuera de rango' } } }));

    expect(error).toHaveTextContent('Días fuera de rango');
  });

  it('payment-term: a NetworkError keeps its own (already translated) message', async () => {
    const networkError = new NetworkError({ reason: 'offline' });

    const error = await failCreateWith(networkError);

    expect(error).toHaveTextContent(networkError.message);
    expect(error).not.toHaveTextContent('genericError');
  });

  it('payment-term: forwards the days comparator and relabels the modal input', () => {
    renderSelector({ createSpec: 'payment-term', createEntity: 'header' });

    expect(selectProbe.props.sortOptions).toBe(comparePaymentTermOptions);
    fireEvent.click(screen.getByTestId('select-stub-create'));
    expect(screen.getByLabelText('paymentTermDaysLabel')).toBe(screen.getByTestId('inline-create-name'));
    expect(screen.getByTestId('inline-create-suffix')).toHaveTextContent('paymentTermDaysSuffix');
    expect(screen.getByTestId('inline-create-name')).toHaveAttribute('inputmode', 'numeric');
  });

  it('match-rule (no variant): unchanged — POSTs { name }, no sort, the generic Name input', async () => {
    mockApiFetch.mockResolvedValue(okResponse({ response: { data: [{ id: 'TT-1', name: 'Bank fee' }] } }));
    selectProbe.query = 'Bank fee';
    const { onCreated } = renderSelector({
      apiBaseUrl: API_BASE, createSpec: 'transaction-type', createEntity: 'transactionType',
    });

    expect(selectProbe.props.sortOptions).toBeUndefined();
    fireEvent.click(screen.getByTestId('select-stub-create'));
    expect(screen.getByTestId('inline-create-name')).toHaveValue('Bank fee');
    expect(screen.getByLabelText('name')).toBe(screen.getByTestId('inline-create-name'));
    expect(screen.queryByTestId('inline-create-suffix')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('inline-create-submit'));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('TT-1', 'Bank fee'));
    const [url, opts] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/sws/neo/transaction-type/transactionType');
    expect(JSON.parse(opts.body)).toEqual({ name: 'Bank fee' });
  });
});

describe('InlineCreateSelector — write-access gate on the create row', () => {
  const field = { key: 'paymentTerms' };

  function renderSelector(props) {
    render(
      <InlineCreateSelector
        field={field}
        apiBaseUrl="/sws/neo/contacts"
        token={TOKEN}
        createLabel="+ create"
        createTitle="Create title"
        namePlaceholder="placeholder"
        createSpec="payment-term"
        createEntity="header"
        {...props}
      />,
    );
  }

  beforeEach(() => {
    selectProbe.props = null;
    session.windowAccess = {};
    session.capabilities = {};
  });

  it.each([
    ['a read-only grant', { 141: 'read-only' }],
    ['no grant on the window', { 999: 'full' }],
    ['access not loaded', {}],
  ])('payment-term with %s: no create row (createLabel / onCreateRequest not passed)', (_label, windowAccess) => {
    session.windowAccess = windowAccess;
    renderSelector();

    expect(selectProbe.props.createLabel).toBeUndefined();
    expect(selectProbe.props.onCreateRequest).toBeUndefined();
    expect(screen.queryByTestId('select-stub-create')).not.toBeInTheDocument();
    // The selector itself is still rendered and still sorted.
    expect(screen.getByTestId('select-stub')).toBeInTheDocument();
    expect(selectProbe.props.sortOptions).toBe(comparePaymentTermOptions);
  });

  it('payment-term with a "full" grant: the create row is offered', () => {
    session.windowAccess = { 141: 'full' };
    renderSelector();

    expect(selectProbe.props.createLabel).toBe('+ create');
    expect(typeof selectProbe.props.onCreateRequest).toBe('function');
    expect(screen.getByTestId('select-stub-create')).toHaveTextContent('+ create');
  });

  it('payment-term as admin / client-admin: the create row is offered without a grant', () => {
    session.capabilities = { isAdminOrClientAdmin: true };
    renderSelector();

    expect(screen.getByTestId('select-stub-create')).toBeInTheDocument();
  });

  it('match-rule → transaction-type (no window in the menu) keeps the create row without a session', () => {
    renderSelector({ apiBaseUrl: API_BASE, createSpec: 'transaction-type', createEntity: 'transactionType' });

    expect(selectProbe.props.createLabel).toBe('+ create');
    expect(screen.getByTestId('select-stub-create')).toBeInTheDocument();
  });
});
