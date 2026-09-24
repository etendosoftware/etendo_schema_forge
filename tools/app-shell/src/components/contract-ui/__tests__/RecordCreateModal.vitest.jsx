/**
 * ETP-5254 — RecordCreateModal creates a record of ANOTHER spec using that spec's own
 * generated form, laid out to read like that spec's own window.
 *
 * The whole point of the component is that it owns no field list: `target.loadForm()`
 * lazily imports the generated `<Entity>Form.jsx` and the modal renders it as-is. These
 * tests therefore hand it a fake `target` whose `loadForm()` resolves to a STUB form —
 * that is what makes every validation path drivable without pulling the real product
 * artifact (and its ~30 fields, selectors and reference lookups) into the suite. The stub
 * honours the same contract the generated form does: `registerFields(fields, formId)`,
 * `data`, `onChange`, `fieldErrors`, and field descriptors carrying `section`.
 *
 * What is pinned here, in order of how badly a regression would hurt:
 *   - BOTH tab panels stay mounted, so the inactive tab's required fields still gate the
 *     POST (`taxCategory` is required, lives in `other`, and has no static default — an
 *     unmounting `TabsContent` would fire `registerFields(null, …)` and let it through to
 *     a backend 400);
 *   - failed validation switches to the offending tab, because an inline error on a hidden
 *     panel is no error at all;
 *   - the synthetic `id` returned by `/defaults` never reaches the POST body;
 *   - `fieldErrors` is a MAP keyed by field key (EntityForm's contract), not an array;
 *   - the target window's label slice is merged into the re-provided dictionary the same
 *     way `WindowLoader.windowDictionaries` does it;
 *   - cancel writes nothing at all.
 */
import { useEffect } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- MOCKS BEFORE IMPORTS ---

const mocks = vi.hoisted(() => ({
  // `ui` must be a STABLE identity: the component lists it in the dependency array of the
  // mount effect (the real `useUI` is memoized on the dictionary), so a fresh function per
  // render would re-fire the effect forever. Same reasoning for `coreDict`/`localeSwitch`,
  // which feed the `modalDictionaries` memo.
  ui: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  // Tab labels resolve through the MENU dictionary (`tMenu(tab.label)`), not `ui`.
  tMenu: (key) => key,
  coreDict: {
    genericLabels: { create: 'Crear' },
    fields: { Name: { label: 'Nombre' }, Description: { label: 'Descripción' } },
  },
  setLocale: () => {},
  apiFetch: vi.fn(),
  localeProvider: { props: null },
  // ETP-5332 — "Completado" must save the popup's own embedded window before re-reading the
  // record. Mocked (not imported for real) because the ordering guarantee under test is the
  // CALL to this function happening before the re-read, not the registry's own internals —
  // those are covered by unsavedChanges.vitest.js.
  saveEmbeddedUnsavedChanges: vi.fn(),
}));
mocks.localeSwitch = { locale: 'es_ES', setLocale: mocks.setLocale };

vi.mock('@/i18n', () => ({
  useUI: () => mocks.ui,
  useLabel: () => (key) => key,
  useMenuLabel: () => mocks.tMenu,
  useLocale: () => mocks.coreDict,
  useLocaleSwitch: () => mocks.localeSwitch,
  // Captured rather than stubbed away: the dictionary it is handed IS the behaviour under
  // test for the label-slice merge below.
  LocaleProvider: ({ children, ...props }) => {
    mocks.localeProvider.props = props;
    return <div data-testid="modal-locale-provider">{children}</div>;
  },
}));

// Same stable-identity requirement as `ui` — `apiFetch` is a dependency of the mount effect.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mocks.apiFetch,
}));

