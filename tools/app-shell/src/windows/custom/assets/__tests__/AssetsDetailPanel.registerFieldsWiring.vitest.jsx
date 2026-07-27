/**
 * ETP-4542 follow-up — end-to-end wiring regression.
 *
 * The blur toast (AssetsDetailPanel.usableLifeValidation.vitest.jsx) proves the WARNING
 * fires. It does NOT prove the actual save is blocked, because that requires
 * usableLifeMonths/usableLifeYears to reach useEntity's formFieldsRef via
 * registerFields — a real EntityForm effect, not the EntityForm stub used by the
 * blur-toast spec.
 *
 * This spec renders the REAL EntityForm (not mocked) inside AssetsDetailPanel, wired
 * exactly like DetailView.jsx wires `formFooter` (registerFields + fieldErrors passed
 * straight through), and asserts:
 *  1. registerFields is actually invoked with a field object for usableLifeMonths/
 *     usableLifeYears when the field is visible.
 *  2. Feeding that captured field list into the real getNumericFieldViolation gate
 *     (useEntity.js) blocks the save — i.e. the wiring fix actually closes the gap
 *     between the AssetsDetailPanel form and the generic numeric save-block gate.
 *  3. The registered usableLife fields carry the min:1 / integer:true contract that
 *     drives the generic gate. ETP-4542.
 */
import { render } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Dependencies pulled in transitively by the real EntityForm — stubbed the same way
// EntityForm.render.vitest.jsx stubs them, so this stays a light DOM render.
vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('@/components/contract-ui/ImageField.jsx', () => ({ ImageField: () => null }));
vi.mock('@/components/contract-ui/PartnerAddressPicker.jsx', () => ({ PartnerAddressPicker: () => null }));
vi.mock('@/components/contract-ui/SelectorInput.jsx', () => ({ SelectorInput: () => null }));
vi.mock('@/components/contract-ui/SelectorChip.jsx', () => ({ SelectorChip: ({ label }) => <span>{label}</span> }));
vi.mock('@/components/contract-ui/CreateContactContext.js', () => ({
  CreateContactContext: { Provider: ({ children }) => children, Consumer: ({ children }) => children(null) },
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

import AssetsDetailPanel from '../AssetsDetailPanel.jsx';
import { getNumericFieldViolation } from '@/hooks/useEntity.js';

// Mimics useEntity's registerFields (see useEntity.js registerFields/formFieldsRef):
// accumulates each EntityForm's visible fields into a Map keyed by formId.
function makeFieldsRegistry() {
  const map = new Map();
  const registerFields = (fields, formId = '__default__') => {
    if (fields === null) {
      map.delete(formId);
    } else {
      map.set(formId, Array.isArray(fields) ? fields : []);
    }
  };
  const allFields = () => [...map.values()].flat();
  return { registerFields, allFields };
}

const BASE_PROPS = {
  token: 'tok',
  apiBaseUrl: 'http://host/neo/assets',
  api: { labelOverrides: {} },
  catalogs: {},
  editing: true,
  onChange: vi.fn(),
};

describe('AssetsDetailPanel -> registerFields wiring (ETP-4542 follow-up)', () => {
  it('registers usableLifeMonths with the real EntityForm and the save-block gate rejects an invalid value', () => {
    const { registerFields, allFields } = makeFieldsRegistry();
    const data = { id: 'a1', depreciate: 'Y', calculateType: 'TI', amortize: 'MO', usableLifeMonths: -4 };

    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        data={data}
        registerFields={registerFields}
        fieldErrors={{}}
      />,
    );

    const registered = allFields();
    const usableLifeField = registered.find((f) => f.key === 'usableLifeMonths');
    expect(usableLifeField).toBeTruthy();
    // The generic gate is driven purely by the field's declarative contract.
    expect(usableLifeField.min).toBe(1);
    expect(usableLifeField.integer).toBe(true);

    // This is the exact call useEntity.handleSave makes against everything currently
    // registered (allFormFields), independent of what the user "changed" this session.
    expect(getNumericFieldViolation(registered, data)).toEqual({
      key: 'usableLifeMonths', errorKey: 'fieldMinValueError', errorParams: { min: 1 },
    });
  });

  it('does NOT block the save-block gate when usableLifeMonths is a valid positive integer', () => {
    const { registerFields, allFields } = makeFieldsRegistry();
    const data = { id: 'a1', depreciate: 'Y', calculateType: 'TI', amortize: 'MO', usableLifeMonths: 12 };

    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        data={data}
        registerFields={registerFields}
        fieldErrors={{}}
      />,
    );

    const registered = allFields();
    expect(registered.find((f) => f.key === 'usableLifeMonths')).toBeTruthy();
    expect(getNumericFieldViolation(registered, data)).toBe(null);
  });

  it('registers usableLifeYears (not usableLifeMonths) when amortize is YE, and blocks on an invalid value', () => {
    const { registerFields, allFields } = makeFieldsRegistry();
    const data = { id: 'a1', depreciate: 'Y', calculateType: 'TI', amortize: 'YE', usableLifeYears: 0 };

    render(
      <AssetsDetailPanel
        {...BASE_PROPS}
        data={data}
        registerFields={registerFields}
        fieldErrors={{}}
      />,
    );

    const registered = allFields();
    expect(registered.find((f) => f.key === 'usableLifeYears')).toBeTruthy();
    // The sibling field must not be registered — it's hidden by displayLogic (amortize !== 'YE').
    expect(registered.find((f) => f.key === 'usableLifeMonths')).toBeFalsy();
    expect(getNumericFieldViolation(registered, data)).toEqual({
      key: 'usableLifeYears', errorKey: 'fieldMinValueError', errorParams: { min: 1 },
    });
  });

  it('does not register the field at all when registerFields is not provided (defensive no-op, no crash)', () => {
    const data = { id: 'a1', depreciate: 'Y', calculateType: 'TI', amortize: 'MO', usableLifeMonths: -4 };
    expect(() =>
      render(<AssetsDetailPanel {...BASE_PROPS} data={data} />),
    ).not.toThrow();
  });
});
