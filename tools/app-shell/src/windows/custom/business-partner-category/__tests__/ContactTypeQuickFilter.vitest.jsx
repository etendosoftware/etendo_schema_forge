// @covers artifacts/business-partner-category/custom/ContactTypeQuickFilter.jsx
/**
 * Contact category list — the contact-type quick filter (`BpCategoryTable.ToolbarQuickFilter`).
 * A single-select over "all contacts" (`null`) / Customer / Vendor-Creditor, each option labelled
 * with its AD column label. Its value lives in the window wrapper's context (`contactType` /
 * `setContactType`); the wrapper turns it into ListView's baseFilter (guarded in index.vitest.jsx).
 * Renders nothing with the flag off or outside the window wrapper.
 *
 * The shared `DistinctValuesFilter` is stubbed (it has its own tests in app-shell-core): this file
 * guards what the quick filter hands it and that a pick reaches the window state.
 */
import { act, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flags: {},
  filterProps: null,
  ui: (key) => `ui:${key}`,
  label: (column) => `label:${column}`,
}));
vi.mock('@/i18n', () => ({ useUI: () => mocks.ui, useLabel: () => mocks.label }));
vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => mocks.flags[key] ?? false,
}));
vi.mock('@etendosoftware/app-shell-core/components/ui/distinct-values-filter.jsx', () => ({
  DistinctValuesFilter: (props) => {
    mocks.filterProps = props;
    return <div data-testid="contact-type-filter-stub">{String(props.value)}</div>;
  },
}));

import { CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import { ContactTypeQuickFilter } from '@generated/business-partner-category/custom/ContactTypeQuickFilter.jsx';
import { BpCategoryWindowContext } from '@generated/business-partner-category/custom/bpCategoryWindowContext.js';

/** The window wrapper's state, reduced to the quick filter's slice. */
function WindowHarness() {
  const [contactType, setContactType] = useState(null);
  const value = useMemo(() => ({ contactType, setContactType }), [contactType]);
  return (
    <BpCategoryWindowContext.Provider value={value}>
      <ContactTypeQuickFilter />
    </BpCategoryWindowContext.Provider>
  );
}

beforeEach(() => {
  mocks.flags = {};
  mocks.filterProps = null;
});

describe('ContactTypeQuickFilter', () => {
  it.each([
    ['the flag is off', false, <WindowHarness key="w" />],
    ['it is mounted outside the window wrapper', true, <ContactTypeQuickFilter key="q" />],
  ])('renders nothing when %s', (_label, flagOn, tree) => {
    mocks.flags[CONTACT_CATEGORY_TYPE] = flagOn;
    const { container } = render(tree);
    expect(container).toBeEmptyDOMElement();
    expect(mocks.filterProps).toBeNull();
  });

  it('offers all contacts / Customer / Vendor-Creditor, labelled with the AD columns, without a search box', () => {
    mocks.flags[CONTACT_CATEGORY_TYPE] = true;
    render(<WindowHarness />);
    const { codes, labelFor, allLabel, value, searchable } = mocks.filterProps;
    expect(value).toBeNull();
    expect(allLabel).toBe('ui:bpCategoryAllContacts');
    expect(codes.map(labelFor)).toEqual(['label:EM_Etgo_Iscustomer', 'label:EM_Etgo_Isvendor']);
    expect(searchable).toBe(false);
  });

  it('a pick updates the window state, and "all contacts" (null) clears it', () => {
    mocks.flags[CONTACT_CATEGORY_TYPE] = true;
    render(<WindowHarness />);
    const [, vendorCode] = mocks.filterProps.codes;

    act(() => mocks.filterProps.onChange(vendorCode));
    expect(screen.getByTestId('contact-type-filter-stub')).toHaveTextContent(vendorCode);
    expect(mocks.filterProps.value).toBe(vendorCode);

    act(() => mocks.filterProps.onChange(null));
    expect(mocks.filterProps.value).toBeNull();
  });
});
