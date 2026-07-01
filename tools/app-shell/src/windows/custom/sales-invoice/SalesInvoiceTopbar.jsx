import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import InvoiceTopbarExtra from '@generated/sales-invoice/custom/InvoiceTopbarExtra';
import CloneButton from '../shared/CloneButton.jsx';
import { useUI } from '@etendosoftware/app-shell-core';
import { useInvoiceUpdatedListener } from '../shared/useInvoiceUpdatedListener.js';

/* eslint-disable react/prop-types */

export default function SalesInvoiceTopbar({ data, recordId, token, apiBaseUrl, api, onProcess, onRefresh }) {
  const navigate = useNavigate();
  const ui = useUI();
  const [showClone, setShowClone] = useState(false);

  useInvoiceUpdatedListener('sales-invoice', recordId, onRefresh);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  if (!data || !recordId) return null;

  return (
    <>
      <CloneButton
        onClick={() => setShowClone(true)}
        title={ui('cloneOrderBtn')}
        data-testid="CloneButton__5c4da7" />
      <InvoiceTopbarExtra
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        api={api}
        onProcess={onProcess}
        data-testid="InvoiceTopbarExtra__5c4da7" />
      {showClone && createPortal(
        <CloneOrderModal
          recordId={recordId}
          data={data}
          apiBaseUrl={apiBaseUrl}
          headers={headers}
          cloneActionName="cloneRecord"
          titleKey="cloneInvoiceConfirmTitle"
          bodyKey="cloneInvoiceConfirmBody"
          actionLabelKey="cloneInvoiceAction"
          errorKey="cloneInvoiceError"
          processingKey="invoiceProcessing"
          onClose={() => setShowClone(false)}
          onCloned={(newId) => {
            setShowClone(false);
            navigate(`/sales-invoice/${newId}`);
          }}
          data-testid="CloneOrderModal__5c4da7" />,
        document.body,
      )}
    </>
  );
}
