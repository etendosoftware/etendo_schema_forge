import { MasterDetailPage } from '@/components/contract-ui';
import RequisitionTable from './RequisitionTable';
import RequisitionForm from './RequisitionForm';
import RequisitionLineTable from './RequisitionLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'user', label: 'User', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'product', label: 'Product', type: 'search', required: true, lookup: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'lineNo', label: 'Line No', type: 'number', required: true },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'needByDate', label: 'Need By Date', type: 'date' },
    { key: 'businessPartner', label: 'Business Partner', type: 'search', reference: 'BusinessPartner', inputMode: 'search' },
  ],
  derived: [
    { key: 'unitPrice', label: 'Unit Price', type: 'number' },
  ],
};

export default function RequisitionPage(props) {
  return (
    <MasterDetailPage
      entity="requisition"
      detailEntity="requisitionLine"
      Table={RequisitionTable}
      Form={RequisitionForm}
      DetailTable={RequisitionLineTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Requisition"
      detailLabel="Requisition Line"
      {...props}
    />
  );
}
