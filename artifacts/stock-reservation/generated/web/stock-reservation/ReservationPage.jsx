import { ListView, DetailView } from '@/components/contract-ui';
import ReservationTable from './ReservationTable';
import ReservationForm from './ReservationForm';
import ReservationStockTable from './ReservationStockTable';
import catalogs from './mockCatalogs';

const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'releasedQty', column: 'ReleasedQty', type: 'number' },
  { key: 'uom', column: 'C_UOM_ID', type: 'string' },
  { key: 'isActive', column: 'IsActive', type: 'boolean' },
];

const statusField = 'status';

const processes = [

];

const addLineFields = {
  entry: [
    { key: 'locator', column: 'M_Locator_ID', type: 'selector', required: true, lookup: true, reference: 'Locator', inputMode: 'selector' },
    { key: 'quantity', column: 'Quantity', type: 'number', required: true },
  ],
  derived: [

  ],
};

export default function ReservationPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="reservation"
        detailEntity="reservationStock"
        Form={ReservationForm}
        DetailTable={ReservationStockTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Reservation"
        detailLabel="Reservation Stock"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="reservation"
      Table={ReservationTable}
      entityLabel="Reservation"
      windowName={windowName}
      {...props}
    />
  );
}
