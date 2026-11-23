import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { WarningIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useLocaleSwitch, useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import ActionChoiceModal from '@/components/contract-ui/ActionChoiceModal.jsx';
import { InfoBanner } from '@/components/InfoBanner';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { fetchLinesTotal } from './remittanceDueItemsApi.js';
import { fileActionErrorMessage, markRemittanceCollected } from './remittanceFileApi.js';
import RemittanceStatusChange from './RemittanceStatusChange.jsx';

/**
 * ETP-6247 — «Pasar a Cobrada» (`markCollected`, `confirmModal`, routed by
 * RemittanceProcessConfirmModal): the bank collected (or paid) the remittance. Built on
 * ActionChoiceModal with no options, like the return dialog. It shows what is settled (receipts,
 * total, the remittance's fecha de cargo/abono, which is the settlement date) and warns what it
 * does: the payments are settled at that date and the invoices become collected. It posts the
 * action itself; success toasts, refreshes the record and closes, a refusal toasts (translated)
 * and keeps the dialog open.
 */
export default function RemittanceCollectDialog({ record, apiBaseUrl, onRefresh, onClose }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const remittanceId = record?.id;
  const [totals, setTotals] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLinesTotal(apiFetch, remittanceId).then((result) => { if (!cancelled) setTotals(result); });
    return () => { cancelled = true; };
  }, [apiFetch, remittanceId]);

  const handleCollect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markRemittanceCollected(apiFetch, remittanceId);
      toast.success(ui('remittanceCollectedSuccess'));
      onRefresh?.();
      onClose?.();
    } catch (err) {
      toast.error(fileActionErrorMessage(err, ui, 'remittanceMarkCollectedError'));
      setBusy(false);
    }
  };

  const content = (
    <ActionChoiceModal
      title={ui('remittanceCollectTitle')}
      summaryColumns={[
        { key: 'count', label: ui('remittanceReturnLines'), testId: 'remittance-collect-count' },
        { key: 'total', label: ui('remittanceConfirmTotal'), testId: 'remittance-collect-total' },
        { key: 'date', label: ui('remittanceCollectDate'), testId: 'remittance-collect-date' },
      ]}
      summaryData={{
        count: totals?.count ?? '—',
        total: formatCurrency(null, totals?.total),
        date: record?.dueDate ? formatCalendarDate(record.dueDate, locale) : '—',
      }}
      options={[]}
      onCancel={() => { if (!busy) onClose?.(); }}
      onContinue={handleCollect}
      loading={busy}
      primaryLabel={ui('remittanceAdvanceToCollected')}
      loadingLabel={ui('remittanceAdvanceToCollected')}
      testId="remittance-collect-dialog"
      data-testid="ActionChoiceModal__remittance-collect">
      <div className="flex flex-col gap-5">
      <RemittanceStatusChange from="SB" to="CT" data-testid="RemittanceStatusChange__collect" />
      <InfoBanner tone="warning" icon={WarningIcon} dismissible={false} role="alert" data-testid="remittance-collect-warning">
        {ui('remittanceCollectWarning')}
      </InfoBanner>
      </div>
    </ActionChoiceModal>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
