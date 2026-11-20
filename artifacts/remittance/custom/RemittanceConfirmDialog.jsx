import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { WarningIcon, FileTextIcon, UsersIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useLocaleSwitch, useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { getApiBase } from '@/hooks/useNeoResource.js';
import { StatusTag } from '@/components/ui/status-tag';
import ActionChoiceModal from '@/components/contract-ui/ActionChoiceModal.jsx';
import { InfoBanner } from '@/components/InfoBanner';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { fetchLinesTotal } from './remittanceDueItemsApi.js';
import {
  GROUPING_NONE,
  confirmRemittance,
  downloadRemittanceFile,
  fetchFileReadiness,
  fileActionErrorMessage,
  problemsFromError,
} from './remittanceFileApi.js';
import { AccountLogoAvatar } from '@/components/financial-accounts/AccountLogoAvatar';
import { fetchAccountLogo, fetchSepaFileData } from './sepaFileDataApi.js';
import { ReadinessProblemsBlock } from './RemittanceFileCard.jsx';

/** The grouping param declared on processOverrides.confirm (its options and default), if any. */
export function groupingParam(process) {
  return (process?.params ?? []).find((p) => p?.key === 'grouping') ?? null;
}

/**
 * What the dialog summarizes: the readiness `summary` when the backend sends it (distinct invoices),
 * otherwise the lines grid summary (a count of LINES, labelled as receipts) and the header's due date.
 */
export function confirmSummary(readiness, linesTotal, record) {
  const summary = readiness?.summary;
  if (summary && (summary.invoiceCount != null || summary.totalAmount != null)) {
    return {
      countKey: summary.invoiceCount != null ? 'remittanceConfirmInvoices' : 'remittanceConfirmReceipts',
      count: summary.invoiceCount ?? summary.lineCount,
      total: summary.totalAmount,
      currency: summary.currency,
      dueDate: summary.dueDate ?? record?.dueDate ?? null,
    };
  }
  return {
    countKey: 'remittanceConfirmReceipts',
    count: linesTotal?.count ?? null,
    total: linesTotal?.total ?? null,
    currency: null,
    dueDate: record?.dueDate ?? null,
  };
}

// What each grouping option means, shown under its card (ActionChoiceModal needs a description), and the
// label key a card falls back to when its option carries none (the single «Sin agrupar» card without a param).
const GROUPING_CARD = {
  [GROUPING_NONE]: { labelKey: 'remittanceGroupingNone', descriptionKey: 'remittanceGroupingNoneDescription', icon: FileTextIcon },
  GGPD: { descriptionKey: 'remittanceGroupingByBpAndDueDateDescription', icon: UsersIcon },
};

/** The choice cards: the grouping param's options, or the single «Sin agrupar» card without a param. */
function groupingOptions(param, ui) {
  const options = param?.options?.length ? param.options : [{ value: GROUPING_NONE }];
  return options.map((option) => {
    const card = GROUPING_CARD[option.value] ?? {};
    return {
      id: option.value,
      label: ui(option.label ?? card.labelKey),
      description: card.descriptionKey ? ui(card.descriptionKey) : '',
      icon: card.icon,
      testId: `remittance-confirm-grouping-${option.value}`,
    };
  });
}

// Confirming leaves the remittance Pendiente de envío (PR); it no longer settles anything.
const CONFIRMED_STATUS = { PR: { key: 'remittanceStatusPr', tone: 'warning' }, SB: { key: 'remittanceStatusSb', tone: 'info' } };

/** «ES91 •••• •••• 1234»: the country and check digits and the last four characters of an IBAN. */
export function maskIban(iban) {
  const value = String(iban ?? '').replace(/\s+/g, '').toUpperCase();
  return value.length > 8 ? `${value.slice(0, 4)} •••• •••• ${value.slice(-4)}` : value;
}

// Same row rhythm as the sibling picker's rows (DocumentPickerModal: min-h-14, px-3 py-2), with the
// border-subtle separators between rows; label left and muted, value right.
function ConfirmedRow({ label, children, testId }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-3 py-2 text-sm" data-testid={testId}>
      <span className="shrink-0 text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

/**
 * ETP-6247 — the success step of «Confirmar remesa» («¡Remesa confirmada!»), in the same modal:
 * a summary card (remittance, status chip, invoices, total, type, fecha de cargo/abono, account
 * with a masked IBAN) and «Descargar fichero» (the card's own download path), «Cerrar». Nothing is
 * downloaded by itself. Every way of leaving (Cerrar, ×, Esc, the backdrop) goes through
 * `onFinish`, which refreshes the page behind the modal and closes it.
 */
function ConfirmedStep({ record, summary, result, apiBaseUrl, onFinish }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const rootApiFetch = useApiFetch(useMemo(() => getApiBase(), []));
  const [account, setAccount] = useState(null);
  const [logo, setLogo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    if (!record?.financialAccount) return undefined;
    let cancelled = false;
    fetchSepaFileData(apiFetch, record.id, record.financialAccount, record.organization ?? null)
      .then((data) => { if (!cancelled) setAccount(data); })
      .catch(() => {});
    fetchAccountLogo(rootApiFetch, record.financialAccount).then((found) => { if (!cancelled) setLogo(found); });
    return () => { cancelled = true; };
  }, [apiFetch, rootApiFetch, record?.id, record?.financialAccount, record?.organization]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadRemittanceFile(rootApiFetch, { attachmentId: result.attachmentId, fileName: result.fileName });
    } catch (err) {
      setDownloadError(fileActionErrorMessage(err, ui, 'remittanceFileDownloadError'));
    } finally {
      setDownloading(false);
    }
  };

  const type = record?.['remittanceType$_identifier'];
  const accountLabel = account
    ? [account.accountName, account.iban ? maskIban(account.iban) : null].filter(Boolean).join(' · ')
    : (record?.['financialAccount$_identifier'] ?? '');
  const statusChip = CONFIRMED_STATUS[result.status];
  const content = (
    <ActionChoiceModal
      title={ui('remittanceConfirmedTitle')}
      options={[]}
      onCancel={onFinish}
      onContinue={handleDownload}
      loading={downloading}
      error={downloadError}
      primaryLabel={ui('remittanceFileDownload')}
      loadingLabel={ui('remittanceFileDownload')}
      cancelLabel={ui('close')}
      primaryDisabled={!result.attachmentId}
      testId="remittance-confirmed-dialog"
      data-testid="ActionChoiceModal__remittance-confirmed">
      <div className="flex flex-col gap-5" data-testid="remittance-confirmed-body">
        <InfoBanner tone="info" dismissible={false} data-testid="remittance-confirmed-subtitle">
          {ui('remittanceConfirmedSubtitle')}
        </InfoBanner>
        <div className="divide-y divide-[hsl(var(--border-subtle))] overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))]" data-testid="remittance-confirmed-summary">
          <ConfirmedRow label={ui('remittanceConfirmedRemittance')} testId="remittance-confirmed-name">
            {[record?.documentNo, record?.name].filter(Boolean).join(' · ') || '—'}
          </ConfirmedRow>
          <ConfirmedRow label={ui('remittanceConfirmedStatus')} testId="remittance-confirmed-status">
            {statusChip && <StatusTag status={result.status} label={ui(statusChip.key)} tone={statusChip.tone} data-testid="StatusTag__confirmed" />}
          </ConfirmedRow>
          <ConfirmedRow label={ui(summary.countKey)} testId="remittance-confirmed-count">{summary.count ?? '—'}</ConfirmedRow>
          <ConfirmedRow label={ui('remittanceConfirmTotal')} testId="remittance-confirmed-total">
            <span className="tabular-nums">{formatCurrency(summary.currency, summary.total)}</span>
          </ConfirmedRow>
          {type && <ConfirmedRow label={ui('remittanceConfirmedType')} testId="remittance-confirmed-type">{type}</ConfirmedRow>}
          <ConfirmedRow label={ui('remittanceConfirmDueDate')} testId="remittance-confirmed-due-date">
            {summary.dueDate ? formatCalendarDate(summary.dueDate, locale) : '—'}
          </ConfirmedRow>
          {accountLabel && (
            <ConfirmedRow label={ui('remittanceConfirmedAccount')} testId="remittance-confirmed-account">
              <AccountLogoAvatar account={{ type: 'B', ...logo }} data-testid="AccountLogoAvatar__confirmed" />
              <span className="min-w-0 truncate">{accountLabel}</span>
            </ConfirmedRow>
          )}
        </div>
      </div>
    </ActionChoiceModal>
  );
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

/**
 * ETP-6247 — «Confirmar» of a remittance (processOverrides.confirm, `confirmModal`), built on
 * ActionChoiceModal (the Figma «PopUps» confirm: summary strip, choice cards, footer), like the
 * follow-up document modal. The grouping is the selected card (`onContinue(optionId)`). It re-checks
 * `fileReadiness` and lists any problem (Confirmar stays disabled), summarizes what is being sent
 * (invoices, total, fecha de cargo/abono), asks the grouping and warns that confirming cannot be
 * undone: the payments are created AND settled and the remittance ends Cobrada or Pagada. Confirming
 * posts the atomic `confirm` action itself (not DetailView's `handleProcess`, which would drop its
 * response), toasts that the SEPA file is generated (it is NOT downloaded: the user takes it from
 * «Fichero SEPA» when they want) and refreshes the record. A refusal keeps
 * the dialog open; a readiness refusal lists its problems.
 */
export default function RemittanceConfirmDialog({ process, record, apiBaseUrl, onRefresh, onClose }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(apiBaseUrl);
  const remittanceId = record?.id;
  const param = groupingParam(process);
  const [readiness, setReadiness] = useState(null);
  const [linesTotal, setLinesTotal] = useState(null);
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [problems, setProblems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const check = useCallback(async () => {
    setChecking(true);
    setCheckFailed(false);
    try {
      const [ready, totals] = await Promise.all([
        fetchFileReadiness(apiFetch, remittanceId),
        fetchLinesTotal(apiFetch, remittanceId),
      ]);
      setReadiness(ready);
      setLinesTotal(totals);
      setProblems(ready.problems);
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  }, [apiFetch, remittanceId]);

  useEffect(() => { check(); }, [check]);

  const summary = confirmSummary(readiness, linesTotal, record);
  const canConfirm = !checking && !busy && !checkFailed && readiness?.ready === true && problems.length === 0;

  const handleConfirm = async (grouping) => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const confirmed = await confirmRemittance(apiFetch, remittanceId, grouping ?? GROUPING_NONE);
      if (confirmed.attachmentId) {
        // The success step lives in this dialog's own state: the page behind is refreshed only when
        // the user leaves it (finish), so nothing unmounts the modal under them.
        setResult(confirmed);
        setBusy(false);
        return;
      }
      toast.success(ui('remittanceConfirmSuccessNoFile'));
      onRefresh?.();
      onClose?.();
    } catch (err) {
      const refused = problemsFromError(err);
      if (refused.length > 0) setProblems(refused);
      toast.error(fileActionErrorMessage(err, ui, 'remittanceConfirmError'));
      setBusy(false);
    }
  };

  const dueDate = summary.dueDate ? formatCalendarDate(summary.dueDate, locale) : '—';
  const options = useMemo(() => groupingOptions(param, ui), [param, ui]);
  const defaultOptionId = options.some((o) => o.id === param?.defaultValue) ? param.defaultValue : options[0].id;
  const summaryColumns = [
    { key: 'count', label: ui(summary.countKey), testId: 'remittance-confirm-count' },
    { key: 'total', label: ui('remittanceConfirmTotal'), testId: 'remittance-confirm-total' },
    { key: 'dueDate', label: ui('remittanceConfirmDueDate'), testId: 'remittance-confirm-due-date' },
  ];
  const summaryData = {
    count: summary.count ?? '—',
    total: formatCurrency(summary.currency, summary.total),
    dueDate,
  };

  const finish = () => { onRefresh?.(); onClose?.(); };
  if (result) {
    return <ConfirmedStep record={record} summary={summary} result={result} apiBaseUrl={apiBaseUrl} onFinish={finish} data-testid="ConfirmedStep__remittance" />;
  }

  const content = (
    <ActionChoiceModal
      title={ui('remittanceConfirmTitle')}
      summaryColumns={summaryColumns}
      summaryData={summaryData}
      question={ui(param?.label ?? 'remittanceGrouping')}
      options={options}
      defaultOptionId={defaultOptionId}
      onCancel={() => { if (!busy) onClose?.(); }}
      onContinue={handleConfirm}
      loading={busy}
      primaryLabel={ui('confirm')}
      loadingLabel={ui('confirm')}
      primaryDisabled={!canConfirm}
      testId="remittance-confirm-dialog"
      data-testid="ActionChoiceModal__remittance-confirm">
      <div className="flex flex-col gap-3" data-testid="remittance-confirm-body">
        <InfoBanner
          tone="info"
          dismissible={false}
          data-testid="remittance-confirm-info">
          {ui('remittanceConfirmInfo')}
        </InfoBanner>
        {checking && <p className="m-0 text-xs text-[hsl(var(--muted-foreground))]" data-testid="remittance-confirm-checking">{ui('remittanceFileReadinessChecking')}</p>}
        {!checking && checkFailed && (
          <p className="m-0 text-sm text-[hsl(var(--muted-foreground))]" data-testid="remittance-confirm-check-failed">{ui('remittanceFileReadinessLoadError')}</p>
        )}
        {!checking && !checkFailed && problems.length > 0 && (
          <div className="flex items-start gap-3 rounded-[0_8px_8px_0] border-l-2 border-status-warning-border bg-status-warning px-4 py-2" data-testid="remittance-confirm-problems-banner">
            <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-status-warning-foreground" aria-hidden="true" data-testid="AlertTriangle__confirm" />
            <div className="min-w-0 flex-1">
              <ReadinessProblemsBlock problems={problems} onNavigate={onClose} hideIcon testId="remittance-confirm-problems" data-testid="ReadinessProblemsBlock__confirm" />
            </div>
          </div>
        )}
      </div>
    </ActionChoiceModal>
  );
  // Portal: the click comes from the detail topbar, whose ancestors must not become the containing
  // block of the modal's `position: fixed` overlay.
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
