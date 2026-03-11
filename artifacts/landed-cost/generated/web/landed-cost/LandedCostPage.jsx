import { ListView, DetailView } from '@/components/contract-ui';
import LandedCostTable from './LandedCostTable';
import LandedCostForm from './LandedCostForm';
import LandedCostCostTable from './LandedCostCostTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'goodsReceipt', column: 'M_InOut_ID', type: 'search', lookup: true, reference: 'GoodsReceipt', inputMode: 'search' },
    { key: 'goodsReceiptLine', column: 'M_InOutLine_ID', type: 'dependent', reference: 'GoodsReceiptLine', inputMode: 'dependent', dependsOn: { field: 'goodsReceipt', filterKey: 'goodsReceiptId' } },
    { key: 'invoiceLine', column: 'C_InvoiceLine_ID', type: 'search', reference: 'InvoiceLine', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea' },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'isActive', column: 'IsActive', type: 'checkbox', required: true },
  ],
  derived: [
    { key: 'landedCostType', column: 'M_LandedCostType_ID', type: 'selector', reference: 'LandedCostType', inputMode: 'selector' },
    { key: 'amount', column: 'Amt', type: 'number' },
    { key: 'landedCostDistribution', column: 'LandedCostDistribution', type: 'text' },
  ],
};

export default function LandedCostPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="landedCost"
        detailEntity="landedCostCost"
        Form={LandedCostForm}
        DetailTable={LandedCostCostTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Landed Cost"
        detailLabel="Landed Cost Cost"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="landedCost"
      Table={LandedCostTable}
      entityLabel="Landed Cost"
      windowName={windowName}
      {...props}
    />
  );
}
