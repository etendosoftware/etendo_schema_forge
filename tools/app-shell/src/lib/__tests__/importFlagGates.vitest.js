// @covers tools/app-shell/src/lib/importFlagGates.js
/**
 * Flag-gated import columns (`window.import.fields[].hiddenWhenFlag`): a field is dropped while
 * its flag is ON, kept while it is OFF, and a field that names no flag is never touched. Generic —
 * the keys below are arbitrary, the filter never names a real flag.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ flagValues: {}, askedKeys: null }));

vi.mock('@/lib/flags/useFeatureFlag.js', () => ({
  useFeatureFlags: (keys) => {
    mocks.askedKeys = keys;
    return mocks.flagValues;
  },
}));

import { applyImportFlagGates, importFlagGateKeys, useFlagGatedImportConfig } from '../importFlagGates.js';

const config = {
  descriptor: 'demo',
  fields: [
    { target: 'name' },
    { target: 'customer', hiddenWhenFlag: 'flag-a' },
    { target: 'vendor', hiddenWhenFlag: 'flag-a' },
    { target: 'legacy', hiddenWhenFlag: 'flag-b' },
  ],
};
const targets = (cfg) => cfg.fields.map((f) => f.target);

beforeEach(() => {
  mocks.flagValues = {};
  mocks.askedKeys = null;
});

describe('applyImportFlagGates', () => {
  it.each([
    ['both flags off', { 'flag-a': false, 'flag-b': false }, ['name', 'customer', 'vendor', 'legacy']],
    ['flag-a on', { 'flag-a': true, 'flag-b': false }, ['name', 'legacy']],
    ['flag-b on', { 'flag-a': false, 'flag-b': true }, ['name', 'customer', 'vendor']],
    ['both flags on', { 'flag-a': true, 'flag-b': true }, ['name']],
    ['flags unknown (not resolved)', {}, ['name', 'customer', 'vendor', 'legacy']],
  ])('%s: hides only the fields gated by an enabled flag', (_label, flagValues, expected) => {
    expect(targets(applyImportFlagGates(config, flagValues))).toEqual(expected);
  });

  it('keeps the rest of the import block and does not mutate the input', () => {
    const result = applyImportFlagGates(config, { 'flag-a': true });
    expect(result.descriptor).toBe('demo');
    expect(config.fields).toHaveLength(4);
  });

  it('returns the same object when nothing is dropped, so identity-memoised callers do not re-run', () => {
    expect(applyImportFlagGates(config, { 'flag-a': false })).toBe(config);
  });

  it.each([[null], [undefined], [{ descriptor: 'no-fields' }]])('passes a config without fields through: %j', (input) => {
    expect(applyImportFlagGates(input, { 'flag-a': true })).toBe(input);
  });
});

describe('importFlagGateKeys', () => {
  it('lists each gating flag once, ignoring ungated fields', () => {
    expect(importFlagGateKeys(config)).toEqual(['flag-a', 'flag-b']);
  });

  it('answers no keys for a config without fields', () => {
    expect(importFlagGateKeys(null)).toEqual([]);
  });
});

describe('useFlagGatedImportConfig', () => {
  it('reads the live values of the flags the config names and applies them', () => {
    mocks.flagValues = { 'flag-a': true, 'flag-b': false };
    const { result } = renderHook(() => useFlagGatedImportConfig(config));
    expect(mocks.askedKeys).toEqual(['flag-a', 'flag-b']);
    expect(targets(result.current)).toEqual(['name', 'legacy']);
  });
});
