// Payment status search_keys from Etendo backend reference list (FIN_Payment.Status).
// Keys match the actual backend values — do NOT rename.
//
// "Deposited" = the payment has been confirmed/processed and therefore has an
// associated FIN_Finacc_Transaction (movement) in its financial account — as
// opposed to RPAP (Awaiting Payment/Execution = Draft, no transaction yet) or
// RPVOID (voided). Shared by the grid (PaymentHeaderTableBase) and the
// Reactivar/Eliminar cartel (PaymentLifecycleConfirmModal) so both agree on
// exactly which statuses imply "there is a movement to revert".
export const DEPOSITED_STATUSES = new Set(['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE']);

export const DEPOSITED_STATUSES_LIST = ['RPR', 'RPPC', 'RDNC', 'PPM', 'PWNC', 'RPAE'];
