import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLabel } from '../resolveLabel.js';

/**
 * ETP-4300 Phase 2A — window-slice resolution in resolveLabel.
 *
 * resolveLabel gains an optional 4th param `windowSlice` (the active-locale
 * label map of a window's generated `labels.js`). The resolution chain becomes:
 *
 *   langOverrides[col] ?? windowSlice[col] ?? dictionary.fields[col].label ?? null
 *
 * These tests pin that chain — both the new priority order and the
 * backward-compatible behavior when no slice is supplied.
 */

const dictionary = {
  fields: {
    C_BPartner_ID: { label: 'Business Partner' },
    DocumentNo: { label: 'Document No.' },
  },
};

describe('resolveLabel — windowSlice backward compatibility', () => {
  it('omitting windowSlice is identical to the old override?>dict>null chain (dict hit)', () => {
    // No 4th arg at all — pre-ETP-4300 call shape.
    assert.equal(resolveLabel(dictionary, 'C_BPartner_ID', null), 'Business Partner');
  });

  it('omitting windowSlice still honors langOverrides over the dictionary', () => {
    const overrides = { C_BPartner_ID: 'Cliente' };
    assert.equal(resolveLabel(dictionary, 'C_BPartner_ID', overrides), 'Cliente');
  });

  it('explicit undefined windowSlice behaves the same as omitting it', () => {
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', null, undefined),
      'Business Partner',
    );
  });

  it('explicit null windowSlice behaves the same as omitting it', () => {
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', null, null),
      'Business Partner',
    );
  });
});

describe('resolveLabel — windowSlice priority', () => {
  it('slice value WINS over the dictionary when no override is present', () => {
    const slice = { C_BPartner_ID: 'Contacto (slice)' };
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', null, slice),
      'Contacto (slice)',
    );
  });

  it('langOverrides WINS over both the slice and the dictionary', () => {
    const overrides = { C_BPartner_ID: 'Override' };
    const slice = { C_BPartner_ID: 'Slice' };
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', overrides, slice),
      'Override',
    );
  });

  it('falls through to the dictionary when the slice lacks the column', () => {
    const slice = { SomeOtherColumn: 'Irrelevant' };
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', null, slice),
      'Business Partner',
    );
  });

  it('returns null when nothing matches (no override, slice miss, dict miss)', () => {
    const slice = { SomeOtherColumn: 'Irrelevant' };
    assert.equal(resolveLabel(dictionary, 'NonExistent', null, slice), null);
  });
});

describe('resolveLabel — windowSlice nullish edge cases (mirror resolveLabel-edge style)', () => {
  it('null slice value falls through to the dictionary (?? is nullish)', () => {
    const slice = { C_BPartner_ID: null };
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', null, slice),
      'Business Partner',
    );
  });

  it('undefined slice value falls through to the dictionary', () => {
    const slice = { C_BPartner_ID: undefined };
    assert.equal(
      resolveLabel(dictionary, 'C_BPartner_ID', null, slice),
      'Business Partner',
    );
  });

  it('empty-string slice value is NOT nullish and shadows the dictionary', () => {
    // Mirrors the existing "empty string label passes through ??" edge case.
    const slice = { C_BPartner_ID: '' };
    assert.equal(resolveLabel(dictionary, 'C_BPartner_ID', null, slice), '');
  });

  it('empty-string override shadows a non-empty slice value', () => {
    const overrides = { C_BPartner_ID: '' };
    const slice = { C_BPartner_ID: 'Slice' };
    assert.equal(resolveLabel(dictionary, 'C_BPartner_ID', overrides, slice), '');
  });

  it('slice hit works even when the dictionary has no entry for the column', () => {
    const slice = { OnlyInSlice: 'From Slice' };
    assert.equal(resolveLabel(dictionary, 'OnlyInSlice', null, slice), 'From Slice');
  });

  it('slice is consulted before a dictionary that is null', () => {
    const slice = { C_BPartner_ID: 'Slice Only' };
    assert.equal(resolveLabel(null, 'C_BPartner_ID', null, slice), 'Slice Only');
  });
});
