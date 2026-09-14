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
      expect(await screen.findByText('client@acme.com')).toBeInTheDocument();
      expect(screen.queryByText('previewCardNoEmailHistory')).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — row rendering', () => {
    it('renders the recipients of each send (subject is no longer shown, ETP-5069)', async () => {
      await renderCardWithRows([SENT_ROW, FAILED_ROW]);
      expect(await screen.findByText('client@acme.com')).toBeInTheDocument();
      expect(screen.getByText('ops@acme.com')).toBeInTheDocument();
      expect(screen.queryByText('Your invoice is ready')).not.toBeInTheDocument();
      expect(screen.queryByText('Delivery attempt for INV-001')).not.toBeInTheDocument();
    });

    it('renders the send date as a formatted date-time, not the raw ISO instant', async () => {
      const { container } = await renderCardWithRows([SENT_ROW]);
      await screen.findByText('client@acme.com');
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
      await screen.findByText('client@acme.com');
      const text = container.textContent;
      expect(text.indexOf('client@acme.com')).toBeLessThan(text.indexOf('ops@acme.com'));
    });

    it('keeps the fail-closed send link contract while rendering history rows', async () => {
      await renderCardWithRows([SENT_ROW]);
      await screen.findByText('client@acme.com');
      expect(screen.queryByText('previewCardSendEmail')).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — success vs failure statuses (collapsed to exactly 2 visual states)', () => {
    it('renders a SENT row with the success label and a success tone', async () => {
      const { container } = await renderCardWithRows([SENT_ROW]);
      expect(await screen.findByText('emailHistoryStatusSuccess')).toBeInTheDocument();
      expect(container.querySelector('.status-tag--success')).not.toBeNull();
    });

    it('renders a DUPLICATE row as a success — it is an idempotent re-send, not a failure', async () => {
      const { container } = await renderCardWithRows([{ ...SENT_ROW, status: 'DUPLICATE' }]);
      expect(await screen.findByText('emailHistoryStatusSuccess')).toBeInTheDocument();
      expect(container.querySelector('.status-tag--success')).not.toBeNull();
      expect(container.querySelector('.status-tag--destructive')).toBeNull();
    });

    it('shows a PROVIDER_FAILED send with the failed label and NEVER as success', async () => {
      const { container } = await renderCardWithRows([FAILED_ROW]);
      expect(await screen.findByText('emailHistoryStatusFailed')).toBeInTheDocument();
      expect(screen.queryByText('emailHistoryStatusSuccess')).not.toBeInTheDocument();
      expect(container.querySelector('.status-tag--destructive')).not.toBeNull();
      expect(container.querySelector('.status-tag--success')).toBeNull();
    });

    for (const status of ['THROTTLED', 'SUPPRESSED', 'NO_RECIPIENT', 'UNAUTHORIZED', 'VALIDATION_FAILED']) {
      it(`shows a ${status} send with the failed label, not as success`, async () => {
        const { container } = await renderCardWithRows([{ ...FAILED_ROW, status }]);
        await waitFor(() => expect(container.querySelector('.status-tag--destructive')).not.toBeNull());
        expect(container.querySelector('.status-tag--success')).toBeNull();
        expect(screen.queryByText('emailHistoryStatusSuccess')).not.toBeInTheDocument();
      });
    }

    it('renders an unrecognized status code with the generic failed label, not the raw code', async () => {
      await renderCardWithRows([{ ...FAILED_ROW, status: 'SOMETHING_NEW' }]);
      expect(await screen.findByText('emailHistoryStatusFailed')).toBeInTheDocument();
      expect(screen.queryByText('SOMETHING_NEW')).not.toBeInTheDocument();
    });
  });

  describe('ETP-5069 — row interaction is non-expandable (detail panel removed)', () => {
    it('renders a plain row with no button role and no aria-expanded attribute', async () => {
      await renderCardWithRows([SENT_ROW]);
      await screen.findByText('client@acme.com');
      expect(screen.queryByRole('button', { name: 'emailHistoryToggleDetails' })).not.toBeInTheDocument();
      expect(document.querySelector('[aria-expanded]')).toBeNull();
    });

    it('never reveals CC, message body or the download link, even though the payload carries them', async () => {
      const { container } = await renderCardWithRows([SENT_ROW]);
      await screen.findByText('client@acme.com');

      // Clicking the row (there is no toggle control any more) must not reveal anything.
      fireEvent.click(container.querySelector('[data-testid="EmailRow__d50c04"]') ?? container.firstChild);

      expect(screen.queryByText('emailHistoryCc')).not.toBeInTheDocument();
      expect(screen.queryByText('boss@acme.com, audit@acme.com')).not.toBeInTheDocument();
      expect(screen.queryByText('emailHistoryMessage')).not.toBeInTheDocument();
      expect(screen.queryByText(/please find the invoice attached/)).not.toBeInTheDocument();
      expect(screen.queryByText('emailHistoryDownload')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'emailHistoryDownload' })).not.toBeInTheDocument();
      expect(screen.queryByText('Irina Urricelqui')).not.toBeInTheDocument();
      expect(screen.queryByText('emailHistoryError')).not.toBeInTheDocument();
    });

    it('never reveals the error detail of a failed send either', async () => {
      await renderCardWithRows([FAILED_ROW]);
      await screen.findByText('ops@acme.com');
      expect(screen.queryByText('emailHistoryError')).not.toBeInTheDocument();
      expect(screen.queryByText('SMTP 550 mailbox unavailable')).not.toBeInTheDocument();
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
      expect(await screen.findByText('client@acme.com')).toBeInTheDocument();
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
      expect(await screen.findByText('client@acme.com')).toBeInTheDocument();
      // Malformed entries are skipped silently — exactly one row renders, no error, no crash.
      expect(screen.queryByRole('button', { name: 'emailHistoryToggleDetails' })).not.toBeInTheDocument();
    });

    it('clears the rows and shows the empty state when documentId disappears', async () => {
      const { rerender } = await renderCardWithRows([SENT_ROW]);
      await screen.findByText('client@acme.com');
      rerender(<EmailsCard apiBaseUrl="/api/sales-order" />);
      expect(screen.getByText('previewCardNoEmailHistory')).toBeInTheDocument();
      expect(screen.queryByText('client@acme.com')).not.toBeInTheDocument();
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
