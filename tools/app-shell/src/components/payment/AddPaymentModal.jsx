// Standalone "Agregar pago" modal. Thin chrome wrapper around the generic
// PaymentForm (the single source of truth for the payment workspace). Used to
// register a payment against an already-existing transaction/invoice from any
// window — unlike the embedded use inside the New Movement wizard, here the
// "Ingresar en / Pagar desde" account field IS shown (and required when there
// is no account in context).
//
// Prepared shell: it captures the PaymentForm snapshot and hands it to
// `onSubmit`, enabling the primary button only when the payment balances
// (`totals.cuadra`). Real persistence (RegisterPaymentHandler) and the triggers
// from other windows are wired in a later phase.
import { useState } from 'react';
import { X, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PaymentForm } from './PaymentForm';

const BTN_PRIMARY =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-[#121217] px-[18px] text-sm font-semibold text-white hover:bg-[#282833] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-[#D1D4DB] bg-white px-[18px] text-sm font-semibold text-[#3F3F50] hover:bg-[#F5F7F9]';

/**
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {(snapshot) => void} [onSubmit] - receives the PaymentForm snapshot.
 * @param {'in' | 'out'} [doc] - 'in' = Cobro, 'out' = Pago.
 * @param {{ id, label } | null} [account] - account in context (locks "Ingresar en").
 * @param {[]} [accounts] - selectable accounts when there is no context account.
 * @param {[]} [paymentMethods] - account payment methods (payin/payout filtered).
 * @param {number} [initialAmount] - pre-fills "Importe del pago".
 * @param {string} [subtitle] - e.g. "Transacción TRX-0142 · 02/05/2026 · Cuenta de Banco".
 */
export function AddPaymentModal({
  open,
  onClose,
  onSubmit,
  doc = 'in',
  account = null,
  accounts = [],
  paymentMethods = [],
  initialAmount = 0,
  subtitle,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const cuadra = !!snapshot?.totals?.cuadra;
  const label = doc === 'in' ? 'Cobro' : 'Pago';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__bfa23e">
      <DialogContent
        className="flex w-[1280px] max-w-[96vw] max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8EAEF] bg-white p-0 [&>button]:hidden"
        data-testid="DialogContent__bfa23e">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle asChild data-testid="DialogTitle__bfa23e">
                <h2 className="m-0 flex items-center gap-2.5 text-lg font-bold leading-6 tracking-[-0.01em] text-[#121217]">
                  Agregar pago
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      doc === 'in'
                        ? 'border-[#B2EECC] bg-[#EEFBF4] text-[#17663A]'
                        : 'border-[#FBB1C4] bg-[#FEF0F4] text-[#D50B3E]'
                    }`}
                  >
                    {label}
                  </span>
                </h2>
              </DialogTitle>
              <DialogDescription asChild data-testid="DialogDescription__bfa23e">
                <p className="mt-0.5 text-[13px] leading-[18px] text-[#6C6C89]">
                  {subtitle || 'Registra un pago contra una transacción existente'}
                </p>
              </DialogDescription>
            </div>
            <button type="button" onClick={onClose} className="grid h-[30px] w-[30px] place-items-center rounded-md text-[#6C6C89] hover:bg-[#F5F7F9] hover:text-[#121217]">
              <X className="h-4 w-4" data-testid="X__bfa23e" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-4">
          <PaymentForm
            doc={doc}
            initialAmount={initialAmount}
            paymentMethods={paymentMethods}
            account={account}
            accounts={accounts}
            showAccountField
            requireAccount={!account}
            onChange={setSnapshot}
            data-testid="PaymentForm__bfa23e" />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-[#E8EAEF] px-6 py-4">
          <span className="mr-auto inline-flex items-center gap-1.5 text-xs leading-4 text-[#6C6C89]">
            <Info className="h-[13px] w-[13px]" data-testid="Info__bfa23e" /> El pago se vincula a la transacción ya creada
          </span>
          <button type="button" className={BTN_GHOST} onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!cuadra}
            onClick={() => onSubmit?.(snapshot)}
          >
            Agregar pago
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
