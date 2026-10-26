import { Children, cloneElement } from 'react';
import { useGridView } from '@/hooks/useGridView.js';
import { useFeatureFlag, GRID_COLUMN_VIEWS } from '@/lib/flags';
import { GridViewControls } from '@/components/contract-ui/GridViewControls.jsx';
import { gridHeaderProps, gridReorderHandle, gridResizeHandle } from '@/components/contract-ui/GridColumnHeaderControls.jsx';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, FileText, Loader2, Plus, Search, Trash2, Info } from 'lucide-react';
import { useUI, useLabel, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { parseCalendarDate } from '@/lib/dateOnly.js';
import { toast } from 'sonner';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import SharedInvoicePickerModal from '@/components/contract-ui/InvoicePickerModal.jsx';
import { useFiscalModelsCatalog, isModelActive } from '@/windows/custom/fiscal-models/useFiscalModelsCatalog.js';
/* eslint-disable react/prop-types */

// ETP-5059 — the 349 period of a corrective is NOT free: AEAT349_CINVREV_TRG0 (module
// org.openbravo.module.aeat349.es) accepts only the ORIGINAL invoice's month (`MM`) or its quarter
// (`nT`), and the year only as the original's fiscal year; the annual `0A` is refused (annual 349
// filing is no longer used). The picker lists exactly the month and the quarter, derived from the
// original's invoice date. A legacy stored `0A` is still shown, never offered as a new choice.
const QUARTER_LABEL_KEYS = { '1T': 'rectPeriodQ1', '2T': 'rectPeriodQ2', '3T': 'rectPeriodQ3', '4T': 'rectPeriodQ4' };
const MONTH_CODE_RE = /^(0[1-9]|1[0-2])$/;

/**
 * The 349 year/month/quarter of an original invoice, from its invoice date — the same values the
 * trigger computes with TO_CHAR(DateInvoiced, 'YYYY' | 'MM' | 'Q'). Parsed as a CALENDAR date
 * (parseCalendarDate), never `new Date(string)`: a UTC-midnight parse would move an invoice dated
 * the 1st into the previous month — and the previous quarter or year — west of Greenwich.
 */
function originalPeriods(invoiceDate) {
  const d = parseCalendarDate(invoiceDate);
  if (!d) return null;
  const month = d.getMonth() + 1;
  return {
    year: String(d.getFullYear()),
    month: String(month).padStart(2, '0'),
    quarter: `${Math.ceil(month / 3)}T`,
  };
}

// Localized label of one AEAT-349 period code: quarters via i18n keys, months via Intl for the
// active locale. `0A` (annual) is refused by the module and never offered; a legacy row that still
// stores it keeps its "0A - Anual" label. Any other code shows as-is.
function periodLabel(code, ui, locale) {
  if (QUARTER_LABEL_KEYS[code]) return `${code} - ${ui(QUARTER_LABEL_KEYS[code])}`;
  if (code === '0A') return `${code} - ${ui('rectPeriodAnnual')}`;
  if (MONTH_CODE_RE.test(code)) {
    const tag = (locale || 'es_ES').replace('_', '-');
    const name = new Intl.DateTimeFormat(tag, { month: 'long' }).format(new Date(2000, Number(code) - 1, 1));
    return `${code} - ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }
  return code;
}

// The original's month and quarter, in that order (the month is the default). A stored value
// outside that pair — a legacy `0A`, or any value saved before the rule existed — is kept as an
// extra option so the select shows what is really stored instead of silently pretending it is the
// month. Such a row is fixed by choosing the month or the quarter (the year goes as null and the
// trigger fills it); a year-only change re-sends the stored value and the trigger refuses it.
function buildPeriodOptions(ui, locale, orig, current) {
  const codes = orig ? [orig.month, orig.quarter] : [];
  if (current && !codes.includes(current)) codes.push(current);
  return codes.map(v => ({ value: v, label: periodLabel(v, ui, locale) }));
}

// ── helpers ───────────────────────────────────────────────────────────────────
function isCorrective(row) {
  return row?.aEAT349IsCorrective === 'Y' || row?.aEAT349IsCorrective === true;
}

function parseRows(json) {
  return json?.response?.data ?? json?.data ?? [];
}

// A single-record GET answers either a one-row list or the bare row, depending on the path.
function firstRow(json) {
  const d = json?.response?.data ?? json?.data ?? null;
  return Array.isArray(d) ? (d[0] ?? null) : d;
}

/**
 * Invoice date of the original invoice a rectification row points at, read from the same NEO
 * header entity the picker lists (the original is always of the same flow). Read by id rather
 * than parsed from `reversedInvoice$_identifier`, whose date part follows the server's display
 * format. `loaded` stays false until the answer for THIS id arrived, so a stale date of a
 * previously selected invoice is never used to build the period options.
 */
function useOriginalInvoiceDate(apiBaseUrl, invoiceId) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [state, setState] = useState({ id: null, date: null });
  useEffect(() => {
    if (!apiBaseUrl || !invoiceId) return undefined;
    let cancelled = false;
    apiFetch(`/header/${encodeURIComponent(invoiceId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => { if (!cancelled) setState({ id: invoiceId, date: firstRow(json)?.invoiceDate ?? null }); })
      .catch(() => { if (!cancelled) setState({ id: invoiceId, date: null }); });
    return () => { cancelled = true; };
  }, [apiFetch, apiBaseUrl, invoiceId]);
  const loaded = !!invoiceId && state.id === invoiceId;
  return { loaded, date: loaded ? state.date : null };
}

// NEO error bodies come in two shapes:
//   500 → {"error":{"message":"..."}}
//   400 → {"response":{"status":-4,"errors":{field:"msg",...}}}
function parseNeoError(json) {
  if (json?.error?.message) return json.error.message;
  const errs = json?.response?.errors;
  if (errs && typeof errs === 'object') {
    const msgs = Object.values(errs).filter(Boolean);
    if (msgs.length) return msgs.join(' · ');
  }
  return json?.message ?? null;
}

// Stable signature of the new-line draft, used to tell "the user changed
// something" from "this is the exact draft that already failed"
function draftSignature(draft) {
  const d = draft ?? {};
  return JSON.stringify(Object.keys(d).sort((a, b) => a.localeCompare(b)).map(k => [k, d[k]]));
}

// NEO does not send expanded reversedInvoice$documentNo/$invoiceDate/$grandTotalAmt
// fields — parse them from the _identifier: "10000016 - 01-03-2021 - 14.52"
function parseReversedRef(line) {
  const ident = line?.['reversedInvoice$_identifier'] ?? '';
  const parts = ident.split(' - ');
  const docNo = parts[0] || ident || null;
  const date = parts[1] ? parts[1].replace(/-/g, '/') : null;
  const amount = parts[2] != null && parts[2] !== '' ? Number(parts[2]) : null;
  return { docNo, date, amount: Number.isNaN(amount) ? null : amount };
}

// ── CorrectivaBadge ───────────────────────────────────────────────────────────
function CorrectivaBadge({ corrective }) {
  const ui = useUI();
  if (corrective) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-purple-700 border"
        style={{ backgroundColor: '#F4F1FD', borderColor: '#C6B6F7' }}
      >
        {ui('rectCorrective349Badge')}
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">No</span>;
}

// ── InfoTooltip ───────────────────────────────────────────────────────────────
function InfoTooltip({ text }) {
  const ui = useUI();
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={ui('rectMoreInfo')}
      >
        <Info className="h-3.5 w-3.5" data-testid="Info__4395d6" />
      </button>
      {visible && (
        <div className="absolute left-6 top-0 z-50 w-72 rounded-lg bg-inverse px-3 py-2 text-xs text-inverse-foreground shadow-lg">
          {text}
        </div>
      )}
    </span>
  );
}

