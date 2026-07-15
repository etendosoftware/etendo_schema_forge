// New Transaction modal — a manual FIN_Finacc_Transaction linked directly to a
// G/L item (concept), created in Draft (Borrador). Simplified single-view design
// (design handoff "Nueva transacción"): no organization / processed / payment
// fields, and a single unified amount driven by the Entrada/Salida direction.
//
//   Entrada → BPD (deposit)     · amount → depositAmount
//   Salida  → BPW (withdrawal)  · amount → paymentAmount
//
// Accounting dimensions are optional: Contacto is ALWAYS shown; Project /
// Cost center / Product only when enabled in the chart of accounts (they come in
// via the `dimensions` prop, the account's headerDimensions).
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X, Check, ArrowDown, ArrowUp, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import { useCreateMovement, useUpdateMovement } from '@/hooks/useCreateMovement';
import { useGLItemLookup, useBPartnerLookup, useDimensionLookup } from '@/hooks/useMovementLookups';
import { Field, DateInput, AmountInput, ChipSelect } from '@/components/forms/fields';
import { eur, parseEur, todayISO } from './NewMovementWizard/movementWizardData';

const BTN_PRIMARY =
  'inline-flex h-9 items-center gap-2 rounded-lg bg-[#121217] px-[18px] text-sm font-semibold text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:opacity-45 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-[#D1D4DB] bg-white px-[18px] text-sm font-semibold text-[#3F3F50] transition-colors hover:bg-[#F5F7F9] disabled:opacity-45 disabled:pointer-events-none';
const BTN_GHOST =
  'inline-flex h-9 items-center gap-2 rounded-lg px-[18px] text-sm font-semibold text-[#3F3F50] hover:bg-[#F5F7F9]';

// Conditional accounting dimensions (besides Contacto, which is always shown).
// key → { labelKey, placeholderKey }. Order follows the design handoff.
const OPTIONAL_DIMS = [
  { key: 'costcenter', labelKey: 'financeAccountTxNewDimCostcenter', placeholderKey: 'financeAccountTxNewDimCostcenterPlaceholder' },
  { key: 'project', labelKey: 'financeAccountTxNewDimProject', placeholderKey: 'financeAccountTxNewDimProjectPlaceholder' },
  { key: 'product', labelKey: 'financeAccountTxNewDimProduct', placeholderKey: 'financeAccountTxNewDimProductPlaceholder' },
];

