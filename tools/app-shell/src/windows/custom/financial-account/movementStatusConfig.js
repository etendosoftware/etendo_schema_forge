// Payment status search_keys from Etendo backend reference list (FIN_Payment.Status).
// Keys match the actual backend values — do NOT rename.
//
// Visual model (ETP-4101 update): the movement status is reduced to just two
// user-facing states — "Conciliado" (the payment is cleared against a bank
// statement, backend code RPPC) and "Sin conciliar" (every other code). The
// finer backend distinctions (draft/voided/in-transit/completed) are not shown.

import { MOVEMENT_STATUS_FAMILY } from '@/components/financial-accounts/tokens';

const RECONCILED   = { family: MOVEMENT_STATUS_FAMILY.CLEARED,       labelKey: 'financeAccountMovementsStatusReconciled' };
const UNRECONCILED = { family: MOVEMENT_STATUS_FAMILY.UNRECONCILED, labelKey: 'financeAccountMovementsStatusUnreconciled' };
// Draft = manual transaction created but not yet processed (Borrador). Backend
// codes RPAP (awaiting payment) / RPAE (awaiting execution) — but a reactivated
// transaction keeps RPR/PPM while processed='N', so the UI drives Draft from the
// `processed` flag (see MovementStatusBadge) and uses this config as the label.
export const DRAFT = { family: MOVEMENT_STATUS_FAMILY.DRAFT, labelKey: 'financeAccountMovementsStatusDraft' };

export const MOVEMENT_STATUS_CONFIG = {
  RPAP:   DRAFT,
  RPAE:   DRAFT,
  RPVOID: UNRECONCILED,
  RPR:    UNRECONCILED,
  PPM:    UNRECONCILED,
  PWNC:   UNRECONCILED,
  RDNC:   UNRECONCILED,
  RPPC:   RECONCILED,
};

export const ALL_STATUSES = Object.keys(MOVEMENT_STATUS_CONFIG);
