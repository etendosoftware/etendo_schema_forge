import { ListView, DetailView } from '@/components/contract-ui';
import PriceListTable from './PriceListTable';
import PriceListForm from './PriceListForm';
import PriceListLineTable from './PriceListLineTable';
import catalogs from './mockCatalogs';

const breadcrumb = 'Settings / Price List';

const summary = [
  { key: 'isSalesPrice', column: 'IsSOPriceList', type: 'boolean' },
  { key: 'isActive', column: 'IsActive', type: 'boolean' },
];

const statusField = null;

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
  ],
  derived: [
    { key: 'listPrice', column: 'PriceList', type: 'number' },
    { key: 'standardPrice', column: 'PriceStd', type: 'number' },
    { key: 'limitPrice', column: 'PriceLimit', type: 'number' },
  ],
};

export default function PriceListPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="priceList"
        detailEntity="priceListLine"
        Form={PriceListForm}
        DetailTable={PriceListLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Price List"
        detailLabel="Price List Line"
        breadcrumb={breadcrumb}
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="priceList"
      Table={PriceListTable}
      entityLabel="Price List"
      breadcrumb={breadcrumb}
      windowName={windowName}
      {...props}
    />
  );
}
