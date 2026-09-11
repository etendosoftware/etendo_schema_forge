// Mocks must come before imports (Vitest hoisting)
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// ETP-5069 / ETP-5022 — the card reads its history through `useApiFetch`, which takes the
// bearer token from the SESSION (never from a `token` prop). The session object is created
// once inside the factory and reused: `useApiFetch` memoises on `auth.logout`'s identity, so
// a fresh object per render would hand the effect a new `apiFetch` on every render and the
// history request would loop forever.
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => {
  const session = { token: 'test-token', logout: () => {} };
  return {
    ...(await importOriginal()),
    useAuthOptional: () => session,
  };
});

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import EmailsCard, { parseEmailHistory } from '../EmailsCard.jsx';

// ── Fixtures ────────────────────────────────────────────────────────────────
// Mirrors the endpoint contract: GET /documentemailhistory?recordId=<id> answers
// 200 { result: "<JSON string>" } — `result` is a STRING the card JSON.parses.

const SENT_ROW = {
  id: 'mail-1',
  sentAt: '2026-03-15T10:30:00Z',
  status: 'SENT',
  recipientsTo: ['client@acme.com'],
  recipientsCc: ['boss@acme.com', 'audit@acme.com'],
  subject: 'Your invoice is ready',
  messageBody: 'Dear customer,\nplease find the invoice attached.',
  downloadLink: 'https://files.example.com/inv-001.pdf',
  sentBy: 'Irina Urricelqui',
};

const FAILED_ROW = {
  id: 'mail-2',
  sentAt: '2026-03-14T09:00:00Z',
  status: 'PROVIDER_FAILED',
  recipientsTo: 'ops@acme.com',
  subject: 'Delivery attempt for INV-001',
  errorMessage: 'SMTP 550 mailbox unavailable',
};

function historyResponse(rows, { ok = true, status = 200, body } = {}) {
  return {
    ok,
    status,
    json: async () => (body !== undefined ? body : { result: JSON.stringify(rows) }),
  };
}

function mockHistory(rows, opts) {
  global.fetch = vi.fn().mockResolvedValue(historyResponse(rows, opts));
}

function historyCalls() {
  return global.fetch.mock.calls.filter(([url]) => String(url).includes('/documentemailhistory'));
}

function renderCard(props = {}) {
  return render(<EmailsCard documentId="doc-1" apiBaseUrl="/api/sales-order" {...props} />);
}

async function renderCardWithRows(rows, props = {}) {
  mockHistory(rows);
  const view = renderCard(props);
  await waitFor(() => expect(historyCalls()).toHaveLength(1));
  return view;
}

