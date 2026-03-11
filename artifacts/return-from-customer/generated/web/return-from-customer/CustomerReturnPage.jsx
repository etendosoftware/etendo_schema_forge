import { ListView, DetailView } from '@/components/contract-ui';
import CustomerReturnTable from './CustomerReturnTable';
import CustomerReturnForm from './CustomerReturnForm';
import CustomerReturnLineTable from './CustomerReturnLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'totalAmount', column: 'Amt', type: 'amount' },
  { key: 'isApproved', column: 'IsApproved', type: 'boolean' },
];

const statusField = 'docStatus';

const processes = [
  { name: 'DocAction_Process', label: 'Doc Action_ Process', style: 'positive' },
];

const addLineFields = {
  entry: [
    { key: 'originalShipmentLine', column: 'M_InOutLine_ID', type: 'selector', required: true, lookup: true, reference: 'ShipmentLine', inputMode: 'selector' },
    { key: 'quantity', column: 'Qty', type: 'number', required: true },
    { key: 'lineNo', column: 'Line', type: 'number', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
  ],
  derived: [

  ],
};

export default function CustomerReturnPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="customerReturn"
        detailEntity="customerReturnLine"
        Form={CustomerReturnForm}
        DetailTable={CustomerReturnLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Customer Return"
        detailLabel="Customer Return Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="customerReturn"
      Table={CustomerReturnTable}
      entityLabel="Customer Returns"
      windowName={windowName}
      {...props}
    />
  );
}
