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
import { X, Check, Save, ArrowDown, ArrowUp, BarChart3 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import { useCreateMovement, useUpdateMovement } from '@/hooks/useCreateMovement';
import { useGLItemLookup, useBPartnerLookup, useDimensionLookup } from '@/hooks/useMovementLookups';
import { Field, DateInput, AmountInput, ChipSelect } from '@/components/forms/fields';
import { eur, parseEur, todayISO } from './NewMovementWizard/movementWizardData';

const BTN_PRIMARY =
  'inline-flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--text-primary))] px-[18px] text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-highlight hover:text-accent-highlight-foreground disabled:opacity-45 disabled:pointer-events-none';
const BTN_SECONDARY =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border-control))] bg-card px-[18px] text-sm font-semibold text-[hsl(var(--text-secondary))] transition-colors hover:bg-[hsl(var(--page-bg))] disabled:opacity-45 disabled:pointer-events-none';
const BTN_GHOST =
  'inline-flex h-9 items-center gap-2 rounded-lg px-[18px] text-sm font-semibold text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--page-bg))]';

// Per-dimension lookup hooks. Defined at module scope (function declarations are
// hoisted) so each is a valid custom hook — a dimension's `useLookup` can then be
// passed straight to ChipSelect instead of wrapping useDimensionLookup in an inline
// callback (which would violate the rules of hooks).
function useCostcenterLookup(query) { return useDimensionLookup(query, 'costcenter'); }
function useProjectLookup(query) { return useDimensionLookup(query, 'project'); }
function useProductLookup(query) { return useDimensionLookup(query, 'product'); }

// Conditional accounting dimensions (besides Contacto, which is always shown).
// Order follows the design handoff. Each carries its own lookup hook.
const OPTIONAL_DIMS = [
  { key: 'costcenter', labelKey: 'financeAccountTxNewDimCostcenter', placeholderKey: 'financeAccountTxNewDimCostcenterPlaceholder', useLookup: useCostcenterLookup },
  { key: 'project', labelKey: 'financeAccountTxNewDimProject', placeholderKey: 'financeAccountTxNewDimProjectPlaceholder', useLookup: useProjectLookup },
  { key: 'product', labelKey: 'financeAccountTxNewDimProduct', placeholderKey: 'financeAccountTxNewDimProductPlaceholder', useLookup: useProductLookup },
];

