import { MasterDetailPage } from '@/components/contract-ui';
import ReturnMaterialTable from './ReturnMaterialTable';
import ReturnMaterialForm from './ReturnMaterialForm';
import ReturnMaterialLineTable from './ReturnMaterialLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', label: 'Document No', type: 'string' },
  { key: 'totalAmount', label: 'Total Amount', type: 'amount' },
  { key: 'isApproved', label: 'Is Approved', type: 'boolean' },
];

const statusField = 'docStatus';

const processes = [
  { name: 'DocAction_Process', label: 'Doc Action_ Process', style: 'positive' },
];

const addLineFields = {
  entry: [
    { key: 'originalReceiptLine', label: 'Original Receipt Line', type: 'selector', required: true, lookup: true, reference: 'MaterialReceiptLine', inputMode: 'selector' },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'lineNo', label: 'Line No', type: 'number', required: true },
    { key: 'description', label: 'Description', type: 'text' },
  ],
  derived: [

  ],
};

export default function ReturnMaterialPage(props) {
  return (
    <MasterDetailPage
      entity="returnMaterial"
      detailEntity="returnMaterialLine"
      Table={ReturnMaterialTable}
      Form={ReturnMaterialForm}
      DetailTable={ReturnMaterialLineTable}
      summary={summary}
      statusField={statusField}
      processes={processes}
      addLineFields={addLineFields}
      catalogs={catalogs}
      entityLabel="Return Material"
      detailLabel="Return Material Line"
      {...props}
    />
  );
}
