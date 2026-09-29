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

/**
 * Routes fetch by method + URL.
 *   clones   — { [sourceId]: newId } answered by POST …/header/{sourceId}/action/cloneRecord (201)
 *   verified — { [newId]: 200 | 404 } answered by GET …/header/{newId}
 * Any other GET (e.g. the helper's re-read of the source record) answers 200 with that record.
 */
function routeFetch({ clones, verified }) {
  globalThis.fetch = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const path = url.split('?')[0];

    const cloneMatch = path.match(/\/header\/([^/]+)\/action\/cloneRecord$/);
    if (method === 'POST' && cloneMatch) {
      return jsonResponse(201, { response: { data: { id: clones[cloneMatch[1]] } } });
    }

    const getMatch = path.match(/\/header\/([^/]+)$/);
    if (method === 'GET' && getMatch) {
      const id = getMatch[1];
      if (verified[id] === 404) {
        return jsonResponse(404, { error: { message: 'Record not found' } });
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
