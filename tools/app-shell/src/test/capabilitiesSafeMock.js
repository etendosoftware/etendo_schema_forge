import { vi } from 'vitest';

/**
 * Shared `vi.mock('@/hooks/useCapabilitiesSafe.js', ...)` surface (ETP-5684).
 *
 * WHY THIS EXISTS — the posting actions (Contabilizar / Descontabilizar) are
 * gated on `capabilities.showAccountingFields`, and that gate fails CLOSED.
 * A component test mounted without an `AuthProvider` therefore loses every
 * post/unpost entry, so a suite that asserts on them has to grant the
 * capability explicitly. This module is that grant, once, plus a setter for
 * the negative tests.
 *
 * Deliberately NOT a global default in `src/test/setup.js`: that would mask
 * the fail-closed behaviour the negative tests exist to prove.
 *
 * Usage — the `vi.mock` call must stay in the test file (Vitest only hoists
 * the calls it can see there), and the factory imports this module lazily:
 *
 *   vi.mock('@/hooks/useCapabilitiesSafe.js', async () =>
 *     (await import('@/test/capabilitiesSafeMock.js')).capabilitiesSafeMock());
 *
 * The map starts as {@link ACCOUNTING_VISIBLE}. A test that needs the role
 * without the flag calls `setMockCapabilities(ACCOUNTING_HIDDEN)`; the
 * global `beforeEach` in `src/test/setup.js` restores the default.
 */

export const ACCOUNTING_VISIBLE = Object.freeze({ showAccountingFields: true });
export const ACCOUNTING_HIDDEN = Object.freeze({ showAccountingFields: false });

let current = ACCOUNTING_VISIBLE;

/** @param {Record<string, boolean>} capabilities */
export function setMockCapabilities(capabilities) {
  current = capabilities;
}

export function resetMockCapabilities() {
  current = ACCOUNTING_VISIBLE;
}

/**
 * The mocked module: the real `useWindowAccessSafe`, and a
 * `useCapabilitiesSafe` that returns the map set by this helper.
 *
 * @returns {Promise<Record<string, unknown>>}
 */
export async function capabilitiesSafeMock() {
  const actual = await vi.importActual('@/hooks/useCapabilitiesSafe.js');
  return { ...actual, useCapabilitiesSafe: () => current };
}
