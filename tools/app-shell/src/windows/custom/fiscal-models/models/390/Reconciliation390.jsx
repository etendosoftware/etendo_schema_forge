// Modelo 390 — "cuadre con los 303" banner under the KPI cards, above the tabs (ETP-5716).
//
// Compares the 390 result on screen ([86], or [94] in territory mode) with the result of the year's
// Modelo 303s, `expectedResult` = [95] − [96] − [97] − [98] − [662] computed from the 303s by the
// backend (definition and justification: com.etendoerp.go docs/aeat-390-endpoints.md,
// "GET /fiscal390/preload"). Within RECONCILIATION_TOLERANCE_390 a success banner; beyond it a
// warning one (non-blocking) with the difference. Both carry "Ver detalle por trimestre", which
// opens the year's 303s (Settlements303Table390, block "Resultado de las liquidaciones").
// No 303 of the year: an info banner "Sin Modelos 303 de <año> con los que cuadrar".
// Nothing while the preload loads or the boxes are not computed.
//
// Rendered with the system notice banner (`@/components/InfoBanner.jsx`, the one every GO window
// uses — status-* tokens), never with colours of its own.
import React from 'react';
import { ArrowRight, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { formatAmount } from '../../fiscalModelsUtils.js';
import { RECONCILIATION_TOLERANCE_390, missingPeriodsLabel } from './preload390.js';

/**
 * @param {object}   props.reconciliation `reconcile390()` result
 * @param {object}   [props.preload]      preload payload (missing periods)
 * @param {Function} [props.onViewDetail] "Ver detalle por trimestre"
 */
export default function Reconciliation390({ reconciliation, preload, year, onViewDetail, t }) {
  const status = reconciliation?.status;
  if (status !== 'ok' && status !== 'difference') {
    // Loaded, but the year has no 303 to reconcile with: an info banner, no action.
    // Still loading (no preload yet) or not computed: nothing.
    if (!preload || status !== 'no303') return null;
    return (
      <div className="fm-390-reconcile-row" data-testid="Reconciliation390">
        <InfoBanner tone="info" icon={Info} dismissible={false} data-testid="Reconciliation390__banner">
          <span data-testid="Reconciliation390__no303">{t('fm.m390.reconcile.no303', { year })}</span>
        </InfoBanner>
      </div>
    );
  }
  const ok = status === 'ok';
  const missing = missingPeriodsLabel(preload);
  return (
    <div className="fm-390-reconcile-row" data-testid="Reconciliation390">
      <InfoBanner
        tone={ok ? 'success' : 'warning'}
        icon={ok ? CircleCheck : TriangleAlert}
        dismissible={false}
        role={ok ? undefined : 'status'}
        data-testid="Reconciliation390__banner"
        action={onViewDetail && (
          <button
            type="button"
            className="fm-btn fm-btn--cancel-pill fm-390-reconcile__btn"
            onClick={onViewDetail}
            data-testid="Reconciliation390__viewDetail"
          >
            {t('fm.m390.reconcile.view_detail')}
            <ArrowRight size={14} strokeWidth={1.75} data-testid="ArrowRight__reconciliation390" />
          </button>
        )}
      >
        <strong className="fm-390-notice__lead" data-testid={ok ? 'Reconciliation390__ok' : 'Reconciliation390__difference'}>
          {t(ok ? 'fm.m390.reconcile.ok_title' : 'fm.m390.reconcile.difference_title')}
        </strong>
        <span className="fm-390-notice__line" data-testid="Reconciliation390__sub">
          {ok
            ? t('fm.m390.reconcile.ok_sub')
            : t('fm.m390.reconcile.difference', {
              difference: formatAmount(reconciliation.difference),
              expected: formatAmount(reconciliation.expected),
              tolerance: formatAmount(RECONCILIATION_TOLERANCE_390),
            })}
        </span>
        {missing && (
          <span className="fm-390-notice__line" data-testid="Reconciliation390__missing">
            {t('fm.m390.new_decl.missing_303', { year, periods: missing })}
          </span>
        )}
      </InfoBanner>
    </div>
  );
}