describe('EmailsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHistory([]);
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('renders the section title via i18n key', () => {
    render(<EmailsCard onSend={vi.fn()} />);
    expect(screen.getByText('previewCardEmails')).toBeInTheDocument();
  });

  it('renders the "send email" link button via i18n key', () => {
    render(<EmailsCard onSend={vi.fn()} />);
    expect(screen.getByText('previewCardSendEmail')).toBeInTheDocument();
  });

  it('renders the "no email history" message via i18n key', () => {
    render(<EmailsCard onSend={vi.fn()} />);
    expect(screen.getByText('previewCardNoEmailHistory')).toBeInTheDocument();
  });

  it('calls onSend when the send email button is clicked', () => {
    const onSend = vi.fn();
    render(<EmailsCard onSend={onSend} />);
    fireEvent.click(screen.getByText('previewCardSendEmail'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  // ── ETP-4717 fail-closed contract: no onSend → no send link at all ─────────
  it('renders without crashing and omits the send link when onSend is undefined (ETP-4717 fail-closed)', () => {
    expect(() => render(<EmailsCard />)).not.toThrow();
    expect(screen.queryByText('previewCardSendEmail')).not.toBeInTheDocument();
  });

  it('exposes no clickable send trigger when onSend is undefined — no dead link (ETP-4717 fail-closed)', () => {
    render(<EmailsCard />);
    // There must be no button/link element to click in the first place.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  // ── ETP-4372 regression: EMAILS-section Send link must be wired ─────────────
  // The bug was a dead "Enviar email" link (onSend passed as undefined). This
  // guards the component boundary: a wired onSend must fire exactly once on click.
  it('ETP-4372: send link invokes the wired onSend exactly once (not a dead link)', () => {
    const onSend = vi.fn();
    render(<EmailsCard onSend={onSend} />);
    fireEvent.click(screen.getByText('previewCardSendEmail'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('ETP-4717: does NOT render the "send email" link at all when onSend is not passed (undefined)', () => {
    render(<EmailsCard />);
    expect(screen.queryByText('previewCardSendEmail')).not.toBeInTheDocument();
  });

  // ── ETP-5069: the card reads the document's real send history ──────────────

  describe('ETP-5069 — history request', () => {
    it('issues no request at all when documentId is missing', async () => {
      render(<EmailsCard onSend={vi.fn()} apiBaseUrl="/api/sales-order" />);
      await act(async () => {});
      expect(historyCalls()).toHaveLength(0);
    });

    it('requests the history endpoint derived from apiBaseUrl, with the record id', async () => {
      await renderCardWithRows([]);
      expect(historyCalls()[0][0]).toBe('/api/documentemailhistory?recordId=doc-1');
    });

    it('falls back to the default NEO base when apiBaseUrl is not given', async () => {
      mockHistory([]);
      render(<EmailsCard documentId="doc-1" />);
      await waitFor(() => expect(historyCalls()).toHaveLength(1));
      expect(historyCalls()[0][0]).toBe('/sws/neo/documentemailhistory?recordId=doc-1');
    });

    it('url-encodes a record id that carries reserved characters', async () => {
      await renderCardWithRows([], { documentId: 'a b/c&d' });
      expect(historyCalls()[0][0]).toBe('/api/documentemailhistory?recordId=a%20b%2Fc%26d');
    });

    it('sends the request through the session-authenticated helper (bearer + locale headers)', async () => {
      await renderCardWithRows([]);
      const [, init] = historyCalls()[0];
      expect(init.headers).toEqual(expect.objectContaining({
        Authorization: 'Bearer test-token',
        'Accept-Language': expect.any(String),
      }));
    });
  });

  describe('ETP-5069 — loading and empty states', () => {
    it('shows placeholder rows while the request is in flight, and no empty state yet', async () => {
      let resolveFetch;
      global.fetch = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
      const { container } = renderCard();

      expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
      expect(screen.queryByText('previewCardNoEmailHistory')).not.toBeInTheDocument();

      await act(async () => { resolveFetch(historyResponse([])); });
      expect(container.querySelectorAll('.animate-pulse').length).toBe(0);
    });

    it('shows the empty state when the document has no sends', async () => {
      await renderCardWithRows([]);
      expect(await screen.findByText('previewCardNoEmailHistory')).toBeInTheDocument();
    });

    it('keeps the empty state out of the DOM once rows are rendered', async () => {
      await renderCardWithRows([SENT_ROW]);
      expect(await screen.findByText('Your invoice is ready')).toBeInTheDocument();
      expect(screen.queryByText('previewCardNoEmailHistory')).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — row rendering', () => {
    it('renders the recipients and the subject of each send', async () => {
      await renderCardWithRows([SENT_ROW, FAILED_ROW]);
      expect(await screen.findByText('client@acme.com')).toBeInTheDocument();
      expect(screen.getByText('ops@acme.com')).toBeInTheDocument();
      expect(screen.getByText('Your invoice is ready')).toBeInTheDocument();
      expect(screen.getByText('Delivery attempt for INV-001')).toBeInTheDocument();
    });

    it('renders the send date as a formatted date-time, not the raw ISO instant', async () => {
      const { container } = await renderCardWithRows([SENT_ROW]);
      await screen.findByText('Your invoice is ready');
      expect(container.textContent).not.toContain('2026-03-15T10:30:00Z');
      expect(container.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(container.textContent).toMatch(/\d{2}:\d{2}/);
    });

    it('falls back to a placeholder when the send has no date', async () => {
      await renderCardWithRows([{ ...SENT_ROW, sentAt: null }]);
      expect(await screen.findByText('emailHistoryUnknownDate')).toBeInTheDocument();
    });

    it('shows a placeholder when a send carries no To recipients', async () => {
      await renderCardWithRows([{ ...SENT_ROW, recipientsTo: [] }]);
      expect(await screen.findByText('emailHistoryNoRecipients')).toBeInTheDocument();
    });

    it('orders the history newest first', async () => {
      const { container } = await renderCardWithRows([FAILED_ROW, SENT_ROW]);
      await screen.findByText('Your invoice is ready');
      const subjects = container.textContent;
      expect(subjects.indexOf('Your invoice is ready'))
        .toBeLessThan(subjects.indexOf('Delivery attempt for INV-001'));
    });

    it('keeps the fail-closed send link contract while rendering history rows', async () => {
      await renderCardWithRows([SENT_ROW]);
      await screen.findByText('Your invoice is ready');
      expect(screen.queryByText('previewCardSendEmail')).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — success vs failure statuses', () => {
    it('renders a SENT row with the sent label and a success tone', async () => {
      const { container } = await renderCardWithRows([SENT_ROW]);
      expect(await screen.findByText('emailHistoryStatusSent')).toBeInTheDocument();
      expect(container.querySelector('.status-tag--success')).not.toBeNull();
    });

    it('renders a DUPLICATE row as a success — it is an idempotent re-send, not a failure', async () => {
      const { container } = await renderCardWithRows([{ ...SENT_ROW, status: 'DUPLICATE' }]);
      expect(await screen.findByText('emailHistoryStatusDuplicate')).toBeInTheDocument();
      expect(container.querySelector('.status-tag--success')).not.toBeNull();
      expect(container.querySelector('.status-tag--destructive')).toBeNull();
    });

    it('shows a PROVIDER_FAILED send as an error and NEVER as sent', async () => {
      const { container } = await renderCardWithRows([FAILED_ROW]);
      expect(await screen.findByText('emailHistoryStatusProviderFailed')).toBeInTheDocument();
      expect(screen.queryByText('emailHistoryStatusSent')).not.toBeInTheDocument();
      expect(container.querySelector('.status-tag--destructive')).not.toBeNull();
      expect(container.querySelector('.status-tag--success')).toBeNull();
    });

    for (const status of ['THROTTLED', 'SUPPRESSED', 'NO_RECIPIENT', 'UNAUTHORIZED', 'VALIDATION_FAILED']) {
      it(`shows a ${status} send as a failure, not as sent`, async () => {
        const { container } = await renderCardWithRows([{ ...FAILED_ROW, status }]);
        await waitFor(() => expect(container.querySelector('.status-tag--destructive')).not.toBeNull());
        expect(container.querySelector('.status-tag--success')).toBeNull();
        expect(screen.queryByText('emailHistoryStatusSent')).not.toBeInTheDocument();
      });
    }

    it('falls back to the raw status code when the status has no label key', async () => {
      await renderCardWithRows([{ ...FAILED_ROW, status: 'SOMETHING_NEW' }]);
      expect(await screen.findByText('SOMETHING_NEW')).toBeInTheDocument();
    });
  });

  describe('ETP-5069 — expanding a row recovers the body and the attachment', () => {
    async function expandFirstRow(rows) {
      const view = await renderCardWithRows(rows);
      const toggle = await screen.findByRole('button', { name: 'emailHistoryToggleDetails' });
      fireEvent.click(toggle);
      return view;
    }

    it('hides the message body until the row is expanded', async () => {
      await renderCardWithRows([SENT_ROW]);
      await screen.findByText('Your invoice is ready');
      expect(screen.queryByText('emailHistoryMessage')).not.toBeInTheDocument();
      expect(screen.queryByText(/please find the invoice attached/)).not.toBeInTheDocument();
    });

    it('reveals the message body when the row is expanded', async () => {
      await expandFirstRow([SENT_ROW]);
      expect(screen.getByText('emailHistoryMessage')).toBeInTheDocument();
      expect(screen.getByText(/please find the invoice attached/)).toBeInTheDocument();
    });

    it('reveals the attachment download link when the row is expanded', async () => {
      await expandFirstRow([SENT_ROW]);
      const link = screen.getByRole('link', { name: 'emailHistoryDownload' });
      expect(link).toHaveAttribute('href', 'https://files.example.com/inv-001.pdf');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('reveals the sender when the row is expanded', async () => {
      await expandFirstRow([SENT_ROW]);
      expect(screen.getByText('Irina Urricelqui')).toBeInTheDocument();
    });

    for (const [field, value] of [
      ['sender', 'From Sender'],
      ['senderName', 'From SenderName'],
      ['createdByName', 'From CreatedByName'],
      ['userName', 'From UserName'],
    ]) {
      it(`resolves the sender from "${field}" when the preferred fields are absent`, async () => {
        await expandFirstRow([{ id: 'mail-x', sentAt: SENT_ROW.sentAt, status: 'SENT', [field]: value }]);
        expect(screen.getByText(value)).toBeInTheDocument();
      });
    }

    it('shows the error message of a failed send when the row is expanded', async () => {
      await expandFirstRow([FAILED_ROW]);
      expect(screen.getByText('emailHistoryError')).toBeInTheDocument();
      expect(screen.getByText('SMTP 550 mailbox unavailable')).toBeInTheDocument();
    });

    it('does not show an error message on a successful send', async () => {
      await expandFirstRow([{ ...SENT_ROW, errorMessage: 'stale error from a previous attempt' }]);
      expect(screen.queryByText('emailHistoryError')).not.toBeInTheDocument();
      expect(screen.queryByText('stale error from a previous attempt')).not.toBeInTheDocument();
    });

    it('collapses the row again on a second click', async () => {
      await expandFirstRow([SENT_ROW]);
      expect(screen.getByText('emailHistoryMessage')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'emailHistoryToggleDetails' }));
      expect(screen.queryByText('emailHistoryMessage')).not.toBeInTheDocument();
    });

    it('expands only the clicked row, not every row', async () => {
      await renderCardWithRows([SENT_ROW, FAILED_ROW]);
      const toggles = await screen.findAllByRole('button', { name: 'emailHistoryToggleDetails' });
      expect(toggles).toHaveLength(2);
      fireEvent.click(toggles[1]);
      expect(screen.getByText('SMTP 550 mailbox unavailable')).toBeInTheDocument();
      expect(screen.queryByText(/please find the invoice attached/)).not.toBeInTheDocument();
    });

    it('renders no download link when the send has no attachment', async () => {
      await expandFirstRow([{ ...SENT_ROW, downloadLink: null }]);
      expect(screen.queryByRole('link', { name: 'emailHistoryDownload' })).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — CC recipients accept both wire shapes', () => {
    it('renders CC given as an array', async () => {
      await renderCardWithRows([SENT_ROW]);
      fireEvent.click(await screen.findByRole('button', { name: 'emailHistoryToggleDetails' }));
      expect(screen.getByText('emailHistoryCc')).toBeInTheDocument();
      expect(screen.getByText('boss@acme.com, audit@acme.com')).toBeInTheDocument();
    });

    it('renders CC given as a comma-separated string', async () => {
      await renderCardWithRows([{ ...SENT_ROW, recipientsCc: 'boss@acme.com, audit@acme.com' }]);
      fireEvent.click(await screen.findByRole('button', { name: 'emailHistoryToggleDetails' }));
      expect(screen.getByText('boss@acme.com, audit@acme.com')).toBeInTheDocument();
    });

    it('renders CC given as a semicolon-separated string', async () => {
      await renderCardWithRows([{ ...SENT_ROW, recipientsCc: 'boss@acme.com;audit@acme.com' }]);
      fireEvent.click(await screen.findByRole('button', { name: 'emailHistoryToggleDetails' }));
      expect(screen.getByText('boss@acme.com, audit@acme.com')).toBeInTheDocument();
    });

    it('renders To given as a semicolon-separated string', async () => {
      await renderCardWithRows([{ ...SENT_ROW, recipientsTo: 'a@acme.com; b@acme.com' }]);
      expect(await screen.findByText('a@acme.com, b@acme.com')).toBeInTheDocument();
    });

    it('omits the CC line entirely when there is no CC', async () => {
      await renderCardWithRows([{ ...SENT_ROW, recipientsCc: null }]);
      fireEvent.click(await screen.findByRole('button', { name: 'emailHistoryToggleDetails' }));
      expect(screen.queryByText('emailHistoryCc')).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — refreshSignal', () => {
    it('refetches the history when refreshSignal changes', async () => {
      const { rerender } = await renderCardWithRows([]);
      rerender(<EmailsCard documentId="doc-1" apiBaseUrl="/api/sales-order" refreshSignal={1} />);
      await waitFor(() => expect(historyCalls()).toHaveLength(2));
    });

    it('does not refetch when the component re-renders with the same refreshSignal', async () => {
      const { rerender } = await renderCardWithRows([], { refreshSignal: 0 });
      rerender(<EmailsCard documentId="doc-1" apiBaseUrl="/api/sales-order" refreshSignal={0} onSend={vi.fn()} />);
      await act(async () => {});
      expect(historyCalls()).toHaveLength(1);
    });

    it('refetches when the document id changes', async () => {
      const { rerender } = await renderCardWithRows([]);
      rerender(<EmailsCard documentId="doc-2" apiBaseUrl="/api/sales-order" />);
      await waitFor(() => expect(historyCalls()).toHaveLength(2));
      expect(historyCalls()[1][0]).toBe('/api/documentemailhistory?recordId=doc-2');
    });

    it('picks up rows added between two refreshes', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce(historyResponse([]))
        .mockResolvedValueOnce(historyResponse([SENT_ROW]));
      const { rerender } = render(<EmailsCard documentId="doc-1" apiBaseUrl="/api/sales-order" refreshSignal={0} />);
      expect(await screen.findByText('previewCardNoEmailHistory')).toBeInTheDocument();

      rerender(<EmailsCard documentId="doc-1" apiBaseUrl="/api/sales-order" refreshSignal={1} />);
      expect(await screen.findByText('Your invoice is ready')).toBeInTheDocument();
    });
  });

  describe('ETP-5069 — degraded responses never crash the card', () => {
    it('shows the error message when the payload carries an error', async () => {
      global.fetch = vi.fn().mockResolvedValue(historyResponse(null, { body: { error: 'boom' } }));
      renderCard();
      expect(await screen.findByText('previewCardEmailHistoryError')).toBeInTheDocument();
    });

    it('shows the error message on a non-ok HTTP status', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      renderCard();
      expect(await screen.findByText('previewCardEmailHistoryError')).toBeInTheDocument();
    });

    it('shows the error message when the request rejects', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));
      renderCard();
      expect(await screen.findByText('previewCardEmailHistoryError')).toBeInTheDocument();
    });

    it('degrades to the empty state when "result" is not parseable JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue(historyResponse(null, { body: { result: '{not json' } }));
      renderCard();
      expect(await screen.findByText('previewCardNoEmailHistory')).toBeInTheDocument();
    });

    it('degrades to the empty state when the parsed result is not an array', async () => {
      global.fetch = vi.fn().mockResolvedValue(historyResponse(null, { body: { result: '{"foo":1}' } }));
      renderCard();
      expect(await screen.findByText('previewCardNoEmailHistory')).toBeInTheDocument();
    });

    it('skips non-object entries inside the array instead of crashing', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        historyResponse(null, { body: { result: JSON.stringify([null, 'nope', 7, SENT_ROW]) } }),
      );
      expect(() => renderCard()).not.toThrow();
      expect(await screen.findByText('Your invoice is ready')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'emailHistoryToggleDetails' })).toHaveLength(1);
    });

    it('clears the rows and shows the empty state when documentId disappears', async () => {
      const { rerender } = await renderCardWithRows([SENT_ROW]);
      await screen.findByText('Your invoice is ready');
      rerender(<EmailsCard apiBaseUrl="/api/sales-order" />);
      expect(screen.getByText('previewCardNoEmailHistory')).toBeInTheDocument();
      expect(screen.queryByText('Your invoice is ready')).not.toBeInTheDocument();
    });
  });
});

describe('parseEmailHistory', () => {
  it('returns an empty list for a nullish payload', () => {
    expect(parseEmailHistory(null)).toEqual([]);
    expect(parseEmailHistory(undefined)).toEqual([]);
  });

  it('returns an empty list for a non-object payload', () => {
    expect(parseEmailHistory('nope')).toEqual([]);
    expect(parseEmailHistory(42)).toEqual([]);
  });

  it('returns an empty list when the payload reports an error', () => {
    expect(parseEmailHistory({ error: 'boom', result: JSON.stringify([SENT_ROW]) })).toEqual([]);
  });

  it('parses the JSON string carried by "result"', () => {
    expect(parseEmailHistory({ result: JSON.stringify([SENT_ROW]) })).toEqual([SENT_ROW]);
  });

  it('accepts a "result" that is already an array', () => {
    expect(parseEmailHistory({ result: [SENT_ROW] })).toEqual([SENT_ROW]);
  });

  it('returns an empty list when "result" is not parseable JSON', () => {
    expect(parseEmailHistory({ result: '{not json' })).toEqual([]);
  });

  it('returns an empty list when the parsed value is not an array', () => {
    expect(parseEmailHistory({ result: '{"a":1}' })).toEqual([]);
    expect(parseEmailHistory({ result: '"a string"' })).toEqual([]);
  });

  it('returns an empty list when "result" is missing', () => {
    expect(parseEmailHistory({})).toEqual([]);
  });

  it('drops entries that are not objects', () => {
    const rows = parseEmailHistory({ result: JSON.stringify([null, 'x', 3, SENT_ROW]) });
    expect(rows).toEqual([SENT_ROW]);
  });

  it('sorts the sends newest first', () => {
    const rows = parseEmailHistory({ result: JSON.stringify([FAILED_ROW, SENT_ROW]) });
    expect(rows.map((r) => r.id)).toEqual(['mail-1', 'mail-2']);
  });

  it('does not throw on rows with a missing or unparseable sentAt', () => {
    const rows = parseEmailHistory({
      result: JSON.stringify([{ id: 'a' }, { id: 'b', sentAt: 'not-a-date' }, SENT_ROW]),
    });
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('mail-1');
  });
});
