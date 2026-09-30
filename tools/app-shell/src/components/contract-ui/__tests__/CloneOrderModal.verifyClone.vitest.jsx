// ETP-5547 — a clone the server reported (POST cloneRecord → 201 + id) but that does not exist
// (the request transaction was rolled back AFTER the 2xx response had been written) must never be
// presented as a navigable success. The follow-up GET of each clone is what proves it: a 404
// renders the row as failed and non-clickable; when every clone is missing, the done title must
// not claim success.
//
// The request helper is the real `useApiFetch` (docs/request-policy.md): the session is supplied
// through a `useAuthOptional` mock and `fetch` is routed by method + URL, so the helper's own
// extra requests (e.g. the post-action re-read of the source record, ETP-5434) are answered
// instead of consuming a positional mock meant for the clone verification.

// SESSION is a stable object: a fresh one per render would re-create the request function.
const { mockNavigate, SESSION } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  SESSION: { token: 'test-token' },
}));

vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => SESSION,
}));

vi.mock('@/i18n', () => ({
  // Echo the key back, so assertions name the i18n key rather than a translation.
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/statusBadge.js', () => ({
  statusLabel: (status) => status,
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));

vi.mock('@/lib/observability/health-events.js', () => ({ trackDocumentCreated: vi.fn() }));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CloneOrderModal from '../CloneOrderModal.jsx';

const API_BASE = '/sws/neo/sales-invoice';
const ROUTE_PREFIX = '/sales-invoice/';

const SOURCE_ONE = [
  { id: 'src-1', documentNo: 'FV-001', 'businessPartner$_identifier': 'Acme Corp', documentStatus: 'CO' },
];
const SOURCE_TWO = [
  ...SOURCE_ONE,
  { id: 'src-2', documentNo: 'FV-002', 'businessPartner$_identifier': 'Beta Inc', documentStatus: 'CO' },
];

// Any i18n key that tells the user something went wrong with a clone.
const FAILURE_KEY = /fail|error|notfound|unverified|missing/i;
// Success copy for the done state (cloneDoneTitleOne / cloneDoneTitleMany).
const SUCCESS_TITLE_KEY = /cloneDoneTitle/;

// Plain response double, same shape the sibling CloneOrderModal tests use: the helper guards
// every optional member (clone, headers) it may read, so { ok, status, json } is enough.
function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// A 2xx response whose body is not JSON (empty / HTML): `json()` rejects like the real one does.
function nonJsonResponse(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
  };
}

// Sentinel values for the routeFetch maps below.
const NO_ID = Symbol('no-id');             // POST 201 with a body that carries no id
const NON_JSON = Symbol('non-json');       // POST 201 with a body that is not JSON
const NETWORK_ERROR = Symbol('network');   // GET rejects (fetch throws)

/**
 * Routes fetch by method + URL.
 *   clones   — { [sourceId]: newId | NO_ID | NON_JSON } answered by
 *              POST …/header/{sourceId}/action/cloneRecord (201)
 *   verified — { [newId]: 200 | 404 | <other status> | NETWORK_ERROR } answered by
 *              GET …/header/{newId}
 * Any other GET (e.g. the helper's re-read of the source record) answers 200 with that record.
 */
function routeFetch({ clones, verified }) {
  globalThis.fetch = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const path = url.split('?')[0];

    const cloneMatch = path.match(/\/header\/([^/]+)\/action\/cloneRecord$/);
    if (method === 'POST' && cloneMatch) {
      const newId = clones[cloneMatch[1]];
      if (newId === NON_JSON) return nonJsonResponse(201);
      if (newId === NO_ID) return jsonResponse(201, { response: { data: {} } });
      return jsonResponse(201, { response: { data: { id: newId } } });
    }

    const getMatch = path.match(/\/header\/([^/]+)$/);
    if (method === 'GET' && getMatch) {
      const id = getMatch[1];
      if (verified[id] === NETWORK_ERROR) {
        throw new TypeError('Failed to fetch');
      }
      if (verified[id] === 404) {
        return jsonResponse(404, { error: { message: 'Record not found' } });
      }
      if (typeof verified[id] === 'number' && verified[id] !== 200) {
        return jsonResponse(verified[id], { error: { message: 'Server error' } });
      }
      return jsonResponse(200, {
        response: { data: [{ id, documentNo: `DOC-${id}`, 'businessPartner$_identifier': 'Acme Corp' }] },
      });
    }

    return jsonResponse(200, { response: { data: [] } });
  });
}

