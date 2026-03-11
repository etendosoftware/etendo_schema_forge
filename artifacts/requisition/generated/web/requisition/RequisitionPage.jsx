import { ListView, DetailView } from '@/components/contract-ui';
import RequisitionTable from './RequisitionTable';
import RequisitionForm from './RequisitionForm';
import RequisitionLineTable from './RequisitionLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'totalLines', column: 'TotalLines', type: 'amount' },
  { key: 'grandTotal', column: 'GrandTotal', type: 'amount' },
  { key: 'user', column: 'AD_User_ID', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', column: 'Qty', type: 'number', required: true },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
    { key: 'needByDate', column: 'NeedByDate', type: 'date' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'search', reference: 'BusinessPartner', inputMode: 'search' },
  ],
  derived: [
    { key: 'unitPrice', column: 'PriceActual', type: 'number' },
  ],
};

export default function RequisitionPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="requisition"
        detailEntity="requisitionLine"
        Form={RequisitionForm}
        DetailTable={RequisitionLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Requisition"
        detailLabel="Requisition Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="requisition"
      Table={RequisitionTable}
      entityLabel="Requisitions"
      windowName={windowName}
      {...props}
    />
  );
}
