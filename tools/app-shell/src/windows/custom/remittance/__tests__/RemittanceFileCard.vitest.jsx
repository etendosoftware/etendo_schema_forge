// @covers artifacts/remittance/custom/RemittanceFileCard.jsx
//
// The SEPA file block of a remittance: «Antes de confirmar» while pending (fileReadiness and its
// problems, each group linked to where it is fixed) (a processed remittance shows nothing here). Rendered with the real remittanceFileApi, RecordLink,
// ConfirmDialog and backendErrors.js; only the two `useApiFetch` instances (by base), the API base,
// `useNavigate`, the browser download and the toasts are mocked.
const mockApiFetch = vi.fn();
const mockRootFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: (base) => (base === '/root-base' ? mockRootFetch : mockApiFetch),
}));
vi.mock('@/hooks/useNeoResource.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getApiBase: () => '/root-base',
}));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useNavigate: () => mockNavigate }));
const mockDownloadBlobAsFile = vi.fn();
vi.mock('@/windows/custom/shared/pdfUtils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadBlobAsFile: (...args) => mockDownloadBlobAsFile(...args),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const mockDictionary = { 'backendError.remittanceFileNotProcessed': 'T:fileNotProcessed' };
const mockUi = (key, params) => mockDictionary[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
vi.mock('@/i18n', () => ({ useUI: () => mockUi }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import RemittanceFileCard, { isProcessedRemittance, problemFixRoute } from '@generated/remittance/custom/RemittanceFileCard.jsx';

const API = '/sws/neo/remittance';
const PENDING = { id: 'rem-1', processed: false, updated: 'T1', financialAccount: 'acc-1' };
const PROCESSED = { id: 'rem-1', processed: 'Y', updated: 'T1' };

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}
const readiness = (data) => jsonResponse({ response: { data } });
const fileBytes = () => ({ ok: true, status: 200, blob: async () => new Blob(['<xml/>']) });
const actionCalls = (action) => mockApiFetch.mock.calls.filter(([url]) => url.endsWith(`/action/${action}`));

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function renderCard(data, extra = {}) {
  return render(<RemittanceFileCard data={data} apiBaseUrl={API} {...extra} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockReset();
  mockRootFetch.mockReset();
});

describe('helpers', () => {
  it('isProcessedRemittance reads a boolean or Y', () => {
    expect(isProcessedRemittance({ processed: true })).toBe(true);
    expect(isProcessedRemittance({ processed: 'Y' })).toBe(true);
    expect(isProcessedRemittance({ processed: 'N' })).toBe(false);
    expect(isProcessedRemittance(null)).toBe(false);
  });

  it('problemFixRoute links the contact, the account edit modal and the organization', () => {
    expect(problemFixRoute('line', { businessPartnerId: 'bp 1' })).toBe('/contacts/bp%201');
    expect(problemFixRoute('account', { accountId: 'acc-1' })).toBe('/financial-account/acc-1?edit=true');
    expect(problemFixRoute('org', { organizationId: 'org-1' })).toBe('/organization/org-1');
    expect(problemFixRoute('line', {})).toBeNull();
    expect(problemFixRoute('other', { accountId: 'x' })).toBeNull();
  });
});

describe('RemittanceFileCard — unsaved remittance', () => {
  it('renders nothing and asks nothing', () => {
    const { container } = renderCard({ processed: false });
    expect(container).toBeEmptyDOMElement();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('RemittanceFileCard — «Antes de confirmar» (pending)', () => {
  it('renders nothing while checking and nothing when there are no problems (no «ready» line, no recheck)', async () => {
    const pending = deferred();
    mockApiFetch.mockReturnValueOnce(pending.promise);
    const { container } = renderCard(PENDING);
    expect(container).toBeEmptyDOMElement();
    await act(async () => { pending.resolve(readiness({ ready: true, scheme: 'CORE' })); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('remittance-file-readiness-recheck')).toBeNull();
    expect(actionCalls('fileReadiness')[0][0]).toBe('/remittance/rem-1/action/fileReadiness');
  });

  it('lists the problems grouped, with a link to where each is fixed', async () => {
    mockApiFetch.mockResolvedValue(readiness({
      ready: false,
      problems: [
        { scope: 'line', businessPartnerId: 'bp-1', businessPartnerName: 'Acme', documentNo: 'FAC-1', code: 'X', message: 'Sin IBAN' },
        { scope: 'account', accountId: 'acc-1', code: 'Y', message: 'Cuenta sin BIC' },
        { scope: 'org', organizationId: 'org-1', code: 'Z', message: 'Sin NIF' },
      ],
    }));
    renderCard(PENDING);
    const problems = await screen.findByTestId('remittance-file-readiness-problems');
    expect(problems).toHaveAttribute('role', 'alert');
    expect(problems).toHaveTextContent('remittanceFileReadinessProblems');
    // Order: org, account, then contacts.
    const groups = [...problems.querySelectorAll('[data-testid^="remittance-file-problems-"]:not([data-testid$="-link"])')]
      .map((n) => n.getAttribute('data-testid'));
    expect(groups).toEqual(['remittance-file-problems-org', 'remittance-file-problems-account', 'remittance-file-problems-partner-bp-1']);
    // The backend's sentence as is, never prefixed with an invoice: a contact problem comes once for
    // all the contact's lines, and the invoice-specific messages already name their invoice.
    expect(screen.getByTestId('remittance-file-problems-partner-bp-1')).toHaveTextContent('Sin IBAN');
    expect(screen.getByTestId('remittance-file-problems-partner-bp-1')).not.toHaveTextContent('FAC-1');
    expect(screen.getByTestId('remittance-file-problems-partner-bp-1-link')).toHaveTextContent('Acme');

    fireEvent.click(screen.getByTestId('remittance-file-problems-partner-bp-1-link'));
    fireEvent.click(screen.getByTestId('remittance-file-problems-account-link'));
    fireEvent.click(screen.getByTestId('remittance-file-problems-org-link'));
    expect(mockNavigate.mock.calls.map(([to]) => to)).toEqual([
      '/contacts/bp-1', '/financial-account/acc-1?edit=true', '/organization/org-1',
    ]);
  });

  it('names an untitled contact group generically and shows a problem without invoice as is', async () => {
    mockApiFetch.mockResolvedValue(readiness({ problems: [{ scope: 'line', businessPartnerId: 'bp-2', message: 'Sin mandato' }] }));
    renderCard(PENDING);
    const group = await screen.findByTestId('remittance-file-problems-partner-bp-2');
    expect(screen.getByTestId('remittance-file-problems-partner-bp-2-link')).toHaveTextContent('remittanceFileGroupContact');
    expect(group).toHaveTextContent('Sin mandato');
  });

  it('shows the load error when fileReadiness fails', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));
    renderCard(PENDING);
    expect(await screen.findByTestId('remittance-file-readiness-error')).toHaveTextContent('remittanceFileReadinessLoadError');
    expect(screen.getByTestId('remittance-file-readiness-recheck')).toBeEnabled();
  });

  it('re-checks on «Volver a comprobar»', async () => {
    mockApiFetch.mockResolvedValueOnce(readiness({ problems: [{ scope: 'org', organizationId: 'org-1', message: 'Sin NIF' }] }))
      .mockResolvedValueOnce(readiness({ ready: true }));
    renderCard(PENDING);
    await screen.findByTestId('remittance-file-readiness-problems');
    await act(async () => { fireEvent.click(screen.getByTestId('remittance-file-readiness-recheck')); });
    await waitFor(() => expect(screen.queryByTestId('remittance-file-readiness')).toBeNull());
    expect(actionCalls('fileReadiness')).toHaveLength(2);
  });

  it('re-checks when the record’s `updated` token changes, and not on a plain re-render', async () => {
    mockApiFetch.mockResolvedValue(readiness({ ready: true }));
    const { rerender } = renderCard(PENDING);
    await waitFor(() => expect(actionCalls('fileReadiness')).toHaveLength(1));
    rerender(<RemittanceFileCard data={{ ...PENDING }} apiBaseUrl={API} />);
    await act(async () => {});
    expect(actionCalls('fileReadiness')).toHaveLength(1);
    rerender(<RemittanceFileCard data={{ ...PENDING, updated: 'T2' }} apiBaseUrl={API} />);
    await waitFor(() => expect(actionCalls('fileReadiness')).toHaveLength(2));
  });
});

describe('RemittanceFileCard — creditor identifier problem', () => {
  const NO_ID = { scope: 'account', accountId: 'acc-1', code: 'ETGO_RemittanceFileAccountNoCreditorId', message: 'Falta el identificador', suggestedCreditorId: null };
  const INVALID = { scope: 'account', accountId: 'acc-1', code: 'ETGO_RemittanceFileAccountInvalidCreditorId', message: 'El identificador es incorrecto' };
  const OTHER = { scope: 'org', organizationId: 'org-1', code: 'Z', message: 'Sin NIF' };

  it('is a plain sentence pointing at the field: no buttons, no checkbox, nothing saved', async () => {
    mockApiFetch.mockResolvedValue(readiness({ ready: false, problems: [NO_ID] }));
    renderCard(PENDING);
    const group = await screen.findByTestId('remittance-file-problems-account');
    expect(group).toHaveTextContent('Falta el identificador');
    expect(screen.getByTestId('remittance-file-creditor-hint')).toHaveTextContent('remittanceFileCreditorIdHint');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('creditor-id-problem-use-suggested')).toBeNull();
    expect(screen.queryByTestId('creditor-id-problem-write')).toBeNull();
    expect(actionCalls('saveCreditorId')).toHaveLength(0);
  });

  it('is dropped while the field holds a valid identifier, whatever fileReadiness says', async () => {
    mockApiFetch.mockResolvedValue(readiness({ ready: false, problems: [NO_ID] }));
    renderCard(PENDING, { creditorValid: true });
    await waitFor(() => expect(actionCalls('fileReadiness')).toHaveLength(1));
    expect(screen.queryByTestId('remittance-file-readiness')).toBeNull();
    expect(screen.queryByTestId('remittance-file-problems-account')).toBeNull();
  });

  it('keeps the other problems when only the creditor ones are dropped', async () => {
    mockApiFetch.mockResolvedValue(readiness({ ready: false, problems: [INVALID, OTHER] }));
    renderCard(PENDING, { creditorValid: true });
    await screen.findByTestId('remittance-file-problems-org');
    expect(screen.queryByTestId('remittance-file-problems-account')).toBeNull();
  });

  it('shows the invalid-identifier problem when the field has no valid value', async () => {
    mockApiFetch.mockResolvedValue(readiness({ ready: false, problems: [INVALID] }));
    renderCard(PENDING, { creditorValid: false });
    expect(await screen.findByTestId('remittance-file-problems-account')).toHaveTextContent('El identificador es incorrecto');
  });
});

describe('RemittanceFileCard — processed', () => {
  it('shows no card any more: «Descargar fichero» is a top-bar button and «Regenerar fichero» a kebab item', () => {
    const { container } = renderCard(PROCESSED);
    expect(container).toBeEmptyDOMElement();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockRootFetch).not.toHaveBeenCalled();
  });
});
