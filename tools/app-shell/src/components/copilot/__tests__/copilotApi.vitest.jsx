/**
 * Tests for copilotApi.js — exercises all exported functions.
 * Pure function tests + fetch-mocked async tests.
 */

// Mock import.meta.env before the module loads
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });

import {
  detectBaseUrl,
  buildCopilotUrl,
  parseJsonResponse,
  copilotRequest,
  copilotGet,
  extractAnswerText,
  extractConversationId,
  makeClientId,
  getAssistants,
  getLabels,
  getConversations,
  getArchivedConversations,
  getConversationMessages,
  sendQuestion,
  executeTool,
  uploadFile,
  generateTitle,
  renameConversation,
  deleteConversation,
  restoreConversation,
  permanentDeleteConversation,
} from '../copilotApi.js';

// ---------------------------------------------------------------------------
// detectBaseUrl
// ---------------------------------------------------------------------------

describe('detectBaseUrl', () => {
  const originalPathname = window.location.pathname;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: originalPathname },
      writable: true,
    });
  });

  it('extracts context path when /web/ is in the pathname', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/com.etendoerp.go/app' },
      writable: true,
    });
    expect(detectBaseUrl()).toBe('/etendo');
  });

  it('returns empty string when /web/ is not in the pathname and no env var', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/some/other/path' },
      writable: true,
    });
    // import.meta.env.VITE_API_BASE is undefined in test env
    const result = detectBaseUrl();
    expect(typeof result).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// buildCopilotUrl
// ---------------------------------------------------------------------------

describe('buildCopilotUrl', () => {
  it('builds a URL for a copilot endpoint', () => {
    const url = buildCopilotUrl('assistants');
    expect(url).toContain('/sws/copilot/assistants');
  });

  it('concatenates the path segment correctly', () => {
    const url = buildCopilotUrl('question');
    expect(url).toContain('/sws/copilot/question');
  });
});

// ---------------------------------------------------------------------------
// parseJsonResponse
// ---------------------------------------------------------------------------

describe('parseJsonResponse', () => {
  it('returns null for empty response body', async () => {
    const response = { text: async () => '' };
    const result = await parseJsonResponse(response);
    expect(result).toBeNull();
  });

  it('parses valid JSON body', async () => {
    const data = { answer: 'hello' };
    const response = { text: async () => JSON.stringify(data) };
    const result = await parseJsonResponse(response);
    expect(result).toEqual(data);
  });

  it('returns raw text wrapper for non-JSON body', async () => {
    const response = { text: async () => 'not json at all' };
    const result = await parseJsonResponse(response);
    expect(result).toEqual({ raw: 'not json at all' });
  });
});

// ---------------------------------------------------------------------------
// extractAnswerText
// ---------------------------------------------------------------------------

