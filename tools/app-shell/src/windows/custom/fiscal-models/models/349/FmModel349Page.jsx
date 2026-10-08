import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useUI, useLocaleSwitch } from '@/i18n';
import {
  Download, CircleCheck, Search,
  Loader2, Globe, ChevronDown, Users, FileEdit,
  TriangleAlert, ReceiptText, Calculator, PenLine, ShieldAlert, Info, FileCheck,
  X, Save, RefreshCw,
} from 'lucide-react';
import { KpiWidget, Tabs, MoreOptionsMenu } from '../../FmCommon.jsx';
import { FmBreadcrumb } from '../../FmBreadcrumb.jsx';
import { SourcesTab, IncidentsTab } from '../../FmTabContent.jsx';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { PresentModal, FileGenModal } from '../../FmOverlays.jsx';
import { formatAmount, compute349Operators, generate349File, validate349Vies, persistManualData } from '../../fiscalModelsUtils.js';
import { getIncidentIndicator } from '../../incidentSeverity.js';
import { FORMER_STATEMENT_LENGTH, isValidFormerStatement, sanitizeFormerStatementInput } from '../../formerStatement.js';
import { invalidateFiscalComputeCache, getCachedFiscalCompute, setCachedFiscalCompute } from '../../useFiscalAutoCompute.js';
import { AttachmentsTab, useAttachments } from '@/components/attachments';
import '../../fiscal-models.css';

// AD table name backing the AEAT justificante attachments store — this is the
// same shared, model-agnostic table 303 uses. 349 only wires the manual
// "Presentación con Acuse de recibo" upload path here — no telematic
// submission flow (no backend endpoint for it yet).
const FISCAL_DECL_TABLE = 'ETGO_Fiscal_Decl';

// statusLabelKey (ETP-4755): see FmModel303Page.jsx for the identical helper — the status
// badge must always read the plain "Presentado" for BOTH `submitted` and `submitted_ack`;
// HOW it was submitted is shown exclusively via the `submissionMethod` suffix below.
function statusLabelKey(status) {
  return status === 'submitted_ack' ? 'submitted' : status;
}

// ── Constants ────────────────────────────────────────────────────
const KEY_IDS = ['E', 'S', 'A', 'I'];

const MOCK_OPERATORS = [
  { id:1, nif:'IT12345678901', name:'Bramini Vino S.r.l.',        key:'A', base:12450.00, vies:'valid',   origin:'4 facturas compra' },
  { id:2, nif:'FR40123456789', name:'Olives de Provence SARL',    key:'A', base:6800.00,  vies:'valid',   origin:'2 facturas compra' },
  { id:3, nif:'DE123456789',   name:'Bayern Technik GmbH',        key:'E', base:17600.00, vies:'valid',   origin:'3 facturas venta' },
  { id:4, nif:'PT501234567',   name:'Lusitana Serviços Lda',      key:'S', base:650.00,   vies:'pending', origin:'1 factura servicio' },
  { id:5, nif:'NL123456789B01',name:'Amsterdam Trading BV',       key:'I', base:1450.00,  vies:'valid',   origin:'2 facturas recibidas' },
  { id:7, nif:'PL1234567890',  name:'Kraków Components sp.z.o.o.',key:'A', base:3200.00,  vies:'valid',   origin:'1 factura compra' },
];

// ETP-5027 — the operators endpoint now returns corrective (rectificative) rows
// alongside the regular ones, ordered after them. `rectificative` is present on
// EVERY row (false for regular ones, never omitted), so no undefined-check is
// needed; this helper only normalizes the string/boolean shapes NEO can emit.
function isRectificativeOp(op) {
  return op?.rectificative === true || op?.rectificative === 'true' || op?.rectificative === 'Y';
}

// ETP-5027 — the declaration period a corrective row rectifies, as the
// `T1 2025` string shown on the row and folded into its identity. Regular rows
// carry neither field and yield '' (see `appendOperators`, which emits
// `declaredYear`/`declaredPeriod` only when the source row has them).
function declaredPeriodLabel(op) {
  const period = String(op?.declaredPeriod ?? '').trim();
  const year   = String(op?.declaredYear   ?? '').trim();
  return [period, year].filter(Boolean).join(' ');
}

// ETP-5456 — extracted out of the main component (S3776 cognitive-complexity fix, pure
// refactor, no behavior change). Mirrors the exact monthNum/monthName/periodLabel logic that
// used to live inline: a numeric two-digit `period` resolves to its localized month name
// (explicit `bcpLocale`, not the runtime default — see the call site's own ETP-5338 comment);
// anything else (quarters like "T1") falls back to the raw `year period` string.
function buildPeriodLabel(decl, bcpLocale) {
  const monthNum = /^\d{2}$/.test(decl.period) ? parseInt(decl.period, 10) : null;
  if (!monthNum) return `${decl.year} ${decl.period}`;
  const monthName = new Intl.DateTimeFormat(bcpLocale, { month: 'long' }).format(new Date(2000, monthNum - 1, 1));
  return `${decl.year} / ${monthName}`;
}

// ETP-5456 — extracted alongside buildPeriodLabel (same S3776 fix). A filter only ever
// applies to the tab it was created for; the other tab must read null even in the instant
// before the clear lands (see the call sites' own comment, unchanged).
function resolveOriginFilterForTab(originFilter, tab) {
  return originFilter?.tab === tab ? originFilter : null;
}

// A regular row and a corrective row can describe the SAME operator+key, so
// `bpId` alone is not unique once corrective rows are present.
//
// ETP-5027 (QA F4) — nor is `bpId|key|R`. The backend groups corrective rows by
// (BPId, TaxKey, Year, Period), so correcting the same partner's 2025/T1 and
// 2025/T2 sales of goods in ONE declaration — ordinary AEAT 349 usage — produces
// two rows sharing that triple. They collided as React keys, and because
// `selected` is keyed by this same string, ticking one row's checkbox ticked the
// other. The declared period is the discriminator, so it belongs in the identity.
function rowKey(op) {
  return [
    op?.id ?? op?.bpId ?? op?.nif ?? '',
    op?.key ?? '',
    isRectificativeOp(op) ? 'R' : '',
    declaredPeriodLabel(op),
  ].join('|');
}

// ETP-5027 — the operators table is at (operator × AEAT key × regular/corrective)
// grain, so `operators.length` is a ROW count and NEVER an answer to "how many
// counterparties are in this declaration": one operator with two keys plus a
// correction already produces three rows. The identity of an operator is the
// business partner, so dedup on `bpId` — the stable AD id the endpoint emits on
// every row (Fiscal349BoxesHandler.appendOperators). It is preferred over `nif`
// because two BP records can legitimately carry the same tax id (duplicates,
// branches) while still being two operators, and a BP whose tax id is missing
// comes through with `nif: ''`. `nif`/`id` are fallbacks for payloads that
// predate `bpId` (mocks, older cached responses).
function operatorIdentity(op) {
  return String(op?.bpId ?? op?.nif ?? op?.id ?? '');
}

// ETP-5027 — VIES validates a NIF-IVA, not a business partner: two BP records
// sharing one tax id are ONE validation to perform, and the KPI/banner wording
// ("N NIF-IVA con validación VIES pendiente") counts exactly that. Deliberately a
// DIFFERENT key from operatorIdentity above. Rows with no tax id cannot be folded
// into a NIF bucket, so they fall back to the BP identity and stay individually
// countable instead of collapsing into a single empty-string bucket.
function viesIdentity(op) {
  const nif = String(op?.nif ?? '').trim().toUpperCase();
  return nif || `bp:${operatorIdentity(op)}`;
}

// Corrective rows are NOT filtered out by either counter: a counterparty that
// appears in this declaration only through a correction is still a counterparty,
// and their NIF still needs validating.
function countDistinct(rows, identify) {
  return new Set(rows.map(identify).filter(Boolean)).size;
}

// ETP-5027 — AEAT349 classification of a rectification row. Rectification rows
// (`collectRectifications` in Fiscal349BoxesHandler) carry no `key` of their own:
// they expose `type` ('Compra'/'Venta') plus the two registro-tipo-2 bases
// (`baseProducts` = EM_AEAT349_BPBaseAmount, `baseServices` = ..._BPBaseAmountS).
// The E/S/A/I key is therefore derived the same way the AEAT classifies them:
// goods vs services × sale vs purchase.
const RECTIF_KEY_BY_TYPE = {
  Venta:  { products: 'E', services: 'S' },
  Compra: { products: 'A', services: 'I' },
};

// The keys a single rectification contributes to — one per non-zero base, so a
// mixed goods+services correction counts under both. A rectification whose two
// bases are zero is a no-op correction and is attributed to no key (mirrors the
// zero-base skip in `appendOperators`).
// ETP-5438 — the Compra/Venta counts a submission snapshot folded into an operator row, or
// `undefined` when the row carries none (live payloads, or no backing invoice).
function snapshotOriginCounts(op) {
  if (op?.originPurchases == null && op?.originSales == null) return undefined;
  return { Compra: Number(op.originPurchases) || 0, Venta: Number(op.originSales) || 0 };
}

function rectificationKeys(r) {
  const byType = RECTIF_KEY_BY_TYPE[r?.type];
  if (!byType) return [];
  const keys = [];
  if ((parseFloat(r.baseProducts) || 0) !== 0) keys.push(byType.products);
  if ((parseFloat(r.baseServices) || 0) !== 0) keys.push(byType.services);
  return keys;
}

// ── Sub-components ───────────────────────────────────────────────
// ETP-5597 — colour comes from `.fm-key--{k}` (fiscal-models.css), grouped by operation type:
// sales/issued (E, S) share one colour, purchases/received (A, I) share another.
function KeyBadge({ k, 'data-testid': testId }) {
  return <span className={`fm-key fm-key--${k}`} data-testid={testId}>{k}</span>;
}

// The Clave cell of the Operadores table — the key badge plus its description. Shared with the
// "Facturas origen" Clave column (ETP-5597) so both tables render the key identically.
function KeyCell({ k, t, badgeTestId }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} data-testid="KeyCell">
      <KeyBadge k={k} data-testid={badgeTestId} />
      <span style={{ fontSize: 14, color: 'var(--fm-fg-1)' }}>{t(`fm.m349.key.${k}`)}</span>
    </span>
  );
}

// Follows the same inline-pill shape as ViesBadge above (see .fm-vies in
// fiscal-models.css) — no new component system, just a sibling class.
// ETP-5027 (QA F4) — the badge names the declared period it rectifies whenever the
// backend supplied one. Two corrective rows for the same operator and key differ ONLY
// by that period, so without it they are indistinguishable on screen; the row key
// disambiguates them for React and selection, but the user needs to read it too.
function RectificativeBadge({ t, period }) {
  return (
    <span className="fm-349-rectif-badge" data-testid="badge__rectificative">
      {period
        ? (t('fm.m349.rectificative_period', { period }) ?? `Rectificativa ${period}`)
        : (t('fm.m349.rectificative') ?? 'Rectificativa')}
    </span>
  );
}

