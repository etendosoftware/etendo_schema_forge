// @covers tools/app-shell/src/windows/custom/business-partner-category/index.jsx
/**
 * Contact Category window wrapper — the `contact-category-type` toggle point of the window.
 *
 * Flag OFF: the header form hides the type group (`etgoIscustomer`, which carries the group) and
 * registers it as a gate exclusion, keeps the generated field list, and the generated Accounting
 * tab and list are left alone (no override props, no list filter).
 * Flag ON: the Accounting tab is replaced by `BpCategoryAccountingPanel` (generated table and form
 * switched off) and the type lives there, so the header still excludes it — except for a role
 * without the accounting capability (the tab is hidden for it), whose header keeps the type group.
 * The header fields are reordered (Descripción after "Asignación predeterminada"), the form hosts
 * the "saved with associated contacts" notice (principal instance only), and the list's
 * contact-type quick filter value becomes ListView's `baseFilter`.
 *
 * The generated App, the generated header form, the panel and the two custom renderers are
 * stubbed: this file guards what the wrapper hands them, not their own rendering. The window
 * context and `contactTypeBaseFilter` are the real ones.
 */
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // The generated header form's field list, in the generated (pre-Figma) order.
  const GENERATED_FIELDS = [
    { key: 'searchKey', column: 'Value' },
    { key: 'name', column: 'Name' },
    { key: 'description', column: 'Description', span: 2 },
    { key: 'default', column: 'IsDefault' },
    { key: 'etgoIscustomer', column: 'EM_Etgo_Iscustomer' },
  ];
  return {
    GENERATED_FIELDS,
    flags: {},
    capabilities: {},
    appProps: null,
    windowState: null,
    formProps: null,
    notifyOnHeaderSave: vi.fn(),
    AccountingPanel: () => null,
    DefaultAssignmentField: () => null,
    ContactTypeField: () => null,
  };
});

vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => mocks.flags[key] ?? false,
}));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({ useCapabilitiesSafe: () => mocks.capabilities }));
vi.mock('@generated/business-partner-category/generated/web/business-partner-category/index.jsx', async () => {
  const { useBpCategoryWindow } = await import('@generated/business-partner-category/custom/bpCategoryWindowContext.js');
  return {
    default: function GeneratedApp(props) {
      mocks.appProps = props;
      mocks.windowState = useBpCategoryWindow();
      return null;
    },
  };
});
vi.mock('@generated/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryForm', () => {
  const Form = (props) => {
    mocks.formProps = props;
    return null;
  };
  Form.fields = mocks.GENERATED_FIELDS;
  return { default: Form };
});
vi.mock('@generated/business-partner-category/custom/BpCategoryAccountingPanel', () => ({
  default: mocks.AccountingPanel,
}));
vi.mock('@generated/business-partner-category/custom/DefaultAssignmentField', () => ({
  default: mocks.DefaultAssignmentField,
}));
vi.mock('@generated/business-partner-category/custom/ContactTypeField', () => ({
  default: mocks.ContactTypeField,
}));
vi.mock('@generated/business-partner-category/custom/useAssociatedContactsNotice.js', () => ({
  useNotifyOnHeaderSave: mocks.notifyOnHeaderSave,
}));

import { CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import { ACCOUNTING_CAPABILITY } from '@/lib/capabilityVisibility.js';
import BusinessPartnerCategoryWindow from '../index.jsx';

function renderWindow(flagOn, props = {}) {
  mocks.flags[CONTACT_CATEGORY_TYPE] = flagOn;
  render(<BusinessPartnerCategoryWindow windowName="business-partner-category" {...props} />);
  return mocks.appProps;
}

function renderHeaderForm(appProps, props = {}) {
  const registerGateExclusions = vi.fn();
  const { Form } = appProps;
  render(<Form record={{}} registerGateExclusions={registerGateExclusions} {...props} />);
  return { formProps: mocks.formProps, registerGateExclusions };
}

const decodeBaseFilter = (filter) => JSON.parse(decodeURIComponent(filter.replace(/^criteria=/, '')));

beforeEach(() => {
  mocks.flags = {};
  mocks.capabilities = {};
  mocks.appProps = null;
  mocks.windowState = null;
  mocks.formProps = null;
  mocks.notifyOnHeaderSave.mockReset();
});

describe('Contact Category window wrapper', () => {
  it('flag OFF keeps the generated Accounting tab: no table, form or panel override is passed', () => {
    const appProps = renderWindow(false);
    expect(appProps.windowName).toBe('business-partner-category');
    for (const prop of ['DetailTable', 'DetailForm', 'CustomLines', 'customLinesLabel']) {
      expect(appProps).not.toHaveProperty(prop);
    }
  });

  it('flag ON replaces the Accounting tab with BpCategoryAccountingPanel and switches off the generated table', () => {
    const appProps = renderWindow(true);
    expect(appProps.CustomLines).toBe(mocks.AccountingPanel);
    expect(appProps.DetailTable).toBeNull();
    expect(appProps.DetailForm).toBeNull();
    expect(appProps.customLinesLabel).toBe('Accounting');
  });

  // The type is drawn by the Accounting tab, so the header excludes it — unless the role cannot
  // see that tab (no accounting capability), in which case the header keeps the type group.
  it.each([
    // Without the capability is the OFF case that matters: the header fallback is flag-on only.
    ['OFF, without the accounting capability', false, false, ['etgoIscustomer']],
    ['ON, with the accounting capability', true, true, ['etgoIscustomer']],
    ['ON, without it (type group stays in the header)', true, false, []],
  ])('flag %s: header form excludeFields and registered gate exclusions', (_state, flagOn, canSeeAccounting, expected) => {
    mocks.capabilities = canSeeAccounting ? { [ACCOUNTING_CAPABILITY]: true } : {};
    const { formProps, registerGateExclusions } = renderHeaderForm(renderWindow(flagOn));
    expect(formProps.excludeFields).toEqual(expected);
    expect(formProps).not.toHaveProperty('registerGateExclusions');
    expect(registerGateExclusions).toHaveBeenCalledWith(expected);
  });

  it('flag ON reorders the header (Descripción after the default assignment) and swaps in the custom renderers', () => {
    const { formProps } = renderHeaderForm(renderWindow(true));
    expect(formProps.fields.map((f) => f.key)).toEqual(['searchKey', 'name', 'default', 'description', 'etgoIscustomer']);
    const byKey = Object.fromEntries(formProps.fields.map((f) => [f.key, f]));
    expect(byKey.default).toMatchObject({ column: 'IsDefault', customRenderer: mocks.DefaultAssignmentField });
    expect(byKey.etgoIscustomer).toMatchObject({ column: 'EM_Etgo_Iscustomer', customRenderer: mocks.ContactTypeField, span: 4 });
    expect(byKey.description).not.toHaveProperty('customRenderer');
  });

  it('flag OFF leaves the generated field list to the form', () => {
    const { formProps } = renderHeaderForm(renderWindow(false));
    expect(formProps).not.toHaveProperty('fields');
  });

  // DetailView mounts the header form twice (principal + always-mounted collapsed section): only
  // the principal instance hosts the notice, so one save never toasts twice. Flag OFF: no notice.
  it.each([
    ['ON, principal section', true, 'principal', true],
    ['ON, collapsed section', true, 'collapsed', false],
    ['OFF, principal section', false, 'principal', false],
  ])('flag %s: the saved-with-contacts notice watches the header record only when it should', (_state, flagOn, section, watches) => {
    const data = { id: 'G-1', updated: 't1' };
    renderHeaderForm(renderWindow(flagOn), { section, data });
    expect(mocks.notifyOnHeaderSave).toHaveBeenLastCalledWith(watches ? data : null);
  });

  describe('list contact-type quick filter -> baseFilter', () => {
    it('flag ON: "all contacts" passes no baseFilter; picking a type passes its server-side criteria', () => {
      renderWindow(true);
      expect(mocks.appProps).not.toHaveProperty('baseFilter');

      act(() => mocks.windowState.setContactType('vendor'));
      expect(decodeBaseFilter(mocks.appProps.baseFilter)).toEqual([
        { fieldName: 'etgoIsvendor', operator: 'equals', value: 'Y' },
      ]);

      act(() => mocks.windowState.setContactType(null));
      expect(mocks.appProps).not.toHaveProperty('baseFilter');
    });

    it.each([
      ['flag OFF', false, {}],
      ['a record view (recordId set)', true, { recordId: 'G-1' }],
    ])('%s: a picked type passes no baseFilter', (_label, flagOn, props) => {
      renderWindow(flagOn, props);
      act(() => mocks.windowState.setContactType('customer'));
      expect(mocks.appProps).not.toHaveProperty('baseFilter');
    });
  });

  it('the wrapped header form keeps the generated form statics the page reads', () => {
    const { Form } = renderWindow(false);
    expect(Form.fields).toBe(mocks.GENERATED_FIELDS);
  });
});