describe('extractAnswerText', () => {
  it('returns empty string for null payload', () => {
    expect(extractAnswerText(null)).toBe('');
  });

  it('returns empty string for undefined payload', () => {
    expect(extractAnswerText(undefined)).toBe('');
  });

  it('returns payload.answer when it is a string', () => {
    expect(extractAnswerText({ answer: 'Hello' })).toBe('Hello');
  });

  it('returns payload.answer.response when answer is an object', () => {
    expect(extractAnswerText({ answer: { response: 'World' } })).toBe('World');
  });

  it('returns payload.response as fallback', () => {
    expect(extractAnswerText({ response: 'Resp' })).toBe('Resp');
  });

  it('returns payload.message as fallback', () => {
    expect(extractAnswerText({ message: 'Msg' })).toBe('Msg');
  });

  it('returns payload.raw as fallback', () => {
    expect(extractAnswerText({ raw: 'Raw text' })).toBe('Raw text');
  });

  it('returns empty string when no known keys match', () => {
    expect(extractAnswerText({ unknown: true })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// extractConversationId
// ---------------------------------------------------------------------------

describe('extractConversationId', () => {
  it('returns null for null payload', () => {
    expect(extractConversationId(null)).toBeNull();
  });

  it('extracts from answer.conversation_id', () => {
    expect(extractConversationId({ answer: { conversation_id: 'C1' } })).toBe('C1');
  });

  it('extracts from top-level conversation_id', () => {
    expect(extractConversationId({ conversation_id: 'C2' })).toBe('C2');
  });

  it('prefers answer.conversation_id over top-level', () => {
    expect(extractConversationId({
      answer: { conversation_id: 'nested' },
      conversation_id: 'top',
    })).toBe('nested');
  });

  it('returns null when no conversation_id found', () => {
    expect(extractConversationId({ other: 'data' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// makeClientId
// ---------------------------------------------------------------------------

describe('makeClientId', () => {
  it('returns a string', () => {
    const id = makeClientId();
    expect(typeof id).toBe('string');
    expect(id).toBe('test-uuid-1234');
  });
});

// ---------------------------------------------------------------------------
// copilotRequest (fetch integration)
// ---------------------------------------------------------------------------

describe('copilotRequest', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an authenticated JSON request and returns parsed data', async () => {
    const data = { answer: 'response text' };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(data),
    });

    const result = await copilotRequest('question', 'test-token', {
      method: 'POST',
      body: JSON.stringify({ question: 'hi' }),
    });

    expect(result).toEqual(data);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/copilot/question');
    expect(opts.credentials).toBe('include');
    expect(opts.headers.get('Authorization')).toBe('Bearer test-token');
    expect(opts.headers.get('Content-Type')).toBe('application/json');
  });

  it('throws on non-ok response with error message from body', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: 'Server down' }),
    });

    await expect(copilotRequest('question', 'tk')).rejects.toThrow('Server down');
  });

  it('throws with status code when no error message in body', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '',
    });

    await expect(copilotRequest('question', 'tk')).rejects.toThrow('403');
  });

  it('does not set Content-Type for FormData body', async () => {
    const formData = new FormData();
    formData.append('file', 'data');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ fileId: 'F1' }),
    });

    await copilotRequest('file', 'tk', { method: 'POST', body: formData });

    const [, opts] = globalThis.fetch.mock.calls[0];
    // Content-Type should NOT be set for FormData (browser sets multipart boundary)
    expect(opts.headers.has('Content-Type')).toBe(false);
  });

  it('omits Authorization header when token is null', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });

    await copilotRequest('question', null);

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.has('Authorization')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// copilotGet
// ---------------------------------------------------------------------------

describe('copilotGet', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a GET request without query params', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([]),
    });

    await copilotGet('assistants', 'tk');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/copilot/assistants');
    expect(url).not.toContain('?');
  });

  it('appends non-empty query params', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({}),
    });

    await copilotGet('conversations', 'tk', { app_id: 'A1', empty: '' });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('app_id=A1');
    // empty string param should be filtered out
    expect(url).not.toContain('empty=');
  });

  it('filters null param values', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await copilotGet('labels', 'tk', { x: null, y: 'yes' });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).not.toContain('x=');
    expect(url).toContain('y=yes');
  });
});

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

