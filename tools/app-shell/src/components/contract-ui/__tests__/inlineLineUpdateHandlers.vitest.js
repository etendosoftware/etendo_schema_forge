// @covers tools/app-shell/src/components/contract-ui/inlineLineUpdateHandlers.js
//
// `buildCompletedLineFieldUpdateHandler` — the `onUpdateRow` used on a document whose
// lines are locked by completion, for the line fields `draftMode.editableLineFieldsWhenCompleted`
// keeps editable. Its draft-time sibling `buildInlineRowUpdateHandler` is covered by
// DetailView.inlineRowUpdate.vitest.js (through DetailView.jsx's re-export).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApiFetch = vi.fn();
// Every backend call goes through the shared helper (docs/request-policy.md) — mock it, not fetch.
vi.mock('@etendosoftware/app-shell-core/auth/api', async (importOriginal) => ({
  ...(await importOriginal()),
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'sonner';
import { buildCompletedLineFieldUpdateHandler } from '../inlineLineUpdateHandlers.js';
// Response doubles the REAL core apiFetch can harvest `updated` from; importing the module also
// resets the per-record version cache and write chains before every test.
import { neoResponse, writeCalls, bodyOf } from '@/test/realApiFetch.js';

const DETAIL_ENTITY = 'lines';
const ROW = {
  id: 'L1',
  product: 'P1',
  quantity: 10,
  unitPrice: 5,
  lineNetAmount: 50,
  project: 'PRJ-OLD',
  costcenter: 'CC1',
};

function okResponse(body = null) {
  return { ok: true, status: 200, json: async () => body };
}
function errResponse(status = 400) {
  return { ok: false, status, json: async () => ({ error: { message: 'boom' } }) };
}

function makeArgs(overrides = {}) {
  return {
    canEditField: vi.fn((row, key) => key === 'project' || key === 'costcenter'),
    api: { crud: { [DETAIL_ENTITY]: { detailUrl: 'https://x/api/lines/{id}' } } },
    detailEntity: DETAIL_ENTITY,
    apiBaseUrl: 'https://x/api',
    hook: { editing: {}, selected: null, handleUpdateChild: vi.fn() },
    token: 'TKN',
    extractErrorMessage: vi.fn().mockResolvedValue('backend said no'),
    ui: (key) => key,
    fields: [
      { key: 'project', column: 'C_Project_ID' },
      { key: 'costcenter', column: 'C_Costcenter_ID' },
      { key: 'quantity', type: 'quantity' },
    ],
    lineFields: undefined,
    raiseRowSaveConflict: undefined,
    ...overrides,
  };
}

function lastBody() {
  const call = mockApiFetch.mock.calls.at(-1);
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(okResponse());
  vi.mocked(toast.error).mockClear();
});

describe('buildCompletedLineFieldUpdateHandler — factory gating', () => {
  it('returns undefined without a gate', () => {
    expect(buildCompletedLineFieldUpdateHandler(makeArgs({ canEditField: undefined }))).toBeUndefined();
    expect(buildCompletedLineFieldUpdateHandler(makeArgs({ canEditField: null }))).toBeUndefined();
  });

  it('returns undefined when the gate is not a function', () => {
    expect(buildCompletedLineFieldUpdateHandler(makeArgs({ canEditField: true }))).toBeUndefined();
  });

  it('returns an async handler when a gate is given', () => {
    expect(typeof buildCompletedLineFieldUpdateHandler(makeArgs())).toBe('function');
  });
});

describe('buildCompletedLineFieldUpdateHandler — one-field PATCH', () => {
  it('PATCHes the configured detailUrl with {id} replaced', async () => {
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());
    await handler(ROW, 'project', 'PRJ-NEW', {});
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockApiFetch.mock.calls[0];
    expect(url).toBe('https://x/api/lines/L1');
    expect(opts).toMatchObject({ method: 'PATCH', token: 'TKN', baseUrl: '' });
  });

  it('falls back to ${apiBaseUrl}/${detailEntity}/${row.id} when no detailUrl is configured', async () => {
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs({ api: {} }));
    await handler(ROW, 'project', 'PRJ-NEW', {});
    expect(mockApiFetch.mock.calls[0][0]).toBe('https://x/api/lines/L1');
  });

  it('sends ONLY the edited field — no other row column, no price recompute', async () => {
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());
    await handler(ROW, 'project', 'PRJ-NEW', {});
    expect(lastBody()).toEqual({ project: 'PRJ-NEW' });
  });

  it('keeps an _ID-backed value as a string even when it looks numeric', async () => {
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());
    await handler(ROW, 'costcenter', '100', {});
    expect(lastBody()).toEqual({ costcenter: '100' });
  });

  it('sends a cleared value as is', async () => {
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());
    await handler(ROW, 'project', '', {});
    expect(lastBody()).toEqual({ project: '' });
  });

  it('asks the gate with the row and the field key', async () => {
    const args = makeArgs();
    const handler = buildCompletedLineFieldUpdateHandler(args);
    await handler(ROW, 'project', 'PRJ-NEW', {});
    expect(args.canEditField).toHaveBeenCalledWith(ROW, 'project');
  });

  it('applies the local update (value + identifier) and does not toast an error on success', async () => {
    const args = makeArgs();
    const handler = buildCompletedLineFieldUpdateHandler(args);
    await handler(ROW, 'project', 'PRJ-NEW', { identifier: 'Project New' });
    expect(args.hook.handleUpdateChild).toHaveBeenCalledWith('L1', {
      project: 'PRJ-NEW',
      'project$_identifier': 'Project New',
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('applies the server row from the PATCH response after the optimistic update', async () => {
    const serverRow = { id: 'L1', project: 'PRJ-NEW', 'project$_identifier': 'Project New' };
    const body = { response: { data: [serverRow] } };
    mockApiFetch.mockResolvedValue(okResponse(body));
    const args = makeArgs();
    const handler = buildCompletedLineFieldUpdateHandler(args);
    await handler(ROW, 'project', 'PRJ-NEW', {});
    expect(args.hook.handleUpdateChild).toHaveBeenCalledTimes(2);
    expect(args.hook.handleUpdateChild).toHaveBeenLastCalledWith('L1', serverRow, undefined, body);
  });
});

describe('buildCompletedLineFieldUpdateHandler — refused field', () => {
  it('throws with userNotified, toasts once and sends no request for a key the gate refuses', async () => {
    const args = makeArgs();
    const handler = buildCompletedLineFieldUpdateHandler(args);
    await expect(handler(ROW, 'quantity', '99', {})).rejects.toMatchObject({ userNotified: true });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('actionFailed');
    expect(args.hook.handleUpdateChild).not.toHaveBeenCalled();
  });

  it('refuses even a listed field when the gate locks it for this row (e.g. posted)', async () => {
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs({ canEditField: () => false }));
    await expect(handler(ROW, 'project', 'PRJ-NEW', {})).rejects.toMatchObject({ userNotified: true });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('buildCompletedLineFieldUpdateHandler — backend failure', () => {
  it('toasts the extracted backend message and throws with userNotified', async () => {
    mockApiFetch.mockResolvedValue(errResponse());
    const args = makeArgs();
    const handler = buildCompletedLineFieldUpdateHandler(args);
    await expect(handler(ROW, 'project', 'PRJ-NEW', {})).rejects.toMatchObject({
      message: 'backend said no',
      userNotified: true,
    });
    expect(toast.error).toHaveBeenCalledWith('backend said no');
    expect(args.hook.handleUpdateChild).not.toHaveBeenCalled();
  });

  it('falls back to the networkError key when the backend message is empty', async () => {
    mockApiFetch.mockResolvedValue(errResponse(500));
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs({ extractErrorMessage: vi.fn().mockResolvedValue('') }));
    await expect(handler(ROW, 'project', 'PRJ-NEW', {})).rejects.toMatchObject({ userNotified: true });
    expect(toast.error).toHaveBeenCalledWith('networkError');
  });

  it('when the conflict dialog is raised, does NOT toast but still throws with userNotified', async () => {
    const res = errResponse(409);
    mockApiFetch.mockResolvedValue(res);
    const raiseRowSaveConflict = vi.fn().mockResolvedValue(true);
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs({ raiseRowSaveConflict }));
    await expect(handler(ROW, 'project', 'PRJ-NEW', {})).rejects.toMatchObject({ userNotified: true });
    expect(raiseRowSaveConflict).toHaveBeenCalledWith(res, 'L1');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('when the conflict handler reports false, toasts and throws with userNotified', async () => {
    mockApiFetch.mockResolvedValue(errResponse(409));
    const raiseRowSaveConflict = vi.fn().mockResolvedValue(false);
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs({ raiseRowSaveConflict }));
    await expect(handler(ROW, 'project', 'PRJ-NEW', {})).rejects.toMatchObject({ userNotified: true });
    expect(toast.error).toHaveBeenCalledWith('backend said no');
  });
});

// The cases above stub `apiFetch` away, so they cannot see the `updated` concurrency token: it
// is not added by the handler but by the core helper, which remembers it from the GET that read
// the lines (keyed by entity AND id) and injects it into the PATCH that follows. Without it the
// backend answers 400 `missing_updated`. These cases keep the REAL `apiFetch` and stub only
// `globalThis.fetch` underneath it (the documented seam, see `@/test/realApiFetch.js`), so what
// they assert is the request that actually leaves the browser.
describe('buildCompletedLineFieldUpdateHandler — request sent through the real apiFetch', () => {
  const LINES_URL = 'https://x/api/lines?parentId=H1';
  const READ_TOKEN = 'LINE-UPDATED-READ-0001';
  let realApiFetch;

  beforeEach(async () => {
    ({ apiFetch: realApiFetch } = await vi.importActual('@etendosoftware/app-shell-core/auth/api'));
    mockApiFetch.mockImplementation((...args) => realApiFetch(...args));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function installFetch(lines) {
    const fetchMock = vi.fn((url, init = {}) => {
      const method = String(init.method || 'GET').toUpperCase();
      if (method === 'GET') return Promise.resolve(neoResponse(lines));
      return Promise.resolve(neoResponse([{ ...lines[0], ...JSON.parse(init.body), updated: 'LINE-UPDATED-AFTER' }]));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  /** Reads the lines the way the grid does (GET through apiFetch) and lets the harvest settle. */
  async function readLines() {
    const res = await realApiFetch(LINES_URL, { token: 'TKN', baseUrl: '' });
    await res.json();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('the PATCH carries the line\'s `updated` token as read, plus only the edited field', async () => {
    const fetchMock = installFetch([{ ...ROW, updated: READ_TOKEN }]);
    await readLines();
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());

    await handler(ROW, 'project', 'PRJ-NEW', {});

    const writes = writeCalls(fetchMock);
    expect(writes).toHaveLength(1);
    expect(String(writes[0][0])).toBe('https://x/api/lines/L1');
    expect(writes[0][1].method).toBe('PATCH');
    expect(bodyOf(writes[0])).toEqual({ project: 'PRJ-NEW', updated: READ_TOKEN });
  });

  it('sends the request authenticated with the given token and as JSON', async () => {
    const fetchMock = installFetch([{ ...ROW, updated: READ_TOKEN }]);
    await readLines();
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());

    await handler(ROW, 'costcenter', 'CC2', {});

    const [, init] = writeCalls(fetchMock)[0];
    const headers = Object.fromEntries(Object.entries(init.headers).map(([k, v]) => [k.toLowerCase(), v]));
    expect(headers.authorization).toBe('Bearer TKN');
    expect(headers['content-type']).toMatch(/application\/json/);
    expect(bodyOf(writeCalls(fetchMock)[0])).toEqual({ costcenter: 'CC2', updated: READ_TOKEN });
  });

  it('uses the token of the line being edited, not of a sibling line read in the same list', async () => {
    const fetchMock = installFetch([
      { ...ROW, id: 'L0', updated: 'SIBLING-TOKEN' },
      { ...ROW, updated: READ_TOKEN },
    ]);
    await readLines();
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());

    await handler(ROW, 'project', 'PRJ-NEW', {});

    expect(bodyOf(writeCalls(fetchMock)[0]).updated).toBe(READ_TOKEN);
  });

  it('a refused field sends nothing at all, not even a token-only body', async () => {
    const fetchMock = installFetch([{ ...ROW, updated: READ_TOKEN }]);
    await readLines();
    const handler = buildCompletedLineFieldUpdateHandler(makeArgs());

    await expect(handler(ROW, 'quantity', '99', {})).rejects.toMatchObject({ userNotified: true });

    expect(writeCalls(fetchMock)).toHaveLength(0);
  });
});