// House style (see ProcessParamDialog.vitest.jsx): Radix's Dialog adds portals, focus traps
// and pointer-events guards that this suite is not testing. `...rest` is forwarded so the
// component's own `data-testid` still lands on the content node.
vi.mock('@/components/ui/dialog.jsx', () => ({
  // The dismiss button stands in for the overlay click / X / Escape — all of which reach the
  // component through this one `onOpenChange(false)` callback.
  Dialog: ({ children, open, onOpenChange }) => (open ? (
    <div data-testid="dialog-root">
      <button type="button" data-testid="dialog-dismiss" onClick={() => onOpenChange(false)}>x</button>
      {children}
    </div>
  ) : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2 data-testid="record-create-title">{children}</h2>,
}));

vi.mock('@/lib/unsavedChanges.js', () => ({
  saveEmbeddedUnsavedChanges: mocks.saveEmbeddedUnsavedChanges,
}));

// Window mode mounts a real application window via EmbeddedWindowRoute (its own memory
// router, PageMetaProvider, EmbeddedWindowContext). None of that machinery is what these
// tests exercise — only that `onRecordId` reaches `finishFromWindow` — so it is stubbed to a
// thin shell exposing a button that fires it directly.
vi.mock('../EmbeddedWindowRoute.jsx', () => ({
  default: ({ children, onRecordId }) => (
    <div data-testid="stub-embedded-window-route">
      <button
        type="button"
        data-testid="stub-set-record-id"
        onClick={() => onRecordId('rec-99')}
      >
        set-record-id
      </button>
      {children}
    </div>
  ),
}));

import RecordCreateModal, {
  buildRecordCreatePayload,
  resolveActionLabel,
  unwrapCreated,
} from '../RecordCreateModal.jsx';

// ────────────────────────────────────────────────────────────────────────────
// Stub generated form
// ────────────────────────────────────────────────────────────────────────────

// Module-level so the field arrays keep a stable identity across renders. `section` matters:
// `submit` reads it off the FIRST missing descriptor to decide which tab to reveal.
const SECTION_FIELDS = {
  principal: [
    { key: 'name', section: 'principal', required: true, readOnly: false },
    { key: 'searchKey', section: 'principal', required: true, readOnly: false },
    // A required-but-readOnly field is resolved server-side; it must never block submit.
    { key: 'organization', section: 'principal', required: true, readOnly: true },
  ],
  other: [
    // The real-world case the "keep both panels mounted" rule exists for.
    { key: 'taxCategory', section: 'other', required: true, readOnly: false },
    { key: 'productCategory', section: 'other', required: false, readOnly: false },
    { key: 'stocked', section: 'other', required: false, readOnly: false },
  ],
};

let formProps = {};

/**
 * Stands in for the generated `ProductForm.jsx`. Registers its section's visible fields
 * exactly like the real one does, renders each value and its field-level error, and exposes
 * buttons to drive `onChange` and the `registerFields(null, formId)` unregister branch.
 */
function StubForm(props) {
  const { section, data, onChange, fieldErrors, registerFields, onFieldBlur, savingField } = props;
  formProps[section] = props;
  const fields = SECTION_FIELDS[section] ?? [];

  useEffect(() => {
    registerFields(fields, section);
    return () => registerFields(null, section);
  }, [registerFields, fields, section]);

  return (
    <div data-testid={`stub-form-${section}`}>
      <span data-testid={`saving-field-${section}`}>{String(savingField ?? '')}</span>
      <span data-testid={`has-blur-handler-${section}`}>{String(typeof onFieldBlur === 'function')}</span>
      {fields.map((f) => (
        <div key={f.key}>
          <span data-testid={`value-${f.key}`}>{String(data[f.key] ?? '')}</span>
          <span data-testid={`error-${f.key}`}>{fieldErrors[f.key] ?? ''}</span>
          <button
            type="button"
            data-testid={`fill-${f.key}`}
            onClick={() => onChange(f.key, `typed-${f.key}`)}
          >
            fill
          </button>
          <button
            type="button"
            data-testid={`blur-${f.key}`}
            onClick={() => onFieldBlur?.(f.key)}
          >
            blur
          </button>
        </div>
      ))}
      <button
        type="button"
        data-testid={`unregister-${section}`}
        onClick={() => registerFields(null, section)}
      >
        unregister
      </button>
    </div>
  );
}

// Shape of the generated `labels.js` slice: `{ <locale>: { <column>: <label> } }`.
const LABEL_SLICE = {
  es_ES: { ProductType: 'Tipo de producto', C_UOM_ID: 'Unidad' },
  en_US: { ProductType: 'Product type', C_UOM_ID: 'UOM' },
};

const LABEL_OVERRIDES = {
  es_ES: { M_Product_Category_ID: 'Categoría', ProductType: 'Tipo', Value: 'Código' },
};

// Tab KEY and `section` are separate concepts: the key mirrors `window.primaryTabs` in
// decisions.json (so the menu dictionary translates the label exactly as the window does),
// while `section` names the EntityForm section that tab renders.
const TABS = [
  { key: 'general', label: 'General', section: 'principal' },
  { key: 'additionalInfo', label: 'Additional Info', section: 'other' },
];

const TARGET = {
  key: 'product',
  entity: 'product',
  ctaKey: 'createProduct',
  titleKey: 'createProductTitle',
  errorKey: 'createProductError',
  apiBaseUrl: '/sws/neo/product',
  prefill: (query) => (query ? { name: query } : {}),
  loadForm: () => Promise.resolve({ default: StubForm }),
  loadLabels: () => Promise.resolve({ default: LABEL_SLICE }),
  labelOverrides: LABEL_OVERRIDES,
  tabs: TABS,
  tabsVariant: 'pill',
  cols: 3,
};

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 — post-create tabs
// ────────────────────────────────────────────────────────────────────────────

// Trivial stand-ins for ProductPriceBar / AttachmentsTab. The real components are covered by
// the registry drift guard in lookupCreateTargets.vitest.js; what belongs HERE is the phase
// machinery, and importing the real ones would drag their fetches and editors into this suite.
let postPanelProps = {};

function makePostPanel(key) {
  return function PostPanel(props) {
    postPanelProps[key] = props;
    return (
      <div data-testid={`post-panel-body-${key}`}>
        <span data-testid={`post-panel-recordId-${key}`}>{String(props.recordId)}</span>
        <button
          type="button"
          data-testid={`post-panel-emit-count-${key}`}
          onClick={() => props.onCountChange(3)}
        >
          emit
        </button>
      </div>
    );
  };
}

const POST_CREATE_TABS = [
  { key: 'pricing', labelKey: 'price', Component: makePostPanel('pricing') },
  {
    key: 'attachments',
    labelKey: 'attachments',
    Component: makePostPanel('attachments'),
    props: { tableName: 'M_Product', config: {} },
  },
];

// `TARGET` deliberately has NO loadPostCreateTabs — it exercises the documented single-phase
// fallback, which is what every test above this point is written against.
const TWO_PHASE_TARGET = {
  ...TARGET,
  loadPostCreateTabs: () => Promise.resolve(POST_CREATE_TABS),
};

// `updated` is the optimistic-lock version; every PATCH must echo the CURRENT one.
const CREATED = { id: 'prod-9', name: 'Agua', searchKey: 'AGUA', updated: '2026-01-01T10:00:00Z' };

// ────────────────────────────────────────────────────────────────────────────
// apiFetch routing helpers
// ────────────────────────────────────────────────────────────────────────────

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

/**
 * Routes `/product/defaults` and the `/product` POST independently. Anything the component
 * does not send is left unmocked on purpose so a stray request shows up as a failure.
 */
function installApiFetch({
  defaults = {},
  post = jsonResponse({ response: { data: [{ id: 'new-1' }] } }),
  patch = jsonResponse({ response: { data: [{ id: 'prod-9', updated: 'v2' }] } }),
} = {}) {
  mocks.apiFetch.mockImplementation((url, opts) => {
    if (url === '/product/defaults') return Promise.resolve(jsonResponse({ defaults }));
    if (url === '/product' && opts?.method === 'POST') {
      return typeof post === 'function' ? post(opts) : Promise.resolve(post);
    }
    if (opts?.method === 'PATCH') {
      return typeof patch === 'function' ? patch(url, opts) : Promise.resolve(patch);
    }
    throw new Error(`unexpected apiFetch call: ${url}`);
  });
}

/** Every PATCH the component issued, as `{ url, body }`. */
function patchCalls() {
  return mocks.apiFetch.mock.calls
    .filter(([, opts]) => opts?.method === 'PATCH')
    .map(([url, opts]) => ({ url, body: JSON.parse(opts.body) }));
}

function postBody() {
  const call = mocks.apiFetch.mock.calls.find(([url, opts]) => url === '/product' && opts?.method === 'POST');
  return call ? JSON.parse(call[1].body) : null;
}

function baseProps(overrides = {}) {
  return {
    open: true,
    target: TARGET,
    initialQuery: '',
    token: 'test-token',
    onCancel: vi.fn(),
    onCreated: vi.fn(),
    ...overrides,
  };
}

/** Renders and waits until the embedded forms have mounted AND the defaults have merged. */
async function renderModal(props) {
  const utils = render(<RecordCreateModal {...props} />);
  await screen.findByTestId('stub-form-principal');
  await waitFor(() => expect(screen.getByTestId('record-create-submit')).toBeEnabled());
  return utils;
}

/** Fills every editable required field of the `principal` tab. */
async function fillPrincipal(user) {
  await user.click(screen.getByTestId('fill-name'));
  await user.click(screen.getByTestId('fill-searchKey'));
}

describe('RecordCreateModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formProps = {};
    postPanelProps = {};
    mocks.localeProvider.props = null;
    installApiFetch();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Rendering + the props handed to the embedded generated form
  // ──────────────────────────────────────────────────────────────────────────

  it('renders nothing when closed', () => {
    const { container } = render(<RecordCreateModal {...baseProps({ open: false })} />);
    expect(container.innerHTML).toBe('');
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('renders nothing when no target was resolved', () => {
    const { container } = render(<RecordCreateModal {...baseProps({ target: null })} />);
    expect(container.innerHTML).toBe('');
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('renders the dialog with the target title and one form per tab', async () => {
    await renderModal(baseProps());
    expect(screen.getByTestId('record-create-modal')).toBeInTheDocument();
    expect(screen.getByTestId('record-create-title')).toHaveTextContent('createProductTitle');
    expect(screen.getByTestId('stub-form-principal')).toBeInTheDocument();
    expect(screen.getByTestId('stub-form-other')).toBeInTheDocument();
  });

  it('hands every embedded form the same entity, apiBaseUrl, token, column count, exclusions and label overrides', async () => {
    await renderModal(baseProps());
    for (const section of ['principal', 'other']) {
      expect(formProps[section].entity).toBe('product');
      expect(formProps[section].apiBaseUrl).toBe('/sws/neo/product');
      expect(formProps[section].token).toBe('test-token');
      expect(formProps[section].cols).toBe(3);
      // `image` needs the upload endpoint and a saved record, so it cannot work pre-create.
      expect(formProps[section].excludeFields).toEqual(['image']);
      expect(formProps[section].labelOverrides).toBe(LABEL_OVERRIDES);
      expect(formProps[section].section).toBe(section);
    }
  });

  it('shows a loading placeholder and a disabled submit until the form module resolves', async () => {
    let resolveForm;
    const slowTarget = { ...TARGET, loadForm: () => new Promise((r) => { resolveForm = r; }) };
    render(<RecordCreateModal {...baseProps({ target: slowTarget })} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.getByTestId('record-create-submit')).toBeDisabled();
    resolveForm({ default: StubForm });
    await screen.findByTestId('stub-form-principal');
  });

  it('surfaces the target error when the form module fails to load', async () => {
    const brokenTarget = { ...TARGET, loadForm: () => Promise.reject(new Error('chunk failed')) };
    render(<RecordCreateModal {...baseProps({ target: brokenTarget })} />);
    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('createProductError');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Tabs
  // ──────────────────────────────────────────────────────────────────────────

  it('renders one trigger and one panel per declared tab, labelled through the MENU dictionary', async () => {
    await renderModal(baseProps());
    const strip = screen.getByTestId('record-create-tabs');
    const triggers = within(strip).getAllByRole('button');
    // `renderPrimaryTabButtons` resolves each label with `tMenu(tab.label)`, never `ui(...)`,
    // so the popup's strip reads exactly like the window's.
    expect(triggers.map(b => b.textContent)).toEqual(['General', 'Additional Info']);
    expect(screen.getByTestId('record-create-panel-general')).toBeInTheDocument();
    expect(screen.getByTestId('record-create-panel-additionalInfo')).toBeInTheDocument();
  });

  it('renders the window-identical pill strip when the target asks for that variant', async () => {
    await renderModal(baseProps());
    // `tabsVariant: 'pill'` makes renderPrimaryTabButtons wrap the buttons in the segmented
    // control the Products window uses (`primaryTabsVariant: "pill"` in its decisions.json);
    // the default variant emits them bare. Asserting the wrapper is what proves the registry
    // field is threaded through rather than silently ignored.
    expect(screen.getByTestId('record-create-tabs').querySelector('div.inline-flex')).not.toBeNull();
  });

  it('renders the bare strip when the target declares no pill variant', async () => {
    const plain = { ...TARGET, tabsVariant: undefined };
    await renderModal(baseProps({ target: plain }));
    const strip = screen.getByTestId('record-create-tabs');
    expect(strip.querySelector('div.inline-flex')).toBeNull();
    expect(within(strip).getAllByRole('button')).toHaveLength(2);
  });

  it('renders the form SECTION each tab declares, not the tab key', async () => {
    await renderModal(baseProps());
    // Tab key and form section are deliberately separate concepts: `general` renders the
    // `principal` section and `additionalInfo` renders `other`.
    expect(formProps.principal.section).toBe('principal');
    expect(formProps.other.section).toBe('other');
    expect(within(screen.getByTestId('record-create-panel-general')).getByTestId('stub-form-principal'))
      .toBeInTheDocument();
    expect(within(screen.getByTestId('record-create-panel-additionalInfo')).getByTestId('stub-form-other'))
      .toBeInTheDocument();
  });

  it('keeps BOTH panels mounted, hiding the inactive one with a class instead of unmounting it', async () => {
    await renderModal(baseProps());
    // TabsContent would return null for the inactive tab, firing EntityForm's
    // registerFields cleanup and silently dropping that tab's fields from validation.
    expect(screen.getByTestId('record-create-panel-general')).not.toHaveClass('hidden');
    expect(screen.getByTestId('record-create-panel-additionalInfo')).toHaveClass('hidden');
    expect(screen.getByTestId('stub-form-other')).toBeInTheDocument();
  });

  it('swaps which panel is hidden when another tab is selected', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps());

    await user.click(screen.getByRole('button', { name: 'Additional Info' }));

    await waitFor(() => expect(screen.getByTestId('record-create-panel-additionalInfo')).not.toHaveClass('hidden'));
    expect(screen.getByTestId('record-create-panel-general')).toHaveClass('hidden');
  });

  it('falls back to a single General tab when the target declares none', async () => {
    const tabless = { ...TARGET, tabs: undefined };
    await renderModal(baseProps({ target: tabless }));
    const triggers = within(screen.getByTestId('record-create-tabs')).getAllByRole('button');
    expect(triggers.map(b => b.textContent)).toEqual(['General']);
    expect(screen.getByTestId('record-create-panel-general')).not.toHaveClass('hidden');
    expect(screen.queryByTestId('record-create-panel-additionalInfo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stub-form-other')).not.toBeInTheDocument();
  });

  it('reopens on the first tab after having been left on another one', async () => {
    const user = userEvent.setup();
    const { rerender } = await renderModal(baseProps());
    await user.click(screen.getByRole('button', { name: 'Additional Info' }));
    await waitFor(() => expect(screen.getByTestId('record-create-panel-additionalInfo')).not.toHaveClass('hidden'));

    rerender(<RecordCreateModal {...baseProps({ open: false })} />);
    rerender(<RecordCreateModal {...baseProps({ open: true })} />);

    await waitFor(() => expect(screen.getByTestId('record-create-panel-general')).not.toHaveClass('hidden'));
    expect(screen.getByTestId('record-create-panel-additionalInfo')).toHaveClass('hidden');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Locale re-provision for the modal subtree
  // ──────────────────────────────────────────────────────────────────────────

  it('merges the target window label slice into the re-provided dictionary, WindowLoader-style', async () => {
    await renderModal(baseProps());
    await waitFor(() => {
      const { dictionaries } = mocks.localeProvider.props;
      // The slice is `{ locale: { column: label } }`; resolveLabel reads `fields[column].label`.
      expect(dictionaries.es_ES.fields.ProductType).toEqual({ label: 'Tipo de producto' });
    });
    const { dictionaries, locale, setLocale } = mocks.localeProvider.props;
    expect(dictionaries.es_ES.fields.C_UOM_ID).toEqual({ label: 'Unidad' });
    // The surrounding window's own fields survive the merge…
    expect(dictionaries.es_ES.fields.Name).toEqual({ label: 'Nombre' });
    // …as does everything else in the core dictionary.
    expect(dictionaries.es_ES.genericLabels).toEqual({ create: 'Crear' });
    // Only the ACTIVE locale is re-provided, and the switcher is passed straight through.
    expect(Object.keys(dictionaries)).toEqual(['es_ES']);
    expect(locale).toBe('es_ES');
    expect(setLocale).toBe(mocks.setLocale);
  });

  it('renders with the untouched core dictionary when the target declares no label slice', async () => {
    const sliceless = { ...TARGET, loadLabels: undefined };
    await renderModal(baseProps({ target: sliceless }));
    const { dictionaries } = mocks.localeProvider.props;
    expect(dictionaries.es_ES.fields).toEqual(mocks.coreDict.fields);
  });

  it('renders with the untouched core dictionary when the label slice fails to load', async () => {
    const broken = { ...TARGET, loadLabels: () => Promise.reject(new Error('chunk failed')) };
    await renderModal(baseProps({ target: broken }));
    expect(screen.getByTestId('stub-form-principal')).toBeInTheDocument();
    expect(screen.queryByTestId('record-create-error')).not.toBeInTheDocument();
    expect(mocks.localeProvider.props.dictionaries.es_ES.fields).toEqual(mocks.coreDict.fields);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Prefill + backend defaults
  // ──────────────────────────────────────────────────────────────────────────

  it('prefills the name with the text typed in the lookup', async () => {
    await renderModal(baseProps({ initialQuery: 'Agua mineral' }));
    expect(screen.getByTestId('value-name')).toHaveTextContent('Agua mineral');
  });

  it('fetches the backend defaults for the target entity and merges them into the form data', async () => {
    installApiFetch({ defaults: { productCategory: 'cat-1', searchKey: 'SK-1' } });
    await renderModal(baseProps());
    expect(mocks.apiFetch).toHaveBeenCalledWith('/product/defaults');
    expect(screen.getByTestId('value-productCategory')).toHaveTextContent('cat-1');
    expect(screen.getByTestId('value-searchKey')).toHaveTextContent('SK-1');
  });

  it('never lets the synthetic id returned by /defaults reach the POST body', async () => {
    installApiFetch({ defaults: { id: 'SYNTHETIC-DEFAULTS-ID', taxCategory: 'tax-1' } });
    const user = userEvent.setup();
    await renderModal(baseProps({ initialQuery: 'Agua' }));

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('record-create-submit'));

    await waitFor(() => expect(postBody()).not.toBeNull());
    expect(postBody()).not.toHaveProperty('id');
    expect(postBody().taxCategory).toBe('tax-1');
  });

  it('does not let a late /defaults response clobber what the user already typed', async () => {
    let resolveDefaults;
    mocks.apiFetch.mockImplementation((url) => {
      if (url === '/product/defaults') return new Promise((r) => { resolveDefaults = r; });
      return Promise.resolve(jsonResponse({ response: { data: [{ id: 'new-1' }] } }));
    });
    const user = userEvent.setup();
    render(<RecordCreateModal {...baseProps()} />);
    await screen.findByTestId('stub-form-principal');

    await user.click(screen.getByTestId('fill-productCategory'));
    resolveDefaults(jsonResponse({ defaults: { productCategory: 'server-default', searchKey: 'SK-1' } }));

    // The touched key keeps the user's value; the untouched one takes the default.
    await waitFor(() => expect(screen.getByTestId('value-searchKey')).toHaveTextContent('SK-1'));
    expect(screen.getByTestId('value-productCategory')).toHaveTextContent('typed-productCategory');
  });

  it('still renders the form when the defaults request fails', async () => {
    mocks.apiFetch.mockImplementation((url) => {
      if (url === '/product/defaults') return Promise.reject(new Error('boom'));
      return Promise.resolve(jsonResponse({ response: { data: [{ id: 'new-1' }] } }));
    });
    render(<RecordCreateModal {...baseProps()} />);
    expect(await screen.findByTestId('stub-form-principal')).toBeInTheDocument();
    expect(screen.queryByTestId('record-create-error')).not.toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Required-field validation
  // ──────────────────────────────────────────────────────────────────────────

  it('blocks the POST and marks every blank required field when submitting an empty form', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    await renderModal(props);

    await user.click(screen.getByTestId('record-create-submit'));

    expect(postBody()).toBeNull();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('record-create-error')).toHaveTextContent('requiredFieldsMissing');
    // fieldErrors is a MAP keyed by field key — rendered under each offending field.
    expect(screen.getByTestId('error-name')).toHaveTextContent('fieldRequired');
    expect(screen.getByTestId('error-searchKey')).toHaveTextContent('fieldRequired');
    expect(screen.getByTestId('error-taxCategory')).toHaveTextContent('fieldRequired');
  });

  it('still validates the required fields of the tab the user is NOT looking at', async () => {
    const user = userEvent.setup();
    const props = baseProps({ initialQuery: 'Agua' });
    await renderModal(props);

    // General tab fully filled; `taxCategory` (required, `other` tab, no static default) is not.
    await fillPrincipal(user);
    await user.click(screen.getByTestId('record-create-submit'));

    // Without both panels mounted this would have sailed through to a backend 400.
    expect(postBody()).toBeNull();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId('error-taxCategory')).toHaveTextContent('fieldRequired');
  });

  it('switches to the offending tab so the inline error is actually visible', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps({ initialQuery: 'Agua' }));
    expect(screen.getByTestId('record-create-panel-additionalInfo')).toHaveClass('hidden');

    await fillPrincipal(user);
    await user.click(screen.getByTestId('record-create-submit'));

    await waitFor(() => expect(screen.getByTestId('record-create-panel-additionalInfo')).not.toHaveClass('hidden'));
    expect(screen.getByTestId('record-create-panel-general')).toHaveClass('hidden');
  });

  it('stays on the current tab when the first offender lives there', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps());

    await user.click(screen.getByTestId('record-create-submit'));

    // `name` is the first missing descriptor and its section is the active tab.
    expect(screen.getByTestId('record-create-panel-general')).not.toHaveClass('hidden');
    expect(screen.getByTestId('record-create-panel-additionalInfo')).toHaveClass('hidden');
  });

  it('does not block on a required field the user cannot edit (readOnly)', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps());

    await fillPrincipal(user);
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    // `organization` is required but readOnly and was never filled — the POST still happens.
    await waitFor(() => expect(postBody()).not.toBeNull());
    expect(screen.getByTestId('error-organization')).toHaveTextContent('');
  });

  it('clears a field-level error as soon as the user edits that field', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps());

    await user.click(screen.getByTestId('record-create-submit'));
    expect(screen.getByTestId('error-name')).toHaveTextContent('fieldRequired');

    await user.click(screen.getByTestId('fill-name'));
    expect(screen.getByTestId('error-name')).toHaveTextContent('');
    // The other blank fields keep theirs.
    expect(screen.getByTestId('error-searchKey')).toHaveTextContent('fieldRequired');
  });

  it('stops validating a section once its form unregisters its fields', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps());

    await fillPrincipal(user);
    // The `other` section goes away (what an unmounting TabsContent would cause) — its
    // required taxCategory no longer gates the submit. This is the failure mode the
    // "both panels stay mounted" rule exists to prevent.
    await user.click(screen.getByTestId('unregister-other'));
    await user.click(screen.getByTestId('record-create-submit'));

    await waitFor(() => expect(postBody()).not.toBeNull());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // No rule restated here
  // ──────────────────────────────────────────────────────────────────────────

  it('states no cost rule of its own, whatever `stocked` is set to', async () => {
    // "A stockable product needs a cost" is owned by the Products window, which enforces it
    // with a blocking banner. The popup used to restate it — a second copy of one rule in a
    // second place, free to drift out of step with the one that actually blocks the save.
    // This guard exists so it does not get reintroduced by reflex; the fix for a gap here is
    // to change the Products window, never to add a banner back into this dialog.
    const user = userEvent.setup();
    installApiFetch({ defaults: { stocked: 'Y' } });
    await renderModal(baseProps());

    expect(screen.queryByTestId('record-create-cost-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-create-modal').textContent).not.toMatch(/cost|coste|costo/i);

    // Same after the user toggles the flag by hand — there is no derived warning to fire.
    await waitFor(() => expect(formProps.other).toBeTruthy());
    await user.click(screen.getByTestId('fill-stocked'));
    formProps.other.onChange('stocked', 'Y');

    expect(screen.queryByTestId('record-create-cost-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-create-modal').textContent).not.toMatch(/cost|coste|costo/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Cancel
  // ──────────────────────────────────────────────────────────────────────────

  it('cancel calls onCancel and writes nothing', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    await renderModal(props);

    await user.click(screen.getByTestId('record-create-cancel'));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(postBody()).toBeNull();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Submit
  // ──────────────────────────────────────────────────────────────────────────

  it('POSTs the payload to the target entity and forwards the created record', async () => {
    const created = { id: 'prod-9', name: 'Agua', searchKey: 'AGUA' };
    installApiFetch({ post: jsonResponse({ response: { data: [created] } }) });
    const user = userEvent.setup();
    const props = baseProps({ initialQuery: 'Agua' });
    await renderModal(props);

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(created));
    const [url, opts] = mocks.apiFetch.mock.calls.find(([u, o]) => u === '/product' && o?.method === 'POST');
    expect(url).toBe('/product');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'Agua', searchKey: 'typed-searchKey' });
  });

  it('surfaces the backend message and keeps the dialog open when the POST fails', async () => {
    installApiFetch({
      post: jsonResponse({ response: { error: { message: 'Search key already exists' } } }, false),
    });
    const user = userEvent.setup();
    const props = baseProps({ initialQuery: 'Agua' });
    await renderModal(props);

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('Search key already exists');
    expect(screen.getByTestId('record-create-modal')).toBeInTheDocument();
    expect(props.onCreated).not.toHaveBeenCalled();
    // The submit button is re-enabled so the user can retry after fixing the value.
    await waitFor(() => expect(screen.getByTestId('record-create-submit')).toBeEnabled());
  });

  it('falls back to the target error when the failed POST carries no message', async () => {
    installApiFetch({ post: { ok: false, json: async () => { throw new Error('not json'); } } });
    const user = userEvent.setup();
    await renderModal(baseProps({ initialQuery: 'Agua' }));

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('createProductError');
  });

  it('errors instead of calling onCreated when the response carries no id', async () => {
    installApiFetch({ post: jsonResponse({ response: { data: [] } }) });
    const user = userEvent.setup();
    const props = baseProps({ initialQuery: 'Agua' });
    await renderModal(props);

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('createProductError');
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('errors when the POST itself throws', async () => {
    installApiFetch({ post: () => Promise.reject(new Error('network down')) });
    const user = userEvent.setup();
    const props = baseProps({ initialQuery: 'Agua' });
    await renderModal(props);

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('createProductError');
    expect(props.onCreated).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 — the record exists, the window's own bottom panels take over
// ────────────────────────────────────────────────────────────────────────────

describe('RecordCreateModal — post-create phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formProps = {};
    postPanelProps = {};
    mocks.localeProvider.props = null;
    installApiFetch({ post: jsonResponse({ response: { data: [CREATED] } }) });
  });

  /** Fills the required fields and POSTs. Returns the props object passed to the modal. */
  async function createRecord(user, overrides = {}) {
    const props = baseProps({ target: TWO_PHASE_TARGET, initialQuery: 'Agua', ...overrides });
    await renderModal(props);
    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));
    return props;
  }

  it('does NOT hand the record back on save — it opens the second phase instead', async () => {
    const user = userEvent.setup();
    const props = await createRecord(user);

    await screen.findByTestId('record-create-post-tabs');
    // The line must not be touched yet: `onCreated` is the single completion point, and it
    // belongs to the user closing the popup, not to the POST.
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(postBody()).not.toBeNull();
  });

  it('hands the record back immediately when the target declares no post-create tabs', async () => {
    // Documented fallback: a target without `loadPostCreateTabs` keeps the original
    // single-phase behaviour. Every test in the suite above rides on this path.
    const user = userEvent.setup();
    const props = baseProps({ initialQuery: 'Agua' });
    await renderModal(props);
    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('fill-taxCategory'));
    await user.click(screen.getByTestId('record-create-submit'));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(CREATED));
    expect(screen.queryByTestId('record-create-post-tabs')).not.toBeInTheDocument();
  });

  it('keeps the header form editable after the record is saved', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    // The header used to lock on save. It no longer does: edits now commit on blur (see the
    // blur-commit block below), so there is nothing to discard and no reason to lock.
    await waitFor(() => expect(formProps.principal.onFieldBlur).toBeTypeOf('function'));
    expect(formProps.principal.readOnly).not.toBe(true);
    expect(formProps.other.readOnly).not.toBe(true);
  });

  it('swaps Cancel + Create for a single finish action', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    expect(screen.queryByTestId('record-create-cancel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-create-submit')).not.toBeInTheDocument();
    const finish = screen.getByTestId('record-create-finish');
    expect(finish).toBeEnabled();
    expect(finish).toHaveTextContent('done');
  });

  it('delivers the created record exactly once when the user finishes', async () => {
    const user = userEvent.setup();
    const props = await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('record-create-finish'));

    expect(props.onCreated).toHaveBeenCalledTimes(1);
    expect(props.onCreated).toHaveBeenCalledWith(CREATED);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('delivers the created record when the dialog is dismissed after the save', async () => {
    const user = userEvent.setup();
    const props = await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    // Overlay click / X / Escape all arrive as onOpenChange(false). Closing here is "done",
    // never "cancel" — the record already exists and the line is still waiting for it.
    await user.click(screen.getByTestId('dialog-dismiss'));

    expect(props.onCreated).toHaveBeenCalledTimes(1);
    expect(props.onCreated).toHaveBeenCalledWith(CREATED);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('cancels without writing anything when the dialog is dismissed before the save', async () => {
    const user = userEvent.setup();
    const props = baseProps({ target: TWO_PHASE_TARGET });
    await renderModal(props);

    await user.click(screen.getByTestId('dialog-dismiss'));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(postBody()).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Blur-commit — the Products window declares `autoSaveOnBlur: true`, so committing
  // each edited field on blur is what "behaves like the window" means here.
  // ──────────────────────────────────────────────────────────────────────────

  it('passes no blur handler at all while the record does not exist yet', async () => {
    const user = userEvent.setup();
    await renderModal(baseProps({ target: TWO_PHASE_TARGET }));

    expect(formProps.principal.onFieldBlur).toBeUndefined();
    expect(screen.getByTestId('has-blur-handler-principal')).toHaveTextContent('false');

    // Editing then blurring commits nothing — there is no record to PATCH.
    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));
    expect(patchCalls()).toHaveLength(0);
  });

  it('does NOT PATCH a field the user never touched', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    // The guard that makes tabbing through the form silent. Drop it and every focus change
    // becomes a request — a storm nothing else in this suite would catch.
    await user.click(screen.getByTestId('blur-organization'));
    await user.click(screen.getByTestId('blur-productCategory'));

    expect(patchCalls()).toHaveLength(0);
  });

  it('PATCHes an edited field on blur, echoing the version from the CREATE response', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));

    await waitFor(() => expect(patchCalls()).toHaveLength(1));
    const [{ url, body }] = patchCalls();
    expect(url).toBe('/product/prod-9');
    // Exactly the one field plus the optimistic-lock version — never the whole form.
    expect(body).toEqual({ name: 'typed-name', updated: CREATED.updated });
  });

  it('carries the REFRESHED version on a second edit', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));

    await user.click(screen.getByTestId('fill-searchKey'));
    await user.click(screen.getByTestId('blur-searchKey'));
    await waitFor(() => expect(patchCalls()).toHaveLength(2));

    // The PATCH response refreshed `createdRecord`, so edit #2 must send `v2`. Sending the
    // original version again is a 409 in production, and nothing else here would catch it.
    expect(patchCalls()[0].body.updated).toBe(CREATED.updated);
    expect(patchCalls()[1].body).toEqual({ searchKey: 'typed-searchKey', updated: 'v2' });
  });

  it('forgets the field once saved, so re-blurring without re-editing sends nothing', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));
    await waitFor(() => expect(patchCalls()).toHaveLength(1));

    await user.click(screen.getByTestId('blur-name'));
    await user.click(screen.getByTestId('blur-name'));

    expect(patchCalls()).toHaveLength(1);
  });

  it('reports savingField while the PATCH is in flight and clears it afterwards', async () => {
    let resolvePatch;
    installApiFetch({
      post: jsonResponse({ response: { data: [CREATED] } }),
      patch: () => new Promise((r) => { resolvePatch = r; }),
    });
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));

    // EntityForm renders its per-field spinner off this prop.
    await waitFor(() => expect(screen.getByTestId('saving-field-principal')).toHaveTextContent('name'));
    expect(formProps.principal.savingField).toBe('name');

    resolvePatch(jsonResponse({ response: { data: [{ id: 'prod-9', updated: 'v2' }] } }));

    await waitFor(() => expect(screen.getByTestId('saving-field-principal')).toHaveTextContent(''));
    expect(formProps.principal.savingField).toBeNull();
  });

  it('surfaces a failed PATCH without corrupting the saved record', async () => {
    installApiFetch({
      post: jsonResponse({ response: { data: [CREATED] } }),
      patch: jsonResponse({ response: { error: { message: 'Record has been modified' } } }, false),
    });
    const user = userEvent.setup();
    const props = await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('Record has been modified');
    // `savingField` is cleared in `finally`, so the field is not left spinning.
    await waitFor(() => expect(formProps.principal.savingField).toBeNull());

    // The record handed to the line is still the one the CREATE returned — a failed field
    // save must not half-apply.
    await user.click(screen.getByTestId('record-create-finish'));
    expect(props.onCreated).toHaveBeenCalledWith(CREATED);
  });

  it('falls back to the target error when the PATCH throws', async () => {
    installApiFetch({
      post: jsonResponse({ response: { data: [CREATED] } }),
      patch: () => Promise.reject(new Error('network down')),
    });
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('createProductError');
    await waitFor(() => expect(formProps.principal.savingField).toBeNull());
  });

  it('clears a previous error once a field saves cleanly', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    // Provoke a form-level error first: submit is gone in phase 2, so drive it through a
    // failed PATCH, then let the retry succeed.
    mocks.apiFetch.mockImplementationOnce(() => Promise.resolve(
      jsonResponse({ response: { error: { message: 'transient' } } }, false),
    ));
    await user.click(screen.getByTestId('fill-name'));
    await user.click(screen.getByTestId('blur-name'));
    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('transient');

    await user.click(screen.getByTestId('blur-name'));

    await waitFor(() => expect(screen.queryByTestId('record-create-error')).not.toBeInTheDocument());
  });

  // ──────────────────────────────────────────────────────────────────────────
  // The panels themselves
  // ──────────────────────────────────────────────────────────────────────────

  it('renders one trigger and one panel per post-create tab, in order', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    expect(screen.getByTestId('record-create-post-tab-pricing')).toHaveTextContent('price');
    expect(screen.getByTestId('record-create-post-tab-attachments')).toHaveTextContent('attachments');
    expect(screen.getByTestId('record-create-post-panel-pricing')).toBeInTheDocument();
    expect(screen.getByTestId('record-create-post-panel-attachments')).toBeInTheDocument();
  });

  it('hands each panel the saved record plus the props DetailView gives it', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await waitFor(() => expect(postPanelProps.pricing).toBeTruthy());
    expect(postPanelProps.pricing).toMatchObject({
      recordId: 'prod-9',
      data: CREATED,
      token: 'test-token',
      apiBaseUrl: '/sws/neo/product',
      isActive: true,
      // The record is saved: these panels persist themselves against a real parent id.
      isNew: false,
    });
    // `tab.props` is spread, which is how AttachmentsTab learns its AD table.
    expect(postPanelProps.attachments).toMatchObject({
      recordId: 'prod-9',
      isNew: false,
      isActive: false,
      tableName: 'M_Product',
      config: {},
    });
  });

  it('keeps the inactive panel mounted but hidden', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    expect(screen.getByTestId('record-create-post-panel-pricing')).not.toHaveStyle({ display: 'none' });
    expect(screen.getByTestId('record-create-post-panel-attachments')).toHaveStyle({ display: 'none' });
    // Mounted, not unmounted — so a panel that loads its own data does it once.
    expect(screen.getByTestId('post-panel-body-attachments')).toBeInTheDocument();
  });

  it('swaps the visible panel and the isActive flag when another post tab is picked', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    await user.click(screen.getByTestId('record-create-post-tab-attachments'));

    await waitFor(() => {
      expect(screen.getByTestId('record-create-post-panel-attachments')).not.toHaveStyle({ display: 'none' });
    });
    expect(screen.getByTestId('record-create-post-panel-pricing')).toHaveStyle({ display: 'none' });
    expect(postPanelProps.attachments.isActive).toBe(true);
    expect(postPanelProps.pricing.isActive).toBe(false);
  });

  it('shows the badge count a panel reports through onCountChange', async () => {
    const user = userEvent.setup();
    await createRecord(user);
    await screen.findByTestId('record-create-post-tabs');

    expect(screen.getByTestId('record-create-post-tab-attachments')).not.toHaveTextContent('3');

    await user.click(screen.getByTestId('post-panel-emit-count-attachments'));

    await waitFor(() => {
      expect(screen.getByTestId('record-create-post-tab-attachments')).toHaveTextContent('3');
    });
    // The other tab keeps its own (absent) count.
    expect(screen.getByTestId('record-create-post-tab-pricing')).not.toHaveTextContent('3');
  });

  it('still offers a way out when the post-create tabs fail to load', async () => {
    const user = userEvent.setup();
    const broken = { ...TARGET, loadPostCreateTabs: () => Promise.reject(new Error('chunk failed')) };
    const props = await createRecord(user, { target: broken });

    // No panels, but the record exists — the user must still be able to hand it to the line.
    const finish = await screen.findByTestId('record-create-finish');
    expect(screen.queryByTestId('record-create-post-tabs')).not.toBeInTheDocument();
    await user.click(finish);
    expect(props.onCreated).toHaveBeenCalledWith(CREATED);
  });

  it('does not enter the second phase when the POST fails', async () => {
    installApiFetch({ post: jsonResponse({ response: { error: { message: 'duplicate' } } }, false) });
    const user = userEvent.setup();
    const props = await createRecord(user);

    expect(await screen.findByTestId('record-create-error')).toHaveTextContent('duplicate');
    expect(screen.queryByTestId('record-create-post-tabs')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-create-submit')).toBeInTheDocument();
    expect(screen.getByTestId('record-create-cancel')).toBeInTheDocument();
    expect(props.onCreated).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Window mode — "Completado" must save the embedded window's own pending edits
// before re-reading and handing the record to the caller (ETP-5332).
// ────────────────────────────────────────────────────────────────────────────

function StubWindowApp() {
  return <div data-testid="stub-window-app" />;
}

const WINDOW_TARGET = {
  key: 'contact',
  entity: 'contact',
  titleKey: 'createContactTitle',
  errorKey: 'createContactError',
  windowHintKey: 'createContactHint',
  apiBaseUrl: '/sws/neo/contact',
  windowName: 'contacts',
  loadWindow: () => Promise.resolve({ default: StubWindowApp }),
  // Loaded unconditionally by the mount effect even in window mode (the fallback form is
  // never rendered while `windowMode` is true) — resolving it keeps the effect from also
  // surfacing an unrelated `target.errorKey` error.
  loadForm: () => Promise.resolve({ default: StubForm }),
};

/** Routes `/contact/defaults` and a single-record GET independently, like `installApiFetch`. */
function installWindowApiFetch({
  reread = jsonResponse({ response: { data: [{ id: 'rec-99', name: 'Acme' }] } }),
} = {}) {
  mocks.apiFetch.mockImplementation((url, opts) => {
    if (url === '/contact/defaults') return Promise.resolve(jsonResponse({ defaults: {} }));
    if (/^\/contact\/[^/]+$/.test(url) && !opts) {
      return typeof reread === 'function' ? reread(url) : Promise.resolve(reread);
    }
    throw new Error(`unexpected apiFetch call: ${url}`);
  });
}

async function renderWindowModal(props) {
  const utils = render(<RecordCreateModal {...props} />);
  await screen.findByTestId('stub-embedded-window-route');
  return utils;
}

describe('RecordCreateModal — window mode finish (ETP-5332)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveEmbeddedUnsavedChanges.mockReset().mockResolvedValue(true);
  });

  it('calls saveEmbeddedUnsavedChanges BEFORE re-reading the record and handing it to onCreated', async () => {
    installWindowApiFetch();
    const user = userEvent.setup();
    const props = baseProps({ target: WINDOW_TARGET });
    await renderWindowModal(props);

    await user.click(screen.getByTestId('stub-set-record-id'));
    await waitFor(() => expect(screen.getByTestId('record-create-finish')).toBeEnabled());

    await user.click(screen.getByTestId('record-create-finish'));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith({ id: 'rec-99', name: 'Acme' }));
    expect(mocks.saveEmbeddedUnsavedChanges).toHaveBeenCalledTimes(1);

    // The re-read must happen strictly AFTER the save call, not merely "also happen".
    const rereadCallIndex = mocks.apiFetch.mock.calls.findIndex(([url]) => url === '/contact/rec-99');
    expect(rereadCallIndex).toBeGreaterThanOrEqual(0);
    const rereadOrder = mocks.apiFetch.mock.invocationCallOrder[rereadCallIndex];
    const saveOrder = mocks.saveEmbeddedUnsavedChanges.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(rereadOrder);
  });

  it('does not call onCreated and keeps the dialog open when saveEmbeddedUnsavedChanges refuses', async () => {
    installWindowApiFetch();
    mocks.saveEmbeddedUnsavedChanges.mockResolvedValue(false);
    const user = userEvent.setup();
    const props = baseProps({ target: WINDOW_TARGET });
    await renderWindowModal(props);

    await user.click(screen.getByTestId('stub-set-record-id'));
    await waitFor(() => expect(screen.getByTestId('record-create-finish')).toBeEnabled());

    await user.click(screen.getByTestId('record-create-finish'));

    // The refusal must stop right there: no re-read, no onCreated, and the popup stays open
    // on the embedded window so the user can see whatever validation error it now shows.
    await waitFor(() => expect(mocks.saveEmbeddedUnsavedChanges).toHaveBeenCalledTimes(1));
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(mocks.apiFetch.mock.calls.some(([url]) => url === '/contact/rec-99')).toBe(false);
    expect(screen.getByTestId('record-create-modal')).toBeInTheDocument();
    expect(screen.getByTestId('record-create-window')).toBeInTheDocument();
  });

  it('does nothing when Completado is not clicked (no premature save)', async () => {
    installWindowApiFetch();
    await renderWindowModal(baseProps({ target: WINDOW_TARGET }));

    expect(mocks.saveEmbeddedUnsavedChanges).not.toHaveBeenCalled();
  });
});

