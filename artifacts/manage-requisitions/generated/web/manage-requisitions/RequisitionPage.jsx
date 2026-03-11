import { ListView, DetailView } from '@/components/contract-ui';
import RequisitionTable from './RequisitionTable';
import RequisitionForm from './RequisitionForm';
import RequisitionLineTable from './RequisitionLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'dateRequired', column: 'DateRequired', type: 'date' },
  { key: 'dateDoc', column: 'DateDoc', type: 'date' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string' },
  { key: 'priceList', column: 'M_PriceList_ID', type: 'string' },
  { key: 'totalLines', column: 'TotalLines', type: 'amount' },
  { key: 'grandTotal', column: 'GrandTotal', type: 'amount' },
  { key: 'user', column: 'AD_User_ID', type: 'string' },
  { key: 'organization', column: 'AD_Org_ID', type: 'string' },
  { key: 'description', column: 'Description', type: 'string' },
  { key: 'cCurrencyId', column: 'C_Currency_ID', type: 'string' },
  { key: 'isActive', column: 'IsActive', type: 'boolean' },
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
