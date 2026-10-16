// Modelo 390 — "cuadre con los 303" indicator under the Resultado card (ETP-5716).
//
// Compares the 390 result on screen ([86], or [94] in territory mode) with the result of the year's
// Modelo 303s, `expectedResult` = [95] − [96] − [97] − [98] − [662] computed from the 303s by the
// backend (definition and justification: com.etendoerp.go docs/aeat-390-endpoints.md,
// "GET /fiscal390/preload"). OK within RECONCILIATION_TOLERANCE_390; beyond it a non-blocking
// warning with the difference. Also the non-blocking "faltan 303" notice.
import React from 'react';
import { CircleCheck, Loader2, TriangleAlert } from 'lucide-react';
import { formatAmount } from '../../fiscalModelsUtils.js';
import { RECONCILIATION_TOLERANCE_390, missingPeriodsLabel } from './preload390.js';

const LINE = { display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 12, lineHeight: '16px' };

/**
 * @param {object} props.reconciliation `reconcile390()` result
 * @param {object} [props.preload]      preload payload (missing periods)
 * @param {boolean} [props.loading]
 */
export default function Reconciliation390({ reconciliation, preload, loading, year, t }) {
  const missing = missingPeriodsLabel(preload);
  let line = null;
  if (loading && !preload) {
    line = (
      <p style={{ ...LINE, color: 'hsl(var(--muted-foreground))' }} data-testid="Reconciliation390__loading">
        <Loader2 size={13} strokeWidth={1.75} style={{ animation: 'spin 1s linear infinite' }} data-testid="Loader2__reconciliation390" />
        {t('fm.m390.reconcile.loading')}
      </p>
    );
  } else if (reconciliation?.status === 'ok') {
    line = (
      <p style={{ ...LINE, color: 'var(--status-success-fg)' }} data-testid="Reconciliation390__ok">
        <CircleCheck size={13} strokeWidth={1.75} data-testid="CircleCheck__reconciliation390" />
        {t('fm.m390.reconcile.ok', { expected: formatAmount(reconciliation.expected) })}
      </p>
    );
  } else if (reconciliation?.status === 'difference') {
    line = (
      <p style={{ ...LINE, color: 'var(--status-warning-fg)' }} role="status" data-testid="Reconciliation390__difference">
        <TriangleAlert size={13} strokeWidth={1.75} data-testid="TriangleAlert__reconciliation390" />
        {t('fm.m390.reconcile.difference', {
          difference: formatAmount(reconciliation.difference),
          expected: formatAmount(reconciliation.expected),
          tolerance: formatAmount(RECONCILIATION_TOLERANCE_390),
        })}
      </p>
    );
  } else if (preload) {
    line = (
      <p style={{ ...LINE, color: 'hsl(var(--muted-foreground))' }} data-testid="Reconciliation390__no303">
        {t('fm.m390.reconcile.no303', { year })}
      </p>
    );
  }
  if (!line && !missing) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 20px 8px', background: 'hsl(var(--card))', flexShrink: 0 }} data-testid="Reconciliation390">
      {line}
      {missing && (
        <p style={{ ...LINE, color: 'var(--status-warning-fg)' }} role="status" data-testid="Reconciliation390__missing">
          <TriangleAlert size={13} strokeWidth={1.75} data-testid="TriangleAlert__missing390" />
          {t('fm.m390.new_decl.missing_303', { year, periods: missing })}
        </p>
      )}
    </div>
  );
}
