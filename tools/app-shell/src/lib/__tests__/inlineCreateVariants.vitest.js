// @covers tools/app-shell/src/lib/inlineCreateVariants.js
// ---------------------------------------------------------------------------
// The inline-create variant registry, keyed by a selector field's `createSpec`.
//
// A Vitest file (not node:test) only because the module imports through the `@/` alias.
//
//   1. An unknown / missing spec resolves to the default name-only variant: body `{ name }`,
//      no validation, no sort, no status-keyed messages.
//   2. A resolved variant is the SAME object on every call (it feeds hook dependencies and the
//      selector's `sortOptions` prop, so a fresh object per render would refetch / re-sort).
//   3. The `payment-term` variant: days input (digits only, max 3), validation keys,
//      `{ overduePaymentDaysRule }` body,
//      numeric sort, and only a key-less 409 fallback (keyed refusals are translated by the shared
//      `translateBackendError`, covered in backendErrors.test.js).
//   4. `resolveCreateErrorMessage` — the fallback message for a failed create, or null.
//   5. `PAYMENT_TERM_CREATE_FIELD_PROPS` — the field keys a hand-built form spreads in.
//   6. Every i18n key a payment-term create can show (variant + shared backendError keys) exists in
//      en_US / es_ES / es_AR, and each duplicate message interpolates `{name}` exactly once.
// ---------------------------------------------------------------------------
import {
  resolveInlineCreateVariant,
  INLINE_CREATE_VARIANTS,
  PAYMENT_TERM_CREATE_FIELD_PROPS,
  resolveCreateErrorMessage,
} from '../inlineCreateVariants.js';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';
import { comparePaymentTermOptions } from '@/lib/paymentTermDays.js';

describe('resolveInlineCreateVariant — default variant', () => {
  it.each([
    ['an unknown spec', 'transaction-type'],
    ['undefined', undefined],
    ['an empty string', ''],
    ['an inherited Object.prototype key', 'constructor'],
  ])('%s resolves to the name-only default', (_label, spec) => {
    const variant = resolveInlineCreateVariant(spec);
    expect(variant.buildBody('Bank fee')).toEqual({ name: 'Bank fee' });
    expect(variant.validate).toBeUndefined();
    expect(variant.sortOptions).toBeUndefined();
    expect(variant.errorMessagesByKey).toBeUndefined();
    expect(variant.fallbackErrorKeysByStatus).toBeUndefined();
    expect(variant.inputPattern).toBeUndefined();
    expect(variant.inputMaxLength).toBeUndefined();
    expect(variant.inputRejectedKey).toBeUndefined();
    expect(variant.inputLabelKey).toBeUndefined();
    expect(variant.inputSuffixKey).toBeUndefined();
  });

  it('returns the same default object for every unknown spec', () => {
    expect(resolveInlineCreateVariant('a')).toBe(resolveInlineCreateVariant('b'));
    expect(Object.isFrozen(resolveInlineCreateVariant('a'))).toBe(true);
  });
});

describe('resolveInlineCreateVariant — payment-term', () => {
  const variant = resolveInlineCreateVariant('payment-term');

  it('returns a stable, frozen object across calls', () => {
    expect(resolveInlineCreateVariant('payment-term')).toBe(variant);
    expect(Object.isFrozen(variant)).toBe(true);
  });

  it('asks for a number of days with a numeric keypad', () => {
    expect(variant.inputLabelKey).toBe('paymentTermDaysLabel');
    expect(variant.inputSuffixKey).toBe('paymentTermDaysSuffix');
    expect(variant.inputMode).toBe('numeric');
  });

  it('validate: null for a valid value, the i18n key (and params) otherwise', () => {
    expect(variant.validate('30')).toBeNull();
    expect(variant.validate('')).toEqual({ key: 'paymentTermDaysRequired', params: undefined });
    expect(variant.validate('7,5')).toEqual({ key: 'paymentTermDaysNotInteger', params: undefined });
    expect(variant.validate('366')).toEqual({ key: 'paymentTermDaysOutOfRange', params: { min: 1, max: 365 } });
  });

  it('restricts the input to at most 3 digits while typing', () => {
    for (const ok of ['', '1', '123']) expect(variant.inputPattern.test(ok), ok).toBe(true);
    for (const bad of ['1.5', '7,5', '-5', '+5', '1 ', ' 1', 'abc', '50%']) {
      expect(variant.inputPattern.test(bad), bad).toBe(false);
    }
    // No `g` flag: a stateful lastIndex would make repeated .test() calls alternate.
    expect(variant.inputPattern.global).toBe(false);
    expect(variant.inputMaxLength).toBe(3);
    expect(variant.inputRejectedKey).toBe('paymentTermDaysNotInteger');
  });

  it('buildBody: POSTs the days as overduePaymentDaysRule (a number), never a name', () => {
    expect(variant.buildBody('12')).toEqual({ overduePaymentDaysRule: 12 });
    expect(variant.buildBody('007')).toEqual({ overduePaymentDaysRule: 7 });
  });

  it('sorts options by days and only falls back on a key-less 409 (keyed refusals go to the shared translator)', () => {
    expect(variant.sortOptions).toBe(comparePaymentTermOptions);
    expect(variant.errorMessagesByKey).toBeUndefined();
    expect(variant.fallbackErrorKeysByStatus).toEqual({ 409: 'paymentTermNameDuplicate' });
  });

  it('is declared in the public registry under its spec name', () => {
    expect(Object.keys(INLINE_CREATE_VARIANTS)).toContain('payment-term');
  });
});

