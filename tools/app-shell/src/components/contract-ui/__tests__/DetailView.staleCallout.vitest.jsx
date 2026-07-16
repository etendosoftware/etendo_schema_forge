import { describe, it, expect, vi } from 'vitest';
import { applyCalloutFieldUpdates } from '../DetailView.jsx';

/**
 * ETP-4524 — Race 2 (stale callout clobbers newer state).
 *
 * useCallout (300ms per-field debounce, useCallout.js) posts a snapshot of the
 * form at trigger time. Whenever its response lands, DetailView's
 * `calloutResult` effect (DetailView.jsx ~2691-2711) applies it via
 * `applyCalloutFieldUpdates` — the exact function under test here, invoked
 * with the same ctx shape the effect builds at DetailView.jsx:2695.
 *
 * That function's only protection against overwriting a field is
 * `userTouchedRef` (a field the user directly typed into via the form, tracked
 * in DetailView's `fireCallout`). It has NO notion of staleness relative to a
 * SAVE that completed in between: a value that reached its current state via a
 * save response (not via the user typing into that exact field this session)
 * is not in `userTouchedRef`, so a callout response that resolves later with
 * an older value for that field is applied unconditionally — silently
 * reverting the freshly-saved state.
 *
 * Scenario:
 *  1. A callout was triggered by `businessPartner` changing (still in flight).
 *  2. While it is pending, a save completes and updates `paymentMethod` to a
 *     new server-resolved value ("PM_SAVED"). This value did not arrive via
 *     the user typing into the paymentMethod field this session, so
 *     userTouchedRef does not have 'paymentMethod' — exactly the gap the
 *     ticket calls out ("no staleness check against saves ... in between").
 *  3. The businessPartner callout FINALLY resolves, carrying a stale
 *     collateral update for paymentMethod computed before the save happened.
 *
 * A correct implementation must not let the stale collateral update win over
 * the newer, already-saved value.
 */
describe('DetailView — applyCalloutFieldUpdates stale-response race (ETP-4524 Race 2)', () => {
  it('does not let a stale collateral callout update overwrite a value set by a more recent save', () => {
    // `data` reflects the CURRENT form state: paymentMethod already updated by
    // the save that completed while the callout was in flight.
    const data = { businessPartner: 'BP-1', paymentMethod: 'PM_SAVED' };

    const handleChange = vi.fn();
    const hook = { handleChange };

    const ctx = {
      data,
      triggerField: 'businessPartner',
      // paymentMethod was never directly typed by the user this session — it
      // arrived via the save's server response, so it is NOT in this set.
      userTouchedRef: { current: new Set() },
      appliedFields: new Map(),
      hook,
      api: {},
      catalogs: {},
    };

    // The callout response, resolved late, still carries the value it computed
    // BEFORE the save happened — now stale relative to 'PM_SAVED'.
    const updates = {
      paymentMethod: { value: 'PM_STALE_FROM_CALLOUT' },
    };

    applyCalloutFieldUpdates(updates, ctx);

    // Must NOT be overwritten with the stale value.
    expect(handleChange).not.toHaveBeenCalledWith('paymentMethod', 'PM_STALE_FROM_CALLOUT');
  });
});
