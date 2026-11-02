// @covers tools/app-shell/src/windows/custom/business-partner-category/index.jsx
/**
 * Contact Category window wrapper — the `contact-category-type` toggle point of the window.
 *
 * Flag OFF: the header form hides the type group (`etgoIscustomer`, which carries the group) and
 * registers it as a gate exclusion, and the generated Accounting tab is left alone (no override
 * props). Flag ON: the type group shows, nothing is excluded, and the Accounting tab is replaced
 * by `BpCategoryAccountingPanel` (generated table and form switched off).
 *
 * The generated App, the generated header form and the panel are stubbed: this file guards what
 * the wrapper hands them, not their own rendering.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flags: {},
  appProps: null,
  formProps: null,
  AccountingPanel: () => null,
}));

vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => mocks.flags[key] ?? false,
}));
vi.mock('@generated/business-partner-category/generated/web/business-partner-category/index.jsx', () => ({
  default: (props) => {
    mocks.appProps = props;
    return null;
  },
}));
vi.mock('@generated/business-partner-category/generated/web/business-partner-category/BusinessPartnerCategoryForm', () => {
  const Form = (props) => {
    mocks.formProps = props;
    return null;
  };
  Form.fields = ['generated-fields'];
  return { default: Form };
});
vi.mock('@generated/business-partner-category/custom/BpCategoryAccountingPanel', () => ({
  default: mocks.AccountingPanel,
}));

import { CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import BusinessPartnerCategoryWindow from '../index.jsx';

function renderWindow(flagOn) {
  mocks.flags[CONTACT_CATEGORY_TYPE] = flagOn;
  render(<BusinessPartnerCategoryWindow windowName="business-partner-category" />);
  return mocks.appProps;
}

function renderHeaderForm(appProps) {
  const registerGateExclusions = vi.fn();
  const { Form } = appProps;
  render(<Form record={{}} registerGateExclusions={registerGateExclusions} />);
  return { formProps: mocks.formProps, registerGateExclusions };
}

beforeEach(() => {
  mocks.flags = {};
  mocks.appProps = null;
  mocks.formProps = null;
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

  it.each([
    ['OFF', false, ['etgoIscustomer'], ['etgoIscustomer']],
    ['ON', true, undefined, []],
  ])('flag %s: header form excludeFields and registered gate exclusions', (_state, flagOn, excludeFields, gateExclusions) => {
    const { formProps, registerGateExclusions } = renderHeaderForm(renderWindow(flagOn));
    expect(formProps.excludeFields).toEqual(excludeFields);
    expect(formProps).not.toHaveProperty('registerGateExclusions');
    expect(registerGateExclusions).toHaveBeenCalledWith(gateExclusions);
  });

  it('the wrapped header form keeps the generated form statics the page reads', () => {
    const { Form } = renderWindow(false);
    expect(Form.fields).toEqual(['generated-fields']);
  });
});
