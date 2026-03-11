import { ListView, DetailView } from '@/components/contract-ui';
import CommissionRunTable from './CommissionRunTable';
import CommissionRunForm from './CommissionRunForm';
import CommissionAmountTable from './CommissionAmountTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'grandTotal', column: 'GrandTotal', type: 'amount' },
];

const statusField = 'docStatus';

const processes = [

];

const addLineFields = {
  entry: [

  ],
  derived: [

  ],
};

export default function CommissionRunPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="commissionRun"
        detailEntity="commissionAmount"
        Form={CommissionRunForm}
        DetailTable={CommissionAmountTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Commission Run"
        detailLabel="Commission Amount"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="commissionRun"
      Table={CommissionRunTable}
      entityLabel="Commission Run"
      windowName={windowName}
      {...props}
    />
  );
}
