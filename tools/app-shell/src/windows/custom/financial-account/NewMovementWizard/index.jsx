// New Movement wizard — 2-stage modal ported from the Claude Design prototype
// ("Crear Movimiento.html", option A · choice cards). Tailwind styling.
//
//   Stage 1 — movement basics (type, dates, description, amounts, dimensions)
//   Stage 2 — choose "Registrar pago" (embedded payment workspace) OR
//             "Concepto contable (G/L)" (simple form), mutually exclusive.
//
// "Registrar pago" creates+processes a real FIN_Payment (Classic "Add Payment",
// which auto-creates the bank transaction); "Concepto contable (G/L)" creates the
// manual finacc transaction with a G/L item. See handleCreate / submitPayment.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Check, ChevronDown, Wallet, Percent, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import { useCreateMovement, useCreatePayment } from '@/hooks/useCreateMovement';
import { useDimensionValues } from '@/hooks/useDimensionValues';
import { useGLItemLookup } from '@/hooks/useMovementLookups';
import {
  Field, ReadOnly, Select, DateInput, AmountInput, SectionLabel, LookupPicker,
} from '@/components/forms/fields';
import { PaymentForm } from '@/components/payment/PaymentForm';
import { parseAmount, todayISO, DIM_META, DIM_ORDER } from './movementWizardData';

// Transaction types we surface in the wizard. We still receive Bank Fee (BF)
// from the backend, but only expose the two user-facing flows: Cobro / Pago.
const VISIBLE_TRX_TYPES = ['BPD', 'BPW'];
const TRX_LABEL_KEY = {
  BPD: 'financeAccountMovementsTypeBPD',
  BPW: 'financeAccountMovementsTypeBPW',
  BF: 'financeAccountMovementsTypeBF',
};

