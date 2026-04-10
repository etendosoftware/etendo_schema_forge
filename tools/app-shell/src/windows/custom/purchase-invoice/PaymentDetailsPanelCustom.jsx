import { useState, useEffect } from 'react';
import { formatAmount } from '@/lib/formatAmount.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUI } from '@/i18n';

const PAYMENT_STATUS = {
  E:      'Executed',
  P:      'Pending',
  PE:     'Partially Executed',
  PPM:    'Payment Made',
  PWNC:   'Withdrawn not Cleared',
  RDNC:   'Deposited not Cleared',
  RPAE:   'Awaiting Execution',
  RPAP:   'Awaiting Payment',
  RPPC:   'Payment Cleared',
  RPR:    'Payment Received',
  RPVOID: 'Void',
};

/**
 * PaymentDetailsPanelCustom — two-step fetch for payment details.
 *
 * The default secondary-tab hook queries paymentDetails?parentId={invoiceId},
 * which returns nothing because FIN_Payment_ScheduleDetail's parent FK is
 * FIN_Payment_Schedule, not C_Invoice.
 *
 * Step 1: fetch paymentPlan schedules for the invoice.
 * Step 2: fetch paymentDetails for each schedule.
 *
 * The backend PaymentDetailsHandler enriches each row with FIN_Payment fields
 * (documentNo, paymentDate, paymentMethod, account, status) via OBDal traversal.
 */
export default function PaymentDetailsPanelCustom({ parentId, token, apiBaseUrl }) {
  const ui = useUI();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!parentId || !token) return;
    setLoading(true);

    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${apiBaseUrl}/paymentPlan?parentId=${parentId}`, { headers })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data) => {
        const schedules = data?.response?.data ?? data?.data ?? [];
        if (schedules.length === 0) return [];
        return Promise.all(
          schedules.map((s) =>
            fetch(`${apiBaseUrl}/paymentDetails?parentId=${s.id}`, { headers })
              .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
              .then((d) => d?.response?.data ?? d?.data ?? [])
              .catch(() => [])
          )
        ).then((results) => results.flat());
      })
      .then((details) => setRows(details))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [parentId, apiBaseUrl, token]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{ui('loading')}</p>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{ui('noPaymentDetailsFound')}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b border-border/40">
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide">{ui('documentNo')}</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide">{ui('paymentDate')}</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide">{ui('paymentMethod')}</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide">{ui('financialAccount')}</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide text-right">{ui('receivedAmount')}</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide">{ui('status')}</TableHead>
          <TableHead className="text-xs font-medium text-muted-foreground/70 tracking-wide">{ui('payment')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={row.id ?? i} className="cursor-default">
            <TableCell className="font-medium text-foreground">{row.documentNo || '—'}</TableCell>
            <TableCell className="text-muted-foreground">{row.paymentDate || '—'}</TableCell>
            <TableCell className="text-muted-foreground">{row['paymentMethod$_identifier'] || '—'}</TableCell>
            <TableCell className="text-muted-foreground">{row['account$_identifier'] || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(row.amount)}</TableCell>
            <TableCell className="text-muted-foreground">
              {PAYMENT_STATUS[row.status] ?? row.status ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">{row['finPaymentID$_identifier'] || '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
