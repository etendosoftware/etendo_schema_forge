import { describe, it, expect } from 'vitest';
import { splitFilterParts } from '../ListView.jsx';

// ---------------------------------------------------------------------------
// splitFilterParts — unit tests
//
// Splits an array of query-string filter fragments into:
//   - allCriteria: flattened array parsed from any `criteria` param (JSON;
//     array OR single object; malformed JSON is silently skipped)
//   - passthrough: a URLSearchParams holding every non-`criteria` key/value
// Run with Vitest (the function imports through the React component module,
// which relies on the `@/` aliases configured in vitest.config.js).
// ---------------------------------------------------------------------------

describe('splitFilterParts', () => {
  it('flattens a criteria param whose value is a JSON array', () => {
    const criteria = [
      { fieldName: 'status', operator: 'equals', value: 'DR' },
      { fieldName: 'org', operator: 'equals', value: 'X' },
    ];
    const part = new URLSearchParams({ criteria: JSON.stringify(criteria) }).toString();

    const { allCriteria, passthrough } = splitFilterParts([part]);

    expect(allCriteria).toEqual(criteria);
    expect(allCriteria).toHaveLength(2);
    expect([...passthrough.entries()]).toEqual([]);
  });

  it('wraps a criteria param whose value is a single JSON object', () => {
    const single = { fieldName: 'status', operator: 'equals', value: 'CO' };
    const part = new URLSearchParams({ criteria: JSON.stringify(single) }).toString();

    const { allCriteria } = splitFilterParts([part]);

    expect(allCriteria).toEqual([single]);
    expect(allCriteria).toHaveLength(1);
  });

  it('routes non-criteria params into passthrough', () => {
    const part = new URLSearchParams({ _org: 'X', status: 'DR' }).toString();

    const { allCriteria, passthrough } = splitFilterParts([part]);

    expect(allCriteria).toEqual([]);
    expect(passthrough.get('_org')).toBe('X');
    expect(passthrough.get('status')).toBe('DR');
  });

  it('silently skips malformed criteria JSON without throwing', () => {
    const part = 'criteria=not-valid-json';

    let result;
    expect(() => {
      result = splitFilterParts([part]);
    }).not.toThrow();

    expect(result.allCriteria).toEqual([]);
    expect([...result.passthrough.entries()]).toEqual([]);
  });

  it('keeps valid criteria when one fragment is malformed and another is valid', () => {
    const valid = [{ fieldName: 'status', operator: 'equals', value: 'DR' }];
    const validPart = new URLSearchParams({ criteria: JSON.stringify(valid) }).toString();
    const malformedPart = 'criteria={broken';

    const { allCriteria } = splitFilterParts([malformedPart, validPart]);

    expect(allCriteria).toEqual(valid);
  });

  it('accumulates criteria and passthrough across multiple fragments', () => {
    const partA = new URLSearchParams({
      criteria: JSON.stringify([{ fieldName: 'a', operator: 'equals', value: '1' }]),
      tag: 'first',
    }).toString();
    const partB = new URLSearchParams({
      criteria: JSON.stringify({ fieldName: 'b', operator: 'equals', value: '2' }),
      tag: 'second',
    }).toString();

    const { allCriteria, passthrough } = splitFilterParts([partA, partB]);

    expect(allCriteria).toEqual([
      { fieldName: 'a', operator: 'equals', value: '1' },
      { fieldName: 'b', operator: 'equals', value: '2' },
    ]);
    // A repeated passthrough key accumulates every value (URLSearchParams.append).
    expect(passthrough.getAll('tag')).toEqual(['first', 'second']);
  });

  it('returns empty results for an empty parts array', () => {
    const { allCriteria, passthrough } = splitFilterParts([]);

    expect(allCriteria).toEqual([]);
    expect([...passthrough.entries()]).toEqual([]);
  });
});
