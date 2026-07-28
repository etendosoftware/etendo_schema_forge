import { describe, it, expect } from 'vitest';
import { hasFilledDimensionValues } from '../hasFilledDimensionValues.js';

// Deliberately NOT mocking resolveIdentifier.js here (unlike the InlineLinesPanel
// component test) — this exercises the real resolveIdentifier + hasFilledDimensionValues
// pair together, including its `''`-vs-`null` contract (ETP-4610).

describe('hasFilledDimensionValues', () => {
  it('returns false when fields is an empty array, regardless of row contents', () => {
    expect(hasFilledDimensionValues({ project: 'PRJ1', 'project$_identifier': 'Project Alpha' }, [])).toBe(false);
    expect(hasFilledDimensionValues({}, [])).toBe(false);
  });

  it('returns false when every field resolves to a falsy/empty value', () => {
    const row = {
      // no project keys at all
      costcenter: null,
      'costcenter$_identifier': undefined,
      region: '',
      'region$_identifier': '',
    };
    const fields = [{ key: 'project' }, { key: 'costcenter' }, { key: 'region' }];
    expect(hasFilledDimensionValues(row, fields)).toBe(false);
  });

  it('returns true when at least one field resolves to a truthy value', () => {
    const row = {
      costcenter: null,
      project: 'PRJ1',
      'project$_identifier': 'Project Alpha',
    };
    const fields = [{ key: 'costcenter' }, { key: 'project' }];
    expect(hasFilledDimensionValues(row, fields)).toBe(true);
  });

  // resolveIdentifier's real contract for a missing `${key}$_identifier` falls back to
  // the raw `row[key]` value. For a genuinely numeric/boolean dimension field (which
  // real dimension fields never are — they're always FK/identifier-backed), a raw `0`
  // or `false` is falsy under `Boolean(...)` and therefore reported as NOT filled.
  // Pinned explicitly so this contract doesn't silently change later.
  it('treats a raw 0 or false value as NOT filled (Boolean(...) contract)', () => {
    expect(hasFilledDimensionValues({ qty: 0 }, [{ key: 'qty' }])).toBe(false);
    expect(hasFilledDimensionValues({ flag: false }, [{ key: 'flag' }])).toBe(false);
  });

  // The bug this helper was specifically written to avoid: resolveIdentifier can
  // return an empty string ('') rather than null/undefined when a `$_identifier`
  // property exists but is blank. An empty string must count as NOT filled.
  it('treats an empty-string identifier as NOT filled, not as a set value', () => {
    const row = { project: '', 'project$_identifier': '' };
    expect(hasFilledDimensionValues(row, [{ key: 'project' }])).toBe(false);
  });

  it('treats a non-empty string identifier as filled', () => {
    const row = { project: 'PRJ1', 'project$_identifier': 'Project Alpha' };
    expect(hasFilledDimensionValues(row, [{ key: 'project' }])).toBe(true);
  });

  it('falls back to the raw field value when no `$_identifier` counterpart exists', () => {
    expect(hasFilledDimensionValues({ project: 'PRJ1' }, [{ key: 'project' }])).toBe(true);
    expect(hasFilledDimensionValues({ project: null }, [{ key: 'project' }])).toBe(false);
  });
});
