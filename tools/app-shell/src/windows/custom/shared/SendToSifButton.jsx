import { useState, useMemo } from 'react';
import { useUI } from '@/i18n';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getPendingSifTargets, getSifBodyKey } from './sifSending.js';
import { resolveInvoiceOrgId } from './resolveInvoiceOrgId.js';
import SifSendingModal from './SifSendingModal.jsx';

export default function SendToSifButton({ data, recordId, apiBaseUrl, status }) {
  const ui = useUI();
  const [modalOpen, setModalOpen] = useState(false);
  const [sentSuccessfully, setSentSuccessfully] = useState(false);
  const specName = apiBaseUrl?.split('/').filter(Boolean).pop() || 'sales-invoice';
  const updateEventName = `${specName}:invoice-updated`;

  // ETP-5087: fiscal config must be keyed by the INVOICE's own org (data.adOrgId),
  // not the top-nav org selector — the selector can point at a different org than
  // the invoice being viewed, silently fetching the wrong TBAI/SII config (and
  // territory) or none at all. See resolveInvoiceOrgId.js.
  const { selectedOrg } = useAuth();
  const orgId = resolveInvoiceOrgId(data, selectedOrg?.id);
  const base = useMemo(() => (apiBaseUrl || '').replace(/\/[^/]+$/, ''), [apiBaseUrl]);

  const { profile, tbaiRecord } = useFiscalConfig(orgId, apiBaseUrl);
  const territory = tbaiRecord?.etsgSifTerritory ?? null;
  const pendingTargets = getPendingSifTargets(specName, profile, data, territory);
  const hasPendingTargets = pendingTargets.sendSii || pendingTargets.sendTbai;

  if (status !== 'CO' || !hasPendingTargets) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium hover:opacity-80 cursor-pointer h-9"
        style={{ padding: '0 12px', borderRadius: '8px', border: '1px solid hsl(var(--border-subtle))', color: 'hsl(var(--foreground))', background: 'hsl(var(--card))' }}
      >
        {ui('sendToSif')}
      </button>
      {modalOpen && (
        <SifSendingModal
          pendingTargets={pendingTargets}
          bodyKey={getSifBodyKey(specName, pendingTargets)}
          base={base}
          specName={specName}
          recordId={recordId}
          onClose={() => {
            setModalOpen(false);
            if (sentSuccessfully) {
              window.dispatchEvent(new CustomEvent(updateEventName, { detail: { invoiceId: recordId } }));
              setSentSuccessfully(false);
            }
          }}
          onAfterSend={(next) => {
            if (Object.values(next).some((r) => r?.ok)) setSentSuccessfully(true);
          }}
          data-testid="SifSendingModal__1d018f" />
      )}
    </>
  );
}