// ── Segmented Entrada/Salida control ──────────────────────────────────────────
function DirectionToggle({ value, onChange, disabled }) {
  const ui = useUI();
  const options = [
    { id: 'in', label: ui('financeAccountTxNewTypeIn'), Icon: ArrowDown, active: 'bg-[var(--status-success-fg)]' },
    { id: 'out', label: ui('financeAccountTxNewTypeOut'), Icon: ArrowUp, active: 'bg-[var(--status-destructive-fg)]' },
  ];
  return (
    <div className={`inline-flex h-[42px] w-full gap-[3px] rounded-[9px] bg-[hsl(var(--page-bg))] p-[3px] ${disabled ? 'opacity-60' : ''}`}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(o.id)}
            data-testid={`tx-dir-${o.id}`}
            className={`inline-flex flex-1 items-center justify-center gap-[7px] rounded-[7px] text-[13px] ${
              disabled ? 'cursor-not-allowed' : ''
            } ${
              on ? `${o.active} font-bold text-primary-foreground` : 'font-medium text-[hsl(var(--text-secondary))]'
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
  gl: null, // selected G/L item object, or null when none is chosen
  amount: '',
  description: '',
  contact: null, // selected business partner object, or null
  dims: {}, // per-dimension selection keyed by costcenter / project / product
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
  // Last description we auto-generated from the G/L item. While the description still equals
  // this (or is empty), switching G/L item keeps it in sync; once the user edits it, it stops.
  const [autoDesc, setAutoDesc] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isEdit = Boolean(movement);
  const busy = creating || updating;

  // Seed the form each time the modal opens: from the edited movement, or blank
  // for a new one.
  useEffect(() => {
    if (!open) return;
    const seeded = movement ? formFromMovement(movement) : initialForm();
    setForm(seeded);
    setAutoDesc(seeded.description || '');
  }, [open, movement]);

  // Which optional dimensions to render: those enabled in the chart of accounts.
  const visibleDims = useMemo(
    () => OPTIONAL_DIMS.filter((d) => dimensions.includes(d.key)),
    [dimensions],
  );

  const iso = accountCurrency?.iso || 'EUR';
  // Editing an already-Processed movement: amount and direction are locked (Classic parity); only
  // G/L item, dimensions, description and dates can change. Confirmar is hidden (already processed).
  const lockAmountType = isEdit && Boolean(movement.processed);
  const amountValue = parseEur(form.amount);
  const valid = Boolean(form.date) && Boolean(form.dir) && Boolean(form.gl?.id) && amountValue > 0;

  const setDim = (key, v) => set({ dims: { ...form.dims, [key]: v } });
  // Mirrors Etendo Classic: picking a G/L item fills the description with
  // "Conceptos Contables: {name}" (es) / "GL Item: {name}" (en). It keeps updating as the user
  // switches between concepts, but never overwrites a description the user typed themselves.
  const handleGlChange = (row) => {
    const nextAuto = row ? `${ui('financeAccountTxNewGlDescPrefix')}: ${row.name}` : '';
    const current = form.description || '';
    const description = (current === '' || current === autoDesc) ? nextAuto : current;
    setAutoDesc(nextAuto);
    set({ gl: row, description });
  };
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
      const editOrNewKey = isEdit ? 'financeAccountTxEditSuccess' : 'financeAccountTxNewSuccess';
      const successKey = process ? 'financeAccountTxConfirmSuccess' : editOrNewKey;
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
        className="flex w-[820px] max-w-[96vw] max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-subtle))] bg-card p-0 [&>button]:hidden"
        data-testid="tx-new-modal">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-[hsl(var(--border-subtle))] px-6 pb-4 pt-[18px]">
          <div className="min-w-0">
            <DialogTitle asChild data-testid="DialogTitle__tx">
              <h2 className="m-0 text-[17px] font-bold leading-[22px] tracking-[-0.01em] text-[hsl(var(--text-primary))]">
                {ui(isEdit ? 'financeAccountTxEditTitle' : 'financeAccountTxNewTitle')}
              </h2>
            </DialogTitle>
            <DialogDescription asChild data-testid="DialogDescription__tx">
              <p className="mt-[3px] text-xs leading-4 text-[hsl(var(--text-secondary))]">{subtitle}</p>
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ui('financeAccountTxNewCancel')}
            data-testid="tx-new-close"
            className="mt-0.5 text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]">
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
              <DirectionToggle value={form.dir} onChange={(dir) => set({ dir })} disabled={lockAmountType} data-testid="tx-dir" />
            </Field>
          </div>

          <div className="grid grid-cols-[1.4fr_1fr] gap-4">
            <Field label={ui('financeAccountTxNewGlItem')} required data-testid="tx-glitem-field">
              <ChipSelect
                value={form.gl}
                onChange={handleGlChange}
                useLookup={useGLItemLookup}
                placeholder={ui('financeAccountTxNewGlItemPlaceholder')}
                testId="tx-glitem"
                data-testid="ChipSelect__9a0423" />
            </Field>
            <AmountInput
              label={ui('financeAccountTxNewAmount')}
              required
              readOnly={lockAmountType}
              value={form.amount}
              currency={iso}
              placeholder={ui('financeAccountTxNewAmountPlaceholder')}
              onChange={(e) => set({ amount: e.target.value })}
              onBlur={formatAmount}
              name="tx-amount"
              data-testid="tx-amount" />
          </div>

          <Field label={ui('financeAccountTxNewDescription')} data-testid="tx-desc-field">
            <textarea
              className="min-h-16 w-full resize-y rounded-lg border border-[hsl(var(--border-control))] bg-card px-3 py-2.5 text-sm leading-[1.4] text-[hsl(var(--text-primary))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--text-primary))] focus:outline-none"
              placeholder={ui('financeAccountTxNewDescriptionPlaceholder')}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              data-testid="tx-description" />
          </Field>

          {/* Accounting dimensions — Contacto always, the rest conditionally */}
          <div className="border-t border-[hsl(var(--border-subtle))] pt-4">
            <div className="mb-3.5 flex items-center gap-2">
              <BarChart3 className="h-[15px] w-[15px] text-[hsl(var(--text-secondary))]" data-testid="BarChart3__tx" />
              <span className="text-sm font-semibold leading-[19px] text-[hsl(var(--text-primary))]">{ui('financeAccountTxNewDimensionsTitle')}</span>
              <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">{ui('financeAccountTxNewDimensionsOptional')}</span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3.5">
              <Field label={ui('financeAccountTxNewDimContact')} data-testid="tx-contact-field">
                <ChipSelect
                  value={form.contact}
                  onChange={(row) => set({ contact: row })}
                  useLookup={useBPartnerLookup}
                  placeholder={ui('financeAccountTxNewDimContactPlaceholder')}
                  testId="tx-contact"
                  data-testid="ChipSelect__9a0423" />
              </Field>
              {visibleDims.map((d) => (
                <Field key={d.key} label={ui(d.labelKey)} data-testid={`tx-dim-${d.key}-field`}>
                  <ChipSelect
                    value={form.dims[d.key] || null}
                    onChange={(row) => setDim(d.key, row)}
                    useLookup={d.useLookup}
                    placeholder={ui(d.placeholderKey)}
                    testId={`tx-dim-${d.key}`}
                    data-testid="ChipSelect__9a0423" />
                </Field>
              ))}
            </div>
          </div>
        </div>

        {/* Footer — Guardar (Draft) + Confirmar (create/update + process) */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-6 py-3.5">
          <button type="button" className={BTN_GHOST} onClick={onClose} data-testid="tx-new-cancel">
            {ui('financeAccountTxNewCancel')}
          </button>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={!valid || busy}
            onClick={() => handleSave(false)}
            data-testid="tx-new-save">
            <Save className="h-[14px] w-[14px]" data-testid="Save__tx" />
            {busy ? ui('financeAccountTxNewSaving') : ui('financeAccountTxNewSave')}
          </button>
          {!lockAmountType && (
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={!valid || busy}
              onClick={() => handleSave(true)}
              data-testid="tx-new-confirm">
              <Check className="h-[14px] w-[14px]" data-testid="Check__tx" />
              {busy ? ui('financeAccountTxNewSaving') : ui('financeAccountTxNewConfirm')}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
