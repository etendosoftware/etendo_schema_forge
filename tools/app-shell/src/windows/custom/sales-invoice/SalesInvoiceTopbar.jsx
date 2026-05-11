import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import CloneOrderModal from '@/components/contract-ui/CloneOrderModal';
import InvoiceTopbarExtra from '@generated/sales-invoice/custom/InvoiceTopbarExtra';
import CloneButton from '../shared/CloneButton.jsx';
import { useUI } from '@/i18n';

/* eslint-disable react/prop-types */

export default function SalesInvoiceTopbar({ data, recordId, token, apiBaseUrl, api, onProcess }) {
  const navigate = useNavigate();
  const ui = useUI();
  const [showClone, setShowClone] = useState(false);

  useEffect(() => {
    const handleInvoiceUpdated = (event) => {
      if (String(event.detail?.invoiceId) !== String(recordId)) return;
      window.location.reload();
    };

    window.addEventListener('sales-invoice:invoice-updated', handleInvoiceUpdated);
    return () => window.removeEventListener('sales-invoice:invoice-updated', handleInvoiceUpdated);
  }, [recordId]);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  if (!data || !recordId) return null;

  return (
    <>
      <CloneButton onClick={() => setShowClone(true)} title={ui('cloneOrderBtn')} />
      <InvoiceTopbarExtra
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        api={api}
        onProcess={onProcess}
      />
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
        />,
        document.body,
      )}
    </>
  );
}
