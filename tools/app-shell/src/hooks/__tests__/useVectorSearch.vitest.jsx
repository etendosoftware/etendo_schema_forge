// @covers tools/app-shell/src/hooks/useVectorSearch.js
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useVectorSearch } from '../useVectorSearch.js';

const TARGETS = ['sales-invoice'];

function vectorSearchCalls() {
  return globalThis.fetch.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/sws/neo/vectorsearch'));
}

describe('useVectorSearch', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // NeoVectorSearchEndpoint reads the result cap from `topK`; `maxResults` is ignored, so the
  // cap only held while both sides happened to default to 10.
  it('sends the result cap as topK, the parameter the endpoint reads', async () => {
    renderHook(() => useVectorSearch({
      query: 'avile', requestedTargetKeys: TARGETS, selectedTargetKeys: TARGETS,
    }));
    await waitFor(() => expect(vectorSearchCalls()).toHaveLength(1));

    const params = new URL(vectorSearchCalls()[0], 'http://localhost').searchParams;
    expect(params.get('topK')).toBe('10');
    expect(params.has('maxResults')).toBe(false);
    expect(params.get('query')).toBe('avile');
    expect(params.get('targets')).toBe('sales-invoice');
    expect(params.get('minScore')).toBe('0.45');
  });
});
