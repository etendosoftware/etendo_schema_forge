// Modelo 390 — "cuadre con los 303" banner under the KPI cards, above the tabs (ETP-5716).
//
// Compares the 390 result on screen ([86], or [94] in territory mode) with the result of the year's
// Modelo 303s, `expectedResult` = [95] − [96] − [97] − [98] − [662] computed from the 303s by the
// backend (definition and justification: com.etendoerp.go docs/aeat-390-endpoints.md,
// "GET /fiscal390/preload"). Within RECONCILIATION_TOLERANCE_390 a green "coincide" banner; beyond
// it an amber, non-blocking one with the difference. Both carry "Ver detalle por trimestre", which
// opens the year's 303s (Settlements303Table390, block "Resultado de las liquidaciones").
// Nothing is rendered while there is nothing to reconcile (no 303 of the year, not computed yet).
import React from 'react';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { formatAmount } from '../../fiscalModelsUtils.js';
import { RECONCILIATION_TOLERANCE_390, missingPeriodsLabel } from './preload390.js';

/**
 * @param {object}   props.reconciliation `reconcile390()` result
 * @param {object}   [props.preload]      preload payload (missing periods)
 * @param {Function} [props.onViewDetail] "Ver detalle por trimestre"
 */
export default function Reconciliation390({ reconciliation, preload, year, onViewDetail, t }) {
  const status = reconciliation?.status;
  if (status !== 'ok' && status !== 'difference') return null;
  const ok = status === 'ok';
  const missing = missingPeriodsLabel(preload);
  return (
    <div className="fm-390-reconcile-row">
      <div
        className={`fm-390-reconcile fm-390-reconcile--${ok ? 'ok' : 'warn'}`}
        role={ok ? undefined : 'status'}
        data-testid="Reconciliation390"
      >
        <span className="fm-390-reconcile__icon" aria-hidden="true">
          {ok
            ? <Check size={16} strokeWidth={2.5} data-testid="Check__reconciliation390" />
            : <TriangleAlert size={16} strokeWidth={2} data-testid="TriangleAlert__reconciliation390" />}
        </span>
        <div className="fm-390-reconcile__text" data-testid={ok ? 'Reconciliation390__ok' : 'Reconciliation390__difference'}>
          <div className="fm-390-reconcile__title">
            {t(ok ? 'fm.m390.reconcile.ok_title' : 'fm.m390.reconcile.difference_title')}
          </div>
          <div className="fm-390-reconcile__sub">
            {ok
              ? t('fm.m390.reconcile.ok_sub')
              : t('fm.m390.reconcile.difference', {
                difference: formatAmount(reconciliation.difference),
                expected: formatAmount(reconciliation.expected),
                tolerance: formatAmount(RECONCILIATION_TOLERANCE_390),
              })}
          </div>
          {missing && (
            <div className="fm-390-reconcile__sub" data-testid="Reconciliation390__missing">
              {t('fm.m390.new_decl.missing_303', { year, periods: missing })}
            </div>
          )}
        </div>
        {onViewDetail && (
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
      </div>
    </div>
  );
}
