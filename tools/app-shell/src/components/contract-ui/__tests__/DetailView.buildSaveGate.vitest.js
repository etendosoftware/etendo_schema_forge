import { describe, it, expect, vi } from 'vitest';
import { buildSaveGate } from '../saveActions.jsx';

const ui = (key, params) => (params ? `${key}:${params.fields}` : key);

describe('buildSaveGate', () => {
  it('is not blocked when isValid is true, regardless of missingRequiredFields', () => {
    const gate = buildSaveGate({ isValid: true, missingRequiredFields: [{ key: 'a' }], labelFor: () => undefined, ui });
    expect(gate).toEqual({ blocked: false, title: undefined, missingAttr: undefined });
  });

  it('is not blocked when missingRequiredFields is empty, regardless of isValid', () => {
    const gate = buildSaveGate({ isValid: false, missingRequiredFields: [], labelFor: () => undefined, ui });
    expect(gate).toEqual({ blocked: false, title: undefined, missingAttr: undefined });
  });

  // Regression: an earlier version failed CLOSED on `isValid === undefined`,
  // permanently disabling the Save button with an empty tooltip for any caller
  // that never wires validity through (a mocked hook, or a pre-ETP-4933 consumer).
  it('regression: does NOT block when isValid is undefined and missingRequiredFields is []', () => {
    const gate = buildSaveGate({ isValid: undefined, missingRequiredFields: [], labelFor: () => undefined, ui });
    expect(gate.blocked).toBe(false);
    expect(gate.title).toBeUndefined();
  });

  it('defaults missingRequiredFields to [] when omitted entirely', () => {
    const gate = buildSaveGate({ isValid: undefined, labelFor: () => undefined, ui });
    expect(gate.blocked).toBe(false);
  });

  it('is blocked when isValid is false and there are missing required fields', () => {
    const gate = buildSaveGate({
      isValid: false,
      missingRequiredFields: [{ key: 'businessPartner', column: 'businessPartner', label: 'Business Partner' }],
      labelFor: () => undefined,
      ui,
    });
    expect(gate.blocked).toBe(true);
  });

  it('builds a comma-joined title from resolved labels, in field order', () => {
    const labelFor = vi.fn((col) => ({ businessPartner: 'Business Partner', warehouse: 'Warehouse' }[col]));
    const gate = buildSaveGate({
      isValid: false,
      missingRequiredFields: [
        { key: 'businessPartner', column: 'businessPartner' },
        { key: 'warehouse', column: 'warehouse' },
      ],
      labelFor,
      ui,
    });
    expect(gate.title).toBe('saveMissingRequired:Business Partner, Warehouse');
  });

  it('builds a comma-joined missingAttr from field KEYS, not labels (locale-independent, for E2E)', () => {
    const labelFor = () => 'Cualquier Etiqueta En Español';
    const gate = buildSaveGate({
      isValid: false,
      missingRequiredFields: [
        { key: 'businessPartner', column: 'businessPartner' },
        { key: 'warehouse', column: 'warehouse' },
      ],
      labelFor,
      ui,
    });
    expect(gate.missingAttr).toBe('businessPartner,warehouse');
  });

  describe('label resolution fallback chain: labelFor(column) -> f.label -> f.key', () => {
    it('uses labelFor(column) when it resolves', () => {
      const labelFor = () => 'Translated Label';
      const gate = buildSaveGate({
        isValid: false,
        missingRequiredFields: [{ key: 'businessPartner', column: 'businessPartner', label: 'Fallback Label' }],
        labelFor,
        ui,
      });
      expect(gate.title).toBe('saveMissingRequired:Translated Label');
    });

    it('falls back to f.label when labelFor returns falsy', () => {
      const labelFor = () => undefined;
      const gate = buildSaveGate({
        isValid: false,
        missingRequiredFields: [{ key: 'businessPartner', column: 'businessPartner', label: 'Fallback Label' }],
        labelFor,
        ui,
      });
      expect(gate.title).toBe('saveMissingRequired:Fallback Label');
    });

    it('falls back to f.key when both labelFor and f.label are missing', () => {
      const labelFor = () => undefined;
      const gate = buildSaveGate({
        isValid: false,
        missingRequiredFields: [{ key: 'businessPartner', column: 'businessPartner' }],
        labelFor,
        ui,
      });
      expect(gate.title).toBe('saveMissingRequired:businessPartner');
    });

    it('falls back to f.key when labelFor itself is not provided', () => {
      const gate = buildSaveGate({
        isValid: false,
        missingRequiredFields: [{ key: 'businessPartner' }],
        ui,
      });
      expect(gate.title).toBe('saveMissingRequired:businessPartner');
    });
  });
});
