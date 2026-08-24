/**
 * ETP-4896 — the Salt Edge (PSD2) connection is contracted for Spain only.
 *
 * This is the single predicate behind that rule; three surfaces consume it (the edit modal's
 * connect button, the list row's inline link, the row kebab's menu item), so pinning it here is
 * what keeps them from drifting apart.
 */
import { canConnectToSaltEdge, SALT_EDGE_COUNTRY_ISO } from '../saltEdgeEligibility.js';

describe('canConnectToSaltEdge', () => {
  it('accepts an account whose stored country is Spain', () => {
    expect(canConnectToSaltEdge({ countryIso: 'ES' })).toBe(true);
  });

  it('rejects any other country', () => {
    expect(canConnectToSaltEdge({ countryIso: 'IT' })).toBe(false);
    expect(canConnectToSaltEdge({ countryIso: 'FR' })).toBe(false);
    expect(canConnectToSaltEdge({ countryIso: 'PT' })).toBe(false);
  });

  it('rejects an unknown country rather than assuming Spain', () => {
    // Rows created before Country became required carry none. Reading "unknown" as "Spain" would
    // offer a connection the service then rejects.
    expect(canConnectToSaltEdge({})).toBe(false);
    expect(canConnectToSaltEdge({ countryIso: '' })).toBe(false);
    expect(canConnectToSaltEdge({ countryIso: '   ' })).toBe(false);
    expect(canConnectToSaltEdge({ countryIso: null })).toBe(false);
    expect(canConnectToSaltEdge(null)).toBe(false);
    expect(canConnectToSaltEdge(undefined)).toBe(false);
  });

  it('is tolerant of casing and surrounding whitespace', () => {
    // The ISO code is server-supplied, but it reaches here through two different list shapes
    // (the W spec's enrichRecord and the R spec's hand-built JSON) — normalise rather than trust.
    expect(canConnectToSaltEdge({ countryIso: 'es' })).toBe(true);
    expect(canConnectToSaltEdge({ countryIso: ' ES ' })).toBe(true);
  });

  it('ignores a non-string country code', () => {
    expect(canConnectToSaltEdge({ countryIso: 34 })).toBe(false);
  });

  it('exposes the gating country code', () => {
    expect(SALT_EDGE_COUNTRY_ISO).toBe('ES');
  });
});