function renderModal(props = {}) {
  const onClose = vi.fn();
  const onCloned = vi.fn();
  render(
    <CloneOrderModal
      records={SOURCE_ONE}
      apiBaseUrl={API_BASE}
      routePrefix={ROUTE_PREFIX}
      onClose={onClose}
      onCloned={onCloned}
      {...props}
    />,
  );
  return { onClose, onCloned };
}

async function cloneAndWaitForDone() {
  fireEvent.click(screen.getByTestId('action-clone-record'));
  await waitFor(() => expect(screen.getByTestId('clone-done-title')).toBeInTheDocument());
}

/** Clicks the row and everything inside it — whatever part the user might click. */
function clickEverywhereIn(row) {
  fireEvent.click(row);
  row.querySelectorAll('*').forEach((el) => fireEvent.click(el));
}

function expectNeverOpened(newId, { onClose, onCloned }) {
  expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining(newId));
  expect(onClose).not.toHaveBeenCalled();
  const handedIds = onCloned.mock.calls.flat().flat();
  expect(handedIds).not.toContain(newId);
}

describe('CloneOrderModal — ETP-5547 clone verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render a navigable row for a clone whose verification GET returns 404', async () => {
    routeFetch({ clones: { 'src-1': 'new-missing' }, verified: { 'new-missing': 404 } });
    const callbacks = renderModal();

    await cloneAndWaitForDone();

    const row = screen.getByTestId('clone-result-new-missing');
    expect(row).toHaveAttribute('data-clone-status', 'notFound');
    // No anchor pointing at the missing record either.
    const linksToMissing = screen.queryAllByRole('link')
      .filter((a) => (a.getAttribute('href') || '').includes('new-missing'));
    expect(linksToMissing).toHaveLength(0);

    clickEverywhereIn(row);

    expectNeverOpened('new-missing', callbacks);
  });

  it('shows an error indication, not a draft status tag, on the 404 row', async () => {
    routeFetch({ clones: { 'src-1': 'new-missing' }, verified: { 'new-missing': 404 } });
    renderModal();

    await cloneAndWaitForDone();

    const row = screen.getByTestId('clone-result-new-missing');
    expect(within(row).getByTestId('clone-result-message-new-missing'))
      .toHaveTextContent(FAILURE_KEY);
    // A draft status tag would present the missing record as a created Borrador.
    expect(within(row).queryByTestId('status-tag')).not.toBeInTheDocument();
  });

  it('does not claim success in the title when the only clone fails verification', async () => {
    routeFetch({ clones: { 'src-1': 'new-missing' }, verified: { 'new-missing': 404 } });
    renderModal();

    await cloneAndWaitForDone();

    const title = screen.getByTestId('clone-done-title');
    expect(title).not.toHaveTextContent(SUCCESS_TITLE_KEY);
    expect(title).toHaveTextContent(FAILURE_KEY);
  });

  it('does not claim success in the title when every clone of a multi-clone fails verification', async () => {
    routeFetch({
      clones: { 'src-1': 'new-missing-1', 'src-2': 'new-missing-2' },
      verified: { 'new-missing-1': 404, 'new-missing-2': 404 },
    });
    const callbacks = renderModal({ records: SOURCE_TWO });

    await cloneAndWaitForDone();

    const title = screen.getByTestId('clone-done-title');
    expect(title).not.toHaveTextContent(SUCCESS_TITLE_KEY);
    expect(title).toHaveTextContent(FAILURE_KEY);
    expect(screen.getByTestId('clone-result-new-missing-1')).toHaveAttribute('data-clone-status', 'notFound');
    expect(screen.getByTestId('clone-result-new-missing-2')).toHaveAttribute('data-clone-status', 'notFound');
    // Nothing openable → nothing handed to the caller.
    expect(callbacks.onCloned).not.toHaveBeenCalled();
  });

  it('keeps the verified clone navigable and the missing one inert in a mixed multi-clone', async () => {
    routeFetch({
      clones: { 'src-1': 'new-ok', 'src-2': 'new-missing' },
      verified: { 'new-ok': 200, 'new-missing': 404 },
    });
    const callbacks = renderModal({ records: SOURCE_TWO });

    await cloneAndWaitForDone();

    const missingRow = screen.getByTestId('clone-result-new-missing');
    clickEverywhereIn(missingRow);
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining('new-missing'));

    // Only the surviving clone is handed to the caller.
    const handedIds = callbacks.onCloned.mock.calls.flat().flat();
    expect(handedIds).toContain('new-ok');
    expect(handedIds).not.toContain('new-missing');

    fireEvent.click(screen.getByTestId('clone-result-new-ok'));
    expect(mockNavigate).toHaveBeenCalledWith(`${ROUTE_PREFIX}new-ok`);
  });

  it('without routePrefix, stays open and does not hand a missing clone to the caller', async () => {
    routeFetch({ clones: { 'src-1': 'new-missing' }, verified: { 'new-missing': 404 } });
    const callbacks = renderModal({ routePrefix: undefined });

    fireEvent.click(screen.getByTestId('action-clone-record'));

    await waitFor(() => expect(screen.getByTestId('clone-result-new-missing')).toBeInTheDocument());
    expectNeverOpened('new-missing', callbacks);
    expect(callbacks.onCloned).not.toHaveBeenCalled();
  });

  it('still shows success and a navigable row when the verification GET succeeds', async () => {
    routeFetch({ clones: { 'src-1': 'new-ok' }, verified: { 'new-ok': 200 } });
    const { onCloned } = renderModal();

    await cloneAndWaitForDone();

    expect(screen.getByTestId('clone-done-title')).toHaveTextContent(SUCCESS_TITLE_KEY);
    const row = screen.getByTestId('clone-result-new-ok');
    expect(row).toHaveAttribute('data-clone-status', 'ok');
    expect(within(row).getByTestId('status-tag')).toBeInTheDocument();
    expect(onCloned).toHaveBeenCalledWith('new-ok');

    fireEvent.click(row);
    expect(mockNavigate).toHaveBeenCalledWith(`${ROUTE_PREFIX}new-ok`);
  });

  describe('unverified — the verification GET fails for a reason other than 404', () => {
    function expectUnverifiedButNavigable(newId, { onCloned }) {
      const row = screen.getByTestId(`clone-result-${newId}`);
      expect(row).toHaveAttribute('data-clone-status', 'unverified');
      expect(row).toHaveStyle({ cursor: 'pointer' });
      // Flagged, not presented as a confirmed Borrador.
      expect(within(row).getByTestId(`clone-result-message-${newId}`))
        .toHaveTextContent('cloneResultUnverified');
      expect(within(row).queryByTestId('status-tag')).not.toBeInTheDocument();
      // The record most likely exists: the title still reports success.
      expect(screen.getByTestId('clone-done-title')).toHaveTextContent(SUCCESS_TITLE_KEY);
      expect(onCloned).toHaveBeenCalledWith(newId);

      fireEvent.click(row);
      expect(mockNavigate).toHaveBeenCalledWith(`${ROUTE_PREFIX}${newId}`);
    }

    it('keeps the row navigable but flagged when the GET rejects with a network error', async () => {
      routeFetch({ clones: { 'src-1': 'new-net' }, verified: { 'new-net': NETWORK_ERROR } });
      const callbacks = renderModal();

      await cloneAndWaitForDone();

      expectUnverifiedButNavigable('new-net', callbacks);
      expect(callbacks.onClose).toHaveBeenCalled();
    });

    for (const status of [500, 403]) {
      it(`keeps the row navigable but flagged when the GET answers ${status}`, async () => {
        routeFetch({ clones: { 'src-1': 'new-err' }, verified: { 'new-err': status } });
        const callbacks = renderModal();

        await cloneAndWaitForDone();

        expectUnverifiedButNavigable('new-err', callbacks);
      });
    }

    it('does not render the unverified row as failed (no destructive background)', async () => {
      routeFetch({ clones: { 'src-1': 'new-err' }, verified: { 'new-err': 500 } });
      renderModal();

      await cloneAndWaitForDone();

      const row = screen.getByTestId('clone-result-new-err');
      expect(row.style.background).not.toContain('--status-destructive-bg');
    });
  });

  describe('missingId — the clone POST answers 2xx without a usable id', () => {
    const variants = [
      { name: 'a JSON body without an id', clone: NO_ID },
      { name: 'a non-JSON / empty body', clone: NON_JSON },
    ];

    for (const { name, clone } of variants) {
      it(`renders an inert missingId row for ${name}`, async () => {
        routeFetch({ clones: { 'src-1': clone }, verified: {} });
        const callbacks = renderModal();

        await cloneAndWaitForDone();

        const row = screen.getByTestId('clone-result-missing-0');
        expect(row).toHaveAttribute('data-clone-status', 'missingId');
        expect(row).toHaveStyle({ cursor: 'default' });
        expect(within(row).getByTestId('clone-result-message-missing-0'))
          .toHaveTextContent('cloneResultMissingId');
        expect(within(row).queryByTestId('status-tag')).not.toBeInTheDocument();

        // The generic clone error would send the user back to State 1 — it must not appear.
        expect(screen.queryByText('cloneOrderError')).not.toBeInTheDocument();
        expect(screen.queryByTestId('action-clone-record')).not.toBeInTheDocument();

        clickEverywhereIn(row);
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(callbacks.onClose).not.toHaveBeenCalled();
        // No usable id → nothing is handed to the caller (never a null id).
        expect(callbacks.onCloned).not.toHaveBeenCalled();
        expect(callbacks.onCloned).not.toHaveBeenCalledWith(null);
      });
    }

    it('does not issue a verification GET for a clone without an id', async () => {
      routeFetch({ clones: { 'src-1': NO_ID }, verified: {} });
      renderModal();

      await cloneAndWaitForDone();

      const nullGets = globalThis.fetch.mock.calls.filter(([input, init = {}]) => {
        const url = typeof input === 'string' ? input : input.url;
        const method = (init.method || 'GET').toUpperCase();
        return method === 'GET' && /\/header\/(null|undefined)(\?|$)/.test(url);
      });
      expect(nullGets).toHaveLength(0);
    });

    it('hands only the linkable clone to the caller in a mixed multi-clone', async () => {
      routeFetch({ clones: { 'src-1': 'new-ok', 'src-2': NON_JSON }, verified: { 'new-ok': 200 } });
      const callbacks = renderModal({ records: SOURCE_TWO });

      await cloneAndWaitForDone();

      expect(screen.getByTestId('clone-result-new-ok')).toHaveAttribute('data-clone-status', 'ok');
      expect(screen.getByTestId('clone-result-missing-1')).toHaveAttribute('data-clone-status', 'missingId');
      expect(callbacks.onCloned).toHaveBeenCalledWith(['new-ok']);
      expect(screen.queryByText('cloneOrderError')).not.toBeInTheDocument();
    });

    it('without routePrefix, stays open on State 2 instead of calling onCloned', async () => {
      routeFetch({ clones: { 'src-1': NO_ID }, verified: {} });
      const callbacks = renderModal({ routePrefix: undefined });

      fireEvent.click(screen.getByTestId('action-clone-record'));

      await waitFor(() => expect(screen.getByTestId('clone-result-missing-0')).toBeInTheDocument());
      expect(callbacks.onClose).not.toHaveBeenCalled();
      expect(callbacks.onCloned).not.toHaveBeenCalled();
    });
  });

  it('verifies each clone with a GET of the new record id', async () => {
    routeFetch({ clones: { 'src-1': 'new-ok' }, verified: { 'new-ok': 200 } });
    renderModal();

    await cloneAndWaitForDone();

    const verificationGets = globalThis.fetch.mock.calls.filter(([input, init = {}]) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init.method || 'GET').toUpperCase();
      return method === 'GET' && url.split('?')[0].endsWith('/header/new-ok');
    });
    expect(verificationGets.length).toBeGreaterThanOrEqual(1);
  });
});
