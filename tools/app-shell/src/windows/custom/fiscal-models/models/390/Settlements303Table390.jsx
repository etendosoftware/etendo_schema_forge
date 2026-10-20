// Modelo 390 — the year's Modelo 303 declarations under "Resultado de las liquidaciones"
// (ETP-5716): period, status, result [71] and what it was (a ingresar / a compensar / a devolver),
// with a link that opens each 303. Data: `GET /fiscal390/preload` (preload390.js). The amounts it
// preloads into block 9 are the period results [69] (the full result of a rectificativa too).
import React from 'react';
import { CircleAlert, ExternalLink, Info, Loader2, TriangleAlert } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { FmStatusChip, formatDeclPeriod } from '../../FmDetailChrome.jsx';
import { formatAmount, formatPercent } from '../../fiscalModelsUtils.js';
import { SETTLEMENT_KIND_KEY_390, missingPeriodsLabel } from './preload390.js';

// Preload warnings shown under the table (MISSING_303 is shown as the shared missing-303 notice).
// Every notice of the block (empty, error, territory, missing 303s, preload warnings) is the
// system notice banner (`@/components/InfoBanner.jsx`); only the intro hint stays muted text.
const WARNING_KEY = Object.freeze({
  DRAFT_303: 'fm.m390.preload.warning.draft',
  PRIOR_CARRY_UNKNOWN: 'fm.m390.preload.warning.prior_carry_unknown',
  REFUND_WITHOUT_MONTHLY_REGISTER: 'fm.m390.preload.warning.refund_without_register',
  COMPUTE_FAILED: 'fm.m390.preload.warning.compute_failed',
  LAST_PERIOD_MISSING: 'fm.m390.preload.warning.last_period_missing',
});

const MUTED = { fontSize: 12, color: 'hsl(var(--muted-foreground))' };

const periodsLabel = (periods) => String(periods ?? '').split(',').filter(Boolean)
  .map(p => (/^\d{2}$/.test(p) ? String(Number(p)) : p)).join(', ');

/**
 * @param {object}   [props.preload]   `GET /fiscal390/preload` payload, `null` while not loaded
 * @param {boolean}  [props.loading]
 * @param {string}   [props.error]     message of a failed request
 * @param {number}   props.year
 * @param {Function} [props.onOpen]    (declarationId) => void — opens the 303
 */
export default function Settlements303Table390({ preload, loading, error, year, onOpen, t, bcpLocale = 'es-ES' }) {
  const rows = Array.isArray(preload?.declarations) ? preload.declarations : [];
  const missing = missingPeriodsLabel(preload);
  const warnings = (preload?.warnings ?? []).filter(w => WARNING_KEY[w.code]);
  return (
    <div style={{ marginTop: 20 }} data-testid="Settlements303Table390">
      <div className="fm-aeat-section__title">{t('fm.m390.preload.table_title', { year })}</div>
      <p className="fm-390-hint">{t('fm.m390.preload.table_hint')}</p>
      {loading && rows.length === 0 && (
        <p className="fm-390-hint" data-testid="Settlements303Table390__loading">
          <Loader2 size={14} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 6 }} data-testid="Loader2__settlements390" />
          {t('fm.m390.preload.loading')}
        </p>
      )}
      {(error || (!loading && rows.length === 0)) && (
        <div className="fm-390-notices">
          {error && (
            <InfoBanner tone="danger" icon={CircleAlert} dismissible={false} role="alert" data-testid="Settlements303Table390__error">
              {t('fm.m390.preload.error', { message: error })}
            </InfoBanner>
          )}
          {!loading && !error && rows.length === 0 && (
            <InfoBanner tone="info" icon={Info} dismissible={false} data-testid="Settlements303Table390__empty">
              {t('fm.m390.preload.empty', { year })}
            </InfoBanner>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="fm-dtable fm-dtable--plain fm-390-mini-table">
            <thead>
              <tr>
                <th>{t('fm.m390.preload.col.period')}</th>
                <th>{t('fm.m390.preload.col.status')}</th>
                <th className="num">{t('fm.m390.preload.col.result')}</th>
                <th>{t('fm.m390.preload.col.kind')}</th>
                <th aria-label={t('fm.m390.preload.open')} />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} data-testid={`Settlements303Table390__row_${r.period}`}>
                  <td>
                    {formatDeclPeriod({ year, period: r.period }, bcpLocale)}
                    {r.superseded > 0 && <span style={MUTED}> · {t('fm.m390.preload.superseded', { count: r.superseded })}</span>}
                  </td>
                  <td>
                    <FmStatusChip status={r.status} t={t} data-testid="FmStatusChip__6104a6" />
                    {r.source === 'live' && <span style={MUTED}> · {t('fm.m390.preload.source_live')}</span>}
                  </td>
                  <td className="num" data-testid={`Settlements303Table390__result_${r.period}`}>
                    {r.source === 'error' ? '—' : formatAmount(Number(r.result))}
                  </td>
                  <td>{r.source === 'error' ? t('fm.m390.preload.kind.error') : t(SETTLEMENT_KIND_KEY_390[r.kind] ?? 'fm.m390.preload.kind.zero')}</td>
                  <td>
                    {onOpen && (
                      <button
                        type="button"
                        className="fm-link-btn"
                        onClick={() => onOpen(r.id)}
                        aria-label={t('fm.m390.preload.open_period', { period: formatDeclPeriod({ year, period: r.period }, bcpLocale) })}
                        data-testid={`Settlements303Table390__open_${r.period}`}
                      >
                        <ExternalLink size={13} strokeWidth={1.75} style={{ verticalAlign: 'middle', marginRight: 4 }} data-testid="ExternalLink__settlements390" />
                        {t('fm.m390.preload.open')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(preload?.territory || missing || warnings.length > 0) && (
        <div className="fm-390-notices">
          {preload?.territory && (
            <InfoBanner tone="info" icon={Info} dismissible={false} data-testid="Settlements303Table390__territory">
              {t('fm.m390.preload.territory_hint', { period: preload.lastPeriod ?? '', common: formatPercent(Number(preload.inputs?.COMMON_TERRITORY ?? 0)) })}
            </InfoBanner>
          )}
          {missing && (
            <InfoBanner tone="warning" icon={TriangleAlert} dismissible={false} role="status" data-testid="Settlements303Table390__missing">
              <strong className="fm-390-notice__lead">{t('fm.m390.new_decl.missing_303_lead', { year, periods: missing })}</strong>
              {' '}
              {t('fm.m390.new_decl.missing_303_body', { year, periods: missing })}
            </InfoBanner>
          )}
          {warnings.map((w, i) => (
            <InfoBanner
              key={`${w.code}-${i}`}
              tone="warning"
              icon={TriangleAlert}
              dismissible={false}
              role="status"
              data-testid={`Settlements303Table390__warning_${w.code}`}
            >
              {t(WARNING_KEY[w.code], { periods: periodsLabel(w.periods) })}
            </InfoBanner>
          ))}
        </div>
      )}
    </div>
  );
}
