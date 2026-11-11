import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileInput } from 'lucide-react';
import { LinesEmptyState } from '@/components/contract-ui';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatCurrency } from '@/lib/formatCurrency.js';
import SelectDueItemsModal from './SelectDueItemsModal';
import { fetchLinesTotal } from './remittanceDueItemsApi.js';

/**
 * ETP-6148 — «Seleccionar desde factura» is offered on a remittance that is not processed and has
 * both its type and its account (the due items on offer depend on both). The record must also be
 * saved: the empty state saves it first (`onSave`), the with-lines trigger only renders for a
 * record that already has an id.
 */
export function canSelectDueItems(data) {
  return Boolean(data && !isProcessed(data) && data.remittanceType && data.financialAccount);
}

/** «R-0012 · Remesa marzo»: the picker's subtitle, the remittance being filled. */
export function remittanceSubtitle(data) {
  return [data?.documentNo, data?.name].filter(Boolean).join(' · ');
}

function isProcessed(data) {
  return data?.processed === true || data?.processed === 'Y';
}

const BUTTON_STYLE = {
  display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
  border: '0.5px solid hsl(var(--muted-foreground))', borderRadius: 8, padding: '6px 14px',
  fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer',
};

function SelectFromInvoicesButton({ onClick, testId }) {
  const ui = useUI();
  return (
    <button type="button" data-testid={testId} onClick={onClick} style={BUTTON_STYLE}>
      <FileInput size={13} aria-hidden="true" data-testid="FileInput__remittance" />
      {ui('remittanceSelectFromInvoices')}
    </button>
  );
}

/**
 * «Total (N líneas) 1.202,30 €» under the lines — every line of the remittance, from the lines
 * list's grid summary (falls back to the loaded lines). Re-read whenever DetailView hands over a
 * new lines array (after a selection, a delete, a process or a reactivation). The currency is
 * the lines' own (REM's `Currency` column, the financial account's currency).
 */
function RemittanceLinesTotal({ remittanceId, apiBaseUrl, lines }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchLinesTotal(apiFetch, remittanceId, lines).then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => { cancelled = true; };
  }, [apiFetch, remittanceId, lines]);
  if (!summary) return null;
  const currency = lines.find((l) => l?.currency)?.currency;
  return (
    <div
      data-testid="remittance-lines-total"
      style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 8, fontSize: 14 }}
    >
      <span style={{ color: 'hsl(var(--muted-foreground))' }} data-testid="remittance-lines-total-label">
        {ui(summary.count === 1 ? 'remittanceLinesTotalOne' : 'remittanceLinesTotal', { count: summary.count })}
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'hsl(var(--foreground))' }} data-testid="remittance-lines-total-amount">
        {formatCurrency(currency, summary.total)}
      </span>
    </div>
  );
}

/**
 * Bottom section of the remittance detail. Remittance lines are never added inline (no POST), so
 * DetailView hides its whole add-line area — and with it `detailExtraActions` / `lineMenuActions`.
 * Once the remittance has lines this panel draws the «Seleccionar desde factura» trigger itself
 * (the panel-rendered pattern, `docs/ui-customization.md`). The empty state carries the same button.
 *
 * DetailView's bottomSection contract has no refresh callback, so a selection made from here
 * reloads the page — the same fallback as the return-material-receipt panel. The window has no
 * notes or related documents, so there is no LinesBottomSection to render below it; the lines
 * total is the panel's own (RemittanceLinesTotal).
 */
export default function RemittanceBottomPanel({ data, recordId, apiBaseUrl, lines, isDocumentReadOnly, windowReadOnly }) {
  const [open, setOpen] = useState(false);
  const id = data?.id || recordId;
  const hasLines = Array.isArray(lines) && lines.length > 0;
  if (!hasLines || !id) return null;
  const showTrigger = !windowReadOnly && !isDocumentReadOnly && canSelectDueItems(data);
  return (
    <div
      data-testid="remittance-lines-footer"
      style={{
        display: 'flex', flexDirection: showTrigger ? 'row' : 'column', alignItems: 'center',
        justifyContent: 'space-between', gap: 6, padding: '10px 16px',
        // `--color-border-tertiary` is not defined in the app, so its fallback (the foreground,
        // near black) drew a heavy line; the design token for a subtle divider is --border-subtle.
        borderTop: '0.5px solid hsl(var(--border-subtle))',
      }}
    >
      {showTrigger && <SelectFromInvoicesButton
        onClick={() => setOpen(true)}
        testId="action-select-due-items"
        data-testid="SelectFromInvoicesButton__20d752" />}
      <div style={{ flex: 1 }}>
        <RemittanceLinesTotal
          remittanceId={id}
          apiBaseUrl={apiBaseUrl}
          lines={lines}
          data-testid="RemittanceLinesTotal__remittance" />
      </div>
      {open && createPortal(
        <SelectDueItemsModal
          remittanceId={id}
          apiBaseUrl={apiBaseUrl}
          subtitle={remittanceSubtitle(data)}
          onClose={() => setOpen(false)}
          onSuccess={() => { setOpen(false); window.location.reload(); }}
          data-testid="SelectDueItemsModal__panel" />,
        document.body,
      )}
    </div>
  );
}

function RemittanceLinesEmptyState({ data, recordId, apiBaseUrl, onRefresh, onSave, forceOpen, onForceOpenHandled }) {
  const ui = useUI();
  const [open, setOpen] = useState(false);

  // A NEW remittance is saved before the picker opens; the save remounts the detail on the
  // record's own route and DetailView re-opens the picker through `forceOpen`.
  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    onForceOpenHandled?.();
  }, [forceOpen, onForceOpenHandled]);

  const handleClick = async () => {
    if (onSave) {
      const ok = await onSave();
      if (!ok) return;
    }
    setOpen(true);
  };

  const id = data?.id || recordId;
  const button = canSelectDueItems(data)
    ? <SelectFromInvoicesButton
    onClick={handleClick}
    testId="action-select-due-items-empty-state"
    data-testid="SelectFromInvoicesButton__20d752" />
    : null;

  return (
    <>
      <LinesEmptyState
        data={data}
        canAddLine={false}
        description={ui('remittanceLinesEmptyDescription')}
        secondaryAction={button}
        data-testid="LinesEmptyState__remittance" />
      {open && id && (
        <SelectDueItemsModal
          remittanceId={id}
          apiBaseUrl={apiBaseUrl}
          subtitle={remittanceSubtitle(data)}
          onClose={() => setOpen(false)}
          onSuccess={() => { setOpen(false); onRefresh?.(); }}
          data-testid="SelectDueItemsModal__empty" />
      )}
    </>
  );
}

RemittanceBottomPanel.linesEmptyState = RemittanceLinesEmptyState;
RemittanceBottomPanel.showLineTotals = false;
