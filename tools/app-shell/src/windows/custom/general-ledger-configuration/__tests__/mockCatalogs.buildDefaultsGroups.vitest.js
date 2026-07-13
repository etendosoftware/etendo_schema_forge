import { describe, it, expect } from 'vitest';
import { buildDefaultsGroups, resolveFieldLabel } from '../mockCatalogs.js';

describe('buildDefaultsGroups', () => {
  it('excludes fields whose visibility is not "editable"', () => {
    const fields = [
      { apiKey: 'a', visibility: 'editable', label: 'A', section: 'bank' },
      { apiKey: 'b', visibility: 'discarded', label: 'B', section: 'bank' },
      { apiKey: 'c', visibility: 'system', label: 'C', section: 'bank' },
    ];
    const groups = buildDefaultsGroups(fields);
    const bank = groups.find((g) => g.section === 'bank');
    expect(bank.fields.map((f) => f.key)).toEqual(['a']);
  });

  it('groups a field with no section into "other"', () => {
    const fields = [
      { apiKey: 'a', visibility: 'editable', label: 'A', section: 'bank' },
      { apiKey: 'b', visibility: 'editable', label: 'B' },
    ];
    const groups = buildDefaultsGroups(fields);
    const other = groups.find((g) => g.section === 'other');
    expect(other.fields.map((f) => f.key)).toEqual(['b']);
  });

  it('emits groups in the fixed display order and omits empty sections', () => {
    const fields = [
      { apiKey: 'w', visibility: 'editable', label: 'W', section: 'warehouse' },
      { apiKey: 'a', visibility: 'editable', label: 'A', section: 'bank' },
    ];
    const groups = buildDefaultsGroups(fields);
    expect(groups.map((g) => g.section)).toEqual(['bank', 'warehouse']);
  });

  it('preserves field order within a group as given in the input array', () => {
    const fields = [
      { apiKey: 'second', visibility: 'editable', label: 'Second', section: 'bank' },
      { apiKey: 'first', visibility: 'editable', label: 'First', section: 'bank' },
    ];
    const groups = buildDefaultsGroups(fields);
    const bank = groups.find((g) => g.section === 'bank');
    expect(bank.fields.map((f) => f.key)).toEqual(['second', 'first']);
  });

  it('carries required=true and the raw label through as fallbackLabel', () => {
    const fields = [
      { apiKey: 'a', visibility: 'editable', label: 'Account A', required: true, section: 'bank' },
    ];
    const groups = buildDefaultsGroups(fields);
    expect(groups[0].fields[0]).toEqual({ key: 'a', required: true, fallbackLabel: 'Account A' });
  });

  it('defaults required to false when contract.json omits it', () => {
    const fields = [
      { apiKey: 'a', visibility: 'editable', label: 'Account A', section: 'bank' },
    ];
    const groups = buildDefaultsGroups(fields);
    expect(groups[0].fields[0].required).toBe(false);
  });

  it('returns an empty array when no fields are editable', () => {
    const fields = [{ apiKey: 'a', visibility: 'discarded', label: 'A', section: 'bank' }];
    expect(buildDefaultsGroups(fields)).toEqual([]);
  });
});

describe('resolveFieldLabel', () => {
  it('prefers the curated i18n label when present', () => {
    const dictionary = { genericLabels: { 'glc.acct.bankAsset': 'Activo bancario' } };
    expect(resolveFieldLabel(dictionary, 'bankAsset', 'Bank Asset')).toBe('Activo bancario');
  });

  it('falls back to the raw AD label when no curated key exists', () => {
    const dictionary = { genericLabels: {} };
    expect(resolveFieldLabel(dictionary, 'brandNewField', 'Brand New Field')).toBe('Brand New Field');
  });

  it('falls back to the raw i18n key when neither a translation nor a fallback label exists', () => {
    const dictionary = { genericLabels: {} };
    expect(resolveFieldLabel(dictionary, 'brandNewField', undefined)).toBe('glc.acct.brandNewField');
  });

  it('handles a missing/undefined dictionary without throwing', () => {
    expect(resolveFieldLabel(undefined, 'bankAsset', 'Bank Asset')).toBe('Bank Asset');
  });
});
