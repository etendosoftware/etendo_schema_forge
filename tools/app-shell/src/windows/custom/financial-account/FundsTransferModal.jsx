import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftRight, ArrowRight, Landmark, ChevronDown, Globe,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectorChip } from '@/components/contract-ui/SelectorChip.jsx';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts.js';
import { useFundsTransfer } from '@/hooks/useCreateMovement';
import { useGLItemLookup } from '@/hooks/useMovementLookups';

/** Narrow currency symbol for the amount-input suffix (matches formatCurrency's symbol). */
function currencySymbol(iso) {
  if (!iso) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: iso, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? iso;
  } catch {
    return iso;
  }
}

/** Parses a user-typed amount ("1.234,56" or "1234.56") into a Number, or NaN. */
function parseAmount(raw) {
  if (raw == null || String(raw).trim() === '') return NaN;
  const normalized = String(raw).replace(/\./g, '').replace(',', '.');
  const n = Number(/[.,]/.test(String(raw)) ? normalized : raw);
  return Number.isFinite(n) ? n : Number(raw);
}

/**
 * Normalizes a user-typed conversion rate to a dot-decimal string ("1,0850" → "1.0850",
 * "1.1" → "1.1"). Unlike {@link parseAmount}, the dot is the decimal separator here (a rate
 * never carries a thousands separator), and the string is kept verbatim to preserve precision.
 */
function normalizeRate(raw) {
  return String(raw ?? '').trim().replace(',', '.');
}

/** Keeps only digits and decimal/thousands separators so numeric fields reject letters/symbols. */
function sanitizeNumeric(raw) {
  return String(raw ?? '').replace(/[^\d.,]/g, '');
}

/** Field label — 12/16 semibold, optional red required asterisk. */
function Label({ children, required }) {
  return (
    <label className="flex items-center gap-1 text-xs font-semibold leading-4 text-[#3F3F50]">
      {children}{required ? <span className="text-[#F3164E]">*</span> : null}
    </label>
  );
}

/** Square bank tile (icon). */
function BankTile({ size = 34 }) {
  return (
    <span
      className="flex flex-none items-center justify-center rounded-md bg-[#E8E8ED] text-[#55556D]"
      style={{ width: size, height: size }}
      data-testid="bank-tile"
    >
      <Landmark className="h-[17px] w-[17px]" data-testid="Landmark__tf" />
    </span>
  );
}

function CurrencyBadge({ iso }) {
  if (!iso) return null;
  return (
    <span className="flex-none rounded-full bg-[#E8E8ED] px-[7px] py-0.5 text-[11px] font-semibold leading-[14px] tracking-[0.02em] text-[#3F3F50]">
      {iso}
    </span>
  );
}

/** Field wrapper that doubles as the chip host and the search-input box (border + focus ring). */
const FIELD_WRAPPER_CLS = 'relative flex h-10 w-full items-center gap-1 rounded-md border border-[#D1D1DB] bg-white px-2 shadow-[0px_1px_2px_rgba(18,18,23,0.05)] focus-within:border-[#121217] focus-within:ring-[3px] focus-within:ring-black/[0.08]';
/** Borderless input used inside FIELD_WRAPPER_CLS. */
const FIELD_INPUT_CLS = 'h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-[#A9A9BC]';

/**
 * Floating list panel rendered inline (NOT portaled) so it scrolls with wheel/touchpad inside the
 * RemoveScroll-locked Dialog (a portaled popover would block wheel events outside the modal).
 */
const DROPDOWN_PANEL_CLS = 'absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-auto rounded-xl border border-[#E8E8ED] bg-white p-1.5 shadow-lg';

/** Closes the dropdown when a pointer-down lands outside the given ref. */
function useCloseOnOutside(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, open, close]);
}

/**
 * Destination account dropdown — searchable, with the rules-modal chip selector: once chosen, the
 * account shows as a removable chip ("name · currency") inside the field; clicking the chip returns
 * to typing mode and the × clears it. Inline (not portaled) so the list scrolls with wheel/touchpad
 * inside the RemoveScroll-locked Dialog.
 */