describe('resolveActionLabel', () => {
  const ui = (key) => key;

  it('reports progress while the POST is in flight', () => {
    expect(resolveActionLabel({ ui, saving: true, createdRecord: null })).toBe('processing');
    // `saving` wins even once the record exists, so a late render cannot flip back to "done".
    expect(resolveActionLabel({ ui, saving: true, createdRecord: { id: 'x' } })).toBe('processing');
  });

  it('offers Create while the popup is still collecting', () => {
    expect(resolveActionLabel({ ui, saving: false, createdRecord: null })).toBe('create');
  });

  it('offers Done once the record exists', () => {
    expect(resolveActionLabel({ ui, saving: false, createdRecord: { id: 'x' } })).toBe('done');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Exported helpers
// ────────────────────────────────────────────────────────────────────────────

describe('buildRecordCreatePayload', () => {
  it('strips the id — a POST assigns it', () => {
    expect(buildRecordCreatePayload({ id: 'x', name: 'Agua' })).toEqual({ name: 'Agua' });
  });

  it('strips every $_identifier display sibling EntityForm writes alongside an FK', () => {
    const payload = buildRecordCreatePayload({
      name: 'Agua',
      productCategory: 'cat-1',
      'productCategory$_identifier': 'Beverages',
      uOM: 'uom-1',
      'uOM$_identifier': 'Unit',
    });
    expect(payload).toEqual({ name: 'Agua', productCategory: 'cat-1', uOM: 'uom-1' });
  });

  it('keeps falsy and null values — they are meaningful to the backend', () => {
    expect(buildRecordCreatePayload({ stocked: false, description: '', price: 0, uOM: null }))
      .toEqual({ stocked: false, description: '', price: 0, uOM: null });
  });

  it.each([[null], [undefined], [{}]])('returns an empty object for %s', (input) => {
    expect(buildRecordCreatePayload(input)).toEqual({});
  });
});

describe('unwrapCreated', () => {
  it('prefers response.data[0]', () => {
    expect(unwrapCreated({ response: { data: [{ id: 'a' }, { id: 'b' }] } })).toEqual({ id: 'a' });
  });

  it('falls back to response.data when it is not an array', () => {
    expect(unwrapCreated({ response: { data: { id: 'a' } } })).toEqual({ id: 'a' });
  });

  it('falls back to data[0]', () => {
    expect(unwrapCreated({ data: [{ id: 'a' }] })).toEqual({ id: 'a' });
  });

  it('falls back to the body itself', () => {
    expect(unwrapCreated({ id: 'a' })).toEqual({ id: 'a' });
  });

  it('returns null for a null body', () => {
    expect(unwrapCreated(null)).toBeNull();
    expect(unwrapCreated(undefined)).toBeNull();
  });
});
