import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Check, ChevronDown, FileText, Layers, Trash2 } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DateField } from '@/components/ui/date-field';
import { cn } from '@/lib/utils';
import { useCreateStatement } from '@/hooks/useCreateStatement';
import { useStatementActions } from '@/hooks/useStatementActions';
import { useBankStatementLines } from '@/hooks/useBankStatementLines';
import { useBPartnerLookup, useGLItemLookup } from '@/hooks/useMovementLookups';
import { AddLineButton } from '@/components/ui/add-line-button';
import { LookupPicker } from './LookupPicker';
import { FieldRow, inputClass, textareaClass } from './formFields';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Amounts (out / in) default to "0,00" so the required amount fields already
// carry a value — a new line then only needs a Reference No to be complete.
let lineSeq = 0;
const newLine = () => {
  lineSeq += 1;
  return {
    id: `l${lineSeq}`,
    // Pre-fill the line date with today; it is excluded from the blank-line check
    // so a row with only the default date still counts as empty.
    date: toLocalIso(new Date()), reference: '', description: '', contactName: '', contact: null, glItem: null,
    // Empty so the amount fields show "0,00" as a placeholder (not a real value
    // the user must clear). parseAmount('') → 0; a line needs at least one amount.
    out: '', in: '',
  };
};

/** Browser-native date input yields `YYYY-MM-DD`. */
function toLocalIso(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Sends UTC midnight so the backend parses the same calendar day regardless of TZ. */
function toIsoUtc(localDate) {
  return localDate ? `${localDate}T00:00:00Z` : '';
}

/** "2026-06-07T00:00:00Z" (or any ISO) → local "YYYY-MM-DD". Blank-safe. */
function isoToLocal(iso) {
  if (!iso) return '';
  return String(iso).split('T')[0];
}

/**
 * Maps a backend statement line (from `?action=lines`) into the editable row
 * shape used by the grid. The committed FK pickers need a `{ id, name }`; the
 * line carries both the id and the joined name (bpartnerFkName / glItemName).
 */
function lineToRow(l) {
  lineSeq += 1;
  return {
    id: `e${lineSeq}`,
    date: isoToLocal(l.date) || toLocalIso(new Date()),
    reference: l.reference && l.reference !== '**' ? l.reference : '',
    description: l.description || '',
    contactName: l.bpartnerName || '',
    contact: l.bpartnerId ? { id: l.bpartnerId, name: l.bpartnerFkName || l.bpartnerName || '' } : null,
    glItem: l.glItemId ? { id: l.glItemId, name: l.glItemName || '' } : null,
    // Show the zero side as empty (placeholder) — a statement line is an inflow
    // OR an outflow, so the unused side reads "0,00" as a hint, not a real 0.
    out: l.out ? String(l.out) : '',
    in: l.in ? String(l.in) : '',
  };
}

/**
 * Parses a user-typed amount that may use either `,` or `.` as decimal
 * separator (Spanish operators type `3.500,00`). When both are present the
 * rightmost is treated as the decimal separator — same rule the backend CSV
 * importer applies. Returns a finite Number (0 on blank/invalid).
 */
function parseAmount(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function isBlankLine(r) {
  // The auto-filled date is ignored: a row with only the default date is empty.
  return !r.reference.trim() && !r.description.trim() && !r.contactName.trim() && !r.contact && !r.glItem
    && parseAmount(r.in) === 0 && parseAmount(r.out) === 0;
}

/**
 * A line is "complete" (committable / saveable) when it has its transaction date,
 * a Reference No, and at least one amount entered (a statement line is an inflow
 * OR an outflow, so the other side is left empty = 0). The contact / G/L item are
 * optional. Empty amount fields count as 0.
 */
function isLineComplete(r) {
  return !!r.date
    && r.reference.trim() !== ''
    && (parseAmount(r.out) > 0 || parseAmount(r.in) > 0);
}

function computeTotals(rows) {
  let tin = 0;
  let tout = 0;
  let n = 0;
  rows.forEach((r) => {
    if (isBlankLine(r)) return;
    tin += parseAmount(r.in);
    tout += parseAmount(r.out);
    n += 1;
  });
  return { tin, tout, bal: tin - tout, n };
}

/** Narrow currency symbol (e.g. "€") for the amount-input suffix. */
function currencySymbol(iso) {
  if (!iso) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: iso, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency')?.value ?? iso;
  } catch {
    return iso;
  }
}

function makeMoneyFormatter(currency, bcpLocale) {
  return (amount) => {
    try {
      return new Intl.NumberFormat(bcpLocale, {
        style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(Number(amount) || 0);
    } catch {
      return `${(Number(amount) || 0).toFixed(2)} ${currency}`;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Header fields
// ─────────────────────────────────────────────────────────────────────────────

function HeaderFields({ form, setForm, ui }) {
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <FieldRow
          label={ui('financeAccountStatementsManualName')}
          required
          data-testid="FieldRow__6b4086">
          <input
            type="text" value={form.name} onChange={set('name')}
            placeholder={ui('financeAccountStatementsManualNamePlaceholder')}
            data-testid="manual-statement-name" className={inputClass}
          />
        </FieldRow>
        <FieldRow
          label={ui('financeAccountStatementsManualTrxDate')}
          required
          data-testid="FieldRow__6b4086">
          <DateField
            value={form.transactionDate}
            onChange={(iso) => setForm((f) => ({ ...f, transactionDate: iso }))}
            data-testid="manual-statement-trxdate"
          />
        </FieldRow>
        <FieldRow
          label={ui('financeAccountStatementsManualImportDate')}
          required
          data-testid="FieldRow__6b4086">
          <DateField
            value={form.importDate}
            onChange={(iso) => setForm((f) => ({ ...f, importDate: iso }))}
            data-testid="manual-statement-importdate"
          />
        </FieldRow>
        <FieldRow
          label={ui('financeAccountStatementsManualFileName')}
          optional={ui('financeAccountStatementsManualOptional')}
          data-testid="FieldRow__6b4086">
          <input type="text" value={form.fileName} onChange={set('fileName')}
            placeholder={ui('financeAccountStatementsManualFileNamePlaceholder')}
            data-testid="manual-statement-filename" className={inputClass} />
        </FieldRow>
      </div>
      <FieldRow
        label={ui('financeAccountStatementsManualNotes')}
        data-testid="FieldRow__6b4086">
        <textarea value={form.notes} onChange={set('notes')} rows={2}
          placeholder={ui('financeAccountStatementsManualNotesPlaceholder')}
          data-testid="manual-statement-notes" className={textareaClass} />
      </FieldRow>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editable line card
// ─────────────────────────────────────────────────────────────────────────────

// One CSS grid track set shared by the header, the read-only display rows and
// the editable row so every column lines up. `fr` units let the row fill the
// modal width without a horizontal scrollbar (which would clip lookup dropdowns).
const LINES_GRID =
  'grid grid-cols-[140px_minmax(120px,0.8fr)_minmax(140px,1.5fr)_minmax(130px,1.1fr)_minmax(140px,1.2fr)_minmax(140px,1.2fr)_100px_100px_40px] gap-2';

// Inline cell inputs: borderless until focused (spreadsheet feel), so the
// editable row reads as plain text cells matching the read-only rows.
const cellInput =
  'h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-[#121217] placeholder:text-[#A8AAB8] focus:border-[#D1D4DB] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#121217]/15';
const cellAmount = cn(cellInput, 'text-right tabular-nums');

// Column header styled like the invoices table in the New movement modal:
// normal case (no uppercase), small semibold dark labels on a white row with a
// bottom border.
/** A column header label with an optional red required asterisk. */
function ColHead({ label, required, className }) {
  return (
    <span className={cn('truncate whitespace-nowrap', className)}>
      {label}{required ? <span className="text-[#9A1B1B]"> *</span> : null}
    </span>
  );
}

function LinesHeader({ ui }) {
  return (
    <div className={cn(LINES_GRID, 'items-center border-b border-[#E8EAEF] bg-white px-6 py-2.5 text-xs font-semibold tracking-normal text-[#121217]')}>
      <ColHead
        label={ui('financeAccountStatementsManualColDate')}
        required
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColReference')}
        required
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColDesc')}
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColContactName')}
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColContact')}
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColGlItem')}
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColOut')}
        required
        data-testid="ColHead__6b4086" />
      <ColHead
        label={ui('financeAccountStatementsManualColIn')}
        required
        data-testid="ColHead__6b4086" />
      <span />
    </div>
  );
}

/** A statement line — always inline-editable, cell by cell (no edit/display toggle). */
function EditRow({ row, onChange, onRemove, ui, currencySym }) {
  const set = (field) => (e) => onChange(row.id, field, e.target.value);
  const setVal = (field) => (value) => onChange(row.id, field, value);
  const amountCell = (field, testId) => (
    <div className="relative">
      <input
        type="text" inputMode="decimal" value={row[field]} onChange={set(field)}
        placeholder={ui('financeAccountAmountPlaceholder')}
        className={cn(cellAmount, 'pr-7')} data-testid={testId} />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#A8AAB8]">
        {currencySym}
      </span>
    </div>
  );
  return (
    <div className={cn(LINES_GRID, 'group items-center bg-white px-6 py-1.5 hover:bg-[#FAFBFC]')} data-testid="manual-line-editrow">
      <DateField value={row.date} onChange={setVal('date')} data-testid="manual-line-date" className="w-full" />
      <input type="text" value={row.reference} onChange={set('reference')} className={cellInput} data-testid="manual-line-ref" />
      <input type="text" value={row.description} onChange={set('description')}
        placeholder={ui('financeAccountStatementsManualDescPlaceholder')}
        className={cellInput} data-testid="manual-line-description" />
      <input type="text" value={row.contactName} onChange={set('contactName')}
        placeholder={ui('financeAccountStatementsManualCounterpartyPlaceholder')}
        className={cellInput} data-testid="manual-line-contactname" />
      <LookupPicker
        value={row.contact}
        onSelect={(it) => setVal('contact')(it)}
        onClear={() => setVal('contact')(null)}
        placeholder={ui('financeAccountStatementsManualContactPlaceholder')}
        useLookup={useBPartnerLookup}
        dataTestId="manual-line-contact"
        className={cellInput}
        search
        data-testid="LookupPicker__6b4086" />
      <LookupPicker
        value={row.glItem}
        onSelect={(it) => setVal('glItem')(it)}
        onClear={() => setVal('glItem')(null)}
        placeholder={ui('financeAccountStatementsManualGlItemPlaceholder')}
        useLookup={useGLItemLookup}
        dataTestId="manual-line-glitem"
        className={cellInput}
        search
        data-testid="LookupPicker__6b4086" />
      {amountCell('out', 'manual-line-out')}
      {amountCell('in', 'manual-line-in')}
      <span className="flex items-center justify-end">
        <button type="button" onClick={() => onRemove(row.id)}
          aria-label={ui('financeAccountStatementsManualRemoveLine')} data-testid="manual-line-remove"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#D50B3E] opacity-0 transition-opacity hover:bg-[#FEF0F4] focus:opacity-100 group-hover:opacity-100">
          <Trash2 className="h-4 w-4" data-testid="Trash2__6b4086" />
        </button>
      </span>
    </div>
  );
}

// Inline hint shown under the row whose cell is being edited.
function LineEditHint({ ui }) {
  return (
    <div className="flex items-center justify-center gap-4 px-6 pb-2 text-xs text-[#6C6C89]">
      <span className="inline-flex items-center gap-1.5">
        <kbd className="rounded border border-[#D1D4DB] bg-[#F5F7F9] px-1.5 py-0.5 text-[11px] leading-none text-[#3F3F50]">↵</kbd>
        {ui('financeAccountStatementsManualLineHintSave')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <kbd className="rounded border border-[#D1D4DB] bg-[#F5F7F9] px-1.5 py-0.5 text-[11px] leading-none text-[#3F3F50]">
          {ui('financeAccountStatementsManualKeyEsc')}
        </kbd>
        {ui('financeAccountStatementsManualLineHintCancel')}
      </span>
    </div>
  );
}

function EditableLines({ rows, setRows, ui, currencySym }) {
  // The row whose cell currently has focus — drives the inline keyboard hint.
  const [focusedId, setFocusedId] = useState(null);

  const change = (id, field, value) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const remove = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  // Every row is directly editable, so adding a line is just appending a blank one.
  const add = () => setRows((rs) => [...rs, newLine()]);

  // Full-bleed table (extends to the modal padding edges so the header / row
  // separators span the full width, per the design). Rows are always editable
  // cell by cell — no edit/display toggle.
  return (
    <div className="-mx-6">
      <LinesHeader ui={ui} data-testid="LinesHeader__6b4086" />
      <div className="divide-y divide-[#E8EAEF]">
        {rows.map((r) => (
          <div
            key={r.id}
            onFocusCapture={() => setFocusedId(r.id)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setFocusedId((cur) => (cur === r.id ? null : cur));
              }
            }}
            onKeyDown={(e) => {
              // Enter commits the cell (blur / move focus) — it must NOT bubble
              // up and trigger "Guardar y procesar". Escape just exits the cell.
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                e.target.blur?.();
              } else if (e.key === 'Escape') {
                e.target.blur?.();
              }
            }}
          >
            <EditRow
              row={r}
              onChange={change}
              onRemove={remove}
              ui={ui}
              currencySym={currencySym}
              data-testid="EditRow__6b4086" />
            {focusedId === r.id ? <LineEditHint ui={ui} data-testid="LineEditHint__6b4086" /> : null}
          </div>
        ))}
      </div>
      <div className="border-t border-[#E8EAEF] px-6 py-2">
        <AddLineButton
          onClick={add}
          label={ui('financeAccountStatementsManualAddLine')}
          hideChevron
          data-testid="AddLineButton__6b4086" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals bar
// ─────────────────────────────────────────────────────────────────────────────

// Top summary strip: Líneas / Entradas / Salidas / Saldo in a bordered widget.
function StatementSummaryWidget({ rows, money, ui }) {
  const t = computeTotals(rows);
  return (
    <div className="flex items-center gap-5 rounded-lg border border-[#E8EAEF] px-3 py-2">
      <SummaryKpi
        label={ui('financeAccountStatementsManualTotalLines')}
        value={t.n}
        data-testid="SummaryKpi__6b4086" />
      <SummaryKpi
        label={ui('financeAccountStatementsManualTotalIn')}
        value={`+${money(t.tin)}`}
        valueClass="text-[#17663A]"
        data-testid="SummaryKpi__6b4086" />
      <SummaryKpi
        label={ui('financeAccountStatementsManualTotalOut')}
        value={`−${money(t.tout)}`}
        valueClass="text-[#AF0932]"
        data-testid="SummaryKpi__6b4086" />
      <SummaryKpi
        label={ui('financeAccountStatementsManualTotalBalance')}
        value={money(t.bal)}
        data-testid="SummaryKpi__6b4086" />
    </div>
  );
}

function SummaryKpi({ label, value, valueClass = 'text-[#121217]' }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="text-xs leading-4 text-[#3F3F50]">{label}</span>
      <span className={cn('truncate text-base font-medium leading-6 tabular-nums', valueClass)}>
        {value}
      </span>
    </div>
  );
}

// Single active "Líneas" tab with a count badge, sitting on a bottom border.
function LinesTab({ count, ui }) {
  return (
    <div className="-mx-6 flex items-center border-b border-[#E8EAEF] px-6">
      <div className="-mb-px flex items-center gap-1.5 border-b-2 border-[#121217] pb-3 pr-3 pt-2">
        <Layers className="h-4 w-4 text-[#121217]" data-testid="Layers__6b4086" />
        <span className="text-sm font-medium text-[#121217]">
          {ui('financeAccountStatementsManualSectionLines')}
        </span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F5F7F9] px-1.5 text-[11px] text-[#3F3F50]">
          {count}
        </span>
      </div>
    </div>
  );
}

/**
 * Split save button: the primary action saves + processes the statement; the ▾
 * menu offers "save as draft" (persist without processing). The menu is
 * portalled below the button so it isn't clipped by the dialog's overflow, with
 * `pointerEvents:auto` so it stays clickable inside the Radix modal.
 */
function SaveSplitButton({ creating, onProcess, onDraft, ui }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const el = wrapRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 256) });
      }
    };
    update();
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const btnBase = 'inline-flex h-10 items-center bg-[#121217] text-white transition-colors hover:bg-[#FFD500] hover:text-[#121217] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div ref={wrapRef} className="relative flex items-stretch">
      <button
        type="button"
        onClick={onProcess}
        disabled={creating}
        data-testid="manual-statement-save"
        className={cn(btnBase, 'gap-1.5 rounded-l-lg px-3 text-sm font-medium')}
      >
        <Check className="h-4 w-4" data-testid="Check__6b4086" />
        {creating ? ui('financeAccountStatementsManualSaving') : ui('financeAccountStatementsManualSaveProcess')}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={creating}
        aria-label={ui('financeAccountStatementsManualSaveMore')}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="manual-statement-save-split"
        className={cn(btnBase, 'w-9 justify-center rounded-r-lg border-l border-white/20')}
      >
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          data-testid="ChevronDown__6b4086" />
      </button>
      {open && pos ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 256, zIndex: 9999, pointerEvents: 'auto' }}
          className="overflow-hidden rounded-lg border border-[#E8EAEF] bg-white shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="manual-statement-save-draft"
            onClick={() => { setOpen(false); onDraft(); }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#F5F7F9]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F0F2F5] text-[#121217]">
              <FileText className="h-4 w-4" data-testid="FileText__6b4086" />
            </span>
            <span className="text-sm font-semibold text-[#121217]">
              {ui('financeAccountStatementsManualSaveDraft')}
            </span>
          </button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────────────────────

const initialForm = (today) => ({ name: '', transactionDate: today, importDate: today, fileName: '', notes: '' });

/**
 * "Crear extracto" — modal to create a bank statement by hand (header + lines)
 * without a file. Mirrors the Classic manual bank-statement form (header: name,
 * dates, file name, notes; lines: date, reference, counterparty name + FK, G/L
 * item, amounts, description) and reuses the same field primitives as the Create
 * movement modal. On save it POSTs to `bank-statements?action=create` which
 * persists the statement + lines and processes it so the lines become
 * available for reconciliation.
 *
 * @param {{
 *   open: boolean;
 *   accountId: string;
 *   accountCurrency?: string;
 *   onClose: () => void;
 *   onSuccess: () => void;
 * }} props
 */
export function ManualStatementModal({
  open, accountId, accountCurrency = 'EUR', statement = null, onClose, onSuccess,
}) {
  const ui = useUI();
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');
  const money = useMemo(() => makeMoneyFormatter(accountCurrency, bcpLocale), [accountCurrency, bcpLocale]);
  const currencySym = useMemo(() => currencySymbol(accountCurrency), [accountCurrency]);

  const editing = !!statement;
  const { createStatement, creating } = useCreateStatement();
  const { updateStatement, busy } = useStatementActions();
  // Only fetch lines while editing an open draft.
  const { lines: loadedLines, loading: linesLoading } =
    useBankStatementLines(editing && open ? statement.id : null);
  const saving = creating || busy;

  const today = useMemo(() => toLocalIso(new Date()), []);
  const [form, setForm] = useState(() => initialForm(today));
  const [rows, setRows] = useState(() => []);
  // Tracks whether the user has touched anything since opening (drives the
  // discard-changes prompt) and whether that prompt is currently shown.
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Guards single hydration per open so user edits aren't clobbered on re-render.
  const hydratedRef = useRef(false);

  // setForm/setRows variants that flag the form as dirty. Hydration/reset use the
  // raw setters so seeding the modal never counts as a user edit.
  const setFormDirty = (updater) => { setDirty(true); setForm(updater); };
  const setRowsDirty = (updater) => { setDirty(true); setRows(updater); };

  // Reset everything when the modal closes. Deps are stable (open/today) so this
  // never re-runs on every render — keeping `loadedLines` out avoids an update loop
  // (the lines hook returns a fresh [] each render when there's no data).
  useEffect(() => {
    if (open) return;
    hydratedRef.current = false;
    setForm(initialForm(today));
    setRows([]);
    setDirty(false);
    setConfirmClose(false);
  }, [open, today]);

  // Hydrate once per open. In edit mode, seed the header + lines from the draft
  // (after they load). The hydratedRef guard makes re-runs (e.g. loadedLines
  // getting a new reference) a no-op, so there's no render loop.
  useEffect(() => {
    if (!open || hydratedRef.current) return;
    if (editing) {
      if (linesLoading) return;
      setForm({
        name: statement.name || '',
        transactionDate: isoToLocal(statement.transactionDate) || today,
        importDate: isoToLocal(statement.importDate) || today,
        fileName: statement.fileName || '',
        notes: statement.notes || '',
      });
      setRows(loadedLines.map(lineToRow));
    } else {
      // Create mode: start with one editable starter row.
      setRows([newLine()]);
    }
    hydratedRef.current = true;
  }, [open, editing, linesLoading, loadedLines, statement, today]);

  const handleSave = async (process) => {
    if (!form.name.trim()) {
      toast.error(ui('financeAccountStatementsManualErrorName'));
      return;
    }
    const usable = rows.filter((r) => !isBlankLine(r));
    if (usable.length === 0) {
      toast.error(ui('financeAccountStatementsManualErrorLines'));
      return;
    }
    // Every non-blank line must have its required fields (date, Reference No,
    // both amounts) — an incomplete line cannot be saved.
    if (usable.some((r) => !isLineComplete(r))) {
      toast.error(ui('financeAccountStatementsManualErrorIncompleteLine'));
      return;
    }
    const payloadLines = usable.map((r) => ({
      date: toIsoUtc(r.date),
      reference: r.reference.trim(),
      description: r.description.trim(),
      bpartnerName: r.contactName.trim(),
      bpartnerId: r.contact?.id ?? null,
      glItemId: r.glItem?.id ?? null,
      in: parseAmount(r.in),
      out: parseAmount(r.out),
    }));
    const header = {
      name: form.name.trim(),
      transactionDate: toIsoUtc(form.transactionDate),
      importDate: toIsoUtc(form.importDate),
      fileName: form.fileName.trim(),
      notes: form.notes.trim(),
      process,
      lines: payloadLines,
    };
    try {
      if (editing) {
        await updateStatement({ id: statement.id, ...header });
      } else {
        await createStatement({ accountId, ...header });
      }
      toast.success(ui(editing
        ? 'financeAccountStatementsManualUpdateSuccess'
        : 'financeAccountStatementsManualSuccess'));
      onSuccess();
      onClose();
    } catch {
      toast.error(ui('financeAccountStatementsManualError'));
    }
  };

  // Closing (X / Escape / Cancel) with unsaved edits asks for confirmation first.
  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => { if (!v) requestClose(); }}
        data-testid="Dialog__6b4086">
        <DialogContent
          className="w-[96vw] max-w-[1440px] overflow-hidden p-0"
          style={{ background: 'var(--surface-overlay, #FFFFFF)' }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => { e.preventDefault(); requestClose(); }}
          data-testid="DialogContent__6b4086">
          <div className="bg-white px-6 pt-6">
            <h2 className="text-xl font-semibold leading-7 text-[#121217]">
              {ui(editing ? 'financeAccountStatementsManualEditTitle' : 'financeAccountStatementsManualTitle')}
            </h2>
            <p className="mt-0.5 text-xs leading-4 text-[#6C6C89]">
              {ui(editing ? 'financeAccountStatementsManualEditSubtitle' : 'financeAccountStatementsManualSubtitle')}
            </p>
          </div>

          <div className="max-h-[62vh] overflow-y-auto overflow-x-hidden bg-white px-6 py-4">
            <div className="flex flex-col gap-5">
              <StatementSummaryWidget
                rows={rows}
                money={money}
                ui={ui}
                data-testid="StatementSummaryWidget__6b4086" />
              <HeaderFields
                form={form}
                setForm={setFormDirty}
                ui={ui}
                data-testid="HeaderFields__6b4086" />
            </div>

            <div className="mt-6">
              <LinesTab count={computeTotals(rows).n} ui={ui} data-testid="LinesTab__6b4086" />
            </div>
            <EditableLines
              rows={rows}
              setRows={setRowsDirty}
              ui={ui}
              currencySym={currencySym}
              data-testid="EditableLines__6b4086" />
          </div>

          <div className="flex items-center justify-end border-t border-[#E8EAEF] bg-white px-6 py-4">
            <SaveSplitButton
              creating={saving}
              onProcess={() => handleSave(true)}
              onDraft={() => handleSave(false)}
              ui={ui}
              data-testid="SaveSplitButton__6b4086" />
          </div>

        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmClose}
        onOpenChange={(v) => { if (!v) setConfirmClose(false); }}
        data-testid="Dialog__6b4086">
        <DialogContent className="max-w-sm bg-white" data-testid="DialogContent__6b4086">
          <div data-testid="manual-discard-overlay">
            <h3 className="text-base font-semibold text-[#121217]">
              {ui('financeAccountStatementsManualDiscardTitle')}
            </h3>
            <p className="mt-1 text-sm text-[#6C6C89]">
              {ui('financeAccountStatementsManualDiscardBody')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                data-testid="manual-discard-keep"
                className="inline-flex h-10 items-center rounded-lg border border-[#D1D4DB] bg-white px-3 text-sm font-medium text-[#121217] hover:bg-[#F5F7F9]"
              >
                {ui('financeAccountStatementsManualDiscardKeep')}
              </button>
              <button
                type="button"
                onClick={() => { setConfirmClose(false); onClose(); }}
                data-testid="manual-discard-confirm"
                className="inline-flex h-10 items-center rounded-lg bg-[#D50B3E] px-3 text-sm font-medium text-white hover:bg-[#B50934]"
              >
                {ui('financeAccountStatementsManualDiscardConfirm')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
