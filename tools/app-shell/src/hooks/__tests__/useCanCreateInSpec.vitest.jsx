// @covers tools/app-shell/src/hooks/useCanCreateInSpec.js
// ---------------------------------------------------------------------------
// The hook binds the real menu.json (payment-term → window 141, transaction-type has no window)
// to the session's `windowAccess` map and `capabilities`, read through useCapabilitiesSafe —
// mocked here so each case states the session it needs.
// ---------------------------------------------------------------------------
const session = vi.hoisted(() => ({ windowAccess: {}, capabilities: {} }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useWindowAccessSafe: () => session.windowAccess,
  useCapabilitiesSafe: () => session.capabilities,
}));

import { renderHook } from '@testing-library/react';
import { useCanCreateInSpec } from '../useCanCreateInSpec.js';

function canCreate(spec, { windowAccess = {}, capabilities = {} } = {}) {
  session.windowAccess = windowAccess;
  session.capabilities = capabilities;
  return renderHook(() => useCanCreateInSpec(spec)).result.current;
}

describe('useCanCreateInSpec', () => {
  it('payment-term with a "full" grant on window 141 → true', () => {
    expect(canCreate('payment-term', { windowAccess: { 141: 'full' } })).toBe(true);
  });

  it('payment-term with a "read-only" grant → false', () => {
    expect(canCreate('payment-term', { windowAccess: { 141: 'read-only' } })).toBe(false);
  });

  it('payment-term with no grant loaded ({}) → false', () => {
    expect(canCreate('payment-term', { windowAccess: {} })).toBe(false);
  });

  it('payment-term as admin / client-admin → true, even with no grant', () => {
    expect(canCreate('payment-term', { capabilities: { isAdminOrClientAdmin: true } })).toBe(true);
  });

  it('only a literal true admin flag bypasses the gate', () => {
    expect(canCreate('payment-term', { capabilities: { isAdminOrClientAdmin: 'true' } })).toBe(false);
  });

  it('transaction-type (no window in the menu) → true, even with no grant', () => {
    expect(canCreate('transaction-type', { windowAccess: {} })).toBe(true);
  });

  it('no spec → false', () => {
    expect(canCreate(undefined, { capabilities: { isAdminOrClientAdmin: true } })).toBe(false);
  });
});
