// Modelo 390 — "cuadre con los 303" banner under the KPI cards, above the tabs (ETP-5716).
//
// Compares the 390 result on screen ([86], or [94] in territory mode) with the result of the year's
// Modelo 303s, `expectedResult` = [95] − [96] − [97] − [98] − [662] computed from the 303s by the
// backend (definition and justification: com.etendoerp.go docs/aeat-390-endpoints.md,
// "GET /fiscal390/preload"). Within RECONCILIATION_TOLERANCE_390 the shared success banner; beyond
// it the shared warn one (non-blocking) with the difference. Both carry "Ver detalle por trimestre", which
// opens the year's 303s (Settlements303Table390, block "Resultado de las liquidaciones").
// Nothing is rendered while there is nothing to reconcile (no 303 of the year, not computed yet).
import React from 'react';
import { ArrowRight, CircleCheck, TriangleAlert } from 'lucide-react';
import { Banner } from '../../FmCommon.jsx';
import { formatAmount } from '../../fiscalModelsUtils.js';
import { RECONCILIATION_TOLERANCE_390, missingPeriodsLabel } from './preload390.js';

/**
 * Rendered with the shared rich `Banner` of FmCommon.jsx (success when it matches, warn when not).
 *
 * @param {object}   props.reconciliation `reconcile390()` result
 * @param {object}   [props.preload]      preload payload (missing periods)
 * @param {Function} [props.onViewDetail] "Ver detalle por trimestre"
 */
export default function Reconciliation390({ reconciliation, preload, year, onViewDetail, t }) {
  const status = reconciliation?.status;
  if (status !== 'ok' && status !== 'difference') return null;
  const ok = status === 'ok';
  const missing = missingPeriodsLabel(preload);
  const sub = (
    <>
      {ok
        ? t('fm.m390.reconcile.ok_sub')
        : t('fm.m390.reconcile.difference', {
          difference: formatAmount(reconciliation.difference),
          expected: formatAmount(reconciliation.expected),
          tolerance: formatAmount(RECONCILIATION_TOLERANCE_390),
        })}
      {missing && (
        <span className="fm-390-reconcile__missing" data-testid="Reconciliation390__missing">
          {t('fm.m390.new_decl.missing_303', { year, periods: missing })}
        </span>
      )}
    </>
  );
  return (
    <div className="fm-390-reconcile-row" data-testid="Reconciliation390">
      <Banner
        tone={ok ? 'success' : 'warn'}
        icon={ok
          ? <CircleCheck size={16} strokeWidth={1.75} data-testid="CircleCheck__reconciliation390" />
          : <TriangleAlert size={16} strokeWidth={1.75} data-testid="TriangleAlert__reconciliation390" />}
        title={(
          <span data-testid={ok ? 'Reconciliation390__ok' : 'Reconciliation390__difference'}>
            {t(ok ? 'fm.m390.reconcile.ok_title' : 'fm.m390.reconcile.difference_title')}
          </span>
        )}
        sub={sub}
        actions={onViewDetail && (
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
      />
    </div>
  );
}
