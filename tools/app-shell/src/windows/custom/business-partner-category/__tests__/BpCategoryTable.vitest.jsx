// @covers artifacts/business-partner-category/custom/BpCategoryTable.jsx
/**
 * Contact Category list — the columns follow the `contact-category-type` flag.
 *
 * Only the shared `DataTable` is stubbed, capturing the columns, filters and hidden keys it
 * receives. The visible list is what DataTable draws: the received columns minus the hidden ones.
 *
 *  - OFF (pre-category-type list): the REAL generated `BusinessPartnerCategoryTable` is mounted
 *    (so its column list is the one the pipeline emits today): Search Key, Name.
 *  - ON: the wrapper renders DataTable with its own Figma columns: Name, Customer,
 *    Vendor/Creditor, Default — each on its real AD column, so all of them filter and sort.
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

  // "List columns must be real columns": a column without its AD `column` silently drops out of the
  // advanced filter. Identificador is hidden but stays declared so that filter still offers it.
  it('flag ON declares every column on its AD column and keeps Identificador declared but hidden', () => {
    const { hiddenColumns } = renderTable(true);
    const { columns, filters } = mocks.tableProps;
    expect(columns.filter((c) => !c.column).map((c) => c.key)).toEqual([]);
    expect(columns.find((c) => c.key === 'searchKey')).toMatchObject({ column: 'Value' });
    expect(hiddenColumns).toContain('searchKey');
    expect(filters).toEqual(['searchKey', 'name']);
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
