// ETP-5195: AuthProvider fires a silent `GET /sws/neo/refreshtoken` on mount, which lands in
// `globalThis.fetch.mock.calls` alongside the hook's own call. Find the hook's own call by URL
// instead of assuming it is always at index 0.
export function findFetchCall(url) {
  const call = globalThis.fetch.mock.calls.find(([calledUrl]) => calledUrl === url);
  expect(call).toBeTruthy();
  return call;
}