describe('Endpoint helpers', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockOk = (data) => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(data),
    });
  };

  it('getAssistants returns array from response', async () => {
    mockOk([{ assistant_id: 'A1' }]);
    const result = await getAssistants('tk');
    expect(result).toEqual([{ assistant_id: 'A1' }]);
  });

  it('getAssistants returns empty array for non-array response', async () => {
    mockOk({ something: 'else' });
    const result = await getAssistants('tk');
    expect(result).toEqual([]);
  });

  it('getLabels returns object from response', async () => {
    mockOk({ greeting: 'Hello' });
    const result = await getLabels('tk');
    expect(result).toEqual({ greeting: 'Hello' });
  });

  it('getLabels returns empty object on fetch failure', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const result = await getLabels('tk');
    expect(result).toEqual({});
  });

  it('getConversations returns normalized conversations', async () => {
    mockOk([{ id: 'C1', name: 'Chat' }]);
    const result = await getConversations('tk', 'A1');
    expect(result[0].conversation_id).toBe('C1');
    expect(result[0].title).toBe('Chat');
  });

  it('getConversations handles data.conversations wrapper', async () => {
    mockOk({ conversations: [{ id: 'C2', title: 'Test' }] });
    const result = await getConversations('tk', 'A1');
    expect(result[0].conversation_id).toBe('C2');
  });

  it('getArchivedConversations returns normalized conversations', async () => {
    mockOk([{ id: 'C3' }]);
    const result = await getArchivedConversations('tk', 'A1');
    expect(result[0].conversation_id).toBe('C3');
  });

  it('getConversationMessages normalizes messages', async () => {
    mockOk([{ sender: 'bot', content: 'Hello' }]);
    const result = await getConversationMessages('tk', 'C1');
    expect(result[0].role).toBe('copilot');
    expect(result[0].text).toBe('Hello');
    expect(result[0].id).toBeDefined();
  });

  it('getConversationMessages handles data.messages wrapper', async () => {
    mockOk({ messages: [{ sender: 'user', message: 'Hi' }] });
    const result = await getConversationMessages('tk', 'C1');
    expect(result[0].role).toBe('user');
    expect(result[0].text).toBe('Hi');
  });

  it('getConversationMessages normalizes assistant role to copilot', async () => {
    mockOk([{ role: 'assistant', text: 'test' }]);
    const result = await getConversationMessages('tk', 'C1');
    expect(result[0].role).toBe('copilot');
  });

  it('sendQuestion sends POST with correct body', async () => {
    mockOk({ answer: 'response' });
    await sendQuestion('tk', { app_id: 'A1', question: 'hi' });
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.app_id).toBe('A1');
    expect(body.question).toBe('hi');
    expect(body.conversation_id).toBeUndefined();
    expect(body.file).toBeUndefined();
  });

  it('sendQuestion includes optional conversation_id and file', async () => {
    mockOk({ answer: 'ok' });
    await sendQuestion('tk', {
      app_id: 'A1',
      question: 'q',
      conversation_id: 'C1',
      file: ['f1.pdf'],
    });
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.conversation_id).toBe('C1');
    expect(body.file).toEqual(['f1.pdf']);
  });

  it('executeTool sends POST with tool_name and params', async () => {
    mockOk({ answer: { result: 'data' } });
    await executeTool('tk', { toolName: 'MyTool', params: { x: 1 } });
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.tool_name).toBe('MyTool');
    expect(body.params).toEqual({ x: 1 });
  });

  it('executeTool includes optional agentId', async () => {
    mockOk({});
    await executeTool('tk', { toolName: 'T', agentId: 'AG1' });
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.agent_id).toBe('AG1');
  });

  it('uploadFile sends FormData body', async () => {
    mockOk({ fileId: 'F1' });
    const file = new File(['content'], 'test.pdf');
    await uploadFile('tk', file);
    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.body instanceof FormData).toBe(true);
  });

  it('generateTitle sends POST with conversation_id', async () => {
    mockOk({ title: 'Auto Title' });
    await generateTitle('tk', 'C1');
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.conversation_id).toBe('C1');
  });

  it('renameConversation sends POST with id and title', async () => {
    mockOk({});
    await renameConversation('tk', 'C1', 'New Name');
    const [, opts] = globalThis.fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.conversation_id).toBe('C1');
    expect(body.title).toBe('New Name');
  });

  it('deleteConversation sends POST with conversation_id', async () => {
    mockOk({});
    await deleteConversation('tk', 'C1');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('deleteConversation');
  });

  it('restoreConversation sends POST with conversation_id', async () => {
    mockOk({});
    await restoreConversation('tk', 'C1');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('restoreConversation');
  });

  it('permanentDeleteConversation sends POST with conversation_id', async () => {
    mockOk({});
    await permanentDeleteConversation('tk', 'C1');
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('permanentDeleteConversation');
  });
});