// ── InvoicePickerModal ────────────────────────────────────────────────────────
// Loads the candidates and hands rendering to the shared
// components/contract-ui/InvoicePickerModal — the same list the return-document flow uses in
// multi-select mode (ETP-5381). Only the fetch stays here, because this tab reads the NEO header
// entity directly while the return flow reads its own action endpoint.
//
// Candidates: COMPLETED invoices of the same flow (sales or purchase) AND the same business
// partner as the invoice being rectified.
//
// ETP-5381: the business-partner filter is NEW, and it replaces a comment here that argued the
// opposite — "the C_Invoice_Reverse DB trigger enforces same-BP only when applicable (Verifactu
// orgs allow cross-BP rectifications), and any rejection is surfaced via the save error message".
// That was wrong. The trigger (src-db/database/model/triggers/C_INVOICE_REVERSE_TRG.xml, whose own
// title is "Check the introduced BP is the same as the Invoice") raises @NotEqualBPartner@ from an
// UNCONDITIONAL check — Openbravo core, no Verifactu branch. So the unfiltered list offered rows
// the database always rejects and the user only found out on save. The same fix landed on the
// return-document side in ReturnShipmentUtils#fetchSelectableInvoices. Do NOT reinstate the old
// behaviour on the strength of the old comment.
// Paged server-side (ETP-5381), the same way the list windows page through `useEntity`: one batch
// of PAGE_SIZE rows, another appended when the user reaches the bottom. `criteria` carries the
// partner and the CO filter so the SERVER narrows the set — filtering a fetched page in the browser
// would drop rows the server already matched, and, worse, report "no matches" for an invoice
// sitting in a batch nobody asked for.
const RECT_PAGE_SIZE = 80;