function AccountSelect({ accounts, value, onChange, placeholder }) {
  const ui = useUI();
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const sel = accounts.find((a) => a.id === value) || null;
  const showChip = !!sel && !editing;
  const close = () => { setOpen(false); setEditing(false); setQuery(''); };
  useCloseOnOutside(ref, open, close);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const startEditing = () => { setEditing(true); setOpen(true); setQuery(''); };
  const q = query.trim().toLowerCase();
  const filtered = q
    ? accounts.filter((a) => (a.name || '').toLowerCase().includes(q)
        || (a.iban || '').toLowerCase().includes(q))
    : accounts;
  return (
    <div className="relative" ref={ref}>
      <div className={FIELD_WRAPPER_CLS} onClick={showChip ? startEditing : undefined}>
        {showChip ? (
          <SelectorChip
            label={`${sel.name} · ${sel.currencyIso}`}
            onClick={startEditing}
            onClear={() => { onChange(''); close(); }}
            clearAriaLabel={ui('clear')}
            testId="transfer-dest-chip"
            data-testid="SelectorChip__7ff08b" />
        ) : (
          <input
            ref={inputRef}
            className={FIELD_INPUT_CLS}
            value={query}
            placeholder={placeholder}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            data-testid="transfer-dest-search" />
        )}
        <ChevronDown className="ml-auto h-4 w-4 flex-none text-[#6E6E80]" data-testid="ChevronDown__tf-dest" />
      </div>
      {open ? (
        <div className={DROPDOWN_PANEL_CLS} data-testid="transfer-dest-popover">
          {filtered.length === 0 ? (
            <div className="px-2.5 py-3 text-sm text-[#A9A9BC]">—</div>
          ) : null}
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onChange(a.id); close(); }}
              data-testid={`transfer-dest-option-${a.id}`}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-[#F7F7F8] ${a.id === value ? 'bg-[#F7F7F8]' : ''}`}
            >
              <BankTile size={34} data-testid="BankTile__7ff08b" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium leading-[18px] text-[#121217]">{a.name}</span>
                <span className="truncate text-xs leading-4 tabular-nums text-[#6E6E80]">
                  {a.iban || a.maskedPan || ''}
                </span>
              </span>
              <CurrencyBadge iso={a.currencyIso} data-testid="CurrencyBadge__7ff08b" />
              <span className="ml-auto text-[13px] font-medium leading-4 tabular-nums text-[#3F3F50]">
                {formatCurrency(a.currencyIso, a.currentBalance)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Accounting-item (GL) dropdown — searchable, with the same chip selector as {@link AccountSelect}
 * (chosen item shows as a removable chip). Required, so the list has no "none" option.
 */
function GlSelect({ value, onChange, placeholder }) {
  const ui = useUI();
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const { results } = useGLItemLookup(query);
  const showChip = !!value && !editing;
  const close = () => { setOpen(false); setEditing(false); setQuery(''); };
  useCloseOnOutside(ref, open, close);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const startEditing = () => { setEditing(true); setOpen(true); setQuery(''); };
  return (
    <div className="relative" ref={ref}>
      <div className={FIELD_WRAPPER_CLS} onClick={showChip ? startEditing : undefined}>
        {showChip ? (
          <SelectorChip
            label={value.name}
            onClick={startEditing}
            onClear={() => { onChange(null); close(); }}
            clearAriaLabel={ui('clear')}
            testId="transfer-gl-chip"
            data-testid="SelectorChip__7ff08b" />
        ) : (
          <input
            ref={inputRef}
            className={FIELD_INPUT_CLS}
            value={query}
            placeholder={placeholder}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            data-testid="transfer-gl-search" />
        )}
        <ChevronDown className="ml-auto h-4 w-4 flex-none text-[#6E6E80]" data-testid="ChevronDown__tf-gl" />
      </div>
      {open ? (
        <div className={DROPDOWN_PANEL_CLS} data-testid="transfer-gl-popover">
          {results.length === 0 ? (
            <div className="px-2.5 py-3 text-sm text-[#A9A9BC]">—</div>
          ) : null}
          {results.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => { onChange(g); close(); }}
              data-testid={`transfer-gl-option-${g.id}`}
              className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm text-[#121217] hover:bg-[#F7F7F8] ${value?.id === g.id ? 'bg-[#F7F7F8]' : ''}`}
            >
              {g.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Amount input with a trailing currency suffix (right-aligned, tabular). */
function AmountField({ value, onChange, currencyIso, testId }) {
  const ui = useUI();
  return (
    <div className="relative">
      <input
        className="h-10 w-full rounded-md border border-[#D1D1DB] bg-white pr-9 pl-3 text-right text-sm leading-5 tabular-nums text-[#121217] placeholder:text-[#A9A9BC] focus:outline-none focus:border-[#121217] focus:ring-[3px] focus:ring-black/[0.08]"
        placeholder={ui('financeAccountTransferAmountPlaceholder')}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(sanitizeNumeric(e.target.value))}
        data-testid={testId}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-[#A9A9BC]">
        {currencySymbol(currencyIso)}
      </span>
    </div>
  );
}

/**
 * Funds Transfer between financial accounts (ETP-4272) — single-step modal.
 * Design: Option A (source → destination flow). Recreated from the design handoff with the
 * codebase primitives (Dialog) and the existing finance hooks. The source account is
 * pre-filled (read-only) with its available balance; on confirm the backend delegates to Etendo
 * Classic, creating the paired withdrawal/deposit (+ optional bank fees) left Pending.
 *
 * Mounted == open: the parent renders it only while the transfer is active and unmounts on close.
 *
 * @param {{ sourceAccountId: string, onClose: () => void, onSuccess?: () => void }} props
 */
export function FundsTransferModal({ sourceAccountId, onClose, onSuccess }) {
  const ui = useUI();
  const { accounts } = useFinancialAccounts();
  const { transfer, transferring } = useFundsTransfer();

  const [destId, setDestId] = useState('');
  const [amount, setAmount] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [glItem, setGlItem] = useState(null);
  const [bankFee, setBankFee] = useState(false);
  const [feeFrom, setFeeFrom] = useState('');
  const [feeTo, setFeeTo] = useState('');
  const [description, setDescription] = useState(() => ui('financeAccountTransferDescriptionDefault'));
  const [error, setError] = useState(null);

  const source = useMemo(
    () => accounts.find((a) => a.id === sourceAccountId) ?? null,
    [accounts, sourceAccountId],
  );
  const destAccounts = useMemo(
    () => accounts.filter((a) => a.id !== sourceAccountId && a.active !== false),
    [accounts, sourceAccountId],
  );
  const dest = useMemo(() => accounts.find((a) => a.id === destId) ?? null, [accounts, destId]);
  const multiCurrency = !!(source && dest && dest.currencyIso !== source.currencyIso);

  const amountNum = parseAmount(amount);
  // Available balance is shown for context only — Classic allows transferring more than the
  // source balance (it never blocks on balance), so we deliberately do not gate on it.
  const available = Number(source?.currentBalance ?? 0);
  const rateNum = Number(normalizeRate(conversionRate));
  const canSubmit = !!destId
    && !!glItem
    && Number.isFinite(amountNum) && amountNum > 0
    && (!multiCurrency || (Number.isFinite(rateNum) && rateNum > 0))
    && !transferring;

  const handleConfirm = async () => {
    setError(null);
    if (destId === sourceAccountId) {
      setError(ui('financeAccountTransferErrorSameAccount'));
      return;
    }
    const payload = {
      sourceAccountId,
      destinationAccountId: destId,
      amount: String(amountNum),
      description,
      bankFee,
    };
    if (glItem?.id) payload.glItemId = glItem.id;
    if (multiCurrency) payload.conversionRate = normalizeRate(conversionRate);
    if (bankFee) {
      payload.bankFeeFrom = String(parseAmount(feeFrom) || 0);
      payload.bankFeeTo = String(parseAmount(feeTo) || 0);
    }
    try {
      await transfer(payload);
      toast.success(ui('financeAccountTransferSuccess'));
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || ui('financeAccountTransferError'));
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose?.(); }} data-testid="Dialog__transfer">
      <DialogContent
        className="max-w-[600px] gap-0 overflow-hidden border-[#E8E8ED] bg-white p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="funds-transfer-modal"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pb-3.5 pt-[22px]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-[#121217] text-white">
              <ArrowLeftRight className="h-[18px] w-[18px]" data-testid="ArrowLeftRight__tf-head" />
            </span>
            <div>
              <h2 className="text-[18px] font-bold leading-6 tracking-[-0.01em] text-[#121217]">
                {ui('financeAccountTransferTitle')}
              </h2>
              <p className="mt-0.5 text-[13px] leading-[18px] text-[#6E6E80]">
                {ui('financeAccountTransferSubtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 pb-2 pt-1.5">
          {/* Source → destination flow */}
          <div className="flex flex-col">
            <div className="flex items-center gap-3 rounded-xl border border-[#E8E8ED] bg-[#F7F7F8] px-4 py-3.5">
              <BankTile size={34} data-testid="BankTile__7ff08b" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase leading-[14px] tracking-[0.06em] text-[#A9A9BC]">
                  {ui('financeAccountTransferSourceRole')}
                </span>
                <span className="flex items-center gap-2 text-sm font-semibold leading-5 text-[#121217]">
                  {source?.name ?? ''}<CurrencyBadge iso={source?.currencyIso} data-testid="CurrencyBadge__7ff08b" />
                </span>
                <span className="text-xs leading-4 tabular-nums text-[#6E6E80]">
                  {source?.iban || source?.maskedPan || ''}
                </span>
              </div>
              <div className="flex-none text-right">
                <div className="text-[11px] leading-[14px] text-[#A9A9BC]">
                  {ui('financeAccountTransferAvailable')}
                </div>
                <div className="text-[15px] font-semibold leading-5 tabular-nums text-[#121217]" data-testid="transfer-available">
                  {formatCurrency(source?.currencyIso, available)}
                </div>
              </div>
            </div>

            {/* connector */}
            <div className="ml-[33px] my-0.5 flex h-[18px] items-center">
              <span className="h-full w-0.5 rounded-sm bg-[#D1D1DB]" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label required data-testid="Label__7ff08b">{ui('financeAccountTransferDestination')}</Label>
              <AccountSelect
                accounts={destAccounts}
                value={destId}
                onChange={setDestId}
                placeholder={ui('financeAccountTransferAccountSearch')}
                data-testid="AccountSelect__7ff08b" />
            </div>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <Label required data-testid="Label__7ff08b">{ui('financeAccountTransferAmount')}</Label>
            <AmountField
              value={amount}
              onChange={setAmount}
              currencyIso={source?.currencyIso}
              testId="transfer-amount"
              data-testid="AmountField__7ff08b" />
          </div>

          {/* Currency conversion (multi-currency only) */}
          {multiCurrency ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[#D1D1DB] bg-[#F7F7F8] px-4 py-3.5" data-testid="transfer-fx-block">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold leading-4 text-[#121217]">
                  <Globe className="h-3.5 w-3.5" data-testid="Globe__tf" />
                  {ui('financeAccountTransferFx')}
                </div>
                <div className="flex items-center gap-2 text-[13px] font-semibold leading-[18px] text-[#121217]">
                  <CurrencyBadge iso={source?.currencyIso} data-testid="CurrencyBadge__7ff08b" />
                  <ArrowRight className="h-[15px] w-[15px] text-[#A9A9BC]" data-testid="ArrowRight__tf" />
                  <CurrencyBadge iso={dest?.currencyIso} data-testid="CurrencyBadge__7ff08b" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label required data-testid="Label__7ff08b">{ui('financeAccountTransferRate')}</Label>
                <input
                  className="h-10 w-full rounded-md border border-[#D1D1DB] bg-white px-3 text-right text-sm leading-5 tabular-nums text-[#121217] placeholder:text-[#A9A9BC] focus:outline-none focus:border-[#121217] focus:ring-[3px] focus:ring-black/[0.08]"
                  placeholder={ui('financeAccountTransferRatePlaceholder')}
                  inputMode="decimal"
                  value={conversionRate}
                  onChange={(e) => setConversionRate(sanitizeNumeric(e.target.value))}
                  data-testid="transfer-rate" />
              </div>
            </div>
          ) : null}

          {/* Accounting item (GL) — required */}
          <div className="flex flex-col gap-1.5">
            <Label required data-testid="Label__7ff08b">{ui('financeAccountTransferGlItem')}</Label>
            <GlSelect
              value={glItem}
              onChange={setGlItem}
              placeholder={ui('financeAccountTransferGlItemPlaceholder')}
              data-testid="GlSelect__7ff08b" />
          </div>

          <div className="h-px bg-[#E8E8ED]" />

          {/* Bank fee — shared Checkbox primitive */}
          <div className="flex items-center gap-2.5">
            <Checkbox
              checked={bankFee}
              onChange={() => setBankFee((v) => !v)}
              data-testid="checkbox-transfer-bankfee" />
            <button
              type="button"
              onClick={() => setBankFee((v) => !v)}
              className="text-sm font-medium leading-5 text-[#121217]"
            >
              {ui('financeAccountTransferBankFee')}
            </button>
          </div>

          {bankFee ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label data-testid="Label__7ff08b">{ui('financeAccountTransferBankFeeFrom')}</Label>
                <AmountField
                  value={feeFrom}
                  onChange={setFeeFrom}
                  currencyIso={source?.currencyIso}
                  testId="transfer-bankfee-from"
                  data-testid="AmountField__7ff08b" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label data-testid="Label__7ff08b">{ui('financeAccountTransferBankFeeTo')}</Label>
                <AmountField
                  value={feeTo}
                  onChange={setFeeTo}
                  currencyIso={dest?.currencyIso || source?.currencyIso}
                  testId="transfer-bankfee-to"
                  data-testid="AmountField__7ff08b" />
              </div>
            </div>
          ) : null}

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label data-testid="Label__7ff08b">{ui('financeAccountTransferDescription')}</Label>
            <input
              className="h-10 w-full rounded-md border border-[#D1D1DB] bg-white px-3 text-sm leading-5 text-[#121217] focus:outline-none focus:border-[#121217] focus:ring-[3px] focus:ring-black/[0.08]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="transfer-description" />
          </div>

          {error ? (
            <p className="text-sm text-[#D50B3E]" data-testid="transfer-error">{error}</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-end gap-2.5 border-t border-[#E8E8ED] px-6 pb-5 pt-4">
          <button
            type="button"
            onClick={() => onClose?.()}
            data-testid="transfer-cancel"
            className="inline-flex h-10 items-center rounded-md border border-[#D1D1DB] bg-white px-[18px] text-sm font-semibold text-[#3F3F50] hover:bg-[#F7F7F8] hover:border-[#A9A9BC]"
          >
            {ui('financeAccountTransferCancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            data-testid="transfer-confirm"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#121217] px-[18px] text-sm font-semibold text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:cursor-not-allowed disabled:bg-[#D1D1DB] disabled:text-[#8A8AA3] disabled:hover:bg-[#D1D1DB] disabled:hover:text-[#8A8AA3]"
          >
            <ArrowLeftRight className="h-4 w-4" data-testid="ArrowLeftRight__tf-confirm" />
            {ui('financeAccountTransferConfirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
