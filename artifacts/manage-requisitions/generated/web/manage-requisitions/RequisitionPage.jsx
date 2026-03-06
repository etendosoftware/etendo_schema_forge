import { MasterDetailPage } from '@/components/contract-ui';
import RequisitionTable from './RequisitionTable';
import RequisitionForm from './RequisitionForm';
import RequisitionLineTable from './RequisitionLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'dateRequired', label: 'Date Required', type: 'date' },
  { key: 'dateDoc', label: 'Date Doc', type: 'date' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'priceList', label: 'Price List', type: 'string' },
  { key: 'totalLines', label: 'Total Lines', type: 'amount' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'user', label: 'User', type: 'string' },
  { key: 'organization', label: 'Organization', type: 'string' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'cCurrencyId', label: 'C Currency Id', type: 'string' },
  { key: 'isActive', label: 'Is Active', type: 'boolean' },
];

const statusField = 'docStatus';

const processes = [
  { name: 'DocAction', label: 'Doc Action', style: 'positive' },
  { name: 'CreatePOFromRequisition', label: 'Create P O From Requisition', style: 'positive' },
];

const addLineFields = {
  entry: [

  ],
  derived: [

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
