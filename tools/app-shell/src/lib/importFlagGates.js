import { useMemo } from 'react';
import { useFeatureFlags } from '@/lib/flags/useFeatureFlag.js';

/**
 * Flag-gated import columns (`window.import.fields[].hiddenWhenFlag`, see
 * docs/decisions-reference.md → "Flag-gated import columns").
 *
 * A field that declares `hiddenWhenFlag: "<flag key>"` is dropped from the import config while that
 * feature flag is ON: it disappears from the downloaded template, the column mapping, the review
 * grid and the list export, exactly as if decisions.json did not declare it. With the flag OFF the
 * field is there as usual. This is how a window keeps a column a flagged feature retires (e.g.
 * Contacts' Cliente / Proveedor columns) without two decisions files.
 *
 * Generic: the flag keys come from the contract, never from this file.
 */

/** Distinct flag keys the config's fields are gated by. */
export function importFlagGateKeys(importConfig) {
  const fields = Array.isArray(importConfig?.fields) ? importConfig.fields : [];
  return [...new Set(fields.map(f => f?.hiddenWhenFlag).filter(Boolean))];
}

/**
 * The config without the fields hidden by an enabled flag. Returns the SAME object when nothing is
 * dropped, so callers that memoise on the config identity do not re-run.
 *
 * @param {object|null|undefined} importConfig the window's `window.import` block
 * @param {Record<string, boolean>} flagValues
 */
export function applyImportFlagGates(importConfig, flagValues) {
  if (!importConfig || !Array.isArray(importConfig.fields)) return importConfig;
  const fields = importConfig.fields.filter(f => !(f?.hiddenWhenFlag && flagValues?.[f.hiddenWhenFlag] === true));
  return fields.length === importConfig.fields.length ? importConfig : { ...importConfig, fields };
}

/** React side: `applyImportFlagGates` with the live values of the flags the config names. */
export function useFlagGatedImportConfig(importConfig) {
  const keys = useMemo(() => importFlagGateKeys(importConfig), [importConfig]);
  const flagValues = useFeatureFlags(keys);
  return useMemo(() => applyImportFlagGates(importConfig, flagValues), [importConfig, flagValues]);
}
