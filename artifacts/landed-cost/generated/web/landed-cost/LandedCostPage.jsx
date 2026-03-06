import { MasterDetailPage } from '@/components/contract-ui';
import LandedCostTable from './LandedCostTable';
import LandedCostForm from './LandedCostForm';
import LandedCostCostTable from './LandedCostCostTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'goodsReceipt', label: 'Goods Receipt', type: 'search', lookup: true, reference: 'GoodsReceipt', inputMode: 'search' },
    { key: 'goodsReceiptLine', label: 'Goods Receipt Line', type: 'dependent', reference: 'GoodsReceiptLine', inputMode: 'dependent', dependsOn: { field: 'goodsReceipt', filterKey: 'goodsReceiptId' } },
    { key: 'invoiceLine', label: 'Invoice Line', type: 'search', reference: 'InvoiceLine', inputMode: 'search' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'lineNo', label: 'Line No', type: 'number', required: true },
    { key: 'isActive', label: 'Is Active', type: 'checkbox', required: true },
  ],
  derived: [
    { key: 'landedCostType', label: 'Landed Cost Type', type: 'selector', reference: 'LandedCostType', inputMode: 'selector' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'landedCostDistribution', label: 'Landed Cost Distribution', type: 'text' },
  ],
};

export default function LandedCostPage(props) {
  return (
    <MasterDetailPage
      entity="landedCost"
      detailEntity="landedCostCost"
      Table={LandedCostTable}
      Form={LandedCostForm}
      DetailTable={LandedCostCostTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Landed Cost"
      detailLabel="Landed Cost Cost"
      {...props}
    />
  );
}