// ── Segmented Entrada/Salida control ──────────────────────────────────────────
function DirectionToggle({ value, onChange }) {
  const ui = useUI();
  const options = [
    { id: 'in', label: ui('financeAccountTxNewTypeIn'), Icon: ArrowDown, active: 'bg-[#17663A]' },
    { id: 'out', label: ui('financeAccountTxNewTypeOut'), Icon: ArrowUp, active: 'bg-[#C5234A]' },
  ];
  return (
    <div className="inline-flex h-[42px] w-full gap-[3px] rounded-[9px] bg-[#F7F7F8] p-[3px]">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            data-testid={`tx-dir-${o.id}`}
            className={`inline-flex flex-1 items-center justify-center gap-[7px] rounded-[7px] text-[13px] ${
              on ? `${o.active} font-bold text-white` : 'font-medium text-[#3F3F50]'
            }`}
          >
            <o.Icon className="h-[13px] w-[13px]" strokeWidth={2.4} data-testid={`tx-dir-icon-${o.id}`} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const initialForm = () => ({
  date: todayISO(),
  dir: 'out',
  gl: null, // { id, name }
  amount: '',
  description: '',
  contact: null, // { id, name }
  dims: {}, // { costcenter, project, product } → { id, name }
});

// Builds the edit-mode form from a movement row (which carries FK ids + display
// names + the deposit/withdrawal split). Amount comes from the direction's column.
function formFromMovement(m) {
  const dir = m.trxType === 'BPD' ? 'in' : 'out';
  const amt = dir === 'in' ? m.depositAmount : m.withdrawalAmount;
  const dims = m.dimensions || {};
  return {
    date: (m.date || '').slice(0, 10) || todayISO(),
    dir,
    gl: m.glItemId ? { id: m.glItemId, name: m.glItem } : null,
    amount: amt != null && amt !== '' ? eur(Number(amt)) : '',
    description: m.description || '',
    contact: m.bpartnerId ? { id: m.bpartnerId, name: m.contact } : null,
    dims: {
      costcenter: m.costcenterId ? { id: m.costcenterId, name: dims.costcenter } : null,
      project: m.projectId ? { id: m.projectId, name: dims.project } : null,
      product: m.productId ? { id: m.productId, name: dims.product } : null,
    },
  };
}

/**
 * @param {{
 *   open: boolean,
 *   accountId: string,
 *   accountName?: string,
 *   accountCurrency: { id: string, iso: string } | null,
 *   dimensions?: string[],   // headerDimensions active in the chart of accounts
 *   movement?: object | null, // when set, the modal edits this DRAFT movement
 *   onClose: () => void,
 *   onSuccess?: () => void,
 * }} props
 */
export function NewTransactionModal({ open, accountId, accountName = '', accountCurrency, dimensions = [], movement = null, onClose, onSuccess }) {
  const ui = useUI();
  const { createMovement, creating } = useCreateMovement();
  const { updateMovement, updating } = useUpdateMovement();
  const [form, setForm] = useState(initialForm);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isEdit = Boolean(movement);
  const busy = creating || updating;

  // Seed the form each time the modal opens: from the edited movement, or blank
  // for a new one.
  useEffect(() => {
    if (open) setForm(movement ? formFromMovement(movement) : initialForm());
  }, [open, movement]);

  // Which optional dimensions to render: those enabled in the chart of accounts.
  const visibleDims = useMemo(
    () => OPTIONAL_DIMS.filter((d) => dimensions.includes(d.key)),
    [dimensions],
  );

  const iso = accountCurrency?.iso || 'EUR';
  const amountValue = parseEur(form.amount);
  const valid = Boolean(form.date) && Boolean(form.dir) && Boolean(form.gl?.id) && amountValue > 0;

  const setDim = (key, v) => set({ dims: { ...form.dims, [key]: v } });
  // On blur, normalize the typed amount to the European 2-decimal format ("20" → "20,00").
  const formatAmount = () => {
    const raw = (form.amount || '').trim();
    if (raw) set({ amount: eur(parseEur(raw)) });
  };

  // process=false → save as Draft ("Guardar"); process=true → create/update AND
  // process it ("Confirmar", Borrador → Procesado).
  const handleSave = async (process) => {
    if (!valid || busy) return;
    const base = {
      trxType: form.dir === 'in' ? 'BPD' : 'BPW',
      transactionDate: `${form.date}T00:00:00Z`,
      accountingDate: `${form.date}T00:00:00Z`,
      depositAmount: form.dir === 'in' ? amountValue : 0,
      paymentAmount: form.dir === 'out' ? amountValue : 0,
      currencyId: accountCurrency?.id,
      description: form.description,
      glItemId: form.gl?.id ?? null,
      bpartnerId: form.contact?.id ?? null,
      costcenterId: form.dims.costcenter?.id || null,
      projectId: form.dims.project?.id || null,
      productId: form.dims.product?.id || null,
      process,
    };
    try {
      if (isEdit) {
        await updateMovement({ id: movement.id, ...base });
      } else {
        await createMovement({ FIN_Financial_Account_ID: accountId, ...base });
      }
      const successKey = process
        ? 'financeAccountTxConfirmSuccess'
        : (isEdit ? 'financeAccountTxEditSuccess' : 'financeAccountTxNewSuccess');
      toast.success(ui(successKey));
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || ui('financeAccountTxNewError'));
    }
  };

  const subtitle = [accountName, iso].filter(Boolean).join(' · ');

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} data-testid="Dialog__tx">
      <DialogContent
        className="flex w-[680px] max-w-[96vw] max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E8ED] bg-white p-0 [&>button]:hidden"
        data-testid="tx-new-modal">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-[#E8E8ED] px-6 pb-4 pt-[18px]">
          <div className="min-w-0">
            <DialogTitle asChild data-testid="DialogTitle__tx">
              <h2 className="m-0 text-[17px] font-bold leading-[22px] tracking-[-0.01em] text-[#121217]">
                {ui(isEdit ? 'financeAccountTxEditTitle' : 'financeAccountTxNewTitle')}
              </h2>
            </DialogTitle>
            <DialogDescription asChild data-testid="DialogDescription__tx">
              <p className="mt-[3px] text-xs leading-4 text-[#6C6C89]">{subtitle}</p>
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui('financeAccountTxNewCancel')}
            data-testid="tx-new-close"
            className="mt-0.5 text-[#6C6C89] hover:text-[#121217]">
            <X className="h-5 w-5" data-testid="X__tx" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <DateInput
              label={ui('financeAccountTxNewDate')}
              required
              value={form.date}
              onChange={(v) => set({ date: v })}
              name="tx-date"
              data-testid="tx-date" />
            <Field label={ui('financeAccountTxNewType')} required data-testid="tx-type-field">
              <DirectionToggle value={form.dir} onChange={(dir) => set({ dir })} data-testid="tx-dir" />
            </Field>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr] gap-4">
            <Field label={ui('financeAccountTxNewGlItem')} required data-testid="tx-glitem-field">
              <ChipSelect
                value={form.gl}
                onChange={(row) => set({ gl: row })}
                useLookup={useGLItemLookup}
                placeholder={ui('financeAccountTxNewGlItemPlaceholder')}
                testId="tx-glitem" />
            </Field>
            <AmountInput
              label={ui('financeAccountTxNewAmount')}
              required
              value={form.amount}
              placeholder="0,00"
              onChange={(e) => set({ amount: e.target.value })}
              onBlur={formatAmount}
              name="tx-amount"
              data-testid="tx-amount" />
          </div>

          <Field label={ui('financeAccountTxNewDescription')} data-testid="tx-desc-field">
            <textarea
              className="min-h-16 w-full resize-y rounded-lg border border-[#D1D1DB] bg-white px-3 py-2.5 text-sm leading-[1.4] text-[#121217] placeholder:text-[#8A8AA3] focus:border-[#121217] focus:outline-none"
              placeholder={ui('financeAccountTxNewDescriptionPlaceholder')}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              data-testid="tx-description" />
          </Field>

          {/* Accounting dimensions — Contacto always, the rest conditionally */}
          <div className="border-t border-[#E8E8ED] pt-4">
            <div className="mb-3.5 flex items-center gap-2">
              <BarChart3 className="h-[15px] w-[15px] text-[#3F3F50]" data-testid="BarChart3__tx" />
              <span className="text-sm font-semibold leading-[19px] text-[#121217]">{ui('financeAccountTxNewDimensionsTitle')}</span>
              <span className="text-xs leading-4 text-[#8A8AA3]">{ui('financeAccountTxNewDimensionsOptional')}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
              <Field label={ui('financeAccountTxNewDimContact')} data-testid="tx-contact-field">
                <ChipSelect
                  value={form.contact}
                  onChange={(row) => set({ contact: row })}
                  useLookup={useBPartnerLookup}
                  placeholder={ui('financeAccountTxNewDimContactPlaceholder')}
                  testId="tx-contact" />
              </Field>
              {visibleDims.map((d) => (
                <Field key={d.key} label={ui(d.labelKey)} data-testid={`tx-dim-${d.key}-field`}>
                  <ChipSelect
                    value={form.dims[d.key] || null}
                    onChange={(row) => setDim(d.key, row)}
                    useLookup={(q) => useDimensionLookup(q, d.key)}
                    placeholder={ui(d.placeholderKey)}
                    testId={`tx-dim-${d.key}`} />
                </Field>
              ))}
            </div>
          </div>
        </div>

        {/* Footer — Guardar (Draft) + Confirmar (create/update + process) */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[#E8E8ED] bg-[#FAFAFB] px-6 py-3.5">
          <button type="button" className={BTN_GHOST} onClick={onClose} data-testid="tx-new-cancel">
            {ui('financeAccountTxNewCancel')}
          </button>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={!valid || busy}
            onClick={() => handleSave(false)}
            data-testid="tx-new-save">
            {busy ? ui('financeAccountTxNewSaving') : ui('financeAccountTxNewSave')}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={!valid || busy}
            onClick={() => handleSave(true)}
            data-testid="tx-new-confirm">
            <Check className="h-[14px] w-[14px]" data-testid="Check__tx" />
            {busy ? ui('financeAccountTxNewSaving') : ui('financeAccountTxNewConfirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