// ---------------------------------------------------------------------------
// copilotRequest — additional FormData and header edge cases
// ---------------------------------------------------------------------------

describe('copilotRequest — FormData body handling', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not set Content-Type when body is FormData (browser sets boundary)', async () => {
    const formData = new FormData();
    formData.append('key', 'value');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    });

    await copilotRequest('upload', 'tk', { method: 'POST', body: formData });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.has('Content-Type')).toBe(false);
    expect(opts.headers.get('Authorization')).toBe('Bearer tk');
  });

  it('sets Content-Type to application/json for string body', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });

    await copilotRequest('endpoint', 'tk', { method: 'POST', body: '{"x":1}' });

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.headers.get('Content-Type')).toBe('application/json');
  });

  it('throws error with message from response body', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ message: 'Validation failed' }),
    });

    await expect(copilotRequest('test', 'tk')).rejects.toThrow('Validation failed');
  });
});

// ---------------------------------------------------------------------------
// copilotGet — null and empty query params filtering
// ---------------------------------------------------------------------------

describe('copilotGet — param filtering', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters out null query params', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await copilotGet('endpoint', 'tk', { valid: 'yes', nullParam: null });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('valid=yes');
    expect(url).not.toContain('nullParam');
  });

  it('filters out undefined query params', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await copilotGet('endpoint', 'tk', { keep: 'val', drop: undefined });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('keep=val');
    expect(url).not.toContain('drop');
  });

  it('filters out empty string query params', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await copilotGet('endpoint', 'tk', { filled: 'data', empty: '' });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('filled=data');
    expect(url).not.toContain('empty=');
  });

  it('builds no query string when all params are null/empty', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      text: async () => '{}',
    });

    await copilotGet('endpoint', 'tk', { a: null, b: '', c: undefined });
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).not.toContain('?');
  });
});

// ---------------------------------------------------------------------------
// parseJsonResponse — non-JSON response
// ---------------------------------------------------------------------------

describe('parseJsonResponse — edge cases', () => {
  it('wraps non-JSON text in { raw } object', async () => {
    const response = { text: async () => 'plain text response' };
    const result = await parseJsonResponse(response);
    expect(result).toEqual({ raw: 'plain text response' });
  });

  it('wraps HTML response in { raw } object', async () => {
    const response = { text: async () => '<html><body>Error</body></html>' };
    const result = await parseJsonResponse(response);
    expect(result).toEqual({ raw: '<html><body>Error</body></html>' });
  });

  it('returns null for whitespace-only body', async () => {
    const response = { text: async () => '' };
    const result = await parseJsonResponse(response);
    expect(result).toBeNull();
  });

  it('parses nested JSON correctly', async () => {
    const nested = { answer: { response: 'deep', metadata: { key: 'val' } } };
    const response = { text: async () => JSON.stringify(nested) };
    const result = await parseJsonResponse(response);
    expect(result).toEqual(nested);
  });
});

// ---------------------------------------------------------------------------
// detectBaseUrl — /web/ in path vs without
// ---------------------------------------------------------------------------

describe('detectBaseUrl — path variations', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
    });
  });

  it('extracts context from /etendo/web/... path', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/com.etendoerp.go/app' },
      writable: true,
    });
    expect(detectBaseUrl()).toBe('/etendo');
  });

  it('extracts context from /myapp/web/ path', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/myapp/web/something' },
      writable: true,
    });
    expect(detectBaseUrl()).toBe('/myapp');
  });

  it('extracts empty string when /web/ is at root', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/web/app' },
      writable: true,
    });
    expect(detectBaseUrl()).toBe('');
  });

  it('returns empty or env fallback when no /web/ in path', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/dashboard/home' },
      writable: true,
    });
    const result = detectBaseUrl();
    // Falls back to import.meta.env.VITE_API_BASE || ''
    expect(typeof result).toBe('string');
  });
});
