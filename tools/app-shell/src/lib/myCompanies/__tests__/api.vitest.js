// @covers tools/app-shell/src/lib/myCompanies/api.js

import { fetchCompanyEnvironments, fetchMyInvitations } from '../api.js';

const apiFetchMock = vi.fn();

vi.mock('@etendosoftware/app-shell-core/auth/api', () => ({
  apiFetch: (...args) => apiFetchMock(...args),
}));

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('fetchCompanyEnvironments', () => {
  it('asks for the opt-in details through the shared apiFetch with the given base', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { environments: [{ clientId: 'a' }] }));

    const environments = await fetchCompanyEnvironments('/etendo');

    expect(environments).toEqual([{ clientId: 'a' }]);
    expect(apiFetchMock).toHaveBeenCalledWith('/sws/go/environments?details=true', { baseUrl: '/etendo' });
  });

  it('returns an empty list when the backend answers one', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { environments: [] }));

    await expect(fetchCompanyEnvironments('')).resolves.toEqual([]);
  });

  it('rejects, instead of reading "no companies", when the body carries no environments array', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { environments: null }));

    await expect(fetchCompanyEnvironments('')).rejects.toThrow(/Malformed response/);
  });

  it('rejects when the body is not JSON', async () => {
    apiFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } });

    await expect(fetchCompanyEnvironments('')).rejects.toMatchObject({ status: 200 });
  });

  it('rejects with the HTTP status on a failed request', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(500, {}));

    await expect(fetchCompanyEnvironments('')).rejects.toMatchObject({ status: 500 });
  });
});

describe('fetchMyInvitations', () => {
  it('reads the account invitations', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, { invitations: [{ id: 'i-1' }] }));

    const invitations = await fetchMyInvitations('/etendo');

    expect(invitations).toEqual([{ id: 'i-1' }]);
    expect(apiFetchMock).toHaveBeenCalledWith('/sws/go/company-invitations/mine', { baseUrl: '/etendo' });
  });

  it('rejects when the body carries no invitations array', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(200, {}));

    await expect(fetchMyInvitations('')).rejects.toThrow(/Malformed response/);
  });

  it('rejects with the HTTP status on a failed request', async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(403, {}));

    await expect(fetchMyInvitations('')).rejects.toMatchObject({ status: 403 });
  });
});
