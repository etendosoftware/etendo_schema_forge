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

  // ETP-4839 — `buildCompletedFieldsGate` (private, exercised only through
  // `buildSaveGate`) is the second, independent gate layered on top of the
  // required-fields gate above: once the document is completed,
  // `draftMode.keepSaveWhenCompletedFields` is the ONLY list of header fields
  // Save is allowed to persist. All cases here pass `isValid: true` so the
  // required-fields gate above is a guaranteed pass-through and only the
  // completed-fields gate is under test.
  describe('completed-fields gate (draftMode.keepSaveWhenCompletedFields, ETP-4839)', () => {
    const PASS_REQUIRED = { isValid: true, labelFor: () => undefined, ui };

    it('is inactive (never blocks) when isDraftModeCompleted is false, even with dirty fields outside the list', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: false,
        draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
        dirtyFieldKeys: ['businessPartner'],
      });
      expect(gate).toEqual({ blocked: false, title: undefined, missingAttr: undefined });
    });

    it('is inactive when keepSaveWhenCompletedFields is absent entirely', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: true,
        draftMode: {},
        dirtyFieldKeys: ['businessPartner'],
      });
      expect(gate.blocked).toBe(false);
    });

    it('is inactive when keepSaveWhenCompletedFields is an empty array', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: true,
        draftMode: { keepSaveWhenCompletedFields: [] },
        dirtyFieldKeys: ['businessPartner'],
      });
      expect(gate.blocked).toBe(false);
    });

    it('active + no dirty fields → not blocked', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: true,
        draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
        dirtyFieldKeys: [],
      });
      expect(gate).toEqual({ blocked: false, title: undefined, missingAttr: undefined });
    });

    it('active + every dirty field is allowed → not blocked', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: true,
        draftMode: { keepSaveWhenCompletedFields: ['orderReference', 'notes'] },
        dirtyFieldKeys: ['orderReference'],
      });
      expect(gate.blocked).toBe(false);
    });

    it('active + a dirty field is NOT allowed → blocked, title includes the resolved label, missingAttr includes the key', () => {
      const labelFor = (col) => ({ businessPartner: 'Business Partner' }[col]);
      const gate = buildSaveGate({
        isValid: true, ui, labelFor,
        isDraftModeCompleted: true,
        draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
        dirtyFieldKeys: ['businessPartner'],
        gateFields: [{ key: 'businessPartner', column: 'businessPartner', label: 'Fallback BP' }],
      });
      expect(gate.blocked).toBe(true);
      expect(gate.title).toBe('saveBlockedFieldsNotAllowedWhenCompleted:Business Partner');
      expect(gate.missingAttr).toBe('businessPartner');
    });

    it('active + a MIX of allowed and disallowed dirty fields → only the disallowed one is reported', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: true,
        draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
        dirtyFieldKeys: ['orderReference', 'businessPartner'],
      });
      expect(gate.blocked).toBe(true);
      expect(gate.missingAttr).toBe('businessPartner');
    });

    it('active + multiple disallowed dirty fields → all are comma-joined in missingAttr, in dirtyFieldKeys order', () => {
      const gate = buildSaveGate({
        ...PASS_REQUIRED,
        isDraftModeCompleted: true,
        draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
        dirtyFieldKeys: ['businessPartner', 'warehouse'],
      });
      expect(gate.blocked).toBe(true);
      expect(gate.missingAttr).toBe('businessPartner,warehouse');
    });

    describe('label resolution fallback chain: labelFor(descriptor.column) -> descriptor.label -> raw key', () => {
      it('uses labelFor(descriptor.column) when it resolves', () => {
        const gate = buildSaveGate({
          isValid: true, ui,
          labelFor: () => 'Translated Label',
          isDraftModeCompleted: true,
          draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
          dirtyFieldKeys: ['businessPartner'],
          gateFields: [{ key: 'businessPartner', column: 'businessPartner', label: 'Fallback Label' }],
        });
        expect(gate.title).toBe('saveBlockedFieldsNotAllowedWhenCompleted:Translated Label');
      });

      it('falls back to descriptor.label when labelFor returns falsy', () => {
        const gate = buildSaveGate({
          isValid: true, ui,
          labelFor: () => undefined,
          isDraftModeCompleted: true,
          draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
          dirtyFieldKeys: ['businessPartner'],
          gateFields: [{ key: 'businessPartner', column: 'businessPartner', label: 'Fallback Label' }],
        });
        expect(gate.title).toBe('saveBlockedFieldsNotAllowedWhenCompleted:Fallback Label');
      });

      it('falls back to the raw key when the field has no matching descriptor in gateFields', () => {
        const gate = buildSaveGate({
          isValid: true, ui,
          labelFor: () => 'Should not be used',
          isDraftModeCompleted: true,
          draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
          dirtyFieldKeys: ['businessPartner'],
          gateFields: [],
        });
        expect(gate.title).toBe('saveBlockedFieldsNotAllowedWhenCompleted:businessPartner');
      });

      it('falls back to the raw key when gateFields itself is omitted', () => {
        const gate = buildSaveGate({
          ...PASS_REQUIRED,
          isDraftModeCompleted: true,
          draftMode: { keepSaveWhenCompletedFields: ['orderReference'] },
          dirtyFieldKeys: ['businessPartner'],
        });
        expect(gate.title).toBe('saveBlockedFieldsNotAllowedWhenCompleted:businessPartner');
      });
    });
  });
});
