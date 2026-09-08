// ETP-5034 — the route-level guard that decides when the detail pane must show
// "record unavailable" instead of a form.
//
// Imports ONLY detailViewHelpers.jsx (never DetailView.jsx): the three helpers moved here
// precisely to keep DetailView.jsx out of this file's dependency closure and off its guarded
// line budget (.claude/hooks/check-detailview-growth.mjs).

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, field) => (field ? data?.[field] : undefined),
}));

import {
  hasRecordForRoute,
  isLoadingRecordForRoute,
  isRecordUnavailableForRoute,
} from '../detailViewHelpers.jsx';

describe('hasRecordForRoute', () => {
  it('is true on the creation route regardless of what is selected', () => {
    expect(hasRecordForRoute(true, { selected: null }, 'rec-1')).toBe(true);
  });

  it('is truthy when the selected record matches the route id', () => {
    expect(hasRecordForRoute(false, { selected: { id: 'rec-1' } }, 'rec-1')).toBeTruthy();
  });

  it('compares ids as strings (numeric legacy ids)', () => {
    expect(hasRecordForRoute(false, { selected: { id: 1234 } }, '1234')).toBeTruthy();
  });

  it('is falsy when the selected record belongs to another route', () => {
    expect(hasRecordForRoute(false, { selected: { id: 'rec-2' } }, 'rec-1')).toBeFalsy();
  });

  it('is falsy when nothing is selected', () => {
    expect(hasRecordForRoute(false, { selected: null }, 'rec-1')).toBeFalsy();
  });
});

describe('isLoadingRecordForRoute', () => {
  it('is true on the creation route while defaults are in flight', () => {
    expect(isLoadingRecordForRoute({ defaultsLoading: true, loading: false }, true, 'new')).toBe(true);
  });

  it('is true while fetching a record the route does not have yet', () => {
    expect(
      isLoadingRecordForRoute({ loading: true, selected: null }, false, 'rec-1')
    ).toBe(true);
  });

  it('is false once the matching record has loaded, even if a list fetch is still running', () => {
    expect(
      isLoadingRecordForRoute({ loading: true, selected: { id: 'rec-1' } }, false, 'rec-1')
    ).toBe(false);
  });

  it('is false when nothing is loading', () => {
    expect(
      isLoadingRecordForRoute({ loading: false, selected: null }, false, 'rec-1')
    ).toBe(false);
  });
});

describe('isRecordUnavailableForRoute (ETP-5034)', () => {
  it('is false on the creation route even when a stale recordError lingers', () => {
    expect(
      isRecordUnavailableForRoute({ recordError: 'notFound', selected: null }, true, 'new'),
      'the creation route has no record to fetch and must never be diverted into the error state'
    ).toBe(false);
  });

  it('is false when there is no recordError', () => {
    expect(
      isRecordUnavailableForRoute({ recordError: null, selected: null }, false, 'rec-1')
    ).toBe(false);
  });

  it('is false when the recordError is stale and the route record is loaded', () => {
    expect(
      isRecordUnavailableForRoute(
        { recordError: 'notFound', selected: { id: 'rec-1' } },
        false,
        'rec-1'
      ),
      'a recordError left behind by a previous id must not blank out a record that has since loaded'
    ).toBe(false);
  });

  it("is true for a 'notFound' with no matching record", () => {
    expect(
      isRecordUnavailableForRoute({ recordError: 'notFound', selected: null }, false, 'ghost')
    ).toBe(true);
  });

  it("is true for an 'error' with no matching record", () => {
    expect(
      isRecordUnavailableForRoute({ recordError: 'error', selected: null }, false, 'rec-1')
    ).toBe(true);
  });

  it('is true when a different record is still selected from a previous route', () => {
    expect(
      isRecordUnavailableForRoute(
        { recordError: 'notFound', selected: { id: 'rec-2' } },
        false,
        'rec-1'
      )
    ).toBe(true);
  });

  it('is false for a null/undefined hook (defensive)', () => {
    expect(isRecordUnavailableForRoute(undefined, false, 'rec-1')).toBe(false);
    expect(isRecordUnavailableForRoute(null, false, 'rec-1')).toBe(false);
  });
});
