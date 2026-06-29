import { useState, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import GoodsReceiptTable from '@generated/goods-receipt/generated/web/goods-receipt/GoodsReceiptTable';
import GeneratedApp from '@generated/goods-receipt/generated/web/goods-receipt/index.jsx';
import GoodsReceiptBottomPanel from '@generated/goods-receipt/custom/GoodsReceiptBottomPanel';
import GoodsReceiptPreview from './GoodsReceiptPreview.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';
import { AttachmentsTab } from '@/components/attachments';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import SendDocumentModal from '@/components/contract-ui/SendDocumentModal';
import { usePreviewAttachment } from '@/windows/custom/shared/usePreviewAttachment.js';
import { useBulkActionToast } from '@/hooks/useBulkActionToast';
import { useRowDelete } from '@/hooks/useRowDelete';
import { useMenuLabel, useUI } from '@/i18n';

const HEADER_COLUMNS = [
  { key: 'movementDate', column: 'MovementDate', type: 'date', dot: false },
  { key: 'orderReference', column: 'POReference', type: 'string' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status' },
  { key: 'warehouse', column: 'M_Warehouse_ID', type: 'selector' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent' },
];

const LABEL_OVERRIDES = {
  es_ES: {
    MovementDate: 'Fecha del movimiento',
    POReference: 'Nº documento',
    C_BPartner_ID: 'Contacto',
    DocStatus: 'Estado doc.',
    M_Warehouse_ID: 'Almacén',
    InvoiceStatus: 'Estado de facturación',
  },
  en_US: {
    MovementDate: 'Movement Date',
    POReference: 'Document No.',
    C_BPartner_ID: 'Contact',
    DocStatus: 'Document Status',
    M_Warehouse_ID: 'Warehouse',
    InvoiceStatus: 'Invoice Status',
  },
};

function CustomHeaderTable(props) {
  return (
    <GoodsReceiptTable
      columns={HEADER_COLUMNS}
      {...props}
      data-testid="GoodsReceiptTable__bf4f23" />
  );
}

function GoodsReceiptBulkAction(props) {
  return (
    <BulkDocumentAction
      {...props}
      entity="goodsReceipt"
      buildActions={buildInOutActions}
      labelKey="confirmBulk"
      data-testid="BulkDocumentAction__bf4f23" />
  );
}

export default function GoodsReceiptWindow(props) {
  useBulkActionToast();
  const ui = useUI();
  const tMenu = useMenuLabel();
  const navigate = useNavigate();
  const { token, apiBaseUrl, windowName } = props;
  const [searchParams] = useSearchParams();
  const docStatus = searchParams.get('DocStatus') || undefined;
  const [cloneTargets, setCloneTargets] = useState(null);
  const [emailRow, setEmailRow] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const emailPreviewAttachment = usePreviewAttachment({
    documentId: emailRow?.id ?? null,
    specName: 'goods-receipt',
    storeCondition: !!emailRow,
    token,
    apiBaseUrl,
  });

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const { requestDelete, deleteDialog } = useRowDelete({
    apiBaseUrl,
    entity: 'goodsReceipt',
    token,
    onSuccess: () => setRefreshKey(k => k + 1),
  });

  const customTabs = useMemo(() => ([
    { key: 'related', label: ui('relatedDocuments'), Component: RelatedDocuments },
    { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: 'M_InOut', config: {} } },
  ]), [ui]);

  const menuActionsForForm = useCallback(({ status, data }) => {
    if (status !== 'CO') return [];
    const isPosted = data?.posted === 'Y' || data?.posted === true;
    return [
      {
        key: 'downloadPdf',
        label: ui('downloadPdf'),
        onClick: () => window.dispatchEvent(new CustomEvent('goods-receipt:download-pdf')),
      },
      ...(!isPosted ? [{ key: 'post', labelKey: 'post', neoAction: 'post', successKey: 'documentPosted' }] : []),
      ...(isPosted ? [{ key: 'unpost', labelKey: 'unpost', neoAction: 'unpost', successKey: 'documentUnposted', destructive: true }] : []),
    ];
  }, [ui]);

  const rowQuickActions = useMemo(() => ({
    enabled: true,
    editMode: 'navigate',
    statusField: 'documentStatus',
    hideDeleteWhenComplete: true,
    actions: {
      edit: { show: true },
      duplicate: { show: true },
      email: { show: true, visibleWhen: "@documentStatus@='CO'" },
      delete: { show: true },
    },
    onEdit: (row) => navigate(`/${windowName}/${row.id}`),
    onClone: (row) => setCloneTargets([row]),
    onEmail: (row) => setEmailRow(row),
    onDelete: requestDelete,
  }), [navigate, windowName, requestDelete]);

  return (
    <>
      <GeneratedApp
        {...props}
        autoSaveOnBlur={true}
        Table={CustomHeaderTable}
        labelOverrides={LABEL_OVERRIDES}
        initialColumnFilters={docStatus ? { documentStatus: { mode: 'enumLabel', value: [docStatus] } } : undefined}
        secondaryTabs={[]}
        draftMode={{
          enabled: true,
          processField: 'documentAction',
          processValue: 'CO',
          label: ui('confirm'),
          onConfirm: () => window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal')),
        }}
        notesField="description"
        bottomSection={GoodsReceiptBottomPanel}
        customTabs={customTabs}
        menuActions={menuActionsForForm}
        hideMoreMenu={({ data }) => data?.documentStatus !== 'CO'}
        rowQuickActions={rowQuickActions}
        onCloneRow={(rowOrRows) => setCloneTargets(Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows])}
        refreshTrigger={refreshKey}
        bulkActions={GoodsReceiptBulkAction}
        renderPreview={({ row, onClose, onEdit }) => (
          <GoodsReceiptPreview
            receipt={row}
            token={token}
            apiBaseUrl={apiBaseUrl}
            windowName={windowName}
            onClose={onClose}
            onEdit={onEdit}
            data-testid="GoodsReceiptPreview__bf4f23" />
        )}
        data-testid="GeneratedApp__bf4f23" />
      {deleteDialog}
      {emailRow && createPortal(
        <SendDocumentModal
          documentType={tMenu('Goods Receipt')}
          documentNo={emailRow.documentNo}
          bpName={emailRow['businessPartner$_identifier']}
          bPartnerId={emailRow.businessPartner}
          apiBaseUrl={apiBaseUrl}
          documentId={emailRow.id}
          windowName="goods-receipt"
          token={token}
          pdfBlobUrl={emailPreviewAttachment.storedFile?.objectUrl}
          pdfBlobLoading={emailPreviewAttachment.isBusy}
          onClose={() => setEmailRow(null)}
          data-testid="SendDocumentModal__bf4f23" />,
        document.body,
      )}
      {cloneTargets && createPortal(
        <CloneOrderModal
          records={cloneTargets}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          headerEntity="goodsReceipt"
          routePrefix={`/${windowName}/`}
          errorKey="cloneReceiptError"
          onClose={() => setCloneTargets(null)}
          onCloned={() => { setCloneTargets(null); setRefreshKey(k => k + 1); }}
          data-testid="CloneOrderModal__bf4f23" />,
        document.body,
      )}
    </>
  );
}
