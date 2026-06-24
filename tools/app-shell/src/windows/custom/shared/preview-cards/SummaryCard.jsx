import { Badge } from '@/components/ui/badge.jsx';
import { useLocaleSwitch, useUI } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly';
import { formatAmount } from '@/lib/formatAmount.js';
import { getStatusBadgeProps } from '@/lib/statusBadge.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function CardShell({ children }) {
  return (
    <div className="mx-4 mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {children}
    </div>
  );
}

function CardHeader({ title, amount, badge }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <span className="font-bold text-gray-900 text-sm">{title}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-base tabular-nums text-gray-900">{amount}</span>
        {badge && (
          <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export function InfoRow({ label, value, underline, children }) {
  return (
    <div className="flex justify-between items-center py-1.5 text-sm">
      <span className="text-gray-400">{label}</span>
      {children ?? (
        <span className={`text-gray-900 font-medium text-right max-w-[55%] truncate${underline ? ' underline decoration-gray-400' : ''}`}>
          {value ?? '—'}
        </span>
      )}
    </div>
  );
}

export function PercentBar({ value }) {
  const pct = isNaN(Number(value)) ? 0 : Math.min(Number(value), 100);
  let trackColor;
  if (pct >= 100) trackColor = 'bg-emerald-500';
  else if (pct > 0) trackColor = 'bg-amber-400';
  else trackColor = 'bg-slate-200';
  let textColor;
  if (pct >= 100) textColor = 'text-emerald-700';
  else if (pct > 0) textColor = 'text-amber-700';
  else textColor = 'text-slate-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${trackColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${textColor}`}>{pct}%</span>
    </div>
  );
}

// ── MovementSummaryCard ───────────────────────────────────────────────────────

/**
 * Shared card for movement-type documents (shipment, receipt, return).
 * Renders a titled CardShell with a fixed set of rows + a status badge row,
 * followed by optional extra rows (children).
 */
export function MovementSummaryCard({ title, rows, statusRowLabel, statusLabel, statusBadgeClass, children }) {
  return (
    <CardShell data-testid="CardShell__a696d7">
      <div className="px-4 py-3 border-b border-gray-100">
        <span className="font-bold text-gray-900 text-sm">{title}</span>
      </div>
      <div className="px-4 py-2">
        {rows.map(({ label, value }) => (
          <InfoRow key={label} label={label} value={value} data-testid="InfoRow__a696d7" />
        ))}
        <InfoRow label={statusRowLabel} data-testid="InfoRow__a696d7">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass}`}>
            {statusLabel}
          </span>
        </InfoRow>
        {children}
      </div>
    </CardShell>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

/**
 * SummaryCard — top card shown in all preview right panels.
 *
 * Props:
 *   currencyCode    string   — e.g. "EUR"
 *   grandTotal      number
 *   contact         string   — business partner name
 *   date            string   — ISO date string or formatted string
 *   statusCode      string   — raw doc status code (e.g. "CO", "DR")
 *   statusLabel     string   — human-readable label (e.g. "Completado")
 *   validUntil      string?  — ISO date, shown only when truthy (quotations)
 *   dueDate         string?  — ISO date, shown between Date and Status when provided (invoices)
 *   invoicePercent  number?  — 0-100, shows "X%" row when provided (orders)
 *   deliveryPercent number?  — 0-100, shows "X%" row when provided (orders)
 *   orgCurrencyCode string?  — e.g. "EUR". Shown below grand total when different from currencyCode.
 *   exchangeRate    number?  — e.g. 1.09. Shown as rate note next to orgGrandTotal.
 *   orgGrandTotal   number?  — pre-computed equivalent in org currency. Shown below grand total.
 *   children        node?    — extra InfoRow(s) appended after standard rows
 */
export default function SummaryCard({
  currencyCode = '',
  grandTotal,
  contact,
  date,
  statusCode,
  statusLabel,
  validUntil,
  dueDate,
  invoicePercent,
  deliveryPercent,
  orgCurrencyCode,
  exchangeRate,
  orgGrandTotal,
  ratePrecision = 4,
  children,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();

  const formattedDate = date ? formatCalendarDate(date, locale) : '—';
  const formattedValidUntil = validUntil ? formatCalendarDate(validUntil, locale) : null;
  const formattedDueDate = dueDate ? formatCalendarDate(dueDate, locale) : null;

  // Dual-currency display (Holded-style):
  //   primary  = org-currency amount + doc-currency badge   e.g. "261.81 €  [USD]"
  //   secondary = (rate) doc-currency amount                e.g. "(1.1647) $304.92"
  // When currencies are the same: primary = doc-currency amount, no secondary.
  const showOrgTotal = orgCurrencyCode && orgCurrencyCode !== currencyCode && orgGrandTotal != null;
  const primaryAmount = showOrgTotal
    ? formatAmount(orgGrandTotal, orgCurrencyCode)
    : formatAmount(grandTotal ?? 0, currencyCode || undefined);
  const docAmountStr = showOrgTotal
    ? formatAmount(grandTotal ?? 0, currencyCode || undefined)
    : null;
  const rateNote = showOrgTotal && exchangeRate
    ? `(${exchangeRate.toLocaleString(undefined, { minimumFractionDigits: ratePrecision, maximumFractionDigits: ratePrecision })})`
    : null;

  return (
    <CardShell data-testid="CardShell__a696d7">
      <CardHeader title={ui('previewCardTotal')} amount={primaryAmount} badge={showOrgTotal ? currencyCode : null} data-testid="CardHeader__a696d7" />
      {showOrgTotal && (
        <div className="flex items-center justify-end gap-1.5 px-4 pb-1 tabular-nums">
          {rateNote && <span className="text-xs text-gray-500 font-bold">{rateNote}</span>}
          {docAmountStr && <span className="text-sm text-gray-900 font-bold">{docAmountStr}</span>}
        </div>
      )}
      <div className="px-4 py-2">
        <InfoRow
          label={ui('previewCardContact')}
          value={contact}
          data-testid="InfoRow__a696d7" />
        <InfoRow
          label={ui('previewCardDate')}
          value={formattedDate}
          data-testid="InfoRow__a696d7" />
        {formattedValidUntil && (
          <InfoRow
            label={ui('previewCardValidUntil')}
            value={formattedValidUntil}
            data-testid="InfoRow__a696d7" />
        )}
        {formattedDueDate && (
          <InfoRow
            label={ui('previewCardDueDate')}
            value={formattedDueDate}
            underline
            data-testid="InfoRow__a696d7" />
        )}
        <InfoRow label={ui('previewCardStatus')} data-testid="InfoRow__a696d7">
          <Badge {...getStatusBadgeProps(statusCode)} data-testid="Badge__a696d7">{statusLabel ?? statusCode}</Badge>
        </InfoRow>
        {invoicePercent != null && (
          <InfoRow label={ui('previewCardInvoicePercent')} data-testid="InfoRow__a696d7">
            <PercentBar value={invoicePercent} data-testid="PercentBar__a696d7" />
          </InfoRow>
        )}
        {deliveryPercent != null && (
          <InfoRow label={ui('previewCardDeliveryPercent')} data-testid="InfoRow__a696d7">
            <PercentBar value={deliveryPercent} data-testid="PercentBar__a696d7" />
          </InfoRow>
        )}
        {children}
      </div>
    </CardShell>
  );
}