const BTN_PRIMARY =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-[#121217] px-[18px] text-sm font-semibold text-white hover:bg-[#282833] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-[#D1D4DB] bg-white px-[18px] text-sm font-semibold text-[#3F3F50] hover:bg-[#F5F7F9]';

// ── Stage 1 ──────────────────────────────────────────────────────────────────
function MovementBasics({ form, set, dimensions, optionsByDim, trxTypes }) {
  const ui = useUI();
  const visibleDims = DIM_ORDER.filter((k) => dimensions.includes(k) && DIM_META[k]);
  const setDim = (key, v) => set({ dims: { ...form.dims, [key]: v } });
  // Cobro (BPD) → deposit editable; Pago (BPW) → withdrawal editable.
  const depositEditable = form.trxType !== 'BPW';
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-[18px] gap-y-3.5">
        <Select
          label={ui('financeAccountMovementsWizardTrxType')}
          required
          value={form.trxType}
          onChange={(v) => set({ trxType: v })}
          options={trxTypes}
          data-testid="Select__e2e571" />
        <div />
        <DateInput
          label={ui('financeAccountMovementsWizardTrxDate')}
          required
          value={form.trxDate}
          onChange={(v) => set({ trxDate: v })}
          data-testid="DateInput__e2e571" />
        <DateInput
          label={ui('financeAccountMovementsNewAcctDate')}
          required
          value={form.acctDate}
          onChange={(v) => set({ acctDate: v })}
          data-testid="DateInput__e2e571" />
        <Field
          label={ui('financeAccountMovementsNewDescription')}
          className="col-span-2"
          data-testid="Field__e2e571">
          <textarea
            className="min-h-16 w-full box-border resize-y rounded-lg border border-[#D1D4DB] bg-white px-3 py-2.5 text-sm leading-5 text-[#121217] placeholder:text-[#8A8AA3] focus:outline-none focus:border-[#121217] focus:ring-2 focus:ring-[#121217]/10"
            placeholder={ui('financeAccountMovementsWizardDescriptionPlaceholder')}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
      </div>
      <SectionLabel data-testid="SectionLabel__e2e571">{ui('financeAccountMovementsWizardAmounts')}</SectionLabel>
      <div className="grid grid-cols-3 gap-x-[18px] gap-y-3.5">
        <Field
          label={ui('financeAccountMovementsNewCurrency')}
          required
          data-testid="Field__e2e571"><ReadOnly data-testid="ReadOnly__e2e571">{form.currencyIso || 'EUR'}</ReadOnly></Field>
        <AmountInput
          label={ui('financeAccountMovementsNewDepositAmount')}
          required={depositEditable}
          readOnly={!depositEditable}
          value={depositEditable ? form.deposit : '0.00'}
          placeholder={ui('financeAccountAmountPlaceholder')}
          onChange={(e) => set({ deposit: e.target.value })}
          data-testid="AmountInput__e2e571" />
        <AmountInput
          label={ui('financeAccountMovementsNewPaymentAmount')}
          required={!depositEditable}
          readOnly={depositEditable}
          value={!depositEditable ? form.withdrawal : '0.00'}
          placeholder={ui('financeAccountAmountPlaceholder')}
          onChange={(e) => set({ withdrawal: e.target.value })}
          data-testid="AmountInput__e2e571" />
      </div>
      {visibleDims.length > 0 ? (
        <>
          <SectionLabel data-testid="SectionLabel__e2e571">{ui('financeAccountMovementsWizardDimensions')}</SectionLabel>
          <div className="grid grid-cols-3 gap-x-[18px] gap-y-3.5">
            {visibleDims.map((key) => {
              const meta = DIM_META[key];
              return (
                <Select
                  key={key}
                  label={ui(meta.labelKey)}
                  required={meta.required}
                  value={form.dims[key] || ''}
                  onChange={(v) => setDim(key, v)}
                  options={optionsByDim[key] || []}
                  data-testid="Select__e2e571" />
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

const CHOICES = [
  { id: 'pay', Icon: Wallet, titleKey: 'financeAccountMovementsWizardChoicePayTitle', hintKey: 'financeAccountMovementsWizardChoicePayHint' },
  { id: 'gl', Icon: Percent, titleKey: 'financeAccountMovementsWizardChoiceGlTitle', hintKey: 'financeAccountMovementsWizardChoiceGlHint' },
];

function ChoiceCard({ choice, active, onClick }) {
  const ui = useUI();
  const { Icon } = choice;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-2.5 rounded-xl border-[1.5px] p-[18px] text-left transition-colors ${
        active ? 'border-[#121217] ring-[3px] ring-[#121217]/[0.08]' : 'border-[#D1D4DB] hover:border-[#A9A9BC] hover:bg-[#F5F7F9]'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${active ? 'bg-[#121217] text-white' : 'bg-[#E8E8ED] text-[#121217]'}`}>
          <Icon className="h-[22px] w-[22px]" data-testid="Icon__e2e571" />
        </span>
        <span className="text-[15px] font-bold leading-5 text-[#121217]">{ui(choice.titleKey)}</span>
        <span className={`ml-auto grid h-5 w-5 place-items-center rounded-full border-2 ${active ? 'border-[#121217]' : 'border-[#A9A9BC]'}`}>
          {active ? <span className="h-2.5 w-2.5 rounded-full bg-[#121217]" /> : null}
        </span>
      </div>
      <span className="text-[13px] leading-[18px] text-[#6C6C89]">{ui(choice.hintKey)}</span>
    </button>
  );
}

// ── G/L concept block ────────────────────────────────────────────────────────
// Mirrors Classic: choosing a G/L item is just selecting the concept from
// C_GLItem (no payment, no extra fields), via the shared LookupPicker fed by
// the existing `glitem-lookup` NEO action. All other movement data is shared.
function GLItemBlock({ value, onChange }) {
  const ui = useUI();
  return (
    <div className="grid grid-cols-2 gap-x-[18px] gap-y-3.5">
      <Field
        label={ui('financeAccountMovementsWizardGlItemLabel')}
        required
        data-testid="Field__e2e571">
        <LookupPicker
          value={value}
          onChange={onChange}
          useLookup={useGLItemLookup}
          placeholder={ui('financeAccountMovementsNewGlItemPlaceholder')}
          data-testid="LookupPicker__e2e571" />
      </Field>
    </div>
  );
}

// ── Stepper ──────────────────────────────────────────────────────────────────
const STEP_CIRCLE_CLASS = {
  on: 'bg-[#121217] text-white',
  done: 'border-[1.5px] border-[#B2EECC] bg-[#EEFBF4] text-[#17663A]',
  todo: 'bg-[#E8E8ED] text-[#6C6C89]',
};
const STEP_LABEL_CLASS = { on: 'text-[#121217]', done: 'text-[#3F3F50]', todo: 'text-[#6C6C89]' };

function stepState(stage, n) {
  if (stage === n) return 'on';
  return stage > n ? 'done' : 'todo';
}

function Stepper({ stage }) {
  const ui = useUI();
  const steps = [
    { n: 1, l: ui('financeAccountMovementsWizardStep1') },
    { n: 2, l: ui('financeAccountMovementsWizardStep2') },
  ];
  return (
    <div className="flex items-center gap-2 py-[18px] pb-4">
      {steps.map((s, i) => {
        const state = stepState(stage, s.n);
        const done = state === 'done';
        const connectorClass = done ? 'bg-[#B2EECC]' : 'bg-[#E8EAEF]';
        return (
          <Fragment key={s.n} data-testid="Fragment__e2e571">
            <div className="inline-flex items-center gap-2.5">
              <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-xs font-bold ${STEP_CIRCLE_CLASS[state]}`}>
                {done ? <Check className="h-3.5 w-3.5" data-testid="Check__e2e571" /> : s.n}
              </span>
              <span className={`whitespace-nowrap text-[13px] font-semibold leading-[18px] ${STEP_LABEL_CLASS[state]}`}>{s.l}</span>
            </div>
            {i < steps.length - 1 ? <span className={`h-0.5 min-w-6 flex-1 rounded-sm ${connectorClass}`} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}

// Picks the default Organization dimension: the account's org when it's among
// the options, otherwise the only option when there is a single one (else none).
function pickDefaultOrg(orgs, defaultOrgId) {
  if (defaultOrgId && orgs.some((o) => o.id === defaultOrgId)) return defaultOrgId;
  return orgs.length === 1 ? orgs[0].id : null;
}

const initialForm = (currencyIso) => ({
  trxType: 'BPD',
  trxDate: todayISO(),
  acctDate: todayISO(),
  description: '',
  currencyIso: currencyIso || 'EUR',
  // Empty so the field shows "0,00" as a placeholder (not a real value the user
  // must clear). parseAmount('') → 0 on submit / validation.
  deposit: '',
  withdrawal: '',
  dims: {},
});

/**
 * @param {{ open, accountId, accountCurrency, onClose, onSuccess }} props
 */
export function NewMovementWizard({ open, accountId, accountCurrency, dimensions = [], trxTypes = [], defaultOrgId = null, paymentMethods = [], onClose, onSuccess }) {
  const ui = useUI();
  const { createMovement, creating } = useCreateMovement();
  const { createPayment, creating: creatingPayment } = useCreatePayment();
  const { optionsByDim } = useDimensionValues(dimensions, open);

  // Only Cobro (BPD) and Pago (BPW) are shown; labels localized via i18n.
  const trxOptions = useMemo(
    () => (trxTypes || [])
      .filter((t) => VISIBLE_TRX_TYPES.includes(t.value))
      .map((t) => ({ value: t.value, label: TRX_LABEL_KEY[t.value] ? ui(TRX_LABEL_KEY[t.value]) : t.label })),
    [trxTypes, ui],
  );
  const [stage, setStage] = useState(1);
  const [choice, setChoice] = useState(null); // 'pay' | 'gl'
  const [form, setForm] = useState(() => initialForm(accountCurrency?.iso));
  const [glItem, setGlItem] = useState(null); // selected C_GLItem { id, name }
  // Latest PaymentForm snapshot (tercero, selected invoices, commissions,
  // overpayment action, totals); consumed by submitPayment to register the payment.
  const paymentSnapshotRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setStage(1);
      setChoice(null);
      setForm(initialForm(accountCurrency?.iso));
      setGlItem(null);
      paymentSnapshotRef.current = null;
    }
  }, [open, accountCurrency?.iso]);

  // Auto-select the Organization dimension from the current context: the
  // account's organization when present, otherwise the only option when there
  // is a single organization. Future-proof for multi-org setups.
  useEffect(() => {
    const orgs = optionsByDim.organization;
    if (!open || !orgs || orgs.length === 0 || form.dims.organization) return;
    const ctx = pickDefaultOrg(orgs, defaultOrgId);
    if (ctx) setForm((f) => ({ ...f, dims: { ...f.dims, organization: ctx } }));
  }, [open, optionsByDim, defaultOrgId, form.dims.organization]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const movementAmount = useMemo(
    () => (form.trxType !== 'BPW' ? parseAmount(form.deposit) : parseAmount(form.withdrawal)),
    [form.trxType, form.deposit, form.withdrawal],
  );
  const doc = form.trxType === 'BPW' ? 'out' : 'in';
  // Contact chosen as the movement's bpartner dimension, used to pre-fill the
  // payment's "Recibido de / Pagado a". Null when no contact was selected.
  const movementContact = useMemo(
    () => (optionsByDim.bpartner || []).find((o) => o.id === form.dims.bpartner) ?? null,
    [optionsByDim, form.dims.bpartner],
  );
  const trxLabel = trxOptions.find((t) => t.value === form.trxType)?.label ?? '';
  const choiceMeta = CHOICES.find((c) => c.id === choice);

  // choice==='pay' → create+process a FIN_Payment (Classic "Add Payment"); the
  // processing auto-creates the bank transaction. choice==='gl' (or none) →
  // create the manual finacc transaction (optionally with a G/L concept).
  const submitMovement = async () => {
    const depositEditable = form.trxType !== 'BPW';
    const dep = depositEditable ? parseAmount(form.deposit) : 0;
    const pay = depositEditable ? 0 : parseAmount(form.withdrawal);
    if (dep <= 0 && pay <= 0) {
      throw new Error(ui('financeAccountMovementsWizardErrAmount'));
    }
    await createMovement({
      FIN_Financial_Account_ID: accountId,
      trxType: form.trxType || 'BPD',
      transactionDate: `${form.trxDate}T00:00:00Z`,
      accountingDate: `${form.acctDate}T00:00:00Z`,
      depositAmount: dep,
      paymentAmount: pay,
      currencyId: accountCurrency?.id,
      description: form.description,
      glItemId: choice === 'gl' ? (glItem?.id ?? null) : null,
    });
    toast.success(ui('financeAccountMovementsNewSuccess'));
  };

  const submitPayment = async () => {
    const snap = paymentSnapshotRef.current || {};
    if (!snap.tercero?.id) {
      const field = ui(doc === 'in'
        ? 'financeAccountMovementsWizardReceivedFrom'
        : 'financeAccountMovementsWizardPaidTo');
      throw new Error(ui('financeAccountMovementsWizardErrContact', { field }));
    }
    const amount = snap.totals?.pago ?? movementAmount;
    if (!amount || amount <= 0) {
      throw new Error(ui('financeAccountMovementsWizardErrPaymentAmount'));
    }
    if ((snap.totals?.diff ?? 0) > 0.005 && !snap.overpaymentAction) {
      throw new Error(ui('financeAccountMovementsWizardErrOverpayment'));
    }
    const glItems = (snap.commissions || [])
      .filter((g) => g.item?.id && ((Number(g.receivedIn) || 0) !== 0 || (Number(g.paidOut) || 0) !== 0))
      .map((g) => ({ glItemId: g.item.id, receivedIn: Number(g.receivedIn) || 0, paidOut: Number(g.paidOut) || 0 }));
    await createPayment({
      FIN_Financial_Account_ID: accountId,
      isReceipt: doc === 'in',
      bpartnerId: snap.tercero.id,
      paymentMethodId: snap.paymentMethodId || null,
      amount,
      paymentDate: snap.fechaPago,
      referenceNo: snap.referencia || '',
      description: form.description || '',
      organizationId: form.dims.organization || null,
      selectedInvoices: snap.selectedInvoices || {},
      writeoffs: snap.writeoffs || {},
      glItems,
      overpaymentAction: snap.overpaymentAction || null,
    });
    toast.success(ui('financeAccountMovementsWizardPaymentSuccess'));
  };

  const handleCreate = async () => {
    try {
      if (choice === 'pay') {
        await submitPayment();
      } else {
        await submitMovement();
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || ui(choice === 'pay'
        ? 'financeAccountMovementsWizardPaymentError'
        : 'financeAccountMovementsNewError'));
    }
  };

  const trxBadgeClass = doc === 'in'
    ? 'border-[#B2EECC] bg-[#EEFBF4] text-[#17663A]'
    : 'border-[#FBB1C4] bg-[#FEF0F4] text-[#D50B3E]';
  const assocLabel = ui(choice === 'gl'
    ? 'financeAccountMovementsWizardAssocGl'
    : 'financeAccountMovementsWizardAssocPay');

  // Stage body — split into if/return branches to avoid a nested ternary and to
  // keep the component's cognitive complexity low.
  const renderBody = () => {
    if (stage === 1) {
      return (
        <MovementBasics
          form={form}
          set={set}
          dimensions={dimensions}
          optionsByDim={optionsByDim}
          trxTypes={trxOptions}
          data-testid="MovementBasics__e2e571" />
      );
    }
    if (!choice) {
      return (
        <>
          <div className="mb-4 mt-1">
            <h3 className="m-0 mb-1 text-base font-bold leading-[22px] text-[#121217]">{ui('financeAccountMovementsWizardReconcileQuestion')}</h3>
            <p className="m-0 max-w-[620px] text-[13px] leading-[18px] text-[#6C6C89]">{ui('financeAccountMovementsWizardReconcileHintA')} <b className="font-semibold text-[#121217]">{ui('financeAccountMovementsWizardReconcileOr')}</b> {ui('financeAccountMovementsWizardReconcileHintB')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {CHOICES.map((c) => (
              <ChoiceCard
                key={c.id}
                choice={c}
                active={choice === c.id}
                onClick={() => setChoice(c.id)}
                data-testid="ChoiceCard__e2e571" />
            ))}
          </div>
        </>
      );
    }
    return (
      <>
        {/* Summary line — collapsed choice with a "Cambiar" button */}
        <div className="flex items-center gap-3 rounded-lg border border-[#E8EAEF] bg-[#F5F7F9] px-3.5 py-3">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-md bg-[#121217] text-white">
            <choiceMeta.Icon className="h-4 w-4" />
          </span>
          <span className="flex flex-col gap-px">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A8AA3]">{ui('financeAccountMovementsWizardAssocType')}</span>
            <span className="text-sm font-bold leading-5 text-[#121217]">{ui(choiceMeta.titleKey)}</span>
          </span>
          <button
            type="button"
            onClick={() => setChoice(null)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[#D1D4DB] bg-white px-3 py-[7px] text-[13px] font-semibold text-[#3F3F50] hover:border-[#A9A9BC] hover:bg-[#F5F7F9]"
          >
            <ChevronDown className="h-3.5 w-3.5" data-testid="ChevronDown__e2e571" /> {ui('financeAccountMovementsWizardChange')}
          </button>
        </div>
        <div className="mt-4">
          {choice === 'gl'
            ? <GLItemBlock value={glItem} onChange={setGlItem} data-testid="GLItemBlock__e2e571" />
            : (
              <PaymentForm
                doc={doc}
                initialAmount={movementAmount}
                initialTercero={movementContact}
                paymentMethods={paymentMethods}
                showAccountField={false}
                onChange={(snap) => { paymentSnapshotRef.current = snap; }}
                data-testid="PaymentForm__e2e571" />
            )}
        </div>
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__e2e571">
      <DialogContent
        className="flex w-[1280px] max-w-[96vw] max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8EAEF] bg-white p-0 [&>button]:hidden"
        data-testid="DialogContent__e2e571">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle asChild data-testid="DialogTitle__e2e571">
                <h2 className="m-0 flex items-center gap-2.5 text-lg font-bold leading-6 tracking-[-0.01em] text-[#121217]">
                  {ui('financeAccountMovementsNewTitle')}
                  {stage === 2 && trxLabel ? (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${trxBadgeClass}`}>
                      {trxLabel}
                    </span>
                  ) : null}
                </h2>
              </DialogTitle>
              <DialogDescription asChild data-testid="DialogDescription__e2e571">
                <p className="mt-0.5 text-[13px] leading-[18px] text-[#6C6C89]">
                  {ui('financeAccountMovementsWizardSubtitle', { iso: accountCurrency?.iso || 'EUR' })}
                </p>
              </DialogDescription>
            </div>
            <button type="button" onClick={onClose} className="grid h-[30px] w-[30px] place-items-center rounded-md text-[#6C6C89] hover:bg-[#F5F7F9] hover:text-[#121217]">
              <X className="h-4 w-4" data-testid="X__e2e571" />
            </button>
          </div>
          <Stepper stage={stage} data-testid="Stepper__e2e571" />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">
          {renderBody()}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-[#E8EAEF] px-6 py-4">
          {stage === 1 ? (
            <>
              <span className="mr-auto text-xs leading-4 text-[#6C6C89]">{ui('financeAccountMovementsWizardStep1Footer')}</span>
              <button type="button" className={BTN_GHOST} onClick={onClose}>{ui('financeAccountMovementsNewCancel')}</button>
              <button type="button" className={BTN_PRIMARY} onClick={() => setStage(2)}>{ui('financeAccountMovementsWizardNext')} <ChevronDown
                className="h-[15px] w-[15px] -rotate-90"
                data-testid="ChevronDown__e2e571" /></button>
            </>
          ) : (
            <>
              <span className="mr-auto inline-flex items-center gap-1.5 text-xs leading-4 text-[#6C6C89]">
                <Info className="h-[13px] w-[13px]" data-testid="Info__e2e571" /> {ui('financeAccountMovementsWizardWillCreate')} {choice ? <>{ui('financeAccountMovementsWizardWith')} <span className="font-semibold text-[#121217]">{assocLabel}</span></> : ui('financeAccountMovementsWizardWithoutAssoc')}
              </span>
              <button type="button" className={BTN_GHOST} onClick={() => setStage(1)}>{ui('financeAccountMovementsWizardBack')}</button>
              <button type="button" className={BTN_PRIMARY} disabled={!choice || creating || creatingPayment} onClick={handleCreate}>
                {(creating || creatingPayment) ? ui('financeAccountMovementsNewSaving') : ui('financeAccountMovementsNewConfirm')}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

