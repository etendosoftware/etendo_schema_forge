import { parseCalendarDate } from './dateOnly.js';

export function getLatestInstallmentDueDate(installments = []) {
  const timestamps = installments
    .map((installment) => parseCalendarDate(installment?.dueDate)?.getTime() ?? NaN)
    .filter((timestamp) => !Number.isNaN(timestamp));

  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}

const SOON_DAYS_THRESHOLD = 7;

// Etendo Figma tokens — see Due Date — Final spec.
const DOT_COLOR = {
  paid: 'var(--status-success-fg)',
  overdue: 'hsl(var(--destructive))',
  soon: 'var(--status-warning-fg)',
  ok: 'var(--status-neutral-fg)',
};

const TEXT_COLOR = {};

/**
 * Resolve the due-date state for an invoice row.
 * Priority: paid wins over any date-based state — once outstanding is 0
 * the invoice is no longer at risk regardless of the calendar.
 */
export function getDueDateState(rawDueDate, outstanding, reference = new Date()) {
  const out = Number(outstanding);
  if (Number.isFinite(out) && out <= 0) return 'paid';

  const due = parseCalendarDate(rawDueDate);
  if (!due) return 'ok';

  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay.getTime() < today.getTime()) return 'overdue';

  const soonLimit = new Date(today);
  soonLimit.setDate(today.getDate() + SOON_DAYS_THRESHOLD);
  if (dueDay.getTime() <= soonLimit.getTime()) return 'soon';

  return 'ok';
}

export function getDueDateDotStyle(state) {
  return { backgroundColor: DOT_COLOR[state] ?? DOT_COLOR.ok };
}

export function getDueDateTextStyle(state) {
  const color = TEXT_COLOR[state];
  return color ? { color } : undefined;
}
