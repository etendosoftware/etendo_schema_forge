import { ListView, DetailView } from '@/components/contract-ui';
import PackingTable from './PackingTable';
import PackingForm from './PackingForm';
import PackingLineTable from './PackingLineTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, lookup: true },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
    { key: 'quantity', column: 'Qty', type: 'number', required: true },
    { key: 'weight', column: 'Weight', type: 'number' },
    { key: 'packageNo', column: 'PackageNo', type: 'text', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
  ],
  derived: [

  ],
};

export default function PackingPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="packing"
        detailEntity="packingLine"
        Form={PackingForm}
        DetailTable={PackingLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Packing"
        detailLabel="Packing Line"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="packing"
      Table={PackingTable}
      entityLabel="Packing"
      windowName={windowName}
      {...props}
    />
  );
}
