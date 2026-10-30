// @covers artifacts/business-partner-category/custom/BpCategoryTable.jsx
/**
 * Contact Category list — the columns follow the `contact-category-type` flag.
 *
 * The REAL generated `BusinessPartnerCategoryTable` is mounted (so its column list is the one the
 * pipeline emits today) and only the shared `DataTable` is stubbed, capturing the columns and the
 * hidden keys it receives. The visible list is what DataTable draws: the generated columns minus
 * the hidden ones.
 *
 *  - OFF (pre-category-type list): Search Key, Name.
 *  - ON: Name, Customer, Vendor/Creditor, Default.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ flags: {}, tableProps: null }));

vi.mock('@/lib/flags', async (importOriginal) => ({
  ...(await importOriginal()),
  useFeatureFlag: (key) => mocks.flags[key] ?? false,
}));
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => {
    mocks.tableProps = props;
    return null;
  },
  InlineLinesPanel: () => null,
}));

import { CONTACT_CATEGORY_TYPE } from '@/lib/flags';
import BpCategoryTable from '@generated/business-partner-category/custom/BpCategoryTable.jsx';

function renderTable(flagOn, props = {}) {
  mocks.flags[CONTACT_CATEGORY_TYPE] = flagOn;
  render(<BpCategoryTable data={[]} {...props} />);
  const { columns, hiddenColumns } = mocks.tableProps;
  return {
    hiddenColumns,
    visible: columns.map((c) => c.key).filter((key) => !hiddenColumns.includes(key)),
  };
}

beforeEach(() => {
  mocks.flags = {};
  mocks.tableProps = null;
});

describe('BpCategoryTable', () => {
  it.each([
    ['OFF', false, ['searchKey', 'name']],
    ['ON', true, ['name', 'etgoIscustomer', 'etgoIsvendor', 'default']],
  ])('flag %s shows the list columns of that state', (_state, flagOn, expected) => {
    expect(renderTable(flagOn).visible).toEqual(expected);
  });

  it.each([
    ['OFF', false],
    ['ON', true],
  ])('flag %s keeps the hidden columns the list itself asks for', (_state, flagOn) => {
    const { hiddenColumns, visible } = renderTable(flagOn, { hiddenColumns: ['name'] });
    expect(hiddenColumns).toContain('name');
    expect(visible).not.toContain('name');
  });
});