function ViesBadge({ status }) {
  const t = useUI();
  const map = { valid: ['✓', 'valid'], pending: ['○', 'pending'], invalid: ['×', 'invalid'] };
  const [icon, cls] = map[status] ?? map.pending;
  return <span className={`fm-vies fm-vies--${cls}`}>{icon} {t(`fm.m349.vies.${status ?? 'pending'}`)}</span>;
}

function TotalsCard({ operators, rectifSummary, t }) {
  // Corrective rows carry signed deltas and are summarized separately in
  // RectificativeSubtotalCard — folding them in here would silently net them
  // off against the regular totals, which is exactly what must not happen.
  const regular = operators.filter(o => !isRectificativeOp(o));
  const totals = {};
  KEY_IDS.forEach(k => { totals[k] = regular.filter(o => o.key === k).reduce((s,o) => s + (parseFloat(o.base) || 0), 0); });
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="fm-349-totals">
      <div className="fm-349-totals__card">
        <div className="fm-349-totals__title">
          {t('fm.m349.totals.title')}
          <span
            className="fm-349-totals__info-wrap"
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
          >
            <Info
              size={12}
              strokeWidth={1.75}
              style={{ color: 'var(--fm-fg-3)', cursor: 'help' }}
              data-testid="Info__346dd5" />
            {showInfo && (
              <div className="fm-349-totals__tooltip">
                {t('fm.m349.totals.info') ?? 'Calculados a partir de los operadores. No editable. Modifica los operadores para ajustar los totales.'}
              </div>
            )}
          </span>
        </div>
        {KEY_IDS.map(k => (
          <div key={k} className="fm-349-total-row">
            <div className="fm-349-total-row__left">
              <KeyBadge k={k} data-testid="KeyBadge__346dd5" />
              <span className="fm-349-total-row__label">{t(`fm.m349.key.${k}`)}</span>
            </div>
            <span className={`fm-349-total-row__amount${totals[k] === 0 ? ' fm-349-total-row__amount--zero' : ''}`}>
              {formatAmount(totals[k])}
            </span>
          </div>
        ))}
      </div>
      <RectificativeSubtotalCard summary={rectifSummary} t={t} data-testid="RectificativeSubtotalCard__346dd5" />
    </div>
  );
}

