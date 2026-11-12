import { Badge } from '@/components/ui/badge';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { isProductionEnvironment, territoryOfRecords } from './fiscalConfig.utils.js';

/**
 * The fiscal configuration status card: a success band ("{system} activo") over a list of
 * label/value rows — the "Estado" side panel of FiscalConfigPage (ETP-5831), shown whenever the
 * organization already has a fiscal configuration, with rows derived from the stored records
 * (`deriveConfiguredStatus`). `eyebrow` adds the "Estado" label and the environment badge.
 *
 * It started as the wizard's "Configuración aplicada" card; that screen was removed in ETP-5831
 * and this panel replaces it. Colours are the system status tokens, never ad-hoc ones.
 */
export default function FiscalStatusSummary({ title, body, rows, eyebrow = null, className = '', 'data-testid': testId }) {
  return (
    <div className={`rounded-xl border border-border overflow-hidden bg-card ${className}`.trim()} data-testid={testId}>
      <div className="bg-status-success border-b border-status-success-border px-5 py-4">
        {eyebrow && (
          <div className="flex items-center justify-between gap-3 mb-3" data-testid="FiscalStatusSummary__eyebrow">
            <span className="text-[11px] font-bold uppercase tracking-widest text-foreground">{eyebrow.label}</span>
            {eyebrow.badge}
          </div>
        )}
        <div className="flex items-center gap-3.5">
          <span className="w-9 h-9 rounded-full bg-status-success text-status-success-foreground flex items-center justify-center flex-shrink-0 text-xl">✓</span>
          <div>
            <div className="font-bold text-status-success-foreground" data-testid="FiscalStatusSummary__title">{title}</div>
            <div className="text-sm text-status-success-foreground/80 mt-0.5">{body}</div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-border px-5 py-2">
        {rows.filter(Boolean).map(row => (
          <SummaryRow
            key={row.key}
            k={row.label}
            v={row.value}
            testId={`FiscalStatusSummary__row-${row.key}`}
            data-testid="SummaryRow__100d28" />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ k, v, testId }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm" data-testid={testId}>
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}

/** The environment badge of the status panel: "Producción" (success) or "Sandbox · pruebas" (warning). */
export function EnvironmentBadge({ isProduction, ui, 'data-testid': testId = 'FiscalStatusSummary__envBadge' }) {
  const tone = isProduction
    ? 'bg-status-success text-status-success-foreground border-status-success-border'
    : 'bg-status-warning text-status-warning-foreground border-status-warning-border';
  return (
    <Badge variant="outline" className={`rounded-full ${tone}`} data-testid={testId}>
      {isProduction ? ui('fiscal.onboarding.applied.env.production') : ui('fiscal.onboarding.applied.env.sandbox')}
    </Badge>
  );
}

// ── Status of an existing configuration (ETP-5831) ─────────────────────────────

const PROFILE_SYSTEM = {
  sii: 'SII',
  'sii-navarra': 'SII',
  'sii+tbai': 'SII+TBAI',
  tbai: 'TBAI',
  verifactu: 'VERIFACTU',
};

// NEO serves the `Created` audit column as `created` (NeoFieldFilter AUDIT_PROP_TO_API_KEY); the
// DAL name `creationDate` is accepted too, for a caller that hands over a raw DAL record.
const createdOf = (record) => record?.created ?? record?.creationDate ?? null;

/** Earliest creation timestamp of the given records, or null. */
function earliestCreation(records) {
  const times = records
    .map(r => (createdOf(r) ? new Date(createdOf(r)).getTime() : Number.NaN))
    .filter(t => !Number.isNaN(t));
  return times.length ? new Date(Math.min(...times)) : null;
}

/**
 * What the status panel shows for a stored configuration — pure, exported for tests.
 *
 * @param {{ profile: string, siiRecord?: object, tbaiRecord?: object, verifactuRecord?: object,
 *   catalog?: object|null }} input - `catalog` is the backend's `fiscalSystemCatalog` (ETP-6053),
 *   which names the values each territory's records carry; without it the territory is unknown.
 * @returns {null | { system: 'SII'|'TBAI'|'SII+TBAI'|'VERIFACTU', territoryId: string|null,
 *   nationalSii: boolean, isProduction: boolean, activatedAt: Date|null }}
 *   null for a profile without an active configuration (unconfigured, conflict, unknown).
 */
export function deriveConfiguredStatus({ profile, siiRecord = null, tbaiRecord = null, verifactuRecord = null, catalog = null }) {
  const system = PROFILE_SYSTEM[profile];
  if (!system) return null;
  const records = { sii: siiRecord, tbai: tbaiRecord, verifactu: verifactuRecord };
  const used = {
    SII: [siiRecord], TBAI: [tbaiRecord], 'SII+TBAI': [siiRecord, tbaiRecord], VERIFACTU: [verifactuRecord],
  }[system];
  return {
    system,
    territoryId: territoryOfRecords(catalog, records),
    nationalSii: Boolean(siiRecord),
    isProduction: isProductionEnvironment(system, records),
    activatedAt: earliestCreation(used),
  };
}

/**
 * The rows of the status panel for a stored configuration: territory, Hacienda, national SII
 * operation (TicketBAI territories only), certificate and activation date. No link to the
 * submission history (left out on purpose, ETP-5831).
 */
export function buildConfiguredStatusRows({ status, territories, systems, cert, locale, ui }) {
  const terr = status.territoryId ? territories[status.territoryId] : null;
  const sys = systems[status.system];
  const bcp = (locale || 'es_ES').replace('_', '-');
  const certValue = cert?.validTo
    ? ui('fiscal.cert.validUntil', { date: formatCalendarDate(cert.validTo, bcp, { day: '2-digit', month: '2-digit', year: 'numeric' }) })
    : <span className="text-status-warning-foreground">{ui('fiscal.onboarding.cert.pending')}</span>;
  return [
    terr && { key: 'territory', label: ui('fiscal.onboarding.applied.row.territory'), value: terr.name },
    { key: 'tax', label: ui('fiscal.onboarding.applied.row.tax'), value: terr ? terr.systemLong : sys?.long },
    terr?.askNational && {
      key: 'national',
      label: ui('fiscal.onboarding.applied.row.national'),
      value: status.nationalSii ? ui('fiscal.onboarding.applied.national.active') : ui('fiscal.onboarding.applied.national.na'),
    },
    { key: 'cert', label: ui('fiscal.status.row.cert'), value: certValue },
    status.activatedAt && {
      key: 'activated',
      label: ui('fiscal.onboarding.applied.row.activated'),
      value: status.activatedAt.toLocaleString(bcp, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    },
  ].filter(Boolean);
}
