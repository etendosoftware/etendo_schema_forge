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

export const MOVEMENT_STATUS_CONFIG = {
  RPAP:   UNRECONCILED,
  RPAE:   UNRECONCILED,
  RPVOID: UNRECONCILED,
  RPR:    UNRECONCILED,
  PPM:    UNRECONCILED,
  PWNC:   UNRECONCILED,
  RDNC:   UNRECONCILED,
  RPPC:   RECONCILED,
};

export const ALL_STATUSES = Object.keys(MOVEMENT_STATUS_CONFIG);