// Search rides in the SAME criteria array rather than a bespoke query parameter. An earlier
// revision of this invented `_textFilter`, which NEO does not implement — it would have been
// accepted and ignored, so typing would have narrowed nothing while looking like it worked.
// `contains` on documentNo is enough here precisely because the list is already one partner:
// matching the partner name too would match every row.
const rectCriteria = (bpId, query) => encodeURIComponent(JSON.stringify([
  { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
  ...(bpId ? [{ fieldName: 'businessPartner', operator: 'equals', value: bpId }] : []),
  ...(query ? [{ fieldName: 'documentNo', operator: 'contains', value: query }] : []),
]));

function InvoicePickerModal({ apiBaseUrl, token, currentId, bpId, multiple, selectedIds, onSelect, onApply, onClose }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const reqRef = useRef(0);
  const startRowRef = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const fetchBatch = useCallback(async (startRow, { append }) => {
    // ETP-4576 - no `!token` conjunct: under the cookie session the client holds no token,
    // so this guard would be permanently true and the picker would never load a single row.
    // apiFetch resolves the credential from the active scheme.
    if (!apiBaseUrl) return;
    const seq = ++reqRef.current;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      // apiBaseUrl = /sws/neo/{spec} — data lives at {spec}/header
      const qs = new URLSearchParams({
        _startRow: String(startRow),
        _endRow: String(startRow + RECT_PAGE_SIZE - 1),
        _sortBy: 'documentNo desc',
      });
      const res = await apiFetch(`/header?${qs}&criteria=${rectCriteria(bpId, query)}`);
      if (seq !== reqRef.current) return;
      const rows = res.ok ? parseRows(await res.json()) : [];
      if (seq !== reqRef.current) return;
      setInvoices(prev => (append ? [...prev, ...rows] : rows));
      // Same short-batch signal useEntity reads — no second COUNT(*) per scroll.
      setHasMore(rows.length >= RECT_PAGE_SIZE);
      startRowRef.current = startRow + rows.length;
    } catch {
      // Stop paging rather than retrying into a loop; the rows already fetched stay usable.
      setHasMore(false);
    } finally {
      if (seq === reqRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [apiFetch, apiBaseUrl, token, bpId, query]);

  useEffect(() => { startRowRef.current = 0; fetchBatch(0, { append: false }); }, [fetchBatch]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    fetchBatch(startRowRef.current, { append: true });
  }, [hasMore, loadingMore, loading, fetchBatch]);

  return (
    <SharedInvoicePickerModal
      invoices={invoices}
      loading={loading}
      currentId={currentId}
      multiple={multiple}
      selectedIds={selectedIds}
      onSelect={onSelect}
      // A single pick still deserves its document number on the field — "1 selected" tells the user
      // less than "10000094" does. The shared modal only hands back ids, and only this wrapper holds
      // the rows, so the label is resolved here rather than pushing row shape into the caller.
      onApply={onApply ? (ids) => {
        const only = ids.length === 1 ? invoices.find(inv => inv.id === ids[0]) : null;
        onApply(ids, only ? (only.documentNo || only._identifier || only.id) : '');
      } : undefined}
      onClose={onClose}
      // Server-driven: hands over one batch at a time and asks for the next on scroll. No
      // `suggested` flag reaches these rows — this tab has no return document and therefore no
      // chain to detect, so nothing is ever badged "related" here.
      search={search}
      onSearchChange={setSearch}
      onReachBottom={loadMore}
      loadingMore={loadingMore}
      data-testid="SharedInvoicePickerModal__4395d6" />
  );
}

// ── YearPickerSelect ──────────────────────────────────────────────────────────
// Loads fiscal years from /fiscal-calendar instead of the broken NEO selector.
//
// ETP-5059 — only the ORIGINAL invoice's fiscal year is offered (`originalYear`, its YYYY):
// AEAT349_CINVREV_TRG0 refuses any other. When the calendar has no such year the select offers
// nothing and the backend's own message (EM_AEAT349_CINVREV_NO_YEAR) explains why on save. While
// the stored value is empty, the original's year is shown, since that is what the trigger fills.
function YearPickerSelect({ apiBaseUrl, token, value, displayValue, originalYear, onChange, readOnly, disabled = false }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [years, setYears] = useState(null);

  useEffect(() => {
    if (!apiBaseUrl || readOnly) return;
    // apiBaseUrl = /sws/neo/{spec} — strip spec to reach /sws/neo, then hit the year entity
    const neoBase = apiBaseUrl.replace(/\/[^/]+$/, '');
    apiFetch(`${neoBase}/fiscal-calendar/year?_startRow=0&_endRow=100`, { baseUrl: '' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const rows = parseRows(json);
        const opts = rows
          .map(r => ({ id: r.id, label: String(r.fiscalYear ?? r._identifier ?? r.id) }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        setYears(opts);
      })
      .catch(() => setYears([]));
  }, [apiBaseUrl, token, apiFetch, readOnly]);

  const options = useMemo(() => {
    const opts = originalYear ? (years || []).filter(y => y.label === originalYear) : [];
    // A stored year outside the allowed one (a row saved before ETP-5059) stays visible as it is.
    if (value && !opts.some(y => y.id === value)) opts.push({ id: value, label: displayValue || value });
    return opts;
  }, [years, originalYear, value, displayValue]);

  if (readOnly) {
    return (
      <input
        value={displayValue || value || ''}
        disabled readOnly
        className="flex h-10 w-full rounded-lg border border-border-control bg-card px-3 text-sm disabled:opacity-70"
      />
    );
  }

  const shown = value || options[0]?.id || '';
  return (
    <select
      value={shown}
      disabled={disabled || years === null || options.length === 0}
      onChange={e => {
        const opt = options.find(y => y.id === e.target.value);
        onChange(e.target.value, opt?.label ?? '');
      }}
      className="flex h-10 w-full rounded-lg border border-border-control bg-card px-3 text-sm focus:outline-none disabled:opacity-70"
    >
      {options.length === 0 && <option value="">{years === null ? ui('selectPlaceholder') : '—'}</option>}
      {options.map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
    </select>
  );
}

// ── AmountInput ──────────────────────────────────────────────────────────────
// Read-only amount display (349 base amounts are DB-trigger computed); the value carries its
// currency symbol from formatCurrency, so there is no separate currency prefix.
function AmountInput({ label, value }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground block">{label}</label>
      <div className="flex items-center h-10 rounded-lg border border-border-control bg-muted overflow-hidden">
        <input
          type="text"
          value={value}
          disabled
          readOnly
          className="flex-1 px-3 text-sm text-right tabular-nums bg-transparent focus:outline-none cursor-not-allowed opacity-70"
          data-testid="AmountInput__4395d6" />
      </div>
    </div>
  );
}

// ── AeatGrid ─────────────────────────────────────────────────────────────────
// Renders the 4 AEAT-349 conditional fields in a 4-column grid.
function AeatGrid({ data, onChange, onFieldSave, apiBaseUrl, token, readOnly, saving = false, labelOverrides }) {
  const t = useLabel(labelOverrides);
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  // ETP-5059 — year and period are bound to the original invoice, so both pickers are built from
  // its invoice date. On a multi-selection draft that is the FIRST selected invoice; the trigger
  // still checks every row against its own original.
  const { date: originalDate } = useOriginalInvoiceDate(apiBaseUrl, readOnly ? null : data?.reversedInvoice);
  const orig = useMemo(() => originalPeriods(originalDate), [originalDate]);
  const storedPeriod = data?.aEAT349Period || '';
  const periodOptions = useMemo(
    () => buildPeriodOptions(ui, locale, orig, storedPeriod),
    [ui, locale, orig, storedPeriod],
  );
  // Empty period = the trigger will store the month, so the month is what is shown by default.
  const shownPeriod = storedPeriod || orig?.month || '';
  // 349 bases are always EUR; canonical formatter (CLAUDE.md, Currency & Amount Formatting).
  const fmtEur = v => (v != null ? formatCurrency('EUR', v) : '');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {/* Año — loads from /fiscal-calendar instead of the NEO selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground block">
          {t('EM_AEAT349_C_Year_ID') ?? 'Año'}
          {!readOnly && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <YearPickerSelect
          apiBaseUrl={apiBaseUrl}
          token={token}
          value={data?.aEAT349CYear ?? ''}
          displayValue={data?.['aEAT349CYear$_identifier'] ?? ''}
          originalYear={orig?.year}
          readOnly={readOnly}
          disabled={saving}
          onChange={(val, lbl) => {
            onChange('aEAT349CYear', val);
            onChange('aEAT349CYear$_identifier', lbl ?? '');
            onFieldSave?.('aEAT349CYear', val);
          }}
          data-testid="YearPickerSelect__4395d6" />
      </div>
      {/* Periodo — the original's month (default) or its quarter */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground block">
          {t('EM_AEAT349_Period') ?? 'Periodo'}
          {!readOnly && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <select
          value={shownPeriod}
          disabled={readOnly || saving || periodOptions.length === 0}
          data-testid="select__aeat349Period"
          className="flex h-10 w-full rounded-lg border border-border-control bg-card px-3 text-sm focus:outline-none disabled:opacity-70"
          onChange={e => {
            onChange('aEAT349Period', e.target.value);
            onFieldSave?.('aEAT349Period', e.target.value);
          }}
        >
          {periodOptions.length === 0 && <option value="">—</option>}
          {periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {/* Base 349 Productos — read-only, DB-trigger computed */}
      <AmountInput
        label={ui('rectBaseProducts')}
        value={fmtEur(data?.aEAT349BPBaseAmount)}
        data-testid="AmountInput__4395d6" />
      {/* Base 349 Servicios — read-only, DB-trigger computed */}
      <AmountInput
        label={ui('rectBaseServices')}
        value={fmtEur(data?.aEAT349BPBaseAmountS)}
        data-testid="AmountInput__4395d6" />
    </div>
  );
}

// ── ExpandedForm ──────────────────────────────────────────────────────────────
// Renders the expandable form section for an existing row or for a new draft.
function ExpandedForm({
  lineData, readOnly, isDraft,
  onChange, onFieldSave,
  apiBaseUrl, token, catalogs, labelOverrides,
  bpId, recordId,
  onCancel,
  onSave,
  saving,
  model349Active,
  aeatSaving = false,
}) {
  const t = useLabel(labelOverrides);
  const ui = useUI();
  const [pickerOpen, setPickerOpen] = useState(false);
  const corrective = isCorrective(lineData);
  const TOOLTIP_TEXT = ui('rectTooltip349');

  const invoiceIdentifier = lineData?.['reversedInvoice$_identifier'] ?? '';
  const ref = parseReversedRef(lineData);
  const draftSelectedCount = lineData?._reversedInvoiceIds?.length ?? 0;

  // Formatted display: "10000067 · 05/06/2026 · 2.854,20"
  const invoiceDisplayParts = [
    ref.docNo,
    ref.date,
    ref.amount != null ? formatCurrency('EUR', ref.amount) : null,
  ].filter(Boolean);
  const invoiceDisplay = invoiceDisplayParts.join(' · ');

  // Picker used by both the draft row and an existing (editable) row. The draft row does not
  // persist immediately; the existing row PATCHes on select.
  //
  // ETP-5381 — multi-select on the DRAFT only, and that asymmetry is the point. A row in this tab
  // holds exactly one `reversedInvoice`, so "select several" cannot mean "put several in this
  // field" — it means CREATE SEVERAL ROWS, which is only meaningful while adding. Editing an
  // existing row is still picking one invoice to replace one invoice; offering checkboxes there
  // would imply it could fan out into new rows, which it cannot.
  const picker = (persistOnSelect) => pickerOpen && (
    <InvoicePickerModal
      apiBaseUrl={apiBaseUrl}
      token={token}
      currentId={recordId}
      bpId={bpId}
      multiple={isDraft}
      selectedIds={isDraft ? (lineData?._reversedInvoiceIds ?? []) : []}
      onApply={isDraft ? (ids, soleLabel) => {
        // The first id keeps feeding `reversedInvoice` so every existing consumer (the save
        // guard, the payload, the display) keeps working unchanged; the full list rides
        // alongside and is what handleSaveNewLine fans out over.
        onChange('_reversedInvoiceIds', ids);
        onChange('reversedInvoice', ids[0] ?? null);
        // Empty for a multi-selection — there is no single identifier to show, and the count
        // stands in. For exactly one, the document number goes back in, or the field would read
        // as "nothing selected" while Save is enabled.
        onChange('reversedInvoice$_identifier', soleLabel || '');
        // ETP-5059 — a year/period picked for the previous original belongs to THAT invoice; the
        // trigger would refuse it for the new one. Clear them so the new original's defaults
        // (its year, its month) apply again.
        onChange('aEAT349CYear', undefined);
        onChange('aEAT349CYear$_identifier', undefined);
        onChange('aEAT349Period', undefined);
        setPickerOpen(false);
      } : undefined}
      onSelect={!isDraft ? (id, label) => {
        onChange('reversedInvoice', id);
        onChange('reversedInvoice$_identifier', label);
        if (persistOnSelect) onFieldSave?.('reversedInvoice', id);
      } : undefined}
      onClose={() => setPickerOpen(false)}
      data-testid="InvoicePickerModal__4395d6" />
  );

  // readOnly → static text; draft → picker trigger; existing → text + search icon
  let invoiceField;
  if (readOnly) {
    invoiceField = (
      <div className="flex items-center gap-2">
        <div className="flex h-10 flex-1 items-center rounded-lg border border-border-control bg-card px-3 text-sm text-foreground">
          {invoiceDisplay || '—'}
        </div>
      </div>
    );
  } else if (isDraft) {
    invoiceField = (
      <>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          // Stable handle for E2E: the label is translated AND varies with the selection
          // (placeholder / document number / "N seleccionadas"), so no text locator can hold.
          data-testid="rectify-select-invoices"
          className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border-control bg-card px-3 text-sm hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <span className={`truncate ${lineData?.reversedInvoice ? 'text-foreground' : 'text-muted-foreground'}`}>
            {/* A multi-selection has no single identifier to show, so the count stands in — and it
                has to say something, because an empty field next to a filled-in draft reads as
                "nothing selected" and invites the user to pick again. */}
            {draftSelectedCount > 1
              ? ui('rectifySelectedCount', { count: draftSelectedCount })
              : (lineData?.['reversedInvoice$_identifier'] || ui('rectifySelectInvoices'))}
          </span>
          <Search className="h-4 w-4 text-muted-foreground shrink-0" data-testid="Search__4395d6" />
        </button>
        {picker(false)}
      </>
    );
  } else {
    invoiceField = (
      <>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-10 flex-1 items-center rounded-lg border border-border-control bg-card px-3 text-sm text-foreground truncate text-left hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {invoiceDisplay || invoiceIdentifier || '—'}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-control bg-card text-muted-foreground hover:text-foreground transition-colors"
            aria-label={ui('rectSearchAria')}
          >
            <Search className="h-4 w-4" data-testid="Search__4395d6" />
          </button>
        </div>
        {picker(true)}
      </>
    );
  }

  return (
    <div className="px-6 py-4 space-y-4 bg-card border-t border-border/30">
      {/* Factura original — compact field + search icon, per UX spec */}
      <div className="space-y-1.5 max-w-[360px]">
        <label className="text-sm font-medium text-foreground">
          {t('Reversed_C_Invoice_ID') ?? 'Factura original'}
          <span className="text-destructive ml-0.5">*</span>
        </label>
        {invoiceField}
      </div>
      {/* Gray panel: Correctiva del 349 checkbox + conditional AEAT fields, per UX spec.
          Hidden entirely unless Modelo 349 is active in the Fiscal Models catalog — this
          checkbox exists only to feed the AEAT-349 declaration, so it has no reason to be
          on-screen when that model isn't even in use. */}
      {model349Active && (
        <div className="rounded-lg bg-muted px-4 py-3 space-y-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={corrective}
              aria-busy={aeatSaving || undefined}
              disabled={readOnly || aeatSaving}
              onClick={() => {
                if (readOnly || aeatSaving) return;
                const next = corrective ? 'N' : 'Y';
                onChange('aEAT349IsCorrective', next);
                onFieldSave?.('aEAT349IsCorrective', next);
              }}
              className={[
                'mt-0.5 h-5 w-5 shrink-0 rounded-sm border border-border-control shadow-[0px_1px_2px_rgba(18,18,23,0.05)]',
                'flex items-center justify-center transition-colors focus-visible:outline-none',
                corrective ? 'bg-primary text-primary-foreground border-primary' : 'bg-card',
                readOnly || aeatSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
              data-testid="checkbox__isCorrective"
            >
              {aeatSaving && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="checkbox__isCorrective-saving" />
              )}
              {!aeatSaving && corrective && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">
                {t('EM_AEAT349_IsCorrective') ?? 'Correctiva del 349'}
              </span>
              <InfoTooltip text={TOOLTIP_TEXT} data-testid="InfoTooltip__4395d6" />
            </div>
          </div>

          {/* Conditional AEAT fields */}
          {corrective && (
            <AeatGrid
              data={lineData}
              onChange={onChange}
              onFieldSave={onFieldSave}
              apiBaseUrl={apiBaseUrl}
              token={token}
              readOnly={readOnly}
              saving={aeatSaving}
              labelOverrides={labelOverrides}
              data-testid="AeatGrid__4395d6" />
          )}
        </div>
      )}
      {/* Draft-only: save / cancel buttons. Save/patch/delete errors are
          surfaced ONLY as a toast (ETP-5027) — one error, one toast, on every
          path, never an inline paragraph duplicating the same message. */}
      {isDraft && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={!lineData?.reversedInvoice || saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="btn__saveNewLine"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__4395d6" />}
            {ui('save')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-lg border border-border-control px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
            data-testid="btn__cancelNewLine"
          >
            {ui('cancel')}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ReversedInvoicesPanel ─────────────────────────────────────────────────────
export default function ReversedInvoicesPanel({
  recordId: recordIdProp,
  data,
  token,
  apiBaseUrl,
  api,
  catalogs,
  onCountChange,
  isActive,
  isNew,
  onSaveHeader,
  onGoToSavedRecord,
  autoOpenAdd,
  restoreDraft,
  accessReadOnly = false,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  // A request with no HTTP answer rejects with a NetworkError whose message is already translated
  // (docs/request-policy.md); anything else keeps the generic save error.
  const saveErrorMessage = err => (isNetworkError(err) ? err.message : ui('rectSaveError'));

  const [lines, setLines] = useState([]);

  const gridColumnViews = useFeatureFlag(GRID_COLUMN_VIEWS);
  const gridColumns = useMemo(() => [
    { key: 'reversedInvoice', column: 'Reversed_C_Invoice_ID', label: ui('rectColOriginalInvoice'), sourceIndex: 1, required: true },
    { key: 'invoiceDate', label: ui('rectColDate'), sourceIndex: 2 },
    { key: 'documentNo', label: ui('rectColDocument'), sourceIndex: 3 },
    { key: 'aEAT349IsCorrective', column: 'EM_AEAT349_IsCorrective', label: ui('rectColModel349'), sourceIndex: 4 },
    { key: 'grandTotalAmount', label: ui('rectColTotal'), sourceIndex: 5 },
  ], [ui]);
  const gridSpec = apiBaseUrl?.match(/\/sws\/neo\/(sales-invoice|purchase-invoice)\/?$/)?.[1] ?? null;
  const gridView = useGridView({
    spec: gridSpec, entity: 'reversedInvoices', columns: gridColumns, data: lines,
    enabled: gridColumnViews && Boolean(gridSpec), apiBaseUrl,
  });
  // Structural cells stay outside the personal view; existing editors and actions
  // retain their handlers and React keys when data cells move.
  const renderGridCells = (fragment) => {
    if (!gridColumnViews || !gridSpec) return fragment;
    const cells = Children.toArray(fragment.props.children);
    const visibleColumns = gridView.active ? gridView.columns : gridColumns;
    const count = visibleColumns.length + 2;
    if (cells.length === 1 && cells[0].props.colSpan) {
      return cloneElement(cells[0], { colSpan: count });
    }
    const dataCells = visibleColumns.map((column) => {
      const cell = cells[column.sourceIndex];
      if (!gridView.active) return cloneElement(cell, { key: column.key });
      const header = cell.type === 'th';
      const width = column.gridUserWidthPx;
      return cloneElement(cell, {
        key: column.key,
        'data-grid-column': column.key,
        style: { ...cell.props.style, ...(width != null ? { width, maxWidth: width, overflow: 'hidden' } : {}), ...(header ? { position: 'relative' } : {}) },
        ...(header ? gridHeaderProps(column, gridView) : {}),
      }, header ? <>{cell.props.children}{gridReorderHandle(column, gridView, column.label, ui)}{gridResizeHandle(column, gridView, column.label, ui)}</> : cell.props.children);
    });
    return [...cells.slice(0, 1), ...dataCells, ...cells.slice(-1)];
  };
  const gridControls = gridColumnViews && gridSpec ? (
    <GridViewControls gridView={gridView} gridColumns={gridColumns} ui={ui}
      t={(key) => gridColumns.find((column) => (column.column ?? column.label ?? column.key) === key)?.label ?? key} />
  ) : null;

  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingEdits, setPendingEdits] = useState({});
  const [deleting, setDeleting] = useState(null);

  // New line draft state
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({});
  const [saving, setSaving] = useState(false);
  const addRowRef = useRef(null);
  // Signature of the draft whose POST was rejected. The rectifications tab stays
  // MOUNTED when the user switches tabs (DetailView hides inactive tabs with
  // display:none), so the document-level capture-phase mousedown below fires on
  // every tab click and used to re-run handleSaveNewLine() with the very same
  // rejected draft — one extra failed POST (and, before this fix, one extra
  // toast) per tab change, unbounded. Re-arms as soon as the draft changes.
  const failedDraftRef = useRef(null);

  // Track whether data has been fetched at least once
  const fetchedRef = useRef(false);

  // "Correctiva del 349" gating: the checkbox (and its dependent AEAT-349 fields) is
  // Modelo-349-specific and stays hidden unless 349 is active in the Fiscal Models catalog.
  // Read through the shared `useFiscalModelsCatalog` (ETP-5831): `{}` or a failed read means no
  // model active, so the panel is fail-closed (hidden) until the catalog confirms 349 === true,
  // never visible-then-hidden. Re-read on `token` change, as before.
  const { activeModels, loaded: catalogLoaded } = useFiscalModelsCatalog(apiBaseUrl, token);
  const model349Active = catalogLoaded && isModelActive(activeModels, '349');

  // On unsaved records the route passes recordId='new' — treat it as no record
  // so add/fetch stay disabled until the invoice is saved (a rectification row
  // needs a persisted parent FK)
  const recordId = (recordIdProp && recordIdProp !== 'new') ? recordIdProp : data?.id;

  // Save-header-first flow (same UX as the Lines tab): on a new invoice the add
  // button persists the header via onSaveHeader; after DetailView navigates to the
  // saved record it sets autoOpenAdd so the add form reopens automatically.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenAdd && recordId && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      // Restore the in-progress draft (and its save error) carried across the
      // save-header navigation, so a failed child POST loses nothing
      if (restoreDraft?.draft) setNewLine(restoreDraft.draft);
      if (restoreDraft?.error) {
        toast.error(restoreDraft.error);
        // The draft carried across the navigation is the one the backend just
        // rejected: keep the re-fire guard armed so the click-outside auto-save
        // does not re-POST (and re-toast) it on the next tab switch.
        failedDraftRef.current = draftSignature(restoreDraft.draft);
      }
      setAddingLine(true);
    }
  }, [autoOpenAdd, recordId, restoreDraft]);

  function handleAddClick() {
    setAddingLine(true);
  }

  // Shared component: derive the doc-type subtitle from the spec in apiBaseUrl
  const docTypeLabel = (apiBaseUrl || '').includes('purchase-invoice')
    ? ui('rectDocPurchase') : ui('rectDocSales');

  // ── data fetching ──────────────────────────────────────────────────────────
  // `silent`: re-read after a write without swapping the rows for the loading line, so an open
  // row does not collapse and re-open around every save.
  const fetchLines = useCallback(async ({ silent = false } = {}) => {
    if (!recordId || !apiBaseUrl) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch(`/reversedInvoices?_startRow=0&_endRow=200`);
      if (!res.ok) return;
      const json = await res.json();
      // NEO ignores query-param filters — keep only rows of THIS invoice
      const rows = parseRows(json).filter(l => l.invoice === recordId);
      setLines(rows);
      onCountChange?.(rows.length);
    } catch { /* silent */ } finally {
      if (!silent) setLoading(false);
    }
  }, [recordId, apiBaseUrl, token, onCountChange, apiFetch]);

  // Lazy fetch on first activation
  useEffect(() => {
    if (isActive && !fetchedRef.current && recordId) {
      fetchedRef.current = true;
      fetchLines();
    }
  }, [isActive, recordId, fetchLines]);

  // ── click-outside to close add row ────────────────────────────────────────
  useEffect(() => {
    if (!addingLine) return undefined;
    function handler(e) {
      const el = addRowRef.current;
      if (!el || el.contains(e.target)) return;
      const portals = ['[data-radix-popper-content-wrapper]', '[role="listbox"]', '[role="dialog"]'];
      for (const sel of portals) { if (e.target.closest?.(sel)) return; }
      if (!newLine.reversedInvoice) { setAddingLine(false); setNewLine({}); return; }
      // Do not retry a draft the backend already rejected unchanged — keep the
      // form open (its error was already toasted) so the user can fix the fields
      if (failedDraftRef.current === draftSignature(newLine)) return;
      handleSaveNewLine();
    }
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [addingLine, newLine]);

  // ── PATCH helpers ──────────────────────────────────────────────────────────
  // Drop only the sent keys (and their $_identifier companions) so the server values win without
  // wiping other in-progress edits. On a refusal too: the row went unchanged, and keeping the
  // local value would leave e.g. the corrective box ticked over a row the trigger refused.
  function dropPendingKeys(lineId, payload) {
    setPendingEdits(p => {
      const edits = { ...(p[lineId] || {}) };
      for (const k of Object.keys(payload)) {
        delete edits[k];
        delete edits[`${k}$_identifier`];
      }
      return { ...p, [lineId]: edits };
    });
  }

  async function patchLine(lineId, payload) {
    try {
      const res = await apiFetch(`/reversedInvoices/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // Without this branch a rejected PATCH (e.g. the AEAT349 corrective DB
        // trigger) failed completely silently: the checkbox just reverted on the
        // next fetchLines() with no explanation — ETP-5027.
        let msg = ui('rectSaveError');
        try {
          msg = parseNeoError(await res.json()) || msg;
        } catch { /* keep default */ }
        toast.error(msg);
      }
      dropPendingKeys(lineId, payload);
      await fetchLines({ silent: true });
    } catch (err) {
      toast.error(saveErrorMessage(err));
    }
  }

  // Line whose AEAT-349 group is being saved. While set, that row's checkbox and pickers are
  // disabled and keep showing the SERVER values: the group is never applied optimistically on a
  // saved row, so a refusal (e.g. EM_AEAT349_ORIG_NOT_POSTED) cannot flash the fields open and
  // shut again. The row only changes once the re-read after the PATCH has landed.
  const [aeatSavingId, setAeatSavingId] = useState(null);
  // Synchronous twin of aeatSavingId: two clicks in the same task run before React re-renders, so
  // the state alone would let the second one through and send a second PATCH. The state only
  // drives the spinner/disabled UI; this ref is the actual in-flight guard.
  const aeatInFlightRef = useRef(false);

  async function patchAeatGroup(lineId, payload) {
    if (aeatInFlightRef.current) return;
    aeatInFlightRef.current = true;
    setAeatSavingId(lineId);
    try {
      await patchLine(lineId, payload);
    } finally {
      aeatInFlightRef.current = false;
      setAeatSavingId(null);
    }
  }

  // ETP-5059 — AEAT349_CINVREV_TRG0 now owns the defaults: with the corrective box ticked and the
  // year or period empty, it stores the ORIGINAL invoice's fiscal year and month. So ticking saves
  // straight away (no more waiting for the user to fill a year and a period) and the re-read after
  // the PATCH brings back what the trigger filled. Year and period go as explicit nulls: a row
  // unticked earlier may still hold the values of a previous original, which the trigger would
  // refuse instead of re-defaulting. A later change of either field saves the whole group, since
  // the trigger validates corrective + year + period together.
  const AEAT_GROUP = ['aEAT349IsCorrective', 'aEAT349CYear', 'aEAT349Period'];

  function handleFieldSave(lineId, line, key, value) {
    if (AEAT_GROUP.includes(key)) {
      if (aeatSavingId || aeatInFlightRef.current) return;
      // The group is not kept as a pending edit (see aeatSavingId): the row holds server values.
      const val = f => (f === key ? value : line?.[f]);
      const corr = val('aEAT349IsCorrective');
      if (corr !== 'Y' && corr !== true) {
        patchAeatGroup(lineId, { aEAT349IsCorrective: 'N' });
        return;
      }
      if (key === 'aEAT349IsCorrective') {
        patchAeatGroup(lineId, { aEAT349IsCorrective: 'Y', aEAT349CYear: null, aEAT349Period: null });
        return;
      }
      patchAeatGroup(lineId, {
        aEAT349IsCorrective: 'Y',
        // A period change re-sends NO year: the stored one may be a legacy wrong year, which the
        // trigger would refuse together with the new period. Null lets it fill the original's
        // year — the only value it accepts anyway.
        aEAT349CYear: key === 'aEAT349CYear' ? (value || null) : null,
        aEAT349Period: val('aEAT349Period') || null,
      });
      return;
    }
    if (String(line?.[key] ?? '') === String(value ?? '')) return;
    patchLine(lineId, { [key]: value });
  }

  function handleChange(lineId, key, value) {
    // AEAT-349 group keys (and the year's identifier) wait for the server — see aeatSavingId.
    if (AEAT_GROUP.includes(key) || key === 'aEAT349CYear$_identifier') return;
    setPendingEdits(p => ({ ...p, [lineId]: { ...p[lineId], [key]: value } }));
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async function deleteLine(lineId) {
    setDeleting(lineId);
    try {
      const res = await apiFetch(`/reversedInvoices/${lineId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        let msg = ui('rectSaveError');
        try {
          msg = parseNeoError(await res.json()) || msg;
        } catch { /* keep default */ }
        toast.error(msg);
      }
      fetchLines();
    } catch (err) {
      toast.error(saveErrorMessage(err));
    } finally { setDeleting(null); }
  }

  // ── create ─────────────────────────────────────────────────────────────────

  // ETP-5381 — one row PER selected invoice. A rectification row holds a single
  // `reversedInvoice`, so a multi-selection fans out into several rows sharing the same AEAT349
  // year/period/corrective values. Sequential on purpose, not Promise.all: the C_Invoice_Reverse
  // trigger and the AEAT349 corrective rule both run per insert, and firing them concurrently
  // would report whichever failed first while the others had already landed — leaving a partial
  // set with no clear message. Sequential stops at the first refusal, so what the toast says
  // matches what is on screen after `fetchLines()`.
  // Returns the LAST response: the first refusal when one happened, the final success otherwise.
  async function postRectificationRows(parentId) {
    // Strip the display-only identifier and the multi-select carrier before POSTing
    const payload = { ...newLine };
    delete payload['reversedInvoice$_identifier'];
    delete payload._reversedInvoiceIds;
    const ids = (newLine._reversedInvoiceIds?.length ? newLine._reversedInvoiceIds
      : [newLine.reversedInvoice]).filter(Boolean);
    let res = null;
    for (const invoiceId of ids) {
      res = await apiFetch(`/reversedInvoices`, {
        method: 'POST',
        body: JSON.stringify({ invoice: parentId, ...payload, reversedInvoice: invoiceId }),
      });
      if (!res.ok) break;
    }
    return res;
  }

  // Toast-only on every path (ETP-5027): the owner validated that these backend messages
  // (e.g. the AEAT349 corrective trigger) must surface in the toast, never as inline red
  // text next to the fields.
  async function reportSaveFailure(res, savedHeader) {
    let msg = ui('rectSaveError');
    try {
      msg = parseNeoError(await res.json()) || msg;
    } catch { /* keep default */ }
    failedDraftRef.current = draftSignature(newLine);
    if (savedHeader) {
      // Header WAS created: navigate to it (staying on /new would make every tab switch
      // re-save a "new" header → duplicate invoices + repeated "Record created" toasts).
      // The draft and error survive the remount, where the error is re-emitted as a toast.
      onGoToSavedRecord?.(savedHeader, { reopenAdd: true, draft: newLine, error: msg });
      return;
    }
    toast.error(msg);
  }

  async function handleSaveNewLine() {
    if (!newLine.reversedInvoice) return;
    if (!recordId && !onSaveHeader) return;
    setSaving(true);
    try {
      // The parent invoice FK is mandatory — on an unsaved invoice, persist the
      // header FIRST (without navigating, to keep this form alive), then POST
      // the rectification against the fresh id
      let parentId = recordId;
      let savedHeader = null;
      if (!parentId) {
        savedHeader = await onSaveHeader({ navigateAfter: false });
        if (!savedHeader?.id) {
          // null = the host already reported why (a failed save, or a save it cannot open), so
          // a second toast here would only contradict it — see onSaveHeader in DetailView.
          failedDraftRef.current = draftSignature(newLine);
          return;
        }
        parentId = savedHeader.id;
      }
      const res = await postRectificationRows(parentId);
      if (res?.ok) {
        setNewLine({});
        setAddingLine(false);
        failedDraftRef.current = null;
        if (savedHeader) {
          // Land on the saved record with this tab active — the remount refetches
          onGoToSavedRecord?.(savedHeader);
          return;
        }
        fetchLines();
      } else {
        await reportSaveFailure(res, savedHeader);
      }
    } catch (err) {
      toast.error(saveErrorMessage(err));
      failedDraftRef.current = draftSignature(newLine);
    } finally { setSaving(false); }
  }

  // ── read-only check ────────────────────────────────────────────────────────
  const processed = data?.processed === 'Y' || data?.processed === true;
  const isVoid = data?.documentStatus === 'VO';
  // TC-13: non-rectificative invoices (isRectificative explicitly false) never
  // get add/edit/delete — only explicit false blocks, so unsaved records
  // (field not yet enriched by the backend) keep the actions
  const notRectificative = data?.isRectificative === false || data?.isRectificative === 'false';
  const isReadOnly = accessReadOnly || (processed && !isVoid) || notRectificative; // ETP-5830: role tier

  // ── render ─────────────────────────────────────────────────────────────────
  const showEmptyState = !loading && lines.length === 0 && !addingLine;

  return (
    <div className="flex-1 min-w-0" data-testid="reversed-invoices-panel">
      {gridControls}
      {/* ── table ── */}
      {(lines.length > 0 || loading || addingLine) && (
        <table className="w-full" style={gridView.active && gridView.columns.some((column) => column.gridUserWidthPx != null) ? { tableLayout: 'fixed' } : undefined}>
          {gridView.active && gridView.columns.some((column) => column.gridUserWidthPx != null) && <colgroup><col style={{ width: 40 }} />{gridView.columns.map((column) => <col key={column.key} style={{ width: column.gridUserWidthPx }} />)}<col style={{ width: 40 }} /></colgroup>}
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b border-border/40">{renderGridCells(<>
              {/* expand toggle placeholder */}
              <th className="h-10 w-10 px-3" />
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColOriginalInvoice')}</th>
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColDate')}</th>
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColDocument')}</th>
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColModel349')}</th>
              <th className="h-10 px-3 text-right text-xs font-semibold text-foreground">{ui('rectColTotal')}</th>
              <th className="h-10 w-10 px-2" />
            </>)}</tr>
          </thead>

          <tbody>
            {loading && (
              <tr>{renderGridCells(<>
                <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2
                    className="h-4 w-4 animate-spin inline mr-1.5"
                    data-testid="Loader2__4395d6" />
                  {ui('loading')}
                </td>
              </>)}</tr>
            )}

            {!loading && lines.map(line => {
              const isExpanded = expandedId === line.id;
              const edits = pendingEdits[line.id] ?? {};
              const lineData = { ...line, ...edits };
              const corrective = isCorrective(lineData);
              const ref = parseReversedRef(lineData);
              const identifier = ref.docNo ?? lineData.reversedInvoice ?? '—';
              const displayDate = ref.date ?? '—';
              const docNo = ref.docNo ?? identifier;
              const totalDisplay = ref.amount != null
                ? formatCurrency('EUR', ref.amount)
                : '—';

              return (
                <React.Fragment key={line.id}>
                  <tr
                    className={`relative border-b border-border/30 group/row transition-colors cursor-pointer hover:bg-muted/30 ${isExpanded ? 'bg-muted/20' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : line.id)}
                    style={{ height: 48 }}
                  >{renderGridCells(<>
                    {/* expand chevron */}
                    <td className="px-3 align-middle" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : line.id)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-control bg-card hover:bg-page-bg transition-colors"
                        aria-label={isExpanded ? ui('rectCollapse') : ui('rectExpand')}
                      >
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          data-testid="ChevronDown__4395d6" />
                      </button>
                    </td>
                    {/* Factura original */}
                    <td className="px-3 align-middle">
                      <span className="text-sm font-semibold text-foreground">{identifier}</span>
                    </td>
                    {/* Fecha */}
                    <td className="px-3 align-middle text-sm text-foreground">{displayDate}</td>
                    {/* Documento */}
                    <td className="px-3 align-middle">
                      <div className="text-sm font-medium text-foreground">{docNo}</div>
                      <div className="text-xs text-muted-foreground">{docTypeLabel}</div>
                    </td>
                    {/* Modelo 349 */}
                    <td className="px-3 align-middle">
                      <CorrectivaBadge corrective={corrective} data-testid="CorrectivaBadge__4395d6" />
                    </td>
                    {/* Total */}
                    <td className="px-3 align-middle text-right">
                      <span className="text-sm font-semibold text-foreground">{totalDisplay}</span>
                    </td>
                    {/* Actions (three-dot menu placeholder — shows on hover) */}
                    <td className="px-2 align-middle opacity-0 group-hover/row:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => deleteLine(line.id)}
                          disabled={deleting === line.id}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          aria-label={ui('delete')}
                          data-testid="btn__deleteLine"
                        >
                          {deleting === line.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__4395d6" />
                            : <Trash2 className="h-3.5 w-3.5" data-testid="Trash2__4395d6" />}
                        </button>
                      )}
                    </td>
                  </>)}</tr>
                  {/* expanded form */}
                  {isExpanded && (
                    <tr>{renderGridCells(<>
                      <td colSpan={7} className="p-0">
                        <ExpandedForm
                          lineData={lineData}
                          readOnly={isReadOnly}
                          isDraft={false}
                          onChange={(k, v) => handleChange(line.id, k, v)}
                          onFieldSave={(k, v) => handleFieldSave(line.id, line, k, v)}
                          apiBaseUrl={apiBaseUrl}
                          token={token}
                          catalogs={catalogs}
                          labelOverrides={api?.labelOverrides}
                          bpId={data?.businessPartner}
                          recordId={recordId}
                          model349Active={model349Active}
                          aeatSaving={aeatSavingId === line.id}
                          data-testid="ExpandedForm__4395d6" />
                      </td>
                    </>)}</tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* draft new-line row — auto-expanded */}
            {addingLine && (
              <tr>{renderGridCells(<>
                <td colSpan={7} className="p-0">
                  <div ref={addRowRef}>
                    <ExpandedForm
                      lineData={newLine}
                      readOnly={false}
                      isDraft={true}
                      onChange={(k, v) => setNewLine(p => ({ ...p, [k]: v }))}
                      onFieldSave={null}
                      apiBaseUrl={apiBaseUrl}
                      token={token}
                      catalogs={catalogs}
                      labelOverrides={api?.labelOverrides}
                      bpId={data?.businessPartner}
                      recordId={recordId}
                      onSave={handleSaveNewLine}
                      onCancel={() => {
                        setAddingLine(false); setNewLine({});
                        failedDraftRef.current = null;
                      }}
                      saving={saving}
                      model349Active={model349Active}
                      data-testid="ExpandedForm__4395d6" />
                  </div>
                </td>
              </>)}</tr>
            )}
          </tbody>
        </table>
      )}
      {/* ── add link (text style, when rows exist) ── */}
      {!isReadOnly && (recordId || (isNew && onSaveHeader)) && !addingLine && lines.length > 0 && !loading && (
        <button
          type="button"
          onClick={handleAddClick}
          className="flex items-center gap-1.5 mt-1 px-3 py-2 text-sm text-primary underline-offset-2 hover:underline transition-colors"
          data-testid="btn__addReversedInvoice"
        >
          <Plus className="h-4 w-4" data-testid="Plus__4395d6" />
          {ui('rectAddInvoice')}
        </button>
      )}
      {/* ── empty state ── */}
      {showEmptyState && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 rounded-xl bg-page-bg flex items-center justify-center">
            <FileText
              className="h-5 w-5 text-muted-foreground"
              strokeWidth={1.5}
              data-testid="FileText__4395d6" />
          </div>
          <p className="text-sm font-medium text-foreground">{ui('rectEmptyTitle')}</p>
          {!isReadOnly && (recordId || (isNew && onSaveHeader)) && (
            <button
              type="button"
              onClick={handleAddClick}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
              data-testid="btn__addFirstRectificacion"
            >
              <Plus className="h-4 w-4" data-testid="Plus__4395d6" />
              {ui('rectAddInvoice')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
