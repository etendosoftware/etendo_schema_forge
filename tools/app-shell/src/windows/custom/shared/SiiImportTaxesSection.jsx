import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, WarningIcon } from '@phosphor-icons/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import RequiredMark from '@/components/ui/required-mark.jsx';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { SelectorInput } from '@/components/contract-ui/SelectorInput.jsx';
import { DeleteConfirmDialog } from '@/components/contract-ui/DeleteConfirmDialog.jsx';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useLocaleSwitch } from '@/i18n';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { buildLineSelectorContext } from '@/lib/selectorContext.js';
import { buildUrlWithParams } from '@/lib/buildUrlWithParams.js';
import { translateBackendErrorResponse } from '@/lib/backendErrors.js';
import { normalizeDateInputValue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import SiiPanelCard from '@/windows/custom/shared/SiiPanelCard.jsx';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { isDuaDateAfterAccountingDate, useSiiImportDuaEnabled } from '@/windows/custom/shared/SiiImportDuaSection.jsx';

/**
 * ETP-6284 — "Impuestos de importación" card of the purchase-invoice SII panel, right after
 * "Importación (DUA)" and behind the same `siiImportDua` capability (`useSiiImportDuaEnabled`).
 *
 * Classic parity (module SII, purchase invoice "Tax" tab): an import is declared by adding manual
 * tax lines (`C_InvoiceTax` with `Recalculate = 'N'`) next to the ones the invoice lines generate.
 * The core trigger `C_INVOICETAX_TRG2` adds a manual line's tax amount to the invoice grand total,
 * and `C_Invoice_Post` keeps those lines on completion (and copies them, negated, on a reversal).
 * With Multiple DUA on the header, each line carries its own DUA and DUA date
 * (`C_InvoiceTax.EM_Aeatsii_Dua` / `EM_Aeatsii_Fecha_Dua`).
 *
 * Inline editable table: Impuesto*, Tipo (rate, read-only), Base imponible*, Cuota (read-only,
 * computed by the Classic callout `SL_InvoiceTax_Amt` — base x rate, currency precision — through
 * the NEO callout endpoint) and a delete icon; with Multiple DUA each line gets a sub-row with
 * DUA* / Fecha DUA* (no extra columns, so no horizontal scroll).
 *
 * Saving: each row saves ITSELF as soon as it is complete — on choosing the tax, on committing the
 * base (blur / Enter), on leaving the DUA field, on picking the DUA date. An incomplete row stays a
 * local draft with its empty required cells outlined in red; nothing is sent until it is complete.
 * A saved row only PATCHes when a value really changed. Each write re-reads the rows and the header
 * totals (`onHeaderRefresh`).
 *
 * DUA / DUA date are REQUIRED per line with Multiple DUA. Classic declares that rule in
 * `InvoiceTaxEventHandler` but its `showMsg` never throws, so the backend does not enforce it —
 * this card is the only place it holds.
 *
 * Tax picker: the purchase-line tax selector (`/lines/selectors/tax`, `C_Tax_IsSOTrx_Date` rule:
 * purchase or both, valid at the invoice date), restricted to import taxes only
 * (`selectImportTaxOptions`: "import" in the name, Classic's heuristic, compensatory "=0%" ones
 * included). It is fed from the card's full tax catalog (`useTaxRateCatalog`, up to 500) filtered,
 * not from the selector's own 50-row pages: filtering a page could leave it empty with no way to
 * scroll to the next one. A saved row whose tax is not an import tax keeps its label (SelectorInput's
 * hidden committed item). Its items carry the rate shown in the Tipo column (`labelPrefix`, the same
 * rate the line pickers show); a saved row falls back to `tax.rate`.
 */
export const DUA_TYPE_KEYS = new Set(['F5', 'LC']);
// The card is mounted on purchase invoices only (SifTab's `isPurchaseInvoice` gate).
const WINDOW_CATEGORY = 'purchases';
const CATALOG_PAGE = 100;
const CATALOG_MAX_PAGES = 5;
const ERROR_OUTLINE = 'border-destructive focus-visible:ring-destructive focus-within:ring-destructive';
const TAX_FIELD = { id: 'sif-importTax-tax', key: 'tax', column: 'tax', required: true };

let draftSeq = 0;

function isTrue(value) {
  return value === true || value === 'Y';
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTaxName(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Classic's import-tax heuristic (deferred-VAT path of the SII module): a tax is an import tax
 * when its name contains "import" (case- and accent-insensitive — "Compras IGIC IMPORTACION 7%",
 * "Importaciones 21%"), except the compensatory "=0%" ones. There is no import flag on C_Tax.
 */
export function isImportTaxName(name) {
  const normalized = normalizeTaxName(name);
  return normalized.includes('import') && !normalized.replace(/\s/g, '').includes('=0%');
}

/**
 * The tax picker's options: import taxes only, the compensatory "=0%" ones included (a deferred-VAT
 * user may pick one by hand), in their original order. Non-import taxes are not offered.
 */
export function selectImportTaxOptions(options) {
  const list = Array.isArray(options) ? options : [];
  return list.filter(o => o?.id && normalizeTaxName(o.name).includes('import'));
}

/** A compensatory import tax of deferred VAT: "import" in the name and a "=0%" suffix. */
export function isCompensatoryTaxName(name) {
  const normalized = normalizeTaxName(name);
  return normalized.includes('import') && normalized.replace(/\s/g, '').includes('=0%');
}

function collapse(name) {
  return normalizeTaxName(name).replace(/\s+/g, ' ').trim();
}

/** "Importaciones 21%=0%" → "importaciones 21%" (normalized, the "=0%" suffix removed). */
export function compensatoryBaseName(name) {
  return collapse(String(name ?? '').replace(/=\s*0\s*%/g, ''));
}

const COMPENSATORY_SUFFIX = '%=0%';
const RATE_TEXT = /^\d+(?:[.,]\d+)?$/;

function isRateChar(ch) {
  return (ch >= '0' && ch <= '9') || ch === '.' || ch === ',';
}

/** The longest number ("21", "10,5") that ends `text`, or null. Linear scan, no backtracking. */
function trailingRate(text) {
  let start = text.length;
  while (start > 0 && isRateChar(text[start - 1])) start -= 1;
  for (let i = start; i < text.length; i += 1) {
    const candidate = text.slice(i);
    if (RATE_TEXT.test(candidate)) return Number(candidate.replace(',', '.'));
  }
  return null;
}

/** The rate in a compensatory name ("Importaciones 21%=0%" → 21), or null. */
export function compensatoryNameRate(name) {
  const text = normalizeTaxName(name).replace(/\s/g, '');
  let at = text.indexOf(COMPENSATORY_SUFFIX);
  while (at !== -1) {
    const rate = trailingRate(text.slice(0, at));
    if (rate !== null) return rate;
    at = text.indexOf(COMPENSATORY_SUFFIX, at + 1);
  }
  return null;
}

/**
 * The compensatory tax for an import tax: the 0% import tax whose name without "=0%" equals the
 * import tax name (case- and accent-insensitive); else one with the same rate in its name; else
 * null.
 *
 * @param {string} importName the import tax name
 * @param {number|null} importRate its rate
 * @param {Array<{id: string, name: string}>} catalog the purchase taxes on offer
 */
export function findCompensatoryTax(importName, importRate, catalog) {
  const compensatory = (catalog ?? []).filter(t => t?.id && isCompensatoryTaxName(t.name));
  const target = collapse(importName);
  return compensatory.find(t => compensatoryBaseName(t.name) === target)
    ?? (importRate == null ? null
      : compensatory.find(t => compensatoryNameRate(t.name) === Number(importRate)))
    ?? null;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function hasPositiveRate(rate) {
  return rate > 0;
}

/** Saved import-tax rows with a positive rate, grouped by tax (and DUA with Multiple DUA). */
function groupImportTaxRows(rows, rateOf, duaOf, multiDua) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const rate = rateOf(row);
    if (!row?.id || !row.tax || !isImportTaxName(row.taxLabel) || !hasPositiveRate(rate)) continue;
    const key = `${row.tax}|${duaOf(row)}`;
    const group = groups.get(key) ?? {
      tax: row.tax, name: row.taxLabel, rate, base: 0,
      aeatsiiDua: duaOf(row), aeatsiiFechaDua: multiDua ? (row.aeatsiiFechaDua ?? '') : '',
    };
    group.base += Number(row.taxableAmount) || 0;
    groups.set(key, group);
  }
  return groups;
}

/**
 * ETP-6284 (alcance 5) — the compensatory lines a deferred-VAT import invoice still needs: one per
 * import tax (saved manual rows whose tax isImportTaxName with rate > 0), base = minus the sum of
 * that tax's bases, tax amount 0, with the matching compensatory tax. A group that already has a
 * compensatory row with exactly that base is skipped.
 *
 * With Multiple DUA the groups are per import tax AND DUA, and each compensatory line carries
 * that DUA and its date: the backend refuses a tax line without them on a multi-DUA invoice.
 *
 * @param {object[]} rows the card's rows ({ id, tax, taxLabel, taxableAmount, serverRate, aeatsiiDua, aeatsiiFechaDua })
 * @param {(row: object) => number|null} rateOf the rate of a row
 * @param {Array<{id: string, name: string}>} catalog the purchase taxes on offer
 * @param {boolean} [multiDua=false] whether the invoice is multi-DUA
 * @returns {{ groups: number, toCreate: object[], missing: string[] }}
 */
export function planCompensatoryLines(rows, rateOf, catalog, multiDua = false) {
  const duaOf = row => (multiDua ? String(row?.aeatsiiDua ?? '').trim() : '');
  const groups = groupImportTaxRows(rows, rateOf, duaOf, multiDua);
  const toCreate = [];
  const missing = [];
  for (const group of groups.values()) {
    const compensatory = findCompensatoryTax(group.name, group.rate, catalog);
    if (!compensatory) {
      if (!missing.includes(group.name)) missing.push(group.name);
      continue;
    }
    const base = round2(-group.base);
    const done = (rows ?? []).some(r => r?.id && r.tax === compensatory.id
      && round2(r.taxableAmount) === base && duaOf(r) === group.aeatsiiDua);
    if (!done) {
      toCreate.push({
        tax: compensatory.id, taxLabel: compensatory.name, taxableAmount: base, taxAmount: 0,
        ...(multiDua ? { aeatsiiDua: group.aeatsiiDua, aeatsiiFechaDua: group.aeatsiiFechaDua } : {}),
      });
    }
  }
  return { groups: groups.size, toCreate, missing };
}

/** Manual (import) tax lines only — the automatic ones belong to the invoice lines. */
export function selectImportTaxRows(rows) {
  return (rows ?? []).filter(r => r && !isTrue(r.recalculate));
}

/** Next `Line` number over EVERY tax line of the invoice, like Classic's `MAX(LINE)+10` default. */
export function nextTaxLineNo(rows) {
  const max = (rows ?? []).reduce((acc, r) => Math.max(acc, Number(r?.lineNo) || 0), 0);
  return max + 10;
}

/**
 * The required cells a row still lacks (`tax`, `taxableAmount`, and with Multiple DUA `aeatsiiDua`
 * and `aeatsiiFechaDua`). `taxAmount` is not a cell the user fills: it comes from the callout, and a
 * row without it is simply not saved yet.
 */
export function missingImportTaxFields(row, multiDua) {
  const missing = new Set();
  if (!row?.tax) missing.add('tax');
  if (row?.taxableAmount == null) missing.add('taxableAmount');
  if (multiDua) {
    if (!String(row?.aeatsiiDua ?? '').trim()) missing.add('aeatsiiDua');
    if (!row?.aeatsiiFechaDua) missing.add('aeatsiiFechaDua');
  }
  return missing;
}

/** Request body of a save. DUA fields travel only while Multiple DUA is checked. */
export function buildImportTaxBody(row, multiDua) {
  const body = {
    tax: row.tax,
    taxableAmount: row.taxableAmount,
    taxAmount: row.taxAmount,
  };
  if (multiDua) {
    body.aeatsiiDua = String(row.aeatsiiDua ?? '').trim();
    body.aeatsiiFechaDua = row.aeatsiiFechaDua;
  }
  return body;
}

/** True when a saved row's editable values differ from what the server holds. */
export function isImportTaxRowDirty(row, persisted, multiDua) {
  if (!persisted) return true;
  const body = buildImportTaxBody(row, multiDua);
  const stored = buildImportTaxBody(persisted, multiDua);
  return Object.keys(body).some(k => (body[k] ?? '') !== (stored[k] ?? ''));
}

/** Sums of the import-tax rows (`total` = base + tax amount); compensatory =0% lines excluded. */
export function summarizeImportTaxes(rows) {
  let base = 0;
  let amount = 0;
  for (const r of (rows ?? []).filter(row => !isCompensatoryTaxName(row?.taxLabel))) {
    base += toNumberOrNull(r?.taxableAmount) ?? 0;
    amount += toNumberOrNull(r?.taxAmount) ?? 0;
  }
  return { base, amount, total: base + amount };
}

function serverRowToRow(row) {
  return {
    key: row.id,
    id: row.id,
    tax: row.tax ?? '',
    taxLabel: row['tax$_identifier'] ?? '',
    serverRate: toNumberOrNull(row['tax$rate']),
    taxableAmount: toNumberOrNull(row.taxableAmount),
    taxAmount: toNumberOrNull(row.taxAmount),
    aeatsiiDua: row.aeatsiiDua ?? '',
    aeatsiiFechaDua: normalizeDateInputValue(row.aeatsiiFechaDua ?? ''),
  };
}

function newDraftRow() {
  draftSeq += 1;
  return {
    key: `draft-${draftSeq}`,
    id: null,
    tax: '',
    taxLabel: '',
    serverRate: null,
    taxableAmount: null,
    taxAmount: null,
    aeatsiiDua: '',
    aeatsiiFechaDua: '',
  };
}

/** Reads one amount out of a NEO callout `updates` map (entries are `{ value }` or raw). */
function calloutAmount(updates, key) {
  if (!updates || !(key in updates)) return undefined;
  const entry = updates[key];
  return toNumberOrNull(entry && typeof entry === 'object' ? entry.value : entry);
}

function createdId(body) {
  const data = body?.response?.data;
  if (Array.isArray(data)) return data[0]?.id ?? null;
  return data?.id ?? body?.id ?? null;
}

/**
 * Parses a rate as the selector or the record carries it — a number, or a `labelPrefix` string
 * such as "10", "10%" or "5,2 %" — into a number. Null when there is nothing numeric.
 */
export function parseRate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[%\s]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** The Tipo cell: the selector's rate for the chosen tax, else the saved `tax.rate`; one "%". */
export function rateLabel(row, rateMap) {
  const rate = parseRate(row.tax ? rateMap?.[row.tax] : null) ?? parseRate(row.serverRate);
  return rate == null ? '—' : `${formatGroupedNumber(rate, { maximumFractionDigits: 2 })}%`;
}

// One horizontal padding for th and td, so a header's text edge matches its cells' content edge.
const CELL_X = 'px-3';
const CONTROL = 'h-9 text-sm';
const COLUMN_ALIGN = { left: 'text-left', right: 'text-right' };

/**
 * Fixed column widths (table-layout: fixed) so header and body cells share their geometry:
 * Impuesto takes the remaining width, Tipo / Base / Cuota are right-aligned fixed columns.
 */
function ImportTaxColGroup({ editable }) {
  return (
    <colgroup data-testid="SiiImportTaxesSection__colgroup">
      <col data-testid="SiiImportTaxesSection__colTax" />
      <col className="w-16" data-testid="SiiImportTaxesSection__colRate" />
      <col className="w-32" data-testid="SiiImportTaxesSection__colBase" />
      <col className="w-32" data-testid="SiiImportTaxesSection__colAmount" />
      {editable && <col className="w-12" data-testid="SiiImportTaxesSection__colActions" />}
    </colgroup>
  );
}

function HeaderCell({ children, required, align = 'left', testId }) {
  return (
    <th
      className={`${CELL_X} py-2 text-xs font-medium text-muted-foreground whitespace-nowrap ${COLUMN_ALIGN[align]}`}
      data-testid={testId}>
      {children}
      {required && <RequiredMark aria-hidden="true" data-testid={`${testId}_required`} />}
    </th>
  );
}

/**
 * The read-only Cuota box: same height, radius, border and right-aligned tabular amount as the
 * Base input, on the muted read-only fill. `pr-3` puts the currency symbol formatCurrency renders
 * at the same right inset as the Base input's symbol.
 */
function ReadOnlyAmount({ currency, value, testId }) {
  return (
    <div
      className={`${CONTROL} w-full rounded-lg border border-border-control bg-muted pl-2 pr-3 flex items-center justify-end tabular-nums text-text-primary`}
      data-testid={testId}>
      {value == null ? '—' : formatCurrency(currency, value)}
    </div>
  );
}

function DuaSubRowField({ ui, htmlFor, labelKey, required, children }) {
  return (
    <div className="space-y-1 min-w-0" data-testid={`SiiImportTaxesSection__duaField_${htmlFor}`}>
      <Label htmlFor={htmlFor} className="text-sm text-foreground font-medium" data-testid={`Label__siiImportTax_${htmlFor}`}>
        {ui(labelKey)}
        {required && <RequiredMark aria-hidden="true" data-testid={`RequiredMark__siiImportTax_${htmlFor}`} />}
      </Label>
      {children}
    </div>
  );
}

/**
 * Multiple DUA: the line's DUA and DUA date live on a sub-row right below it (same `<tbody>` row
 * group, no separator between the two rows), starting at the Impuesto column's content edge, with
 * stacked labels and two equal-width controls — so the table keeps its 4 columns + delete and
 * never needs a horizontal scroll.
 */
function DuaSubRow({ ui, row, editable, locale, missing, disabled, colSpan, onDuaChange, onDuaBlur, onDateChange }) {
  const duaId = `sif-importTax-dua-${row.key}`;
  const dateId = `sif-importTax-duaDate-${row.key}`;
  return (
    <tr data-testid={`SiiImportTaxesSection__duaRow_${row.key}`}>
      <td colSpan={colSpan} className={`${CELL_X} pt-0 pb-3`} data-testid="SiiImportTaxesSection__tdDuaGroup">
        <div className="grid grid-cols-2 gap-3 max-w-md" data-testid="SiiImportTaxesSection__duaFields">
          <DuaSubRowField ui={ui} htmlFor={duaId} labelKey="sifDataTabs.field.dua" required={editable} data-testid="DuaSubRowField__dua">
            {editable ? (
              <Input
                id={duaId}
                type="text"
                maxLength={255}
                value={row.aeatsiiDua}
                onChange={e => onDuaChange(row, e.target.value)}
                onBlur={() => onDuaBlur(row)}
                disabled={disabled}
                aria-invalid={missing.has('aeatsiiDua') || undefined}
                className={`${CONTROL} bg-card ${missing.has('aeatsiiDua') ? ERROR_OUTLINE : ''}`}
                data-testid="Input__siiImportTaxDua" />
            ) : (
              <p className="text-sm text-text-primary" data-testid="SiiImportTaxesSection__duaValue">{row.aeatsiiDua || '—'}</p>
            )}
          </DuaSubRowField>
          <DuaSubRowField ui={ui} htmlFor={dateId} labelKey="sifDataTabs.field.duaDate" required={editable} data-testid="DuaSubRowField__duaDate">
            {editable ? (
              <DateField
                id={dateId}
                value={row.aeatsiiFechaDua}
                onChange={iso => onDateChange(row, iso ?? '')}
                disabled={disabled}
                className={missing.has('aeatsiiFechaDua') ? ERROR_OUTLINE : undefined}
                data-testid="DateField__siiImportTaxDuaDate" />
            ) : (
              <p className="text-sm text-text-primary" data-testid="SiiImportTaxesSection__duaDateValue">
                {row.aeatsiiFechaDua ? formatCalendarDate(row.aeatsiiFechaDua, locale) : '—'}
              </p>
            )}
          </DuaSubRowField>
        </div>
      </td>
    </tr>
  );
}

function ImportTaxRow({
  ui, row, multiDua, editable, currency, locale, rateMap, taxCatalogs, token,
  onTaxChange, onBaseCommit, onDuaChange, onDuaBlur, onDateChange, onDelete,
}) {
  const cell = `${CELL_X} py-2 align-middle`;
  const missing = editable ? missingImportTaxFields(row, multiDua) : new Set();
  const disabled = Boolean(row.saving);
  const subRow = multiDua && (
    <DuaSubRow
      ui={ui}
      row={row}
      editable={editable}
      locale={locale}
      missing={missing}
      disabled={disabled}
      colSpan={editable ? 5 : 4}
      onDuaChange={onDuaChange}
      onDuaBlur={onDuaBlur}
      onDateChange={onDateChange}
      data-testid="DuaSubRow__siiImportTax" />
  );
  // The separator sits between row GROUPS (one tax line + its DUA sub-row), never inside one.
  const groupClass = 'border-b border-border/60 last:border-b-0';
  if (!editable) {
    return (
      <tbody className={groupClass} data-testid={`SiiImportTaxesSection__group_${row.key}`}>
        <tr data-testid={`SiiImportTaxesSection__row_${row.key}`}>
          <td className={`${cell} truncate`} data-testid="SiiImportTaxesSection__tdTax">{row.taxLabel || row.tax}</td>
          <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdRate">{rateLabel(row, rateMap)}</td>
          <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdBase">
            {formatCurrency(currency, row.taxableAmount)}
          </td>
          <td className={`${cell} text-right tabular-nums`} data-testid="SiiImportTaxesSection__tdAmount">
            {formatCurrency(currency, row.taxAmount)}
          </td>
        </tr>
        {subRow}
      </tbody>
    );
  }
  return (
    <tbody className={groupClass} data-testid={`SiiImportTaxesSection__group_${row.key}`}>
      <tr data-testid={`SiiImportTaxesSection__row_${row.key}`}>
        <td className={cell} data-testid="SiiImportTaxesSection__tdTax">
          <SelectorInput
            entityName="tax"
            field={TAX_FIELD}
            value={row.tax}
            displayValue={row.taxLabel}
            onChange={(val, lbl) => onTaxChange(row, val ?? '', lbl ?? '')}
            catalogs={taxCatalogs}
            resolvedLabel={ui('tax')}
            selectorUrl={null}
            token={token}
            compact
            triggerClassName={`w-full ${CONTROL} text-text-primary bg-card ${missing.has('tax') ? ERROR_OUTLINE : ''}`}
            data-testid="SelectorInput__siiImportTax" />
        </td>
        <td className={`${cell} text-right tabular-nums text-text-secondary whitespace-nowrap`} data-testid="SiiImportTaxesSection__tdRate">
          {rateLabel(row, rateMap)}
        </td>
        <td className={cell} data-testid="SiiImportTaxesSection__tdBase">
          <MaskedAmountInput
            bare
            currency={currency}
            value={row.taxableAmount}
            onCommit={parsed => onBaseCommit(row, parsed)}
            disabled={disabled}
            aria-label={ui('sifDataTabs.importTaxes.taxableAmount')}
            aria-invalid={missing.has('taxableAmount') || undefined}
            className={`${CONTROL} bg-card ${missing.has('taxableAmount') ? ERROR_OUTLINE : ''}`}
            data-testid="MaskedAmountInput__siiImportTaxBase" />
        </td>
        <td className={cell} data-testid="SiiImportTaxesSection__tdAmount">
          <ReadOnlyAmount currency={currency} value={row.taxAmount} testId="SiiImportTaxesSection__amount" data-testid="ReadOnlyAmount__siiImportTax" />
        </td>
        <td className={`${cell} pl-0 text-right`} data-testid="SiiImportTaxesSection__tdActions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={ui('delete')}
            onClick={() => onDelete(row)}
            disabled={disabled}
            data-testid="Button__siiImportTaxDelete">
            <TrashIcon data-testid="Trash2__siiImportTax" />
          </Button>
        </td>
      </tr>
      {subRow}
    </tbody>
  );
}

function SummaryLine({ label, value, strong, testId }) {
  return (
    <div className={`flex items-center justify-between gap-6 text-sm ${strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}`} data-testid={testId}>
      <span data-testid={`${testId}_label`}>{label}</span>
      <span className="tabular-nums" data-testid={`${testId}_value`}>{value}</span>
    </div>
  );
}

function useTaxRateCatalog(apiFetch, selectorUrl, selectorContext) {
  const [catalogState, setCatalogState] = useState({ rateMap: {}, catalog: [] });
  const contextKey = JSON.stringify(selectorContext ?? {});
  useEffect(() => {
    if (!selectorUrl) return undefined;
    let cancelled = false;
    (async () => {
      const map = {};
      const catalog = [];
      for (let page = 0; page < CATALOG_MAX_PAGES; page += 1) {
        const url = buildUrlWithParams(selectorUrl, { ...selectorContext, limit: CATALOG_PAGE, offset: page * CATALOG_PAGE });
        const res = await apiFetch(url, { baseUrl: '' });
        if (!res.ok) break;
        const body = await res.json();
        const items = body?.items ?? body?.response?.data ?? [];
        for (const item of items) {
          if (!item?.id) continue;
          map[item.id] = item.labelPrefix ?? null;
          catalog.push({ id: item.id, name: item.label ?? item.name ?? '' });
        }
        if (items.length < CATALOG_PAGE) break;
      }
      if (!cancelled) setCatalogState({ rateMap: map, catalog });
    })().catch(() => { /* the Tipo column falls back to the saved tax rate */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, selectorUrl, contextKey]);
  return catalogState;
}

/**
 * ETP-6284 — whether the saved purchase invoice is an import of deferred VAT (F5/LC, IVA
 * organization in SII, `SIIUtils.isDeferredVATInvoice`), which is when the card offers the
 * compensatory line. Served by `GET <neo>/purchase-invoice/header/{id}/action/siiDeferredVat`
 * (com.etendoerp.go, body `{ deferredVat }` at the top level). Fetched while `enabled`, refetched
 * whenever `refreshKey` changes; `false` while loading or on any failure.
 */
export function useSiiDeferredVat({ apiBaseUrl, recordId, enabled, refreshKey }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [deferredVat, setDeferredVat] = useState(false);
  useEffect(() => {
    if (!enabled || !recordId || !apiBaseUrl) {
      setDeferredVat(false);
      return undefined;
    }
    let cancelled = false;
    apiFetch(`/header/${encodeURIComponent(recordId)}/action/siiDeferredVat`)
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (!cancelled) setDeferredVat(body?.deferredVat === true);
      })
      .catch(() => { if (!cancelled) setDeferredVat(false); });
    return () => { cancelled = true; };
  }, [apiFetch, apiBaseUrl, recordId, enabled, refreshKey]);
  return deferredVat;
}

function ImportTaxesBlock({
  ui, multiDua, recordId, data, apiBaseUrl, token, readOnly, onHeaderRefresh, step, deferredVat = false,
  accountingRegisterDate = null,
}) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const { locale } = useLocaleSwitch();
  const [allServerRows, setAllServerRows] = useState([]);
  const [rows, setRows] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const persistedRef = useRef({});

  const currency = data?.['currency$_identifier'] || '';
  const editable = !readOnly && Boolean(recordId);
  const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/lines/selectors/tax` : null;
  const selectorContext = buildLineSelectorContext({ windowCategory: WINDOW_CATEGORY, parentId: recordId, headerRecord: data });
  const { rateMap, catalog } = useTaxRateCatalog(apiFetch, editable ? selectorUrl : null, selectorContext);
  // The picker offers the catalog's import taxes (keyed as SelectorInput's `tax:tax` catalog).
  const taxCatalogs = useMemo(() => ({ [`tax:${TAX_FIELD.column}`]: selectImportTaxOptions(catalog) }), [catalog]);
  const [compensating, setCompensating] = useState(false);

  const load = useCallback(async () => {
    if (!recordId || !apiBaseUrl) return;
    try {
      const res = await apiFetch(`/tax?parentId=${encodeURIComponent(recordId)}&_extraProperties=tax.rate`);
      if (!res.ok) return;
      const body = await res.json();
      const list = body?.response?.data ?? (Array.isArray(body) ? body : []);
      const all = Array.isArray(list) ? list : [];
      const manual = selectImportTaxRows(all).map(serverRowToRow);
      persistedRef.current = Object.fromEntries(manual.map(r => [r.id, r]));
      setAllServerRows(all);
      // Keep the local drafts (not saved yet) after the saved rows.
      setRows(prev => [...manual, ...prev.filter(r => !r.id)]);
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    }
  }, [recordId, apiBaseUrl, apiFetch, ui]);

  useEffect(() => { load(); }, [load]);

  const patchRow = useCallback((key, patch) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  // Classic SL_InvoiceTax_Amt: the tax amount follows the base and the tax. Best effort — on
  // failure the row keeps no amount and is not saved.
  const withCalloutAmount = useCallback(async (row) => {
    if (!row.tax || row.taxableAmount == null) return row;
    try {
      const res = await apiFetch('/tax/callout', {
        method: 'POST',
        body: JSON.stringify({
          field: 'taxableAmount',
          value: row.taxableAmount,
          formState: { tax: row.tax, invoice: recordId, taxableAmount: row.taxableAmount, taxAmount: row.taxAmount },
        }),
      });
      if (!res.ok) return row;
      const amount = calloutAmount((await res.json())?.updates, 'taxAmount');
      return amount === undefined ? row : { ...row, taxAmount: amount };
    } catch {
      return row;
    }
  }, [apiFetch, recordId]);

  // Rows with a write in flight, by key. `row.saving` alone is not enough: two overlapping flows
  // (e.g. the date picker and the DUA blur) can each hold a copy taken before it was set, and
  // would POST the same draft twice.
  const inFlightRef = useRef(new Set());

  const saveRow = useCallback(async (row) => {
    if (!row || row.saving || inFlightRef.current.has(row.key)) return;
    if (missingImportTaxFields(row, multiDua).size > 0 || row.taxAmount == null) return;
    if (row.id && !isImportTaxRowDirty(row, persistedRef.current[row.id], multiDua)) return;
    const flightKey = row.key;
    inFlightRef.current.add(flightKey);
    patchRow(row.key, { saving: true });
    try {
      const body = buildImportTaxBody(row, multiDua);
      const res = row.id
        ? await apiFetch(`/tax/${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/tax', {
          method: 'POST',
          body: JSON.stringify({ ...body, parentId: recordId, lineNo: nextTaxLineNo(allServerRows), recalculate: false }),
        });
      if (!res.ok) {
        toast.error(await translateBackendErrorResponse(res, ui));
        patchRow(row.key, { saving: false });
        return;
      }
      if (!row.id) {
        // The draft becomes the saved row; the reload below replaces it with the server version.
        const id = createdId(await res.json().catch(() => null));
        setRows(prev => (id == null
          ? prev.filter(r => r.key !== row.key)
          : prev.map(r => (r.key === row.key ? { ...r, id, key: id, saving: false } : r))));
      }
      await load();
      onHeaderRefresh?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
      patchRow(row.key, { saving: false });
    } finally {
      inFlightRef.current.delete(flightKey);
    }
  }, [multiDua, patchRow, apiFetch, recordId, allServerRows, load, onHeaderRefresh, ui]);

  const recomputeAndSave = useCallback(async (row) => {
    const next = await withCalloutAmount(row);
    patchRow(row.key, { taxAmount: next.taxAmount });
    await saveRow(next);
  }, [withCalloutAmount, patchRow, saveRow]);

  const onTaxChange = useCallback((row, tax, taxLabel) => {
    const next = { ...row, tax, taxLabel, serverRate: null, taxAmount: row.tax === tax ? row.taxAmount : null };
    patchRow(row.key, { tax, taxLabel, serverRate: null, taxAmount: next.taxAmount });
    recomputeAndSave(next);
  }, [patchRow, recomputeAndSave]);

  const onBaseCommit = useCallback((row, parsed) => {
    if (parsed === row.taxableAmount) return;
    const next = { ...row, taxableAmount: parsed, taxAmount: null };
    patchRow(row.key, { taxableAmount: parsed, taxAmount: null });
    recomputeAndSave(next);
  }, [patchRow, recomputeAndSave]);

  const onDuaChange = useCallback((row, value) => patchRow(row.key, { aeatsiiDua: value }), [patchRow]);
  const onDuaBlur = useCallback((row) => {
    saveRow(rowsRef.current.find(r => r.key === row.key));
  }, [saveRow]);
  const onDateChange = useCallback((row, iso) => {
    patchRow(row.key, { aeatsiiFechaDua: iso });
    saveRow({ ...rowsRef.current.find(r => r.key === row.key), aeatsiiFechaDua: iso });
  }, [patchRow, saveRow]);

  const onDelete = useCallback((row) => {
    if (row.id) setDeleteTarget(row);
    else setRows(prev => prev.filter(r => r.key !== row.key));
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/tax/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await translateBackendErrorResponse(res, ui));
        return;
      }
      setRows(prev => prev.filter(r => r.key !== deleteTarget.key));
      toast.success(ui('sifDataTabs.importTaxes.deleted'));
      await load();
      onHeaderRefresh?.();
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, apiFetch, load, onHeaderRefresh, ui]);

  const summary = summarizeImportTaxes(rows);
  const compensation = planCompensatoryLines(rows,
    row => parseRate(row.tax ? rateMap[row.tax] : null) ?? parseRate(row.serverRate), catalog, multiDua);
  let compensationHint = null;
  if (compensation.missing.length > 0) {
    compensationHint = ui('sifDataTabs.importTaxes.noCompensatoryTax', { taxes: compensation.missing.join(', ') });
  } else if (compensation.groups === 0) {
    compensationHint = ui('sifDataTabs.importTaxes.noImportTaxToCompensate');
  } else if (compensation.toCreate.length === 0) {
    compensationHint = ui('sifDataTabs.importTaxes.alreadyCompensated');
  }

  const addCompensatoryLines = async () => {
    if (compensationHint || compensating) return;
    setCompensating(true);
    let lineNo = nextTaxLineNo(allServerRows);
    let allCreated = true;
    try {
      for (const line of compensation.toCreate) {
        const res = await apiFetch('/tax', {
          method: 'POST',
          body: JSON.stringify({
            tax: line.tax, taxableAmount: line.taxableAmount, taxAmount: 0,
            ...(multiDua ? { aeatsiiDua: line.aeatsiiDua, aeatsiiFechaDua: line.aeatsiiFechaDua } : {}),
            parentId: recordId, lineNo, recalculate: false,
          }),
        });
        if (!res.ok) {
          toast.error(await translateBackendErrorResponse(res, ui));
          allCreated = false;
          break;
        }
        lineNo += 10;
      }
      // Success only when every compensatory line was created.
      if (allCreated) toast.success(ui('sifDataTabs.importTaxes.compensatoryAdded'));
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setCompensating(false);
      await load();
      onHeaderRefresh?.();
    }
  };

  return (
    <SiiPanelCard
      step={step}
      title={ui('sifDataTabs.importTaxes.title')}
      subtitle={ui('sifDataTabs.importTaxes.subtitle')}
      testId="SiiImportTaxesSection__card"
      data-testid="SiiPanelCard__siiImportTaxes">
      {!recordId ? (
        <p className="text-xs text-muted-foreground" data-testid="SiiImportTaxesSection__saveFirst">
          {ui('sifDataTabs.importTaxes.saveFirst')}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border" data-testid="SiiImportTaxesSection__tableWrap">
              <table className="w-full table-fixed text-sm" data-testid="SiiImportTaxesSection__table">
                <ImportTaxColGroup editable={editable} data-testid="ImportTaxColGroup__siiImportTax" />
                <thead className="bg-muted" data-testid="SiiImportTaxesSection__thead">
                  <tr className="border-b border-border/60" data-testid="SiiImportTaxesSection__headRow">
                    <HeaderCell required={editable} testId="SiiImportTaxesSection__thTax" data-testid="HeaderCell__tax">{ui('tax')}</HeaderCell>
                    <HeaderCell align="right" testId="SiiImportTaxesSection__thRate" data-testid="HeaderCell__rate">{ui('sifDataTabs.importTaxes.rate')}</HeaderCell>
                    <HeaderCell required={editable} align="right" testId="SiiImportTaxesSection__thBase" data-testid="HeaderCell__base">
                      {ui('sifDataTabs.importTaxes.taxableAmount')}
                    </HeaderCell>
                    <HeaderCell align="right" testId="SiiImportTaxesSection__thAmount" data-testid="HeaderCell__amount">
                      {ui('sifDataTabs.importTaxes.taxAmount')}
                    </HeaderCell>
                    {editable && <th aria-hidden="true" data-testid="SiiImportTaxesSection__thActions" />}
                  </tr>
                </thead>
                  {rows.map(row => (
                    <ImportTaxRow
                      key={row.key}
                      ui={ui}
                      row={row}
                      multiDua={multiDua}
                      editable={editable}
                      currency={currency}
                      locale={locale}
                      rateMap={rateMap}
                      taxCatalogs={taxCatalogs}
                      token={token}
                      onTaxChange={onTaxChange}
                      onBaseCommit={onBaseCommit}
                      onDuaChange={onDuaChange}
                      onDuaBlur={onDuaBlur}
                      onDateChange={onDateChange}
                      onDelete={onDelete}
                      data-testid="ImportTaxRow__siiImportTax" />
                  ))}
              </table>
            </div>
          )}
          {multiDua && rows.some(r => isDuaDateAfterAccountingDate(r.aeatsiiFechaDua, accountingRegisterDate)) && (
            <InfoBanner
              tone="warning"
              icon={WarningIcon}
              dismissible={false}
              data-testid="SiiImportTaxesSection__dateHint">
              {ui('sifDataTabs.dua.dateAfterAccountingDate')}
            </InfoBanner>
          )}
          {rows.length === 0 && !editable && (
            <p className="text-xs text-muted-foreground" data-testid="SiiImportTaxesSection__empty">
              {ui('sifDataTabs.importTaxes.empty')}
            </p>
          )}
          <div className="flex flex-wrap items-start justify-between gap-4" data-testid="SiiImportTaxesSection__footer">
            <div className="flex flex-wrap items-center gap-2" data-testid="SiiImportTaxesSection__footerActions">
            {editable ? (
              <button
                type="button"
                onClick={() => setRows(prev => [...prev, newDraftRow()])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border-control px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                data-testid="Button__siiImportTaxAdd">
                <PlusIcon className="h-4 w-4" data-testid="Plus__siiImportTax" />
                {ui('sifDataTabs.importTaxes.add')}
              </button>
            ) : <span data-testid="SiiImportTaxesSection__footerSpacer" />}
            {editable && deferredVat && (
              <span title={compensationHint ?? undefined} className="inline-flex" data-testid="SiiImportTaxesSection__compensateWrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCompensatoryLines}
                  disabled={Boolean(compensationHint) || compensating}
                  data-testid="Button__siiImportTaxCompensate">
                  {ui('sifDataTabs.importTaxes.addCompensatory')}
                </Button>
              </span>
            )}
            </div>
            <div className="min-w-56 space-y-1.5" data-testid="SiiImportTaxesSection__summary">
              <SummaryLine
                label={ui('sifDataTabs.importTaxes.taxableAmount')}
                value={formatCurrency(currency, summary.base)}
                testId="SiiImportTaxesSection__sumBase"
                data-testid="SummaryLine__base" />
              <SummaryLine
                label={ui('sifDataTabs.importTaxes.summaryTaxAmount')}
                value={formatCurrency(currency, summary.amount)}
                testId="SiiImportTaxesSection__sumAmount"
                data-testid="SummaryLine__amount" />
              <div className="border-t border-border/60" data-testid="SiiImportTaxesSection__sumSeparator" />
              <SummaryLine
                label={ui('sifDataTabs.importTaxes.duaTotal')}
                value={formatCurrency(currency, summary.total)}
                strong
                testId="SiiImportTaxesSection__sumTotal"
                data-testid="SummaryLine__total" />
            </div>
          </div>
        </>
      )}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        count={1}
        deleting={deleting}
        onConfirm={confirmDelete}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        testIdScope="sii-import-tax-delete"
        data-testid="DeleteConfirmDialog__siiImportTax" />
    </SiiPanelCard>
  );
}

export default function SiiImportTaxesSection({
  ui, siiTypeKey, multiDua, recordId, data, apiBaseUrl, token, readOnly, onHeaderRefresh, step,
  deferredVat = false, accountingRegisterDate = null,
}) {
  const enabled = useSiiImportDuaEnabled();
  if (!enabled || !DUA_TYPE_KEYS.has(siiTypeKey)) return null;
  return (
    <ImportTaxesBlock
      ui={ui}
      multiDua={multiDua}
      recordId={recordId}
      data={data}
      apiBaseUrl={apiBaseUrl}
      token={token}
      readOnly={readOnly}
      onHeaderRefresh={onHeaderRefresh}
      step={step}
      deferredVat={deferredVat}
      accountingRegisterDate={accountingRegisterDate}
      data-testid="ImportTaxesBlock__siiImportTax" />
  );
}
