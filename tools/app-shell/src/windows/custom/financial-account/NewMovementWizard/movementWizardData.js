// Movement-specific catalogs for the New Movement wizard (stage 1 dimensions).
// Payment-related data/helpers live in `@/components/payment/paymentData`.
export { eur, parseEur, fmtAmount, parseAmount, todayISO } from '@/components/payment/paymentData';

// Metadata for the accounting dimensions that can appear in the "Dimensiones"
// section. Which ones actually render is decided at runtime by the account's
// header dimensions (the active chart-of-accounts dimensions for FAT, minus the
// ones explicitly hidden) — we never hardcode the list. Option values come from
// real lookups (useDimensionValues); the labelKey/required here drive the field
// chrome (labelKey is resolved via the i18n `ui()` hook in the component). Order
// follows the AD field order (Organization, Business Partner, Project, …).
export const DIM_META = {
  organization: { labelKey: 'financeAccountMovementsDimOrganization', required: true },
  bpartner: { labelKey: 'financeAccountMovementsDimBpartner' },
  project: { labelKey: 'financeAccountMovementsDimProject' },
  costcenter: { labelKey: 'financeAccountMovementsDimCostcenter' },
  activity: { labelKey: 'financeAccountMovementsDimActivity' },
  campaign: { labelKey: 'financeAccountMovementsDimCampaign' },
  salesregion: { labelKey: 'financeAccountMovementsDimSalesregion' },
  user1: { labelKey: 'financeAccountMovementsDimUser1' },
  user2: { labelKey: 'financeAccountMovementsDimUser2' },
};

export const DIM_ORDER = ['organization', 'bpartner', 'project', 'costcenter', 'activity', 'campaign', 'salesregion', 'user1', 'user2'];
