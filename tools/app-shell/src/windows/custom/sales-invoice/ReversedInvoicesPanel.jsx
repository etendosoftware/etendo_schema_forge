import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, FileText, Loader2, Plus, Search, Trash2, Info } from 'lucide-react';
import { useUI, useLabel, useLocaleSwitch } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly';

import { useApiFetch } from '@/auth/useApiFetch.js';
/* eslint-disable react/prop-types */

const PERIOD_VALUES = ['0A', '1T', '2T', '3T', '4T',
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

// Localized labels for the AEAT-349 period list: quarters/annual via i18n keys,
// month names via Intl for the active locale
function buildPeriodOptions(ui, locale) {
  const tag = (locale || 'es_ES').replace('_', '-');
  const monthName = m => {
    const name = new Intl.DateTimeFormat(tag, { month: 'long' }).format(new Date(2000, m - 1, 1));
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const fixed = {
    '0A': ui('rectPeriodAnnual'), '1T': ui('rectPeriodQ1'), '2T': ui('rectPeriodQ2'),
    '3T': ui('rectPeriodQ3'), '4T': ui('rectPeriodQ4'),
  };
  return PERIOD_VALUES.map(v => ({ value: v, label: `${v} - ${fixed[v] ?? monthName(Number(v))}` }));
}

// ── helpers ───────────────────────────────────────────────────────────────────
function isCorrective(row) {
  return row?.aEAT349IsCorrective === 'Y' || row?.aEAT349IsCorrective === true;
}

function parseRows(json) {
  return json?.response?.data ?? json?.data ?? [];
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
// Modal for selecting the original invoice to rectify.
// Bypasses the NEO selector endpoint and queries the header entity directly.
// Candidates: COMPLETED invoices of the same flow (sales or purchase). No
// business-partner filter here — the C_Invoice_Reverse DB trigger enforces
// same-BP only when applicable (Verifactu orgs allow cross-BP rectifications),
// and any rejection is surfaced to the user via the save error message.
// NEO ignores arbitrary query-param filters, so all filtering is client-side.
function InvoicePickerModal({ apiBaseUrl, token, currentId, onSelect, onClose }) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiBaseUrl) return;
    // apiBaseUrl = /sws/neo/{spec} — data lives at {spec}/header
    apiFetch('/header?_startRow=0&_endRow=500')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        // NEO does not expose `updated` — sort by invoiceDate desc, then
        // documentNo desc as tie-breaker (higher number = created later)
        const rows = parseRows(json)
          .filter(inv => inv.documentStatus === 'CO')
          .sort((a, b) =>
            (new Date(b.invoiceDate ?? 0) - new Date(a.invoiceDate ?? 0))
            || String(b.documentNo ?? '').localeCompare(String(a.documentNo ?? ''), undefined, { numeric: true }));
        setInvoices(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBaseUrl, token, apiFetch]);

  const MAX_VISIBLE = 5;
  const { filtered, hiddenCount } = useMemo(() => {
    let visible = invoices.filter(inv => inv.id !== currentId);
    if (search.trim()) {
      const q = search.toLowerCase();
      visible = visible.filter(inv =>
        `${inv.documentNo || inv._identifier || ''} ${inv['businessPartner$_identifier'] || ''}`.toLowerCase().includes(q));
    }
    return { filtered: visible.slice(0, MAX_VISIBLE), hiddenCount: Math.max(0, visible.length - MAX_VISIBLE) };
  }, [invoices, search, currentId]);

  const fmtDate = (d) => formatCalendarDate(d, 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtAmt = (v) => v != null ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  const invoiceRow = (inv) => (
    <div
      key={inv.id}
      onClick={() => { onSelect(inv.id, inv.documentNo || inv._identifier || inv.id); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', borderBottom: '0.5px solid hsl(var(--border) / 0.3)' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--muted))'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{inv.documentNo || inv._identifier}</span>
          <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{fmtDate(inv.invoiceDate)}</span>
        </div>
        {inv['businessPartner$_identifier'] && (
          <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {inv['businessPartner$_identifier']}
          </div>
        )}
      </div>
      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(inv.grandTotalAmount ?? inv.grandTotalAmt)}</span>
    </div>
  );

  let listBody;
  if (loading) {
    listBody = <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('loading')}</p>;
  } else if (filtered.length === 0) {
    listBody = <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '24px 0', textAlign: 'center' }}>{ui('rectNoInvoices')}</p>;
  } else {
    listBody = filtered.map(invoiceRow);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 12, backgroundColor: 'hsl(var(--card))', boxShadow: '0 8px 30px hsl(var(--foreground) / 0.12)', border: '0.5px solid hsl(var(--border))' }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '2px solid hsl(var(--border))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{ui('rectPickerTitle')}</span>
          <button type="button" onClick={onClose} style={{ fontSize: 18, lineHeight: 1, padding: '2px 6px', borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>&times;</button>
        </div>
        <div style={{ padding: '10px 16px 0' }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={ui('rectSearchInvoice')} autoFocus
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '0.5px solid hsl(var(--border))', borderRadius: 6, outline: 'none', color: 'hsl(var(--foreground))' }}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {listBody}
          {hiddenCount > 0 && (
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', padding: '8px 16px 4px', textAlign: 'center' }}>
              +{hiddenCount} {ui('rectMoreInvoicesHint')}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', background: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border))', padding: '10px 16px' }}>
          <button type="button" onClick={onClose} style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'transparent', color: 'hsl(var(--muted-foreground))', cursor: 'pointer' }}>{ui('cancel')}</button>
        </div>
      </div>
    </div>
  );
}

