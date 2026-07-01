import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useCreateMovement } from '@/hooks/useCreateMovement';
import { useBPartnerLookup, useGLItemLookup } from '@/hooks/useMovementLookups';
import { LookupPicker } from './LookupPicker';
import { FieldRow, inputClass, selectClass } from './formFields';

/**
 * Modal form to create a single manual movement on the active account.
 * Mirrors the Classic "Transactions" tab form: trx type, dates, BP, GL item,
 * description, currencies, amounts.
 *
 * @param {{
 *   open: boolean;
 *   accountId: string;
 *   accountCurrency?: { id: string, iso: string } | null;
 *   onClose: () => void;
 *   onSuccess: () => void;
 * }} props
 */
export function NewMovementDialog({ open, accountId, accountCurrency, onClose, onSuccess }) {
  const ui = useUI();
  const { createMovement, creating } = useCreateMovement();

  const today = useMemo(() => toLocalIso(new Date()), []);

  const [form, setForm] = useState(() => initialForm(accountCurrency, today));
  const [bpartner, setBpartner] = useState(null);
  const [glItem, setGlItem] = useState(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setForm(initialForm(accountCurrency, today));
      setBpartner(null);
      setGlItem(null);
    }
  }, [open, accountCurrency, today]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const dep = Number(form.depositAmount) || 0;
    const pay = Number(form.paymentAmount) || 0;
    // Validate that the editable amount(s) for the current trxType are > 0.
    const needsDeposit = depositEditable(form.trxType);
    const needsPayment = paymentEditable(form.trxType);
    const hasAnyAmount =
      (needsDeposit && dep > 0) || (needsPayment && pay > 0);
    if (!hasAnyAmount) {
      toast.error(ui('financeAccountMovementsNewErrorAmount'));
      return;
    }
    try {
      await createMovement({
        FIN_Financial_Account_ID: accountId,
        trxType: form.trxType,
        transactionDate: toIsoUtc(form.transactionDate),
        accountingDate: toIsoUtc(form.accountingDate),
        depositAmount: needsDeposit ? dep : 0,
        paymentAmount: needsPayment ? pay : 0,
        currencyId: accountCurrency?.id,
        description: form.description,
        bpartnerId: bpartner?.id ?? null,
        glItemId: glItemVisible(form.trxType) ? (glItem?.id ?? null) : null,
      });
      toast.success(ui('financeAccountMovementsNewSuccess'));
      onSuccess();
      onClose();
    } catch {
      toast.error(ui('financeAccountMovementsNewError'));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__cc1c8b">
      <DialogContent className="max-w-xl" data-testid="DialogContent__cc1c8b">
        <DialogHeader data-testid="DialogHeader__cc1c8b">
          <DialogTitle data-testid="DialogTitle__cc1c8b">{ui('financeAccountMovementsNewTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Tipo */}
          <FieldRow
            label={ui('financeAccountMovementsNewType')}
            data-testid="FieldRow__cc1c8b">
            <select
              value={form.trxType}
              onChange={(e) => setForm({ ...form, trxType: e.target.value })}
              className={selectClass}
            >
              <option value="BPD">{ui('financeAccountMovementsTypeBPD')}</option>
              <option value="BPW">{ui('financeAccountMovementsTypeBPW')}</option>
              <option value="BF">{ui('financeAccountMovementsTypeBF')}</option>
            </select>
          </FieldRow>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <FieldRow
              label={ui('financeAccountMovementsNewTrxDate')}
              data-testid="FieldRow__cc1c8b">
              <input
                type="date"
                value={form.transactionDate}
                onChange={(e) => setForm({ ...form, transactionDate: e.target.value })}
                className={inputClass}
              />
            </FieldRow>
            <FieldRow
              label={ui('financeAccountMovementsNewAcctDate')}
              data-testid="FieldRow__cc1c8b">
              <input
                type="date"
                value={form.accountingDate}
                onChange={(e) => setForm({ ...form, accountingDate: e.target.value })}
                className={inputClass}
              />
            </FieldRow>
          </div>

          {/* BP + GL Item */}
          <FieldRow
            label={ui('financeAccountMovementsNewBpartner')}
            data-testid="FieldRow__cc1c8b">
            <LookupPicker
              value={bpartner}
              onSelect={setBpartner}
              onClear={() => setBpartner(null)}
              placeholder={ui('financeAccountMovementsNewBpartnerPlaceholder')}
              useLookup={useBPartnerLookup}
              dataTestId="new-movement-bpartner"
              data-testid="LookupPicker__cc1c8b" />
          </FieldRow>
          {glItemVisible(form.trxType) ? (
            <FieldRow
              label={ui('financeAccountMovementsNewGlItem')}
              data-testid="FieldRow__cc1c8b">
              <LookupPicker
                value={glItem}
                onSelect={setGlItem}
                onClear={() => setGlItem(null)}
                placeholder={ui('financeAccountMovementsNewGlItemPlaceholder')}
                useLookup={useGLItemLookup}
                dataTestId="new-movement-glitem"
                data-testid="LookupPicker__cc1c8b" />
            </FieldRow>
          ) : null}

          {/* Descripción */}
          <FieldRow
            label={ui('financeAccountMovementsNewDescription')}
            data-testid="FieldRow__cc1c8b">
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
          </FieldRow>

          {/* Moneda (read-only, viene de la cuenta) */}
          <FieldRow
            label={ui('financeAccountMovementsNewCurrency')}
            data-testid="FieldRow__cc1c8b">
            <input
              type="text"
              readOnly
              value={accountCurrency?.iso ?? ''}
              className={`${inputClass} cursor-not-allowed bg-[#F5F7F9] text-[#6c6c89]`}
            />
          </FieldRow>

          {/* Importes — Classic exposes both columns and toggles readonly by trxType. */}
          <div className="grid grid-cols-2 gap-4">
            <FieldRow
              label={ui('financeAccountMovementsNewDepositAmount')}
              data-testid="FieldRow__cc1c8b">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.depositAmount}
                onChange={(e) => setForm({ ...form, depositAmount: e.target.value })}
                readOnly={!depositEditable(form.trxType)}
                data-testid="new-movement-deposit"
                className={depositEditable(form.trxType)
                  ? inputClass
                  : `${inputClass} cursor-not-allowed bg-[#F5F7F9] text-[#6c6c89]`}
              />
            </FieldRow>
            <FieldRow
              label={ui('financeAccountMovementsNewPaymentAmount')}
              data-testid="FieldRow__cc1c8b">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.paymentAmount}
                onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })}
                readOnly={!paymentEditable(form.trxType)}
                data-testid="new-movement-payment"
                className={paymentEditable(form.trxType)
                  ? inputClass
                  : `${inputClass} cursor-not-allowed bg-[#F5F7F9] text-[#6c6c89]`}
              />
            </FieldRow>
          </div>

          <DialogFooter data-testid="DialogFooter__cc1c8b">
            <DialogClose asChild data-testid="DialogClose__cc1c8b">
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg border border-[#D1D4DB] bg-white px-4 text-sm font-medium text-[#121217] hover:bg-[#F5F7F9]"
              >
                {ui('financeAccountMovementsNewCancel')}
              </button>
            </DialogClose>
            <button
              type="submit"
              disabled={creating}
              data-testid="new-movement-submit"
              className="inline-flex h-10 items-center rounded-lg bg-[#121217] px-4 text-sm font-medium text-white hover:bg-[#FFD500] hover:text-[#121217] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? ui('financeAccountMovementsNewSaving') : ui('financeAccountMovementsNewConfirm')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function initialForm(_accountCurrency, today) {
  return {
    trxType: 'BPD',
    transactionDate: today,
    accountingDate: today,
    description: '',
    depositAmount: '',
    paymentAmount: '',
  };
}

/**
 * Mirrors Classic's readonly rules:
 *   Depositamt.readonly  ← @Trxtype@='BPW'  (i.e. editable for BPD & BF)
 *   Paymentamt.readonly  ← @Trxtype@='BPD'  (i.e. editable for BPW & BF)
 */
function depositEditable(trxType) {
  return trxType === 'BPD' || trxType === 'BF';
}
function paymentEditable(trxType) {
  return trxType === 'BPW' || trxType === 'BF';
}

/**
 * Mirrors Classic's displaylogic for C_Glitem_ID:
 *   @Trxtype@!='' & @Trxtype@!='BF' & @Fin_Payment_ID@=''
 * Hidden for Bank Fee.
 */
function glItemVisible(trxType) {
  return trxType !== 'BF' && trxType !== '';
}

/** Browser-native date input yields `YYYY-MM-DD`. */
function toLocalIso(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Sends UTC midnight so the backend parses the same calendar day regardless of TZ. */
function toIsoUtc(localDate) {
  return `${localDate}T00:00:00Z`;
}
