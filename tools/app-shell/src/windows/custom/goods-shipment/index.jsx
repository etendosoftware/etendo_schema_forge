import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useRowDelete } from '@/hooks/useRowDelete';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';
import GoodsShipmentPage from '@generated/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage';
import GoodsShipmentTable from '@generated/goods-shipment/generated/web/goods-shipment/GoodsShipmentTable';
import BulkInvoiceFromShipment from '@generated/goods-shipment/custom/BulkInvoiceFromShipment';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import GoodsShipmentPreview from './GoodsShipmentPreview';

const LABEL_OVERRIDES = {
  es_ES: { InvoiceStatus: 'Estado de facturación' },
  en_US: { InvoiceStatus: 'Invoice Status' },
};

const COLUMNS = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', dot: false },
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
  { key: 'posted', column: 'Posted', type: 'boolean', badge: true, badgeLabels: { true: { en_US: 'Posted', es_ES: 'Contabilizado' }, false: { en_US: 'Not posted', es_ES: 'Sin contabilizar' } }, badgeVariants: { true: 'green', false: 'orange' } },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'string' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent' },
];

function CustomGoodsShipmentTable(props) {
  return <GoodsShipmentTable columns={COLUMNS} {...props} data-testid="GoodsShipmentTable__9851c7" />;
}

function GoodsShipmentBulkActions(props) {
  return (
    <>
      <BulkInvoiceFromShipment {...props} data-testid="BulkInvoiceFromShipment__9851c7" />
      <BulkDocumentAction
        {...props}
        entity="goodsShipment"
        buildActions={buildInOutActions}
        labelKey="confirmBulk"
        data-testid="BulkDocumentAction__9851c7" />
    </>
  );
}

export default function GoodsShipmentWindow({ windowName, recordId, apiBaseUrl, token, ...rest }) {
  useBulkActionToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docStatus = searchParams.get('DocStatus');
  const initialColumnFilters = docStatus
    ? { documentStatus: { mode: 'enumLabel', value: [docStatus] } }
    : undefined;

  const [cloneTargets, setCloneTargets] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'goodsShipment',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const { headers, createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'sale' });

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    documentPreview: true,
    statusField: 'documentStatus',
    hideDeleteWhenComplete: true,
    actions: {
      edit: { show: true },
      duplicate: { show: true },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onClone: (row) => setCloneTargets([row]),
    onDelete: requestDelete,
  }), [navigate, windowName, requestDelete]);

  if (recordId) {
    return (
      <CreateContactContext.Provider value={createContactCtxValue}>
        <GoodsShipmentPage
          windowName={windowName}
          recordId={recordId}
          apiBaseUrl={apiBaseUrl}
          token={token}
          Table={CustomGoodsShipmentTable}
          processes={[]}
          draftMode={{ enabled: true, label: 'Confirm', style: 'positive', onConfirm: () => window.dispatchEvent(new CustomEvent('goods-shipment:open-confirm-modal')) }}
          hideMoreMenu={({ data }) => data?.documentStatus !== 'CO'}
          autoSaveOnBlur={true}
          {...rest}
          data-testid="GoodsShipmentPage__9851c7" />
        {contactPortal}
      </CreateContactContext.Provider>
    );
  }

  return (
    <>
      <GoodsShipmentPage
        windowName={windowName}
        apiBaseUrl={apiBaseUrl}
        token={token}
        Table={CustomGoodsShipmentTable}
        initialColumnFilters={initialColumnFilters}
        rowQuickActions={rowQuickActions}
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        refreshTrigger={refreshKey}
        labelOverrides={LABEL_OVERRIDES}
        bulkActions={GoodsShipmentBulkActions}
        renderPreview={({ row, onClose, onEdit }) => (
          <GoodsShipmentPreview
            shipment={row}
            token={token}
            apiBaseUrl={apiBaseUrl}
            windowName={windowName}
            onClose={onClose}
            onEdit={onEdit}
            data-testid="GoodsShipmentPreview__9851c7" />
        )}
        {...rest}
        data-testid="GoodsShipmentPage__9851c7" />
      {deleteDialog}
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          headerEntity="goodsShipment"
          routePrefix="/goods-shipment/"
          onClose={() => setCloneTargets(null)}
          onCloned={() => setRefreshKey(k => k + 1)}
          data-testid="CloneOrderModal__9851c7" />,
        document.body,
      )}
    </>
  );
}