// ETP-5027 — `rectificativeSummary` from the operators endpoint, rendered as its
// own card so corrective deltas stay visually and numerically separate from the
// regular totals above. Amounts are SIGNED deltas and are usually negative (a
// rectification removing 3 units of a 10 EUR product reports -30) — they are
// rendered as-is through the canonical formatter, never Math.abs()'d, because a
// negative subtotal is the expected, valid case and not an error state.
//
// Deliberately per-key ONLY, with no "Total rectificativas" row. E/S are entregas
// (sales) and A/I are adquisiciones (purchases); the AEAT never nets one against
// the other, so E+S+A+I is not a quantity that means anything. An earlier revision
// showed that sum and produced figures like "-32,00 + -5,00 = -37,00", and would
// have rendered "0,00" for a -30 sales correction offset by a +30 purchase
// correction. `summary` above has always omitted a grand total for the same
// reason; the backend now emits both subtotals through one shared shape
// (`buildKeyTotals`), so `summary.total` is never present.
function RectificativeSubtotalCard({ summary, t }) {
  if (!summary) return null;
  const rows = KEY_IDS
    .map(k => [k, summary[`total${k}`]])
    .filter(([, v]) => v != null && v !== '');
  if (rows.length === 0) return null;
  return (
    <div className="fm-349-totals__card fm-349-rectif-totals" data-testid="card__rectificativeSubtotal">
      <div className="fm-349-totals__title">
        {t('fm.m349.rectif_subtotal.title') ?? 'Subtotal rectificativas'}
      </div>
      {rows.map(([k, v]) => {
        const num = parseFloat(v) || 0;
        return (
          <div key={k} className="fm-349-total-row">
            <div className="fm-349-total-row__left">
              <KeyBadge k={k} data-testid="KeyBadge__346dd5" />
              <span className="fm-349-total-row__label">{t(`fm.m349.key.${k}`)}</span>
            </div>
            <span
              className={`fm-349-total-row__amount${num < 0 ? ' fm-349-total-row__amount--negative' : ''}`}
              data-testid={`amount__rectifSubtotal_${k}`}
            >
              {formatAmount(num)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Key filter dropdown
function KeyFilterDropdown({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allLabel = t('fm.m349.filter.all_keys') ?? 'Todas las claves';
  const selectedLabel = value === 'all'
    ? allLabel
    : `${value} — ${t('fm.m349.key.' + value) ?? value}`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="fm-toolbar__pill"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
      >
        {selectedLabel}
        <ChevronDown
          size={12}
          strokeWidth={1.75}
          style={{ opacity: .6 }}
          data-testid="ChevronDown__346dd5" />
      </button>
      {open && (
        <div className="fm-status-select__menu" role="listbox" style={{ minWidth: 220 }}>
          <button
            className={`fm-status-select__item${value === 'all' ? ' fm-status-select__item--active' : ''}`}
            onClick={() => { onChange('all'); setOpen(false); }}
          >
            <span style={{ flex: 1 }}>{allLabel}</span>
            {value === 'all' && <span>✓</span>}
          </button>
          {KEY_IDS.map(k => (
            <button
              key={k}
              className={`fm-status-select__item${value === k ? ' fm-status-select__item--active' : ''}`}
              onClick={() => { onChange(k); setOpen(false); }}
            >
              {/* ETP-5597 — same KeyBadge as the totals card, so the key colours (grouped by
                  operation type, see `.fm-key--*` in fiscal-models.css) have ONE source. */}
              <KeyBadge k={k} data-testid="KeyBadge__keyFilter" />
              <span style={{ flex: 1 }}>{t(`fm.m349.key.${k}`)}</span>
              {value === k && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ETP-5027 — turns a `validate349Vies` result into the sonner toast to show.
// Pure and exported-by-position (module-local, exercised through the page's tests).
//
// AGGREGATE COUNTS ONLY, by explicit product decision: no per-error-code breakdown
// ("why is this one pending?"). Classic collapses every inconclusive VIES answer into
// "pending" and GO must behave the same.
//
// The five outcome buckets partition `validated` and each gets its own fragment, because
// each one implies a DIFFERENT next action:
//
//   valid / invalid   — conclusive AND persisted. Nothing to do.
//   notEligible       — the partner failed the eligibility gate (tax-id key is not NOI, or the
//                       tax id is blank) or no longer exists. This is PERMANENT: the same
//                       partner fails the same gate on every future click. It used to be folded
//                       into `stillPending`, whose copy invites a re-run — an unbreakable loop
//                       with no explanation (ETP-5027, QA F5). Its copy points at the partner
//                       record instead, and never at a retry.
//   failed            — VIES answered, but the write-back to C_BPartner did not land. Transient
//                       and retryable, but it must not be reported as success (QA F2).
//   stillPending      — genuinely inconclusive right now: VIES could not answer (a timeout, or
//                       the very common MS_MAX_CONCURRENT_REQ — France returns that on
//                       essentially every attempt), or the partner was deferred past the batch
//                       cap of 25 per call. Both are transient, and `stillPending` is exactly
//                       what the banner shows on the next render, so a re-run is the right
//                       follow-up — the only hint this fragment offers. It still attributes no
//                       cause: blaming the VIES service would be wrong for the deferred case.
// Pushes the "N of this outcome" sentence onto `parts` when count > 0, picking the
// singular/plural key. Factored out of buildViesResultMessage purely to keep that
// function's cognitive complexity under Sonar's threshold (S3776) — behavior unchanged.
function pushViesCountPart(parts, t, count, singularKey, pluralKey) {
  if (count > 0) {
    parts.push(t(count === 1 ? singularKey : pluralKey, { count }));
  }
}

function buildViesResultMessage(t, {
  validated = 0, valid = 0, invalid = 0, notEligible = 0, failed = 0, stillPending = 0,
} = {}) {
  if (validated <= 0) {
    return {
      level: 'info',
      message: t('fm.m349.vies.result.none') ?? 'No había ningún NIF-IVA pendiente de validar',
    };
  }

  const parts = [];
  pushViesCountPart(parts, t, valid, 'fm.m349.vies.result.valid_one', 'fm.m349.vies.result.valid_many');
  pushViesCountPart(parts, t, invalid, 'fm.m349.vies.result.invalid_one', 'fm.m349.vies.result.invalid_many');
  pushViesCountPart(parts, t, failed, 'fm.m349.vies.result.failed_one', 'fm.m349.vies.result.failed_many');
  pushViesCountPart(parts, t, notEligible, 'fm.m349.vies.result.not_eligible_one', 'fm.m349.vies.result.not_eligible_many');
  pushViesCountPart(parts, t, stillPending, 'fm.m349.vies.result.pending_one', 'fm.m349.vies.result.pending_many');

  // "procesado", not "comprobado": `validated` is every pending operator the call ACCOUNTED
  // FOR (deduplicated by bpId — one partner spans several rows, one per AEAT key plus
  // rectificative rows), which includes the ones it declined to check.
  const headline = t(validated === 1 ? 'fm.m349.vies.result.processed_one' : 'fm.m349.vies.result.processed_many', { count: validated });
  // The backend guarantees `valid + invalid + notEligible + failed + stillPending ===
  // validated`, so `parts` can only be empty if that invariant broke. Say what is known and
  // stay off the success channel rather than implying every NIF came back clean.
  const level = (stillPending > 0 || invalid > 0 || notEligible > 0 || failed > 0 || parts.length === 0)
    ? 'warning'
    : 'success';
  return { level, message: parts.length ? `${headline}: ${parts.join(', ')}` : headline };
}

// VIES pending-validation banner — extracted out of the main component's render
// (SonarQube S3776: keeps FmModel349Page's own cognitive complexity down without
// changing behavior) so the `viesPending > 0 && !dismissed` gate lives in its own
// small function instead of nesting inside the main render tree.
function ViesBanner({ viesPending, dismissed, onDismiss, onValidate, validating, t }) {
  if (viesPending <= 0 || dismissed) return null;
  return (
    <div style={{ padding: '8px 20px', flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 8, background: 'var(--status-info-bg)',
      }}>
        <Globe
          size={14}
          strokeWidth={1.75}
          style={{ color: 'var(--status-info-fg)', flexShrink: 0 }}
          data-testid="Globe__346dd5" />
        <span style={{ fontSize: 14, flex: 1 }}>
          <span style={{ color: 'var(--status-info-fg)', fontWeight: 500 }}>
            {t('fm.m349.banner.vies_title', { count: viesPending }) ?? `${viesPending} NIF-IVA con validación VIES pendiente`}
          </span>
          {/* ETP-5027 — the two halves are independent sentences and were running
              together ("…VIES pendiente Validación VIES asíncrona…"). The separator
              lives here, in the layout, rather than being baked into either locale
              string, so no translation has to remember to carry the punctuation. */}
          {'. '}
          <span style={{ color: 'var(--status-info-fg)', fontWeight: 400 }}>
            {/* ETP-5027 — this used to read "Validación VIES asíncrona". It is not
                asynchronous: bptaxidkey's ViesStatusObserver calls ViesService.checkVat()
                SYNCHRONOUSLY inside the business-partner save transaction (blocking up to
                the HttpURLConnection timeout), and the "Validar VIES" button below is a
                synchronous request too. What is actually true is that it does not block
                the DECLARATION — hence the reworded key. */}
            {t('fm.m349.banner.vies_sub') ?? 'Consulta en vivo al servicio VIES — informativa, no bloquea la declaración'}
          </span>
        </span>
        {/* Disabled while a validation is in flight so the user cannot queue several
            bulk VIES runs — each one is a live, rate-limited call to the member states'
            services, and MS_MAX_CONCURRENT_REQ is exactly what piling them up produces. */}
        <button
          type="button"
          onClick={onValidate}
          disabled={validating}
          aria-busy={validating || undefined}
          data-testid="vies-validate-button"
          style={{
            fontSize: 14, fontWeight: 500, color: 'var(--status-info-fg)', background: 'none',
            border: 'none', cursor: validating ? 'progress' : 'pointer', textDecoration: 'underline',
            textUnderlineOffset: 2, whiteSpace: 'nowrap', opacity: validating ? 0.6 : 1,
          }}
        >
          {validating
            ? (t('fm.m349.banner.vies_validating') ?? 'Validando…')
            : (t('fm.m349.banner.vies_action') ?? 'Validar VIES')}
        </button>
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-info-fg)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          onClick={onDismiss}
          aria-label={t('fm.action.close') ?? 'Cerrar'}
        >×</button>
      </div>
    </div>
  );
}

// Shared invoices/incidents/receipt tab content — extracted out of the main
// component's render (SonarQube S3776, same rationale as ViesBanner above): the
// `activeTab === 'invoices' || ... || ...` gate and its 3 nested per-tab `&&`
// branches now live in their own function, called unconditionally below.
// ETP-5027 — the Origen link's operator filter, shared by the two tabs it can land
// on. `originFilter` is a single `{ nif, key, tab }` (null = unfiltered): only one
// tab is ever filtered at a time, because the filter is set by the jump that also
// switches tabs and is cleared as soon as the user leaves that tab. `tab` records
// which dataset the filter belongs to so the other tab can never inherit it.
//
// The grain is (nif, key), NOT the VAT number alone. One operator can occupy
// SEVERAL rows of the operators table, one per AEAT349 key, and both `originByNif`
// and `originByRectification` count under the composite `nif|key`. Filtering on the
// VAT number alone would land the user on rows belonging to a *different* operator
// row, with a count that disagrees with the link they just clicked.
function OriginFilterChip({ nif, count, onClear, t, testId }) {
  return (
    <div style={{ padding: '12px 0 8px', display: 'flex', justifyContent: 'flex-end' }}>
      <button
        className="fm-toolbar__pill fm-toolbar__pill--active-dark"
        style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={onClear}
        title={t('fm.m349.origin_filter.clear')}
        data-testid={testId}
      >
        {t('fm.m349.origin_filter.operator', { nif })}
        <span className="fm-toolbar__count-badge">{count}</span>
        <X size={11} strokeWidth={2} data-testid="X__346dd5" />
      </button>
    </div>
  );
}

// Filter-specific empty state. Deliberately distinct from each tab's generic
// "nothing here" message, which would otherwise imply the declaration has no
// invoices / no rectifications at all rather than none for THIS operator.
function OriginFilterEmpty({ message, testId }) {
  return (
    <div
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}
      data-testid={testId}
    >
      <span style={{ fontSize: 16, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
        {message}
      </span>
    </div>
  );
}

// ETP-5027 — "Facturas origen" tab body. The Origen link on a REGULAR operator row
// narrows this list to the invoices that produced the count the user clicked.
// Invoice rows carry the operator's VAT number in `nifIva` and its AEAT349
// classification in `key` (backend `buildInvoiceRow`), so they match the filter grain
// directly.
//
// Filtering happens here rather than inside the shared `SourcesTab`, which stays
// generic (303 renders it too) and never learns about 349's operator filter.
function InvoicesTabContent({ decl, liveInvoices, t, originFilter, onClearOriginFilter }) {
  const allSources = liveInvoices ?? decl.invoices ?? [];
  const sources = originFilter
    ? allSources.filter(inv => inv.nifIva === originFilter.nif && (inv.key ?? '') === originFilter.key)
    : allSources;
  return (
    <>
      {originFilter && (
        <OriginFilterChip
          nif={originFilter.nif}
          count={sources.length}
          onClear={onClearOriginFilter}
          t={t}
          testId="fm349-invoice-origin-filter-chip"
          data-testid="OriginFilterChip__346dd5" />
      )}
      {originFilter && sources.length === 0 ? (
        // Reachable when a row carries a preset `op.origin` string (legacy/mock
        // shape) that no live invoice backs.
        (<OriginFilterEmpty
          message={t('fm.m349.invoices.filter.empty', { nif: originFilter.nif })}
          testId="fm349-invoice-origin-filter-empty"
          data-testid="OriginFilterEmpty__346dd5" />)
      ) : (
        <SourcesTab
          decl={{ ...decl, sources }}
          t={t}
          showTaxColumns={false}
          // ETP-5597 — the AEAT349 key of each origin row, rendered exactly like the Operadores
          // Clave cell (KeyCell), so the two rows of a mixed goods + services invoice (E + S, A + I)
          // can be told apart. The key already says whether a row is a purchase or a sale, so the
          // generic "Tipo" column is hidden here.
          keyColumn={{
            label: t('fm.m349.col.key') ?? 'Clave',
            render: r => (r.key ? <KeyCell k={r.key} t={t} badgeTestId="KeyBadge__sourceRow" /> : '—'),
          }}
          hiddenColumns={['type']}
          data-testid="SourcesTab__346dd5" />
      )}
    </>
  );
}

// ETP-5027 — "Rectificaciones" tab body. The Origen link on a RECTIFICATIVE operator
// row narrows this table the same way the regular row narrows the invoices tab.
//
// Rectification rows carry no `key` of their own, so the filter's key is matched
// against `rectificationKeys(r)` — the very derivation `originByRectification` uses
// to build the count shown in the Origen cell. Filter and count therefore agree by
// construction, and a rectification contributing to two keys shows under both.
function RectificationsTabContent({ rows, t, originFilter, onClearOriginFilter }) {
  const allRows = Array.isArray(rows) ? rows : [];
  const filtered = originFilter
    ? allRows.filter(r => r.nifIva === originFilter.nif && rectificationKeys(r).includes(originFilter.key))
    : allRows;

  if (allRows.length === 0) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'hsl(var(--foreground))', marginBottom: 6 }}>
          {t('fm.m349.tab.rectif') ?? 'Rectificaciones'}
        </div>
        <div style={{ fontSize: 13, color: 'hsl(var(--text-disabled))' }}>
          {t('fm.m349.rectif.empty')}
        </div>
      </div>
    );
  }

  return (
    <>
      {originFilter && (
        <OriginFilterChip
          nif={originFilter.nif}
          count={filtered.length}
          onClear={onClearOriginFilter}
          t={t}
          testId="fm349-rectif-origin-filter-chip"
          data-testid="OriginFilterChip__346dd5" />
      )}
      {originFilter && filtered.length === 0 ? (
        <OriginFilterEmpty
          message={t('fm.m349.rectif.filter.empty', { nif: originFilter.nif })}
          testId="fm349-rectif-origin-filter-empty"
          data-testid="OriginFilterEmpty__346dd5" />
      ) : (
        <div className="fm-table-wrap" style={{ marginTop: 8 }}>
          <table className="fm-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>{t('fm.col.date')}</th>
                <th>{t('fm.m349.rectif.col.invoice')}</th>
                <th>{t('fm.col.type')}</th>
                <th>{t('fm.m349.col.operator')}</th>
                <th>{t('fm.m349.rectif.col.original')}</th>
                <th>{t('fm.m349.rectif.col.declared_period')}</th>
                <th style={{ textAlign: 'right' }}>{t('fm.m349.rectif.col.base_products')}</th>
                <th style={{ textAlign: 'right' }}>{t('fm.m349.rectif.col.base_services')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={`${r.ref}-${r.originalRef}-${idx}`}>
                  <td style={{ paddingLeft: 20, fontWeight: 600 }}>{r.date || '—'}</td>
                  <td>{r.ref}</td>
                  <td>{r.type}</td>
                  <td>
                    <div>{r.party}</div>
                    {r.nifIva && <div style={{ fontSize: 12, color: 'var(--fm-fg-3)' }}>{r.nifIva}</div>}
                  </td>
                  <td>{r.originalRef || '—'}</td>
                  <td>{r.declaredYear ? `${r.declaredYear} / ${r.declaredPeriod || '—'}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatAmount(r.baseProducts)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatAmount(r.baseServices)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ETP-5438 — shown in place of the per-invoice tabs of a declaration served from its submission
// snapshot, which keeps only the figures (see `snapshotServed`).
function InvoiceDetailNotKept({ t }) {
  return (
    <div className="fm-snapshot-note" style={{ padding: 24, color: 'hsl(var(--muted-foreground))' }}
      data-testid="fm-snapshot-no-invoice-detail">
      {t('fm.snapshot.invoice_detail_not_kept') ?? 'El detalle por factura no se conserva en las declaraciones presentadas.'}
    </div>
  );
}

function DetailTabContent({
  activeTab, decl, liveInvoices, blocking, warning, t, onGoToSources, token, apiBaseUrl, status,
  originFilter, onClearOriginFilter,
}) {
  if (activeTab !== 'invoices' && activeTab !== 'incidents' && activeTab !== 'receipt') return null;
  return (
    <div className="fm-page__body" style={{ display: 'flex', flexDirection: 'column', overflowY: 'hidden', ...(activeTab === 'invoices' || activeTab === 'incidents' ? { padding: 0 } : {}) }}>
      {activeTab === 'invoices' && (
        <InvoicesTabContent
          decl={decl}
          liveInvoices={liveInvoices}
          t={t}
          originFilter={originFilter}
          onClearOriginFilter={onClearOriginFilter}
          data-testid="InvoicesTabContent__346dd5" />
      )}
      {activeTab === 'incidents' && (
        <IncidentsTab
          decl={decl}
          blocking={blocking}
          warning={warning}
          t={t}
          onGoToSources={onGoToSources}
          data-testid="IncidentsTab__346dd5" />
      )}
      {activeTab === 'receipt' && (
        <AttachmentsTab
          tableName={FISCAL_DECL_TABLE}
          recordId={decl.id}
          token={token}
          apiBaseUrl={apiBaseUrl}
          isActive={activeTab === 'receipt'}
          config={{ allowedMimeTypes: ['application/pdf'] }}
          // ETP-5432 pt.3 — the justificante must only be deletable while the
          // declaration is still a draft, same rule `FmRowActions`' own delete
          // action already enforces for the declaration record itself.
          readOnly={status !== 'draft'}
          key={status}
          data-testid="AttachmentsTab__349receipt" />
      )}
    </div>
  );
}

// ETP-5456 / ETP-5597 — declaration-level "Tipo" (Normal | Sustitutiva). A substitute filing is a
// decision about the DECLARATION, not a one-off parameter typed at file-generation time, so it
// lives on the form and is persisted (`manualData.identification.sustitutiva`, flushed by
// "Guardar") the same way 303's `rectificativa` is — see `identChecks` in the main component.
//
// ETP-5597 — rendered as a two-option segmented control in the header action bar, right after
// the "Estado" chip (it used to be a checkbox next to the "Todas las claves" key filter).
// Read-only once the declaration is submitted.
function isSustitutivaChecked(identChecks) {
  return identChecks?.sustitutiva === true || identChecks?.sustitutiva === 'Y';
}

// ETP-5597 (W4) — `isBusy` also locks it while a manual-data save / generate / present is in
// flight, so no Tipo edit can land mid-save.
function DeclarationTypeControl({ identChecks, onChange, isSubmitted, isBusy = false, t }) {
  const sustitutiva = isSustitutivaChecked(identChecks);
  const options = [
    { value: false, labelKey: 'fm.m349.type.normal', fallback: 'Normal', testId: 'normal' },
    { value: true,  labelKey: 'fm.m349.type.substitutive', fallback: 'Sustitutiva', testId: 'sustitutiva' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="fm-toolbar__sep" aria-hidden="true" />
      <span style={{ fontSize: 14, color: 'hsl(var(--muted-foreground))' }}>
        {t('fm.m349.type.label') ?? 'Tipo'}
      </span>
      <div
        className="fm-newdecl-segmented fm-349-type-segmented"
        role="radiogroup"
        aria-label={t('fm.m349.type.label') ?? 'Tipo'}
      >
        {options.map(o => {
          const active = sustitutiva === o.value;
          return (
            <button
              key={o.testId}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={isSubmitted || isBusy}
              className={`fm-newdecl-segmented__btn${active ? ' fm-newdecl-segmented__btn--active' : ''}`}
              onClick={() => { if (!active) onChange('sustitutiva', o.value); }}
              data-testid={`FmModel349Page__type_${o.testId}`}
            >
              {t(o.labelKey) ?? o.fallback}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ETP-5597 — full-width warning banner shown between the action bar and the KPI cards while
// Tipo = Sustitutiva. Hosts the former-declaration identifier ("Identificador declaración
// anterior", AEAT: 13 digits), persisted with the flag as
// `manualData.identification.formerStatement` and handed to FileGenModal, which still blocks
// generation unless it is valid. Both gates — this page's "Registrar/Presentar" and
// FileGenModal's "Generar fichero 349" — share ONE rule: exactly 13 digits after trim
// (`isValidFormerStatement`, formerStatement.js). The input only accepts digits.
function SubstitutiveBanner({ identChecks, onChange, isSubmitted, isBusy = false, t }) {
  if (!isSustitutivaChecked(identChecks)) return null;
  const label = t('fm.m349.substitutive_banner.former_statement') ?? 'Identificador declaración anterior';
  return (
    <div style={{ padding: '8px 20px', flexShrink: 0 }}>
      <div
        className="fm-349-substitutive-banner"
        data-testid="FmModel349Page__substitutiveBanner"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 320px', minWidth: 0 }}>
          <RefreshCw
            size={18}
            strokeWidth={1.75}
            style={{ color: 'var(--status-warning-fg)', flexShrink: 0 }}
            data-testid="RefreshCw__substitutiveBanner" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              {t('fm.m349.substitutive_banner.title') ?? 'Declaración sustitutiva'}
            </div>
            <div style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
              {t('fm.m349.substitutive_banner.sub') ?? 'Reemplaza por completo a la declaración presentada anteriormente para este periodo.'}
            </div>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', whiteSpace: 'nowrap' }}>
          <span>
            {label}
            <span aria-hidden="true" style={{ color: 'var(--status-destructive-fg)', marginLeft: 2 }}>*</span>
          </span>
          <input
            value={identChecks?.formerStatement ?? ''}
            onChange={e => onChange('formerStatement', sanitizeFormerStatementInput(e.target.value))}
            disabled={isSubmitted || isBusy}
            required
            aria-label={label}
            maxLength={FORMER_STATEMENT_LENGTH}
            inputMode="numeric"
            placeholder={t('fm.m349.substitutive_banner.former_statement_placeholder') ?? '13 dígitos'}
            style={{
              width: 180, height: 36, boxSizing: 'border-box', padding: '7px 12px', fontSize: 14,
              border: '1px solid hsl(var(--border-control))', borderRadius: 8, outline: 'none',
              color: 'hsl(var(--foreground))', background: 'hsl(var(--card))',
            }}
            data-testid="FmModel349Page__formerStatement" />
        </label>
      </div>
    </div>
  );
}

// ── Submission snapshot helpers (ETP-5438) ────────────────────────
// Pure, module-level — extracted from the component body to keep its cognitive complexity under
// the SonarQube javascript:S3776 threshold. Exported for their unit tests only.

// The snapshot the backend persisted when the declaration was presented, or `null` (drafts, and
// legacy declarations presented before snapshots existed).
export function submittedSnapshotOf(decl) {
  const snapshot = decl?.submittedSnapshot;
  return snapshot && typeof snapshot === 'object' ? snapshot : null;
}

// True when the page is served from the snapshot: a submitted declaration whose snapshot carries
// the operators.
export function isSnapshotServed349(isSubmitted, snapshot) {
  return isSubmitted && Array.isArray(snapshot?.operators);
}

// Rectification count: the snapshot keeps only the COUNT, a live payload keeps the rows (the
// legacy/mock shape can carry a plain number instead of an array, which counts as 0 here).
export function rectificationCountFor(snapshotServed, snapshot, rows) {
  if (snapshotServed) return Number(snapshot.rectificationCount) || 0;
  return Array.isArray(rows) ? rows.length : 0;
}

// The "Facturas origen" tab badge: the snapshot's invoice count, else the live rows' length
// (`null` while nothing is loaded).
export function invoicesTabBadge(snapshotServed, snapshot, liveInvoices) {
  if (snapshotServed) return Number(snapshot.invoiceCount) || 0;
  return liveInvoices?.length ?? null;
}

// The tab the shared DetailTabContent renders: none for a snapshot-served "Facturas origen" tab,
// whose content is the "not kept" note instead.
export function detailTabFor(snapshotServed, activeTab) {
  return snapshotServed && activeTab === 'invoices' ? null : activeTab;
}

// ── Main ─────────────────────────────────────────────────────────
export default function FmModel349Page({ decl, onBack, onStatusChange, onManualDataSaved, token, apiBaseUrl }) {
  const ui = useUI();
  const t = ui;
  const { locale: appLocale } = useLocaleSwitch();
  const bcpLocale = (appLocale || 'es_ES').replace('_', '-');

  const [status,      setStatus]      = useState(decl.status);
  // submissionMethod (ETP-4755) — see FmModel303Page.jsx's identical state for the full
  // rationale: distinguishes the manual "Presentado" paths from a real AEAT telematic
  // submission (303-only; a 349 declaration only ever reaches the two manual paths).
  const [submissionMethod, setSubmissionMethod] = useState(decl.submissionMethod);
  // Computed from `status` state (not `decl.status`) so it tracks a same-session
  // presentation (`handlePresent` -> `handleStatusChange` -> `setStatus`) without a
  // remount. Declared early — before the mount-time auto-compute effect below, which
  // reads it (ETP-5438) — and reused at the action-bar gates further down.
  const isSubmitted = ['submitted', 'submitted_ext', 'submitted_ack'].includes(status);
  // ETP-5438 — the operators payload the backend persisted when this declaration was presented
  // (`null` for drafts and for legacy declarations presented before snapshots existed). See the
  // mount-time auto-compute effect below for how it is consumed.
  const submittedSnapshot = submittedSnapshotOf(decl);
  // ETP-5438 — the snapshot keeps operators and the key totals, plus the invoice/rectification
  // COUNTS (`invoiceCount`, `rectificationCount`); the per-invoice `invoices`/`rectifications`
  // rows are not kept. While served from a snapshot those two tabs show a note instead of a list;
  // the operators' "Origen" counts come from `originPurchases`/`originSales` on each row.
  const snapshotServed = isSnapshotServed349(isSubmitted, submittedSnapshot);
  const [activeTab,   setActiveTab]   = useState('operators');
  const [keyFilter,   setKeyFilter]   = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPresent, setShowPresent] = useState(false);
  const [showFilegen, setShowFilegen] = useState(false);
  const [selected,     setSelected]     = useState(new Set());
  const [liveOperators, setLiveOperators] = useState(decl._precomputed?.operators ?? null);
  const [liveInvoices,  setLiveInvoices]  = useState(decl._precomputed?.invoices  ?? null);
  const [liveRectifications, setLiveRectifications] = useState(decl._precomputed?.rectifications ?? null);
  const [liveRectifSummary, setLiveRectifSummary] = useState(decl._precomputed?.rectificativeSummary ?? null);
  // ETP-5456 — read-only fallback values `Fiscal349BoxesHandler#computeOperators` exposes
  // (`contactFallback`/`phoneFallback`, mirroring exactly what a blank field falls back to at
  // generation time: the logged-in AD_User's name / the org's resolved phone). FileGenModal uses
  // these to decide whether an empty "Persona de contacto"/"Teléfono de contacto" would actually
  // resolve to something, same `live* ?? decl._precomputed? ?? decl.*` pattern as every other
  // computed field on this page.
  const [liveContactFallback, setLiveContactFallback] = useState(decl._precomputed?.contactFallback ?? null);
  const [livePhoneFallback,   setLivePhoneFallback]   = useState(decl._precomputed?.phoneFallback   ?? null);
  const [viesBannerDismissed, setViesBannerDismissed] = useState(false);
  // ETP-5456 — persisted `manualData.identification` for the "Sustitutiva" flag + its former-
  // declaration identifier, mirroring 303's `identChecks` (same shape convention:
  // `manualData.identification`, hydrated once from `decl.manualData` and flushed explicitly by
  // "Guardar" — no debounce/autosave, see `handleSave` below). 349 has no box-override state to
  // race against, so this skips 303's `useRecordWriteQueue` machinery entirely.
  const [identChecks, setIdentChecks] = useState(decl.manualData?.identification ?? {});
  const hasPendingEditRef = useRef(false);
  // ETP-5597 (W4) — bumped on every edit. A save only clears `hasPendingEditRef` when no edit
  // happened after it started (same version on success), so an edit racing an in-flight save
  // is never silently marked as persisted.
  const editVersionRef = useRef(0);
  // ETP-5597 (W4) — single-flight guards: the in-flight manual-data save (reused by any caller
  // that asks for a save while one is running) and the in-flight present/generate actions (a
  // double click starts only one).
  const saveInFlightRef = useRef(null);
  const presentInFlightRef = useRef(false);
  const generateInFlightRef = useRef(false);
  const [isSavingManualData, setIsSavingManualData] = useState(false);
  const [presenting, setPresenting] = useState(false);

  React.useEffect(() => {
    if (decl._precomputed?.operators) setLiveOperators(decl._precomputed.operators);
    if (decl._precomputed?.invoices)  setLiveInvoices(decl._precomputed.invoices);
    if (decl._precomputed?.rectifications) setLiveRectifications(decl._precomputed.rectifications);
    if (decl._precomputed?.rectificativeSummary) setLiveRectifSummary(decl._precomputed.rectificativeSummary);
    if (decl._precomputed?.contactFallback != null) setLiveContactFallback(decl._precomputed.contactFallback);
    if (decl._precomputed?.phoneFallback   != null) setLivePhoneFallback(decl._precomputed.phoneFallback);
  }, [decl._precomputed]);
  // ETP-5027 — `{ nif, key, tab }` the Origen link narrowed a tab to (null = show
  // everything). ONE state serves both destinations: the link sets it and switches to
  // `tab` in the same gesture, and it is cleared whenever the user leaves that tab, so
  // two filters can never be live at once and a stale one can never silently hide rows.
  const [originFilter, setOriginFilter] = useState(null);
  const [computing,    setComputing]    = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [validatingVies, setValidatingVies] = useState(false);
  // Mirrors `validatingVies` synchronously: `setState` is async, so between two fast
  // clicks (or a programmatic caller) the `disabled` attribute has not been committed yet.
  const validatingViesRef = useRef(false);

  // Only used to grab `upload()` for the manual acuse-de-recibo path below —
  // isActive: false keeps it from eagerly listing/fetching attachments on
  // mount (that eager fetch is owned by the "receipt" tab's own AttachmentsTab).
  const { upload: uploadReceipt } = useAttachments({
    tableName: FISCAL_DECL_TABLE,
    recordId: decl.id,
    token,
    apiBaseUrl,
    isActive: false,
  });

  const operators = liveOperators ?? decl.operators ?? MOCK_OPERATORS;

  // ETP-5338 — `undefined` locale here used to resolve to the RUNTIME's/browser's
  // default locale (typically the OS language), not the app's selected UI locale —
  // so under an es-language OS the breadcrumb showed "octubre" even with the UI
  // set to English. Pass the resolved `bcpLocale` explicitly, same fix pattern as
  // `normDecl.updatedAt` in FmListPage.jsx.
  const periodLabel = buildPeriodLabel(decl, bcpLocale);

  // ETP-5456 — derived from `identChecks`, not `decl.manualData` directly, so an unsaved
  // edit is reflected immediately (same precedent as 303's `identChecks.rectificativa`).
  const sustitutiva = isSustitutivaChecked(identChecks);
  // ETP-5597 — a substitute declaration cannot be registered/presented without the AEAT
  // former-declaration identifier: exactly 13 digits, the same rule FileGenModal applies
  // (`isValidFormerStatement`, formerStatement.js).
  const formerStatementInvalid = sustitutiva && !isValidFormerStatement(identChecks?.formerStatement);
  // ETP-5597 (W4) — while a manual-data save (Guardar or the flush before Generar/Presentar), a
  // generation or a presentation is in flight, every control that edits or acts on the
  // declaration is locked: no edit mid-save, no second save/present/generate.
  const actionBusy = isSavingManualData || generating || presenting;

  const blocking     = decl.incidents?.blocking ?? 0;
  const warning      = decl.incidents?.warning  ?? 0;
  // ETP-5027 — both counters are DISTINCT counts, not row counts (see
  // operatorIdentity / viesIdentity). The VIES banner consumes this same
  // `viesPending` value, so the KPI and the banner can never disagree.
  const operatorCount = countDistinct(operators, operatorIdentity);
  const viesPending  = countDistinct(operators.filter(o => o.vies === 'pending'), viesIdentity);
  // Excludes corrective rows for the same reason TotalsCard does — their signed
  // deltas must not net off against the regular base total (ETP-5027).
  const totalBase    = operators
    .filter(o => !isRectificativeOp(o))
    .reduce((s,o) => s + (parseFloat(o.base) || 0), 0);
  const rectifSummary = liveRectifSummary ?? decl.rectificativeSummary ?? null;
  const rectifRows     = liveRectifications ?? decl.rectifications ?? [];
  const rectifications = rectificationCountFor(snapshotServed, submittedSnapshot, rectifRows);

  // Returns whatever `onStatusChange` returns (FiscalModelsPage resolves the PUT result), so a
  // caller can react to a rejected transition — see `handlePresent`.
  function handleStatusChange(newStatus, newSubmissionMethod) {
    setStatus(newStatus);
    if (newSubmissionMethod) setSubmissionMethod(newSubmissionMethod);
    return onStatusChange?.(decl.id, newStatus, newSubmissionMethod);
  }

  // ETP-5456 — 349 now has real locally-edited, persistable declaration data (the "Sustitutiva"
  // section's `identChecks`, see its own comment above), so the former deliberate no-op
  // confirmation (ETP-5338 pt.5) is replaced with an actual flush — this is the handler that
  // comment pointed at. Mirrors 303's `persistEditableFields`/`handleSave` split, simplified:
  // 349 has no box-override state and no background recompute racing against this write, so
  // there is no need for 303's `useRecordWriteQueue`/`waitUntilManualDataIdle` machinery — a
  // single explicit PUT per click is enough.
  function handleIdentChange(id, value) {
    hasPendingEditRef.current = true;
    editVersionRef.current += 1;
    setIdentChecks(prev => ({ ...prev, [id]: value }));
  }

  // ETP-5597 — the single write path for `identChecks` (the whole manualData payload this page
  // edits), shared by "Guardar", "Generar fichero 349" and "Registrar/Presentar". Returns `null`
  // SYNCHRONOUSLY when there is nothing to persist (so callers keep their synchronous path), or
  // a promise resolving `{ ok }`. Never toasts on its own.
  function persistIdentChecks() {
    if (!hasPendingEditRef.current || !apiBaseUrl) return null;
    return persistIdentChecksNow();
  }

  function persistIdentChecksNow() {
    // ETP-5597 (W4) — single flight: a second request while a save is running joins it instead
    // of issuing a parallel PUT.
    // A joining caller's edit made after the running save started is not in that save's payload:
    // it stays pending (editVersionRef) and the next action flushes it — safe, the form is locked
    // while the save is in flight, so only a racing event can produce such an edit.
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const startVersion = editVersionRef.current;
    const payload = { identification: identChecks };
    setIsSavingManualData(true);
    const run = (async () => {
      try {
        const result = await persistManualData(decl.id, payload, { token, apiBaseUrl });
        if (result.ok) {
          // Only an edit-free save clears the pending flag — see editVersionRef.
          if (editVersionRef.current === startVersion) hasPendingEditRef.current = false;
          // ETP-5338 Bug A precedent (303) — push the just-saved manualData into FmListPage's own
          // cached `decls` entry so the "Tipo" column and a re-opened declaration both see it
          // without a full page reload. ETP-5597 (W4) — the payload actually SENT, never a
          // later in-memory state.
          onManualDataSaved?.(decl.id, payload);
        }
        return { ok: !!result.ok };
      } finally {
        saveInFlightRef.current = null;
        setIsSavingManualData(false);
      }
    })();
    saveInFlightRef.current = run;
    return run;
  }

  // ETP-5597 — flushes unsaved edits before an action that depends on them (generate/present).
  // Resolves `true` when the action may proceed; on failure shows Guardar's own error toast.
  async function flushBeforeAction() {
    const pending = persistIdentChecks();
    if (!pending) return true;
    const { ok } = await pending;
    if (!ok) toast.error(t('fm.action.save_error') ?? 'No se pudo guardar. Inténtalo de nuevo.');
    return ok;
  }

  async function handleSave() {
    const pending = persistIdentChecks();
    const { ok } = pending ? await pending : { ok: true };
    if (ok) {
      toast.success(t('recordSaved') ?? 'Registro guardado');
    } else {
      toast.error(t('fm.action.save_error') ?? 'No se pudo guardar. Inténtalo de nuevo.');
    }
  }

  // Manual "Presentación con Acuse de recibo" path: persist the uploaded
  // receipt to the same attachments store the "Justificante" tab reads
  // from. Fire-and-forget — useAttachments.upload() already toasts its
  // own errors and never rethrows, so a failed upload must not block the
  // status change the user explicitly confirmed.
  async function handlePresent(args) {
    // ETP-5597 (W4) — a double confirm starts only one flush + one status change.
    if (presentInFlightRef.current) return;
    presentInFlightRef.current = true;
    setPresenting(true);
    try {
      await presentNow(args);
    } finally {
      presentInFlightRef.current = false;
      setPresenting(false);
    }
  }

  async function presentNow({ status: newStatus, acuseFile }) {
    // ETP-5597 — belt-and-braces for the disabled "Registrar/Presentar" button: a substitutive
    // declaration cannot be presented without its 13-digit former-declaration identifier.
    if (formerStatementInvalid) {
      toast.error(t('fm.m349.present_disabled.former_statement') ?? 'Introduce el identificador de la declaración anterior (13 dígitos) para presentar una declaración sustitutiva.');
      return;
    }
    // ETP-5597 (bug) — flush unsaved Tipo/identifier BEFORE the status change, same as 303's
    // handlePresent → persistEditableFields. The status PUT only carries `status`, and once the
    // declaration is submitted it is read-only, so an unsaved "Sustitutiva" was silently lost:
    // the declaration came back as Normal and the list's "Tipo" column read "Ordinaria".
    if (hasPendingEditRef.current && !(await flushBeforeAction())) return;
    if (newStatus === 'submitted_ack' && acuseFile) {
      uploadReceipt(acuseFile);
    }
    // submissionMethod (ETP-4755) — see FmModel303Page.jsx's handlePresent for the
    // identical rationale; 349 only ever exercises these two manual paths.
    const submissionMethodForPath = newStatus === 'submitted_ack' ? 'manual_ack' : 'manual_no_receipt';
    // ETP-5438 — roll back a presentation the backend rejected (it could not compute the
    // submission snapshot); see FmModel303Page.jsx's handlePresent.
    const previous = { status, submissionMethod };
    // ETP-5597 — a rejected onStatusChange (network error, thrown handler) is treated exactly
    // like a backend `{ ok: false }`: roll back + present_error toast, never an unhandled rejection.
    let result;
    try {
      result = await handleStatusChange(newStatus, submissionMethodForPath);
    } catch (err) {
      console.error('349 status change failed for', decl.id, err);
      result = { ok: false };
    }
    if (result?.ok === false) {
      setStatus(previous.status);
      setSubmissionMethod(previous.submissionMethod);
      toast.error(t('fm.action.present_error') ?? 'No se pudo presentar la declaración. Inténtalo de nuevo.');
      return;
    }
    // ETP-5438 — show exactly the operators the backend froze in this same request (the PUT
    // echoes the snapshot), so the page matches what the list and every later reopen show.
    if (result?.submittedSnapshot?.operators) {
      applyOperatorsResult(result.submittedSnapshot);
    }
  }

  function applyOperatorsResult(res) {
    if (res?.operators) setLiveOperators(res.operators);
    if (res?.invoices)  setLiveInvoices(res.invoices);
    if (res?.rectifications) setLiveRectifications(res.rectifications);
    if (res?.rectificativeSummary) setLiveRectifSummary(res.rectificativeSummary);
    // ETP-5456 — contactFallback/phoneFallback are new on the compute payload (added alongside
    // this same helper's other fields), folded into this shared setter rather than a second
    // hand-rolled copy at every call site (mount snapshot, cold-cache restore, live recompute).
    if (res?.contactFallback != null) setLiveContactFallback(res.contactFallback);
    if (res?.phoneFallback   != null) setLivePhoneFallback(res.phoneFallback);
  }

  async function handleCompute() {
    setComputing(true);
    try {
      const res = await compute349Operators(decl, { token, apiBaseUrl });
      applyOperatorsResult(res);
    } finally {
      setComputing(false);
    }
  }

  // ETP-5438 follow-up — ONE compute for a submitted declaration opened on a cold session cache
  // (new tab, reload, another browser/user), frozen into the same sessionStorage entry
  // `FmListPage.jsx`'s submitted-family bucket reads, so list and detail show the same data for
  // the rest of the session. Display-only: no persistence. `compute349Operators` already
  // resolves `null` on a failed backend call (no mock fallback when `apiBaseUrl` is set), and a
  // `null` result is never cached, so a failure leaves the tabs empty instead of freezing garbage.
  // `isCancelled` comes from the mount effect's cleanup: a response that resolves after unmount
  // or after `decl.id` changed still freezes the cache under the id it was computed for, but
  // must not paint that declaration's operators into whatever this page shows now.
  async function computeSubmittedOnce(isCancelled = () => false) {
    const declId = decl.id;
    setComputing(true);
    try {
      const res = await compute349Operators(decl, { token, apiBaseUrl });
      if (!res?.operators) return;
      setCachedFiscalCompute(declId, res);
      if (isCancelled()) return;
      applyOperatorsResult(res);
    } finally {
      if (!isCancelled()) setComputing(false);
    }
  }

  // ETP-5027 — re-runs VIES for this declaration's pending NIF-IVAs, then refreshes the
  // operators so the VIES badges, the "Pendientes VIES" KPI and this banner all move
  // together (all three read the same `operators` array).
  async function handleValidateVies() {
    // Double-submit guard. The button is `disabled` while in flight, but each run fires a
    // bulk of LIVE calls to the member states' VIES services; overlapping runs are exactly
    // what earns a MS_MAX_CONCURRENT_REQ rejection, so the guard is not merely cosmetic.
    if (validatingViesRef.current) return;
    validatingViesRef.current = true;
    setValidatingVies(true);
    try {
      const res = await validate349Vies(decl, { token, apiBaseUrl });
      if (!res.ok) {
        // Return WITHOUT touching liveOperators: a failed request must leave the
        // currently displayed statuses exactly as they were, not blank them.
        toast.error(
          res.serverMessage
          || t('fm.m349.vies.result.error')
          || 'No se pudo ejecutar la validación VIES. Inténtelo de nuevo.'
        );
        return;
      }
      // Drop the list's cached operators payload BEFORE recomputing. `checkModified349`
      // only asks whether the period's INVOICES changed, and a VIES revalidation touches
      // business partners instead — so it answers `false` and `useFiscalAutoCompute`
      // restores the pre-validation payload, repainting the stale VIES badges over the
      // fresh ones and making this button look inert. See invalidateFiscalComputeCache.
      invalidateFiscalComputeCache(decl.id);
      await handleCompute();
      const { level, message } = buildViesResultMessage(t, res);
      (toast[level] ?? toast)(message);
    } finally {
      validatingViesRef.current = false;
      setValidatingVies(false);
    }
  }

  // Auto-compute on mount when the list didn't hand us any precomputed data
  // (ETP-4755 regression). `FmListPage`'s `useFiscalAutoCompute` only ever
  // precomputes DRAFT declarations — once a declaration is submitted (or is
  // opened via a path that bypasses the list's own auto-compute), `decl._precomputed`
  // is `undefined` and operators/invoices/rectifications all start blank (and, worse,
  // `operators` below falls back to `MOCK_OPERATORS` — real-looking demo data —
  // instead of showing empty). This mirrors what the (now hidden-when-submitted)
  // "Calcular" button used to do manually. Scoped to `decl.id` only (not
  // `liveOperators`/`decl._precomputed`) so it fires exactly once per opened
  // declaration instead of looping once `handleCompute` populates state.
  //
  // ETP-5438 — Legacy (no snapshot): for a submitted declaration presented before the
  // backend persisted submission snapshots, this effect computes at most ONCE per browser
  // session (a declaration WITH `submittedSnapshot` is served from it — first branch below —
  // and never reaches any of this; a live `GET /fiscal349/operators` always recomputes from whatever
  // invoices exist RIGHT NOW, regardless of who calls it or when — recomputing on
  // every mount silently picked up invoices added/removed after presentation, the
  // "sigue tomando facturas aun presentada" bug). It first reuses
  // `getCachedFiscalCompute`, the same sessionStorage cache `FmListPage.jsx`'s own
  // submitted-family bucket populates (see its `neverModifiedFn` comment) —
  // network-free. Only on a cold cache (new tab, reload, another browser, with no
  // `_precomputed` handed down) does it compute once (`computeSubmittedOnce`) and
  // write the result back to that same cache entry, so later mounts and the list
  // stay frozen on it. "Calcular" stays hidden once submitted. Legacy-only trade-off:
  // a cold session recomputes from the invoice data as it is at that moment.
  useEffect(() => {
    // ETP-5438 — a declaration presented once snapshots existed carries the exact
    // `GET /fiscal349/operators` payload persisted server-side at submission time
    // (`decl.submittedSnapshot`): the single source of truth for its data, applied through the
    // same `applyOperatorsResult` with no compute call and no sessionStorage involvement.
    // Checked first so nothing below can ever recompute it. Legacy declarations presented
    // before snapshots existed have none and keep the once-per-session freeze below.
    if (isSubmitted && submittedSnapshot?.operators) {
      applyOperatorsResult(submittedSnapshot);
      return;
    }
    const hasPrecomputed = decl._precomputed?.operators != null || liveOperators != null;
    if (hasPrecomputed) return;
    if (!apiBaseUrl) return;
    // ETP-4576 — `!token` is deliberately NOT part of this gate; see FmModel303Page.jsx's
    // identical comment. Under the cookie session the client holds no token, so a `!token`
    // gate is permanently false and the request would simply never fire.
    if (isSubmitted) {
      const cached = getCachedFiscalCompute(decl.id);
      if (cached?.operators) {
        applyOperatorsResult(cached);
        return;
      }
      let cancelled = false;
      computeSubmittedOnce(() => cancelled);
      return () => { cancelled = true; };
    }
    handleCompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decl.id]);

  // ETP-5456 — `substitutive` is the persisted `identChecks` value (the checkbox lives on the
  // form — see DeclarationTypeControl). ETP-5597 — `formerStatement` is typed in the
  // substitutive banner (persisted as `identChecks.formerStatement`) and comes
  // back through FileGenModal's payload, which only forwards it while `substitutive` is true.
  async function handleGenerate(args) {
    // ETP-5597 (W4) — a double confirm starts only one flush + one generation.
    if (generateInFlightRef.current) return;
    generateInFlightRef.current = true;
    try {
      await generateNow(args);
    } finally {
      generateInFlightRef.current = false;
    }
  }

  async function generateNow({
    phone, contact, fileName, formerStatement, representativeTaxId, navarra, guipuzcoa,
  } = {}) {
    // ETP-5438 — the button that opens FileGenModal is itself hidden once submitted, so this
    // is a belt-and-braces second check (same double-check pattern FmModel303Page.jsx already
    // uses for missingRequiredFields), not the primary gate. The real defense-in-depth against a
    // direct/malformed API call is server-side, in Fiscal349BoxesHandler#handleGenerate.
    if (isSubmitted) {
      toast.error(t('fm.validation.already_submitted') ?? 'Esta declaración ya ha sido presentada.');
      return;
    }
    // ETP-5597 (bug) — persist unsaved Tipo/identifier first (same flush as Registrar/Presentar),
    // so the declaration record never disagrees with the file just generated from it.
    if (hasPendingEditRef.current && !(await flushBeforeAction())) return;
    setGenerating(true);
    const result = await generate349File(decl, {
      token, apiBaseUrl, phone, contact, fileName,
      substitutive: sustitutiva,
      formerStatement,
      representativeTaxId, navarra, guipuzcoa,
    });
    setGenerating(false);
    if (!result.ok) {
      // Classic does not client-side-validate Substitutive/Navarra/Guipuzcoa combinations
      // either (no AD_Val_Rule for it) — it lets the user attempt and shows AEAT3492010Report's
      // real validation error (e.g. "@AEAT349_FormerStatement_Required@",
      // "@AEAT349_NAVARRA_OR_GUIPUZCOA@") when the backend rejects it. Mirror that here instead
      // of adding preventive validation, which would be stricter than classic.
      const msg = result.serverMessage
        || t('fm.gen349.error.generic')
        || 'Error al generar el fichero. Por favor, inténtelo de nuevo.';
      toast.error(msg);
      console.error('generate349File failed for', decl.year, decl.period, result.error, result.serverMessage);
    }
  }

  const searchLower  = searchQuery.trim().toLowerCase();
  const filteredOps  = operators
    .filter(o => keyFilter === 'all' || o.key === keyFilter)
    .filter(o => !searchLower ||
      (o.name ?? '').toLowerCase().includes(searchLower) ||
      (o.nif  ?? '').toLowerCase().includes(searchLower)
    );
  const toggleSelect = id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected  = filteredOps.length > 0 && filteredOps.every(o => selected.has(rowKey(o)));

  const originByNif = React.useMemo(() => {
    if (!liveInvoices) return {};
    const map = {};
    liveInvoices.forEach(inv => {
      const k = `${inv.nifIva}|${inv.key ?? ''}`;
      if (!map[k]) map[k] = { Compra: 0, Venta: 0 };
      map[k][inv.type] = (map[k][inv.type] ?? 0) + 1;
    });
    return map;
  }, [liveInvoices]);

  // ETP-5027 — same `nif|key` shape as `originByNif`, but built from the
  // rectifications dataset. Corrective invoices are deliberately absent from
  // `liveInvoices` (backend puts them in their own array), so resolving a
  // rectificative operator row against `originByNif` made it inherit the invoice
  // count of the REGULAR row sharing its (nif, key) — the misattribution this fixes.
  const originByRectification = React.useMemo(() => {
    const map = {};
    // `decl.rectifications` is a COUNT in the legacy/mock shape (the array form
    // only arrives from the operators endpoint) — same guard as `rectifications` above.
    if (!Array.isArray(rectifRows)) return map;
    rectifRows.forEach(r => {
      rectificationKeys(r).forEach(key => {
        const k = `${r.nifIva}|${key}`;
        if (!map[k]) map[k] = { Compra: 0, Venta: 0 };
        map[k][r.type] = (map[k][r.type] ?? 0) + 1;
      });
    });
    return map;
  }, [rectifRows]);

  function formatOrigin(op) {
    if (op.origin) return op.origin;
    // A rectificative row resolves ONLY against the rectifications lookup: no match
    // means "—", never a fallback to the regular-invoice count.
    const source = isRectificativeOp(op) ? originByRectification : originByNif;
    // ETP-5438 — a submission snapshot drops the invoice/rectification rows but folds the same
    // per-operator counts into each operator row (`originPurchases`/`originSales`, computed
    // server-side with the same nif|key grouping); use them when the rows are absent.
    const counts = source[`${op.nif}|${op.key ?? ''}`] ?? snapshotOriginCounts(op);
    if (!counts) return null;
    const c = counts['Compra'] ?? 0;
    const v = counts['Venta']  ?? 0;
    if (c > 0 && v > 0) return `${c} compra, ${v} venta`;
    if (c > 0) return `${c} factura${c !== 1 ? 's' : ''} compra`;
    if (v > 0) return `${v} factura${v !== 1 ? 's' : ''} venta`;
    return null;
  }

  // The Origen link must land on the dataset the value was computed from, narrowed to
  // the row that was clicked: the Rectificaciones tab for corrective rows, Facturas
  // origen for regular ones. Both destinations filter on the same (nif, key) grain the
  // Origen count is aggregated under, so the list and the number always agree.
  function goToOrigin(op) {
    const tab = isRectificativeOp(op) ? 'rectif' : 'invoices';
    setOriginFilter({ nif: op.nif, key: op.key ?? '', tab });
    setActiveTab(tab);
  }

  // A filter only ever applies to the tab it was created for; the other tab reads null
  // even in the instant before the clear lands.
  const invoiceOriginFilter = resolveOriginFilterForTab(originFilter, 'invoices');
  const rectifOriginFilter  = resolveOriginFilterForTab(originFilter, 'rectif');


  const TABS = [
    { id:'operators', label: t('fm.m349.tab.operators'), badge: operators.length,        icon: <Users size={16} strokeWidth={1.75} data-testid="Users__346dd5" /> },
    { id:'rectif',    label: t('fm.m349.tab.rectif'),    badge: rectifications || null,  icon: <FileEdit size={16} strokeWidth={1.75} data-testid="FileEdit__346dd5" /> },
    { id:'invoices',  label: t('fm.m349.tab.invoices'),  badge: invoicesTabBadge(snapshotServed, submittedSnapshot, liveInvoices), icon: <ReceiptText size={16} strokeWidth={1.75} data-testid="ReceiptText__346dd5" /> },
    // ETP-5597 — the badge counts every incident and takes its tone from the shared severity
    // helper (danger if any blocking, warn if warnings only), same as the 303 incidents tab.
    { id:'incidents', label: t('fm.m349.tab.incidents'), badge: (blocking + warning) || null,
      badgeTone: getIncidentIndicator({ blocking, warning }, t)?.tone ?? null, icon: <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__346dd5" /> },
    { id:'receipt',   label: t('fm.tab.receipt') ?? 'Justificante', badge: null,        icon: <FileCheck size={16} strokeWidth={1.75} data-testid="FileCheck__346dd5" /> },
  ];

  return (
    <div className="fm-page fm-page--freeflow">
      {/* ── Title bar ────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 20px',
        background: 'hsl(var(--card))', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="fm-model-badge fm-model-badge--349">349</span>
          <span style={{ fontWeight: 600, fontSize: 20, color: 'hsl(var(--foreground))' }}>
            {t('fm.config.m349.title') ?? 'Modelo 349'} - {periodLabel}
          </span>
          <div style={{ flex: 1 }} />
          <MoreOptionsMenu
            favKey="fiscal-models"
            favLabel={t('fm.list.title') ?? 'Declaraciones'}
            data-testid="MoreOptionsMenu__346dd5" />
        </div>
        {/* ETP-5597 — the "Modelos Fiscales" level goes back to the declarations list, like the
            parent crumb of a generated window's detail; same path as "Cancelar". */}
        <FmBreadcrumb
          style={{ fontSize: 12, color: 'hsl(var(--text-disabled))', marginTop: 2 }}
          items={[
            ui('finance'),
            { label: ui('fm.breadcrumb.section'), onClick: onBack },
            `${t('fm.config.m349.title') ?? 'Modelo 349'} - ${periodLabel}`,
          ]}
        />
      </div>
      {/* ── Action bar ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 20px 10px',
        background: 'hsl(var(--card))', flexShrink: 0,
      }}>
        <button className="fm-btn" onClick={onBack}
          style={{ borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14, color: 'hsl(var(--foreground))' }}>
          {t('fm.action.cancel') ?? 'Cancelar'}
        </button>
        <span style={{
          padding: '4px 8px', borderRadius: 8, fontSize: 14, fontWeight: 400,
          background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))',
        }}>
          {t('fm.col.status') ?? 'Estado'}: {t(`fm.status.${statusLabelKey(status)}`) ?? status}
          {/* submissionMethod (ETP-4755) — see FmModel303Page.jsx for the identical pattern.
              The badge text itself never varies between `submitted` and `submitted_ack`
              (see `statusLabelKey`) — only this sub-suffix does. */}
          {submissionMethod && (status === 'submitted' || status === 'submitted_ack') && (
            <span style={{ opacity: .75 }}> · {t(`fm.present.method.${submissionMethod}`)}</span>
          )}
        </span>

        {/* ETP-5597 — Tipo: Normal | Sustitutiva, persisted via "Guardar". */}
        <DeclarationTypeControl
          identChecks={identChecks}
          onChange={handleIdentChange}
          isSubmitted={isSubmitted}
          isBusy={actionBusy}
          t={t}
          data-testid="DeclarationTypeControl__346dd5" />

        <div style={{ flex: 1 }} />

        {/* ETP-5338 pt.5 — "Guardar", right-aligned leftmost of the primary-action group
            (matching 303 and `saveActions.jsx`'s Save-before-Confirm convention). See
            `handleSave`'s own comment above for why this is a deliberate no-op confirmation:
            349 has no locally-edited declaration data to actually persist. Hidden once
            submitted, same `!isSubmitted` gate as "Calcular"/"Registrar-Presentar". */}
        {!isSubmitted && (
          <button
            className="fm-btn"
            onClick={handleSave}
            disabled={actionBusy}
            title={t('fm.action.save') ?? 'Guardar'}
            aria-label={t('fm.action.save') ?? 'Guardar'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14, color: 'hsl(var(--foreground))' }}
            data-testid="FmModel349Page__save"
          >
            {isSavingManualData
              ? <Loader2 size={16} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__save" />
              : <Save size={16} strokeWidth={1.75} data-testid="Save__save" />}
            {t('fm.action.save') ?? 'Guardar'}
          </button>
        )}

        {!isSubmitted && (
          <button
            className="fm-btn"
            onClick={handleCompute}
            disabled={computing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14 }}
          >
            {computing
              ? <Loader2
                  size={16}
                  strokeWidth={1.75}
                  style={{ animation: 'spin 1s linear infinite' }}
                  data-testid="Loader2__346dd5" />
              : <Calculator size={16} strokeWidth={1.75} data-testid="Calculator__346dd5" />
            }
            {computing ? (t('fm.action.computing') ?? 'Calculando…') : (t('fm.action.compute') ?? 'Calcular')}
          </button>
        )}

        {/* ETP-5438 — hidden once submitted: a declaration already presented must not be
            re-generated, matching "Calcular"/"Registrar-Presentar"'s existing `!isSubmitted`
            gate above. Previously always visible regardless of status (see
            docs/generated-custom-windows/fiscal-models.md's Modelo 303 "Action bar" note for
            the ANALOGOUS, still-deliberate 303 behavior — NOT changed here, out of this
            ticket's scope). */}
        {!isSubmitted && (
          <button
            className="fm-btn"
            onClick={() => setShowFilegen(true)}
            disabled={actionBusy}
            data-testid="FmModel349Page__generate"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid hsl(var(--border-control))', boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)', padding: '9px 12px', fontSize: 14 }}
          >
            <Download size={16} strokeWidth={1.75} data-testid="Download__346dd5" />
            {t('fm.action.gen349') ?? 'Generar fichero 349'}
          </button>
        )}

        {!isSubmitted && (
          <button
            className="fm-toolbar__btn fm-toolbar__btn--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '9px 12px', fontSize: 14, fontWeight: 500 }}
            onClick={() => setShowPresent(true)}
            disabled={formerStatementInvalid || actionBusy}
            title={formerStatementInvalid
              ? (t('fm.m349.present_disabled.former_statement') ?? 'Introduce el identificador de la declaración anterior (13 dígitos) para presentar una declaración sustitutiva.')
              : undefined}
            data-testid="FmModel349Page__present"
          >
            <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__346dd5" />
            {t('fm.action.present') ?? 'Registrar/Presentar'}
          </button>
        )}
      </div>
      {/* ── Substitutive banner (ETP-5597) ───────────────────────── */}
      <SubstitutiveBanner
        identChecks={identChecks}
        onChange={handleIdentChange}
        isSubmitted={isSubmitted}
        isBusy={actionBusy}
        t={t}
        data-testid="SubstitutiveBanner__346dd5" />
      {/* ── VIES banner ──────────────────────────────────────────── */}
      <ViesBanner
        onValidate={handleValidateVies}
        validating={validatingVies}
        viesPending={viesPending}
        dismissed={viesBannerDismissed}
        onDismiss={() => setViesBannerDismissed(true)}
        t={t}
        data-testid="ViesBanner__346dd5" />
      {/* ── KPI bar ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center',
        gap: 12, padding: '0 8px',
        height: 84, flexShrink: 0,
      }}>
        <KpiWidget
          icon={<Users size={20} strokeWidth={1.75} data-testid="Users__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.operators') ?? 'Operadores'}
          value={String(operatorCount)}
          badge={t('fm.m349.kpi.operators_desc') ?? 'Activos'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--text-disabled))"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<Calculator size={20} strokeWidth={1.75} data-testid="Calculator__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.total_ops') ?? 'Total operaciones'}
          value={formatAmount(totalBase)}
          badge={t('fm.m349.kpi.total_ops_desc') ?? 'Base total'}
          badgeBg="hsl(var(--muted))"
          badgeColor="hsl(var(--text-disabled))"
          data-testid="KpiWidget__346dd5" />
        <KpiWidget
          icon={<PenLine size={20} strokeWidth={1.75} data-testid="PenLine__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.rectif') ?? 'Rectificaciones'}
          value={String(rectifications)}
          badge={t('fm.m349.kpi.rectif_desc') ?? 'Previos'}
          badgeBg="var(--status-warning-bg)"
          badgeColor="var(--status-warning-fg)"
          data-testid="KpiWidget__346dd5" />
        {/* ETP-5027 — informational severity, not an error: the banner right above
            this bar states the VIES check is "informativa, no bloquea la
            declaración", so the destructive/red token was overstating it. Uses the
            SAME --status-info-* pair as that banner. The genuinely-invalid VIES
            state stays red — that lives in ViesBadge (.fm-vies--invalid). */}
        <KpiWidget
          icon={<ShieldAlert size={20} strokeWidth={1.75} data-testid="ShieldAlert__346dd5" />}
          iconColor="hsl(var(--text-disabled))"
          label={t('fm.m349.kpi.vies_pending') ?? 'Pendientes VIES'}
          value={String(viesPending)}
          valueColor={viesPending > 0 ? 'var(--status-info-fg)' : 'hsl(var(--foreground))'}
          badge={t('fm.m349.kpi.vies_pending_desc') ?? 'Sin validar'}
          badgeBg={viesPending > 0 ? 'var(--status-info-bg)' : 'hsl(var(--muted))'}
          badgeColor={viesPending > 0 ? 'var(--status-info-fg)' : 'hsl(var(--text-disabled))'}
          data-testid="KpiWidget__346dd5" />
      </div>
      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="fm-tabs-sticky" style={{ padding: '0 8px' }}>
        <Tabs
          tabs={TABS}
          active={activeTab}
          onSelect={(id) => { setActiveTab(id); if (originFilter && id !== originFilter.tab) setOriginFilter(null); }}
          data-testid="Tabs__346dd5" />
      </div>
      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="fm-page__body">

        {activeTab === 'operators' && (
          <div>
            {/* Filter + search + new operator row */}
            {/* ETP-5456 (layout follow-up) — sticky, stacked directly below `.fm-tabs-sticky`
                (top: 49, see that class's own comment for the 48px-tab-height + 1px-border
                derivation). Before this it scrolled with the content and ended up peeking out
                half-hidden under the (already-sticky) tabs bar — this docks it cleanly instead.
                `marginTop`/`marginBottom` became `paddingTop`/`paddingBottom` on purpose: for a
                sticky element the offset in `top` is measured from the MARGIN edge, so a margin
                here would have shifted the actual stick point away from 49px; padding keeps the
                same visual spacing while keeping the box's own height (and therefore the stick
                point) predictable. `background` is required — without an opaque background the
                table rows scrolling underneath would show through this bar once it is pinned.
                `zIndex: 15` is intentionally below the tabs bar's 20 (they never overlap — this
                bar docks strictly below the tabs — but keeps the ordering explicit) and above the
                unset/auto z-index of the scrolling table content below.
                `.fm-349-totals`'s `top` was bumped from 49 to 97 to dock below BOTH sticky bars —
                97 = 49 (tabs) + 48 (this bar's own rendered height: 8px paddingTop + 36px content
                row [`.fm-toolbar__pill` / the search box, both padding 7px 12px + ~20px line
                content + 1px+1px border = 36px border-box] + 4px paddingBottom). See
                `.fm-349-totals`'s own comment in fiscal-models.css for the full sticky-stack
                writeup. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4, paddingTop: 8, flexWrap: 'wrap', position: 'sticky', top: 49, zIndex: 15, background: 'hsl(var(--card))' }}>
              <KeyFilterDropdown
                value={keyFilter}
                onChange={setKeyFilter}
                t={t}
                data-testid="KeyFilterDropdown__346dd5" />
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: `1px solid ${searchQuery ? 'hsl(var(--focus-ring))' : 'hsl(var(--border-subtle))'}`, borderRadius: 8, fontSize: 14, color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--card))', minWidth: 240 }}>
                <Search
                  size={15}
                  strokeWidth={1.75}
                  style={{ flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}
                  data-testid="Search__346dd5" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('fm.m349.search_placeholder')}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'hsl(var(--muted-foreground))', width: '100%' }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))', padding: 0, lineHeight: 1, fontSize: 16 }}>×</button>
                )}
              </div>
            </div>

            {/* Full-width separator above NIF-IVA columns */}
            <div style={{ margin: '4px -20px 0', borderTop: '1px solid hsl(var(--border-subtle))' }} />

            {/* Layout: totals panel + table */}
            {/* ETP-5456 (bug follow-up) — `alignItems: 'flex-start'` so TotalsCard (now
                `position: sticky`, see `.fm-349-totals` in fiscal-models.css) keeps its own short,
                natural height instead of the default `stretch` matching it to the operators
                table's height. A stretched sticky panel already spans the whole scrollable range,
                leaving nothing for `position: sticky` to visibly reposition — same fix 303's
                CasillasTab sidebar needed. See `.fm-349-totals`'s own comment for the full
                root-cause writeup (this used to be papered over by a padding/margin trick that
                does not actually work on a flex item, and caused a separate phantom-scroll bug). */}
            <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
              <TotalsCard
                operators={operators}
                rectifSummary={rectifSummary}
                t={t}
                data-testid="TotalsCard__346dd5" />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fm-table-wrap" style={{ flex: 'none' }}>
                  <table className="fm-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32, paddingLeft: 20 }} onClick={e => e.stopPropagation()}>
                          <CheckboxField
                            checked={allSelected}
                            onToggle={() => setSelected(allSelected ? new Set() : new Set(filteredOps.map(rowKey)))}
                            onClick={e => e.stopPropagation()}
                            data-testid="CheckboxField__346dd5" />
                        </th>
                        <th>{t('fm.m349.col.nif_iva')}</th>
                        <th>{t('fm.m349.col.operator')}</th>
                        <th>{t('fm.m349.col.key')}</th>
                        <th style={{ textAlign: 'right' }}>{t('fm.m349.col.taxable_base')}</th>
                        <th>{t('fm.m349.col.vies')}</th>
                        <th>{t('fm.m349.col.origin')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOps.map(op => (
                        <tr
                          key={rowKey(op)}
                          className={selected.has(rowKey(op)) ? 'fm-table__row--selected' : ''}
                          data-rectificative={isRectificativeOp(op) ? 'true' : undefined}
                        >
                          <td style={{ paddingLeft: 20 }} onClick={e => e.stopPropagation()}>
                            <CheckboxField
                              checked={selected.has(rowKey(op))}
                              onToggle={() => toggleSelect(rowKey(op))}
                              onClick={e => e.stopPropagation()}
                              data-testid="CheckboxField__346dd5" />
                          </td>
                          <td>{op.nif}</td>
                          <td style={{ fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {op.name}
                              {isRectificativeOp(op) && (
                                <RectificativeBadge
                                  t={t}
                                  period={declaredPeriodLabel(op)}
                                  data-testid="RectificativeBadge__346dd5" />
                              )}
                            </span>
                          </td>
                          <td>
                            <KeyCell k={op.key} t={t} badgeTestId="KeyBadge__346dd5" />
                          </td>
                          <td
                            style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                            className={(parseFloat(op.base) || 0) < 0 ? 'fm-349-amount--negative' : undefined}
                          >
                            {formatAmount(op.base)}
                          </td>
                          <td><ViesBadge status={op.vies} data-testid="ViesBadge__346dd5" /></td>
                          <td>
                            {/* ETP-5438 — a snapshot-served declaration keeps the counts but not the
                                invoice rows, so the link would land on the "not kept" note:
                                plain text there, link everywhere else. */}
                            {formatOrigin(op) && snapshotServed && (
                              <span className="fm-origin-text" data-testid="fm-origin-text">{formatOrigin(op)}</span>
                            )}
                            {formatOrigin(op) && !snapshotServed && (
                              <button className="fm-origin-link" onClick={() => goToOrigin(op)}>{formatOrigin(op)}</button>
                            )}
                            {!formatOrigin(op) && <span style={{ color: 'var(--fm-fg-4)' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rectif' && snapshotServed && <InvoiceDetailNotKept t={t} data-testid="InvoiceDetailNotKept__346dd5" />}
        {activeTab === 'rectif' && !snapshotServed && (
          <RectificationsTabContent
            rows={rectifRows}
            t={t}
            originFilter={rectifOriginFilter}
            onClearOriginFilter={() => setOriginFilter(null)}
            data-testid="RectificationsTabContent__346dd5" />
        )}

      </div>
      {/* Shared tab content — same layout as 303 */}
      {activeTab === 'invoices' && snapshotServed && <InvoiceDetailNotKept t={t} data-testid="InvoiceDetailNotKept__346dd5" />}
      <DetailTabContent
        activeTab={detailTabFor(snapshotServed, activeTab)}
        decl={decl}
        liveInvoices={liveInvoices}
        blocking={blocking}
        warning={warning}
        t={t}
        onGoToSources={() => { setOriginFilter(null); setActiveTab('invoices'); }}
        token={token}
        apiBaseUrl={apiBaseUrl}
        status={status}
        originFilter={invoiceOriginFilter}
        onClearOriginFilter={() => setOriginFilter(null)}
        data-testid="DetailTabContent__346dd5" />
      {/* Overlays */}
      {showPresent && (
        <PresentModal
          decl={decl}
          onConfirm={handlePresent}
          onClose={() => setShowPresent(false)}
          data-testid="PresentModal__346dd5" />
      )}
      {showFilegen && (
        <FileGenModal
          // ETP-5456 — contactFallback/phoneFallback are added on top of `decl` here (never
          // persisted with it) so FileGenModal can validate against the live-computed fallback,
          // not just whatever came down on the initial `decl` prop.
          decl={{ ...decl, contactFallback: liveContactFallback, phoneFallback: livePhoneFallback }}
          substitutive={sustitutiva}
          formerStatement={identChecks?.formerStatement ?? ''}
          onConfirm={(payload) => handleGenerate(payload)}
          onClose={() => setShowFilegen(false)}
          data-testid="FileGenModal__346dd5" />
      )}
    </div>
  );
}
