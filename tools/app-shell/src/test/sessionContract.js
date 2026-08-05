/**
 * Shared assertions for the cookie-session request contract (ETP-4576).
 *
 * Single definition for the whole suite. This assertion was copy-pasted into 26
 * test files during the migration, which is both duplication and a maintenance
 * trap: the contract it encodes is one decision, so a change to it (a new
 * credential-bearing header to forbid, say) has to land in one place, not 26.
 */
import { expect } from 'vitest';

/**
 * Asserts that no request recorded by the fetch mock carried a bearer token —
 * the whole point of ETP-4576.
 *
 * Checks the header name case-insensitively (a caller could send `authorization`
 * lowercase) and also scans the serialized value, so a token smuggled under a
 * differently-named header is still caught.
 *
 * The mock is read at call time rather than bound at import time, so a suite
 * that reinstalls `globalThis.fetch` between tests still asserts on the current
 * one.
 *
 * @param {{ mock: { calls: Array<[unknown, RequestInit|undefined]> } }} [fetchMock]
 */
export function expectNoAuthorizationHeader(fetchMock = globalThis.fetch) {
  for (const [, init] of fetchMock.mock.calls) {
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }
}
