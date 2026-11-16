import { useFeatureFlag, PSD2_STATEMENT_IMPORT_SETTINGS } from '@/lib/flags';

/**
 * ETP-6151 — whether the PSD2 statement import settings behaviour is on for this user (flag
 * `psd2-statement-import-settings`, default off). The single read point of the flag: every surface
 * of the feature (bank connect flow, edit-account import panel, statement delete on a
 * bank-connected account) asks here, so retiring the flag is one grep of this hook's name.
 *
 * @returns {boolean}
 */
export function usePsd2ImportSettingsFlag() {
  return useFeatureFlag(PSD2_STATEMENT_IMPORT_SETTINGS) === true;
}