// ── YearPickerSelect ──────────────────────────────────────────────────────────
// Loads fiscal years from /fiscal-calendar instead of the broken NEO selector.
function YearPickerSelect({ apiBaseUrl, token, value, displayValue, onChange, readOnly }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [years, setYears] = useState(null);

  useEffect(() => {
    if (!apiBaseUrl) return;
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
  }, [apiBaseUrl, token, apiFetch]);

  if (readOnly) {
    return (
      <input
        value={displayValue || value || ''}
        disabled readOnly
        className="flex h-10 w-full rounded-lg border border-border-control bg-card px-3 text-sm disabled:opacity-70"
      />
    );
  }

  return (
    <select
      value={value || ''}
      disabled={years === null}
      onChange={e => {
        const opt = (years || []).find(y => y.id === e.target.value);
        onChange(e.target.value, opt?.label ?? '');
      }}
      className="flex h-10 w-full rounded-lg border border-border-control bg-card px-3 text-sm focus:outline-none disabled:opacity-70"
    >
      <option value="">Seleccionar...</option>
      {(years || []).map(y => <option key={y.id} value={y.id}>{y.label}</option>)}
    </select>
  );
}

// ── AmountInput ──────────────────────────────────────────────────────────────
// Read-only EUR amount display (349 base amounts are DB-trigger computed).
function AmountInput({ label, value }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground block">{label}</label>
      <div className="flex items-center h-10 rounded-lg border border-border-control bg-muted overflow-hidden">
        <span className="px-3 text-sm text-muted-foreground border-r border-border-control flex items-center h-full">EUR</span>
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
function AeatGrid({ data, onChange, onFieldSave, apiBaseUrl, token, catalogs, readOnly, labelOverrides }) {
  const t = useLabel(labelOverrides);
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const periodOptions = useMemo(() => buildPeriodOptions(ui, locale), [ui, locale]);
  const fmtEur = v => v != null ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

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
          readOnly={readOnly}
          onChange={(val, lbl) => {
            onChange('aEAT349CYear', val);
            onChange('aEAT349CYear$_identifier', lbl ?? '');
            onFieldSave?.('aEAT349CYear', val);
          }}
          data-testid="YearPickerSelect__4395d6" />
      </div>
      {/* Periodo */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground block">
          {t('EM_AEAT349_Period') ?? 'Periodo'}
          {!readOnly && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <select
          value={data?.aEAT349Period ?? ''}
          disabled={readOnly}
          className="flex h-10 w-full rounded-lg border border-border-control bg-card px-3 text-sm focus:outline-none disabled:opacity-70"
          onChange={e => {
            onChange('aEAT349Period', e.target.value);
            onFieldSave?.('aEAT349Period', e.target.value);
          }}
        >
          <option value="">—</option>
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
  error,
  model349Active,
}) {
  const t = useLabel(labelOverrides);
  const ui = useUI();
  const [pickerOpen, setPickerOpen] = useState(false);
  const corrective = isCorrective(lineData);
  const TOOLTIP_TEXT = ui('rectTooltip349');

  const invoiceIdentifier = lineData?.['reversedInvoice$_identifier'] ?? '';
  const ref = parseReversedRef(lineData);

  // Formatted display: "10000067 · 05/06/2026 · 2.854,20"
  const invoiceDisplayParts = [
    ref.docNo,
    ref.date,
    ref.amount != null ? ref.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null,
  ].filter(Boolean);
  const invoiceDisplay = invoiceDisplayParts.join(' · ');

  // Picker used by both the draft row and an existing (editable) row. The draft
  // row does not persist immediately; the existing row PATCHes on select.
  const picker = (persistOnSelect) => pickerOpen && (
    <InvoicePickerModal
      apiBaseUrl={apiBaseUrl}
      token={token}
      currentId={recordId}
      onSelect={(id, label) => {
        onChange('reversedInvoice', id);
        onChange('reversedInvoice$_identifier', label);
        if (persistOnSelect) onFieldSave?.('reversedInvoice', id);
      }}
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
          className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border-control bg-card px-3 text-sm hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <span className={`truncate ${lineData?.reversedInvoice ? 'text-foreground' : 'text-muted-foreground'}`}>
            {lineData?.['reversedInvoice$_identifier'] || 'Seleccionar...'}
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
              disabled={readOnly}
              onClick={() => {
                if (readOnly) return;
                const next = corrective ? 'N' : 'Y';
                onChange('aEAT349IsCorrective', next);
                onFieldSave?.('aEAT349IsCorrective', next);
              }}
              className={[
                'mt-0.5 h-5 w-5 shrink-0 rounded-sm border border-border-control shadow-[0px_1px_2px_rgba(18,18,23,0.05)]',
                'flex items-center justify-center transition-colors focus-visible:outline-none',
                corrective ? 'bg-primary text-primary-foreground border-primary' : 'bg-card',
                readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
              data-testid="checkbox__isCorrective"
            >
              {corrective && (
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
              catalogs={catalogs}
              readOnly={readOnly}
              labelOverrides={labelOverrides}
              data-testid="AeatGrid__4395d6" />
          )}
        </div>
      )}
      {/* Draft-only: error + save / cancel buttons */}
      {isDraft && error && (
        <p className="text-sm text-destructive" data-testid="text__saveError">{error}</p>
      )}
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
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(apiBaseUrl);

  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [pendingEdits, setPendingEdits] = useState({});
  const [deleting, setDeleting] = useState(null);

  // New line draft state
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const addRowRef = useRef(null);

  // Track whether data has been fetched at least once
  const fetchedRef = useRef(false);

  // "Correctiva del 349" gating: the checkbox (and its dependent AEAT-349
  // fields) is Modelo-349-specific and must stay hidden entirely unless 349 is
  // active in the Fiscal Models catalog. The catalog is a generic, per-client
  // AD_PREFERENCE (ETGO_FiscalModelsCatalog) exposed at the built-in
  // /sws/neo/fiscal-models-catalog endpoint — not scoped to the fiscal-models
  // spec — so it's reachable cross-spec exactly like YearPickerSelect's
  // /fiscal-calendar lookup above. Mirrors FmListPage's own fetch/shape
  // (activeModels + catalogLoaded) so "unconfigured catalog" behaves the same
  // "all models inactive" way everywhere: fail-closed (hidden) until the
  // fetch confirms 349 === true, never a flash of visible-then-hidden.
  const [activeModels, setActiveModels] = useState({});
  const [catalogLoaded, setCatalogLoaded] = useState(!apiBaseUrl);

  useEffect(() => {
    if (!apiBaseUrl) return;
    const neoBase = apiBaseUrl.replace(/\/[^/]+$/, '');
    apiFetch(`${neoBase}/fiscal-models-catalog`, { baseUrl: '' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => setActiveModels(json ?? {}))
      .catch(() => {})
      .finally(() => setCatalogLoaded(true));
  }, [apiBaseUrl, token, apiFetch]);

  const model349Active = catalogLoaded && activeModels?.['349'] === true;

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
      if (restoreDraft?.error) setSaveError(restoreDraft.error);
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
  const fetchLines = useCallback(async () => {
    if (!recordId || !apiBaseUrl) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/reversedInvoices?_startRow=0&_endRow=200`);
      if (!res.ok) return;
      const json = await res.json();
      // NEO ignores query-param filters — keep only rows of THIS invoice
      const rows = parseRows(json).filter(l => l.invoice === recordId);
      setLines(rows);
      onCountChange?.(rows.length);
    } catch { /* silent */ } finally {
      setLoading(false);
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
      if (newLine.reversedInvoice) handleSaveNewLine();
      else { setAddingLine(false); setNewLine({}); }
    }
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [addingLine, newLine]);

  // ── PATCH helpers ──────────────────────────────────────────────────────────
  async function patchLine(lineId, payload) {
    try {
      const res = await apiFetch(`/reversedInvoices/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // Drop only the saved keys (and their $_identifier companions) so the
        // fresh server values win without wiping other in-progress edits
        setPendingEdits(p => {
          const edits = { ...(p[lineId] || {}) };
          for (const k of Object.keys(payload)) {
            delete edits[k];
            delete edits[`${k}$_identifier`];
          }
          return { ...p, [lineId]: edits };
        });
        fetchLines();
      }
    } catch { /* silent */ }
  }

  // The AEAT349 DB trigger validates the whole group at once: corrective='Y'
  // requires year + period in the SAME statement, so per-field PATCH always
  // fails. Accumulate the group locally and PATCH it together once complete.
  const AEAT_GROUP = ['aEAT349IsCorrective', 'aEAT349CYear', 'aEAT349Period'];

  function handleFieldSave(lineId, line, key, value) {
    if (AEAT_GROUP.includes(key)) {
      const edits = { ...(pendingEdits[lineId] || {}), [key]: value };
      const val = f => edits[f] ?? line?.[f];
      const corr = val('aEAT349IsCorrective');
      const isCorrectiveOn = corr === 'Y' || corr === true;
      if (!isCorrectiveOn) {
        patchLine(lineId, { aEAT349IsCorrective: 'N' });
        return;
      }
      const year = val('aEAT349CYear');
      const period = val('aEAT349Period');
      if (year && period) {
        patchLine(lineId, { aEAT349IsCorrective: 'Y', aEAT349CYear: year, aEAT349Period: period });
      }
      // Group incomplete: keep the edit local until year AND period are set
      return;
    }
    if (String(line?.[key] ?? '') === String(value ?? '')) return;
    patchLine(lineId, { [key]: value });
  }

  function handleChange(lineId, key, value) {
    setPendingEdits(p => ({ ...p, [lineId]: { ...p[lineId], [key]: value } }));
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async function deleteLine(lineId) {
    setDeleting(lineId);
    try {
      await apiFetch(`/reversedInvoices/${lineId}`, {
        method: 'DELETE',
      });
      fetchLines();
    } catch { /* silent */ } finally { setDeleting(null); }
  }

  // ── create ─────────────────────────────────────────────────────────────────
  async function handleSaveNewLine() {
    if (!newLine.reversedInvoice) return;
    if (!recordId && !onSaveHeader) return;
    setSaving(true);
    setSaveError(null);
    try {
      // The parent invoice FK is mandatory — on an unsaved invoice, persist the
      // header FIRST (without navigating, to keep this form alive), then POST
      // the rectification against the fresh id
      let parentId = recordId;
      let savedHeader = null;
      if (!parentId) {
        savedHeader = await onSaveHeader({ navigateAfter: false });
        if (!savedHeader?.id) {
          setSaveError(ui('rectSaveError'));
          return;
        }
        parentId = savedHeader.id;
      }
      // Strip the display-only identifier before POSTing the payload
      const payload = { ...newLine };
      delete payload['reversedInvoice$_identifier'];
      const res = await apiFetch(`/reversedInvoices`, {
        method: 'POST',
        body: JSON.stringify({ invoice: parentId, ...payload }),
      });
      if (res.ok) {
        setNewLine({});
        setAddingLine(false);
        if (savedHeader) {
          // Land on the saved record with this tab active — the remount refetches
          onGoToSavedRecord?.(savedHeader);
          return;
        }
        fetchLines();
      } else {
        let msg = ui('rectSaveError');
        try {
          msg = parseNeoError(await res.json()) || msg;
        } catch { /* keep default */ }
        if (savedHeader) {
          // Header WAS created: navigate to it (staying on /new would make every
          // tab switch re-save a "new" header → duplicate invoices + repeated
          // "Record created" toasts). The draft and error survive the remount.
          onGoToSavedRecord?.(savedHeader, { reopenAdd: true, draft: newLine, error: msg });
          return;
        }
        setSaveError(msg);
      }
    } catch {
      setSaveError(ui('rectSaveError'));
    } finally { setSaving(false); }
  }

  // ── read-only check ────────────────────────────────────────────────────────
  const processed = data?.processed === 'Y' || data?.processed === true;
  const isVoid = data?.documentStatus === 'VO';
  // TC-13: non-rectificative invoices (isRectificative explicitly false) never
  // get add/edit/delete — only explicit false blocks, so unsaved records
  // (field not yet enriched by the backend) keep the actions
  const notRectificative = data?.isRectificative === false || data?.isRectificative === 'false';
  const isReadOnly = (processed && !isVoid) || notRectificative;

  // ── render ─────────────────────────────────────────────────────────────────
  const showEmptyState = !loading && lines.length === 0 && !addingLine;

  return (
    <div className="flex-1 min-w-0" data-testid="reversed-invoices-panel">
      {/* ── table ── */}
      {(lines.length > 0 || loading || addingLine) && (
        <table className="w-full">
          <thead className="sticky top-0 z-20 bg-card">
            <tr className="border-b border-border/40">
              {/* expand toggle placeholder */}
              <th className="h-10 w-10 px-3" />
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColOriginalInvoice')}</th>
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColDate')}</th>
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColDocument')}</th>
              <th className="h-10 px-3 text-left text-xs font-semibold text-foreground">{ui('rectColModel349')}</th>
              <th className="h-10 px-3 text-right text-xs font-semibold text-foreground">{ui('rectColTotal')}</th>
              <th className="h-10 w-10 px-2" />
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2
                    className="h-4 w-4 animate-spin inline mr-1.5"
                    data-testid="Loader2__4395d6" />
                  {ui('loading')}
                </td>
              </tr>
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
                  >
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
                  </tr>
                  {/* expanded form */}
                  {isExpanded && (
                    <tr>
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
                          data-testid="ExpandedForm__4395d6" />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* draft new-line row — auto-expanded */}
            {addingLine && (
              <tr>
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
                      onCancel={() => { setAddingLine(false); setNewLine({}); setSaveError(null); }}
                      saving={saving}
                      error={saveError}
                      model349Active={model349Active}
                      data-testid="ExpandedForm__4395d6" />
                  </div>
                </td>
              </tr>
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
