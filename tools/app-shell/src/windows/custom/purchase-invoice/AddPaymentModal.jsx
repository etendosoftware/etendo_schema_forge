import { useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';

const ACCOUNT_OPTIONS = [
  { value: 'TEST', labelKey: 'testAccount' },
  { value: 'MAIN', labelKey: 'mainAccount' },
  { value: 'PETTY', labelKey: 'pettyCash' },
];

/**
 * AddPaymentModal — simple "New payment" popup for a purchase invoice.
 * Does not call any real API. On save it stores locally and shows a toast.
 *
 * Props:
 *   invoice    — the invoice record (used for pre-fill and display)
 *   onClose    — called when the user cancels or after a successful save
 *   onSave     — called with { amount, date, account } on confirm
 */
export default function AddPaymentModal({ invoice, outstanding, onClose, onSave }) {
  const ui = useUI();
  const today = new Date().toISOString().slice(0, 10);
  // Prefer the real-time outstanding passed from the modal (accounts for local payments)
  const defaultAmount = outstanding != null
    ? outstanding
    : (invoice?.outstandingAmount ?? invoice?.grandTotalAmount ?? '');

  const [amount, setAmount] = useState(String(defaultAmount));
  const [date, setDate] = useState(today);
  const [account, setAccount] = useState(ACCOUNT_OPTIONS[0].value);

  function handleSave() {
    onSave?.({ amount: Number(amount), date, account });
    toast(ui('paymentRecordedLocally'));
  }

  const partnerName = invoice?.businessPartner$_identifier || invoice?.businessPartner || '';
  const docNo = invoice?.documentNo || '';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900">{ui('newPayment')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {partnerName && (
          <p className="text-sm text-gray-500 mb-5">
            {partnerName}{docNo ? ` • ${ui('invoiceDoc', { number: docNo })}` : ''}
          </p>
        )}

        <div className="space-y-4">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {ui('amount')}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="0"
              step="0.01"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {ui('date')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {ui('account')}
            </label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {ACCOUNT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{ui(opt.labelKey)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {ui('cancel')}
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            {ui('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
