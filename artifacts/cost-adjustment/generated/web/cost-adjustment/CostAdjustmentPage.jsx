import { ListView, DetailView } from '@/components/contract-ui';
import CostAdjustmentTable from './CostAdjustmentTable';
import CostAdjustmentForm from './CostAdjustmentForm';
import CostAdjustmentLineTable from './CostAdjustmentLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'docStatus';

const processes = [
  { name: 'completeCostAdjustment', label: 'Complete Cost Adjustment', style: 'positive' },
  { name: 'voidCostAdjustment', label: 'Void Cost Adjustment', style: 'destructive' },
];

const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'inventoryTransaction', column: 'M_Transaction_ID', type: 'search', reference: 'MaterialTransaction', inputMode: 'search' },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
    { key: 'isActive', column: 'IsActive', type: 'checkbox', required: true },
  ],
  derived: [
    { key: 'adjustmentAmount', column: 'AdjustmentAmount', type: 'number' },
  ],
};

export default function CostAdjustmentPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="costAdjustment"
        detailEntity="costAdjustmentLine"
        Form={CostAdjustmentForm}
        DetailTable={CostAdjustmentLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Cost Adjustment"
        detailLabel="Cost Adjustment Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="costAdjustment"
      Table={CostAdjustmentTable}
      entityLabel="Cost Adjustments"
      windowName={windowName}
      {...props}
    />
  );
}