describe('PAYMENT_TERM_CREATE_FIELD_PROPS', () => {
  it('declares exactly the create keys a payment-term selector field needs', () => {
    expect(PAYMENT_TERM_CREATE_FIELD_PROPS).toEqual({
      allowCreate: true,
      createSpec: 'payment-term',
      createEntity: 'header',
      createLabelKey: 'paymentTermCreate',
      createTitleKey: 'paymentTermCreateTitle',
      createNamePlaceholderKey: 'paymentTermDaysPlaceholder',
    });
    expect(Object.isFrozen(PAYMENT_TERM_CREATE_FIELD_PROPS)).toBe(true);
  });

  it('points at a spec that has a registered variant', () => {
    expect(resolveInlineCreateVariant(PAYMENT_TERM_CREATE_FIELD_PROPS.createSpec))
      .toBe(resolveInlineCreateVariant('payment-term'));
  });
});

describe('resolveCreateErrorMessage', () => {
  const paymentTerm = resolveInlineCreateVariant('payment-term');
  const defaultVariant = resolveInlineCreateVariant('transaction-type');

  it('a 409 with NO message keys → paymentTermNameDuplicate (the name unique constraint)', () => {
    expect(resolveCreateErrorMessage(paymentTerm, { status: 409 })).toEqual({ key: 'paymentTermNameDuplicate' });
    expect(resolveCreateErrorMessage(paymentTerm, { status: 409, messageKeys: [] }))
      .toEqual({ key: 'paymentTermNameDuplicate' });
  });

  it.each([
    ['ETGO_PaymentTermDaysDuplicate', 409, { paymentTermName: '30 Días', paymentTermActive: true }],
    ['ETGO_PaymentTermDaysDuplicate', 409, { paymentTermName: '30 Días', paymentTermActive: false }],
    ['ETGO_PaymentTermNameDuplicate', 409, { paymentTermName: '45 Días', paymentTermActive: true }],
    ['ETGO_PaymentTermDaysOutOfRange', 400, { min: 1, max: 365, value: 400 }],
    ['ETGO_SomethingElse', 409, undefined],
  ])('a keyed error (%s, %i) → null: the shared translator owns it', (key, status, messageParams) => {
    expect(resolveCreateErrorMessage(paymentTerm, { status, messageKeys: [key], messageParams })).toBeNull();
  });

  it('a key-less error with an unmapped status → null', () => {
    expect(resolveCreateErrorMessage(paymentTerm, { status: 500 })).toBeNull();
    expect(resolveCreateErrorMessage(paymentTerm, { message: 'Created record has no id' })).toBeNull();
  });

  it('the default variant never maps an error, even a key-less 409', () => {
    expect(resolveCreateErrorMessage(defaultVariant, { status: 409 })).toBeNull();
  });

  it('a null / undefined error → null', () => {
    expect(resolveCreateErrorMessage(paymentTerm, null)).toBeNull();
    expect(resolveCreateErrorMessage(paymentTerm, undefined)).toBeNull();
  });
});

describe('payment-term create messages exist in every locale', () => {
  const LOCALES = { en_US: enUS, es_ES: esES, es_AR: esAR };
  const KEYS = [
    'paymentTermCreate', 'paymentTermCreateTitle', 'paymentTermDaysPlaceholder',
    'paymentTermDaysLabel', 'paymentTermDaysSuffix',
    'paymentTermDaysRequired', 'paymentTermDaysNotInteger', 'paymentTermDaysOutOfRange',
    'paymentTermNameDuplicate',
  ];
  const BACKEND_KEYS = [
    'backendError.paymentTermDaysInvalid', 'backendError.paymentTermDaysOutOfRange',
    'backendError.paymentTermDaysDuplicate', 'backendError.paymentTermDaysDuplicateInactive',
    'backendError.paymentTermNameDuplicate', 'backendError.paymentTermNameDuplicateInactive',
  ];
  const NAMED_DUPLICATES = BACKEND_KEYS.filter((k) => k.includes('Duplicate'));

  it.each(Object.entries(LOCALES))('%s defines every key the variant, its field props and the shared translator can show', (_locale, json) => {
    for (const key of [...KEYS, ...BACKEND_KEYS]) {
      expect(typeof json.genericLabels[key], key).toBe('string');
      expect(json.genericLabels[key].trim(), key).not.toBe('');
    }
    // Keys of earlier designs must not linger.
    for (const gone of ['paymentTermDaysDuplicate', 'paymentTermDaysDuplicateActive', 'paymentTermDaysDuplicateInactive']) {
      expect(json.genericLabels[gone], gone).toBeUndefined();
    }
  });

  it.each(Object.entries(LOCALES))('%s duplicate messages name the existing term ({name}) exactly once', (_locale, json) => {
    expect(NAMED_DUPLICATES).toHaveLength(4);
    for (const key of NAMED_DUPLICATES) {
      expect(json.genericLabels[key].match(/\{name\}/g), key).toHaveLength(1);
    }
    expect(json.genericLabels.paymentTermDaysOutOfRange).toMatch(/\{min\}.*\{max\}/);
  });

  it('the keys the registry references are among those checked', () => {
    const variant = resolveInlineCreateVariant('payment-term');
    const referenced = [
      variant.inputLabelKey, variant.inputSuffixKey, variant.inputRejectedKey,
      ...Object.values(variant.fallbackErrorKeysByStatus),
      variant.validate('').key, variant.validate('x').key, variant.validate('0').key,
      PAYMENT_TERM_CREATE_FIELD_PROPS.createLabelKey, PAYMENT_TERM_CREATE_FIELD_PROPS.createTitleKey,
      PAYMENT_TERM_CREATE_FIELD_PROPS.createNamePlaceholderKey,
    ];
    expect(KEYS).toEqual(expect.arrayContaining(referenced));
  });
});
