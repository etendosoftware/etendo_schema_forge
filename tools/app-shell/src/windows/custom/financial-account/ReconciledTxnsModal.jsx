import { useNavigate, useParams } from 'react-router-dom';
import { Link2, ArrowUpRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { MoneyAmount } from '@/components/ui/money-amount';
import { cn } from '@/lib/utils';
import { formatDate, formatSigned } from '@/lib/formatSigned';
import { PostingStatusDot } from './PostingStatusDot';

// Columns of the movements table — mirrors the Movimientos tab:
//   Fecha · Pago · Contacto · Descripción · Tipo(+estado) · Importe · (ir →)
const TXN_GRID =
  'grid grid-cols-[88px_92px_minmax(96px,1fr)_minmax(140px,1.5fr)_130px_110px_44px] items-center gap-3';

function trxTypeLabel(trxType, ui) {
  if (trxType === 'BPD') return ui('financeAccountMovementsTypeBPD');
  if (trxType === 'BPW') return ui('financeAccountMovementsTypeBPW');
  if (trxType === 'BF') return ui('financeAccountMovementsTypeBF');
  return trxType || '—';
}

/** One label + value column inside the top summary widget. */
function WidgetField({ label, value, children }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-xs leading-4 text-[#3F3F50]">{label}</span>
      {children ?? (
        <span className="truncate text-base font-medium leading-6 text-[#121217]">{value}</span>
      )}
    </div>
  );
}

/**
 * Modal listing the financial-account transaction(s) a statement line was
 * reconciled with. Works for 1 or N transactions (today the backend returns at
 * most 1; the layout already supports N for the upcoming 1:N reconciliation).
 *
 * Built on the shared {@link Dialog} (no raw scrim/portal). The line's net
 * amount is compared against the sum of the transactions to show whether the
 * reconciliation balances.
 *
 * @param {{ line: object|null, currency?: string, onClose: () => void }} props
 */
export function ReconciledTxnsModal({ line, currency = 'EUR', onClose }) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const navigate = useNavigate();
  const { recordId } = useParams();

  const open = line != null;
  const txns = (line && line.txns) || [];
  const lineNet = line ? (Number(line.in) || 0) - (Number(line.out) || 0) : 0;
  const txnSum = txns.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const diff = Number((lineNet - txnSum).toFixed(2));
  const balanced = Math.abs(diff) < 0.005;

  const contact = line ? (line.bpartnerFkName || line.bpartnerName || '') : '';

  // Navigate to the financial-account Movements tab and highlight the transaction itself
  // (FIN_FinaccTransaction) — not its payment. Works for 1:N (each row points to its own txn).
  const goToMovement = (t) => {
    if (!t.transactionId || !recordId) return;
    onClose();
    // replace (not push): we stay in the same account window, only switching tab + highlighting.
    // A push would leave a duplicate clean-URL history entry (the window clears the params after),
    // forcing the user to press Back twice.
    navigate(`/financial-account/${recordId}?tab=movements&txn=${t.transactionId}`, { replace: true });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} data-testid="Dialog__2dbb84">
      <DialogContent className="w-[92vw] max-w-[1080px] overflow-hidden rounded-xl bg-white p-0 shadow-[0px_0px_0px_1px_rgba(18,18,23,0.1),0px_24px_48px_rgba(18,18,23,0.08)]" data-testid="reconciled-txns-modal">
        {/* Header */}
        <div className="px-6 pb-2 pt-5">
          <DialogTitle
            className="m-0 text-xl font-semibold leading-7 text-[#121217]"
            data-testid="DialogTitle__2dbb84">
            {ui('financeAccountStatementLinesTxnModalTitle')}
          </DialogTitle>
        </div>

        {/* Statement-line summary widget */}
        {line ? (
          <div className="px-6 pb-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-[#E8EAEF] px-3 py-2">
              <WidgetField
                label={ui('financeAccountStatementLinesTxnModalLineLabel')}
                value={line.description || contact || '—'}
                data-testid="WidgetField__2dbb84" />
              <WidgetField
                label={ui('financeAccountMovementsColDate')}
                value={formatDate(line.date, bcpLocale)}
                data-testid="WidgetField__2dbb84" />
              <WidgetField label={ui('financeAccountMovementsColContact')} data-testid="WidgetField__2dbb84">
                {contact ? (
                  <span className="inline-flex w-fit max-w-full truncate rounded-lg bg-[#F5F7F9] px-2 py-0.5 text-xs text-[#3F3F50]">
                    {contact}
                  </span>
                ) : (
                  <span className="text-base font-medium leading-6 text-[#121217]">—</span>
                )}
              </WidgetField>
              <WidgetField
                label={ui('financeAccountStatementLinesTxnRefLabel')}
                value={line.reference || '—'}
                data-testid="WidgetField__2dbb84" />
              <WidgetField label={ui('financeAccountStatementLinesTxnFootLineAmount')} data-testid="WidgetField__2dbb84">
                <MoneyAmount
                  value={lineNet}
                  currency={currency}
                  tone="neutral"
                  className="text-base font-medium tabular-nums"
                  data-testid="MoneyAmount__2dbb84" />
              </WidgetField>
              <WidgetField label={ui('financeAccountStatementLinesTxnFootSum')} data-testid="WidgetField__2dbb84">
                <MoneyAmount
                  value={txnSum}
                  currency={currency}
                  tone="neutral"
                  className="text-base font-medium tabular-nums"
                  data-testid="MoneyAmount__2dbb84" />
              </WidgetField>
              <WidgetField label={ui('financeAccountStatementLinesTxnReconciliation')} data-testid="WidgetField__2dbb84">
                {balanced ? (
                  <span className="inline-flex items-center gap-1 text-base font-medium leading-6 text-[#1E874C]">
                    <CheckCircle2 className="h-4 w-4" data-testid="CheckCircle2__2dbb84" />
                    {ui('financeAccountStatementLinesTxnBalancedShort')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm font-medium leading-6 text-[#A8670B]">
                    <AlertTriangle className="h-4 w-4 flex-none" data-testid="AlertTriangle__2dbb84" />
                    {ui('financeAccountStatementLinesTxnDiff', { amount: formatSigned(diff, currency) })}
                  </span>
                )}
              </WidgetField>
            </div>
          </div>
        ) : null}

        {/* Tab strip */}
        <div className="mt-2 flex items-center border-b border-[#E8EAEF] px-6">
          <div className="-mb-px flex items-center gap-1.5 border-b-2 border-[#121217] pb-3 pr-3 pt-2">
            <Link2 className="h-4 w-4 text-[#121217]" data-testid="Link2__2dbb84" />
            <span className="text-sm font-medium text-[#121217]">
              {ui('financeAccountStatementLinesTxnModalAssociated')}
            </span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F5F7F9] px-1.5 text-[11px] text-[#3F3F50]">
              {txns.length}
            </span>
          </div>
        </div>

        {/* Movements table (full-width separators) */}
        <div className="max-h-[56vh] overflow-y-auto overflow-x-hidden">
          {/* head */}
          <div className={cn(TXN_GRID, 'min-h-[40px] border-b border-[#E8EAEF] px-6 text-xs font-semibold leading-4 text-[#121217]')}>
            <span>{ui('financeAccountMovementsColDate')}</span>
            <span>{ui('financeAccountMovementsColDocument')}</span>
            <span>{ui('financeAccountMovementsColContact')}</span>
            <span>{ui('financeAccountMovementsColDescription')}</span>
            <span>{ui('financeAccountMovementsColType')}</span>
            <span className="justify-self-end">{ui('financeAccountMovementsColAmount')}</span>
            <span aria-hidden="true" />
          </div>
          {/* rows */}
          {txns.map((t) => (
            <div
              key={t.transactionId || t.documentNo}
              data-testid={`reconciled-txn-row-${t.documentNo}`}
              className={cn(TXN_GRID, 'min-h-[54px] border-b border-[#E8EAEF] px-6 text-sm text-[#121217] last:border-0 hover:bg-[#F8F9FB]')}
            >
              <span>{formatDate(t.date, bcpLocale)}</span>
              <span className="font-semibold">{t.documentNo || '—'}</span>
              <span className="truncate" title={t.contact || ''}>{t.contact || <span className="text-[#A8AAB8]">—</span>}</span>
              <span className="truncate" title={t.description || ''}>{t.description || <span className="text-[#A8AAB8]">—</span>}</span>
              <span className="flex flex-col gap-0.5">
                <span className="leading-[17px]">{trxTypeLabel(t.trxType, ui)}</span>
                <PostingStatusDot paymentStatus={t.paymentStatus} data-testid="PostingStatusDot__2dbb84" />
              </span>
              <MoneyAmount
                value={t.amount}
                currency={currency}
                tone="auto"
                className="justify-self-end whitespace-nowrap text-sm font-semibold tabular-nums"
                data-testid="MoneyAmount__2dbb84" />
              <span className="flex justify-center">
                {t.transactionId ? (
                  <button
                    type="button"
                    title={ui('financeAccountStatementLinesTxnGoToMovement')}
                    aria-label={ui('financeAccountStatementLinesTxnGoToMovement')}
                    data-testid={`reconciled-txn-go-${t.documentNo}`}
                    onClick={() => goToMovement(t)}
                    className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md border border-[#E8EAEF] bg-white text-[#6C6C89] hover:border-[#D1D4DB] hover:bg-[#F5F7F9] hover:text-[#121217]"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" data-testid="ArrowUpRight__2dbb84" />
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#E8EAEF] px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            data-testid="reconciled-txns-cancel"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#D1D4DB] bg-white px-4 text-sm font-medium text-[#121217] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-[#F5F7F9]"
          >
            {ui('financeAccountStatementLinesTxnCancel')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
