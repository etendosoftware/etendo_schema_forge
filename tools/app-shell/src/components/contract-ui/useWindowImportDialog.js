import { useCallback, useMemo } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useLabel, useUI } from '@/i18n';
import { simSearch } from '@etendosoftware/app-shell-core/lib/simSearch.js';
import { useBatch } from '../copilot/ocr/ingest/useBatch.js';

/**
 * Accent- and case-insensitive label comparison, matching how `mapColumns.normalizeHeader`
 * compares a CSV header — so two labels this calls equal are also two headers the import
 * treats as the same column.
 */
export function sameLabel(a, b) {
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return norm(a) === norm(b);
}

/**
 * ETP-5190 — everything `ImportDialog` needs, in one place.
 *
 * Extracted from `ListView` because the list view is no longer the only caller: the First
 * Steps checklist runs the SAME import (same descriptor, same batch endpoint, same review
 * queue) inline, and duplicating ~90 lines of label wiring there would have guaranteed the
 * two copies drift — the exact failure ETP-4669 fixed once already, when the dialog rendered
 * hardcoded English because a caller forgot to pass `labels`.
 *
 * Spread the result straight onto `<ImportDialog>`; the caller still owns `open`,
 * `onOpenChange`, `config` and `onImported`.
 *
 * @param {object} params
 * @param {object|null} params.importConfig the window's `window.import` contract block
 * @param {string} params.apiBaseUrl
 * @param {string|null} params.token
 * @param {object} [params.labelOverrides] per-window AD label overrides, as `ListView` passes
 */
export function useWindowImportDialog({ importConfig, apiBaseUrl, token, labelOverrides }) {
  const ui = useUI();
  const t = useLabel(labelOverrides);
  const apiFetch = useApiFetch(apiBaseUrl);
  const { runBatch } = useBatch({ apiBaseUrl, token });
  const entity = importConfig?.entity;

  // ETP-4696/ETP-4997 — `headerScope` appends a localized qualifier naming the tab a column
  // belongs to. A Contacts row is split across THREE records — the business partner, its
  // contact person (AD_User) and its address (C_BPartner_Location + C_Location) — and the AD
  // label for two of those halves is identical ("Correo electrónico" is the label of BOTH
  // EM_Etgo_Email and Email). Without the qualifier the template writes the same header twice,
  // which `parseDelimited` rejects outright — the file could not be uploaded at all. The scope
  // used to be a single "contact" value covering everything off the header entity, which
  // labelled the five address columns "Dirección (Contacto)" — naming the wrong tab. An
  // unknown scope falls back to no qualifier rather than printing a raw key.
  const importHeaderScopeLabels = useMemo(() => ({
    contact: ui('importHeaderScopeContact'),
    address: ui('importHeaderScopeAddress'),
  }), [ui]);

  // ETP-4996 — `fieldLabelFn` writes the downloaded CSV template's headers in the SESSION
  // language. The base comes from the AD label dictionary (`t(column)`, which already applies
  // the window's own `labelOverrides`) — those translations exist and are maintained, so the
  // template should not carry a second copy of them. `labelKey` is the escape hatch for the
  // handful of columns AD cannot serve: `EM_Etgo_Isperson` has no dictionary entry, and
  // address/city/postal/region are C_Location columns the descriptor writes directly, so they
  // are not entity fields and have no AD label at all.
  const fieldLabelFn = useCallback((field) => {
    const base = (field.labelKey ? ui(field.labelKey) : null)
      || (field.column ? t(field.column) : null)
      || field.label || field.target;
    const scope = importHeaderScopeLabels[field.headerScope];
    // The address column's own label IS the scope word, so qualifying it would read
    // "Dirección (Dirección)". Nothing else in the file carries that name, and
    // `resolveTemplateHeaders` still disambiguates if a collision ever appears.
    if (!scope || sameLabel(base, scope)) return base;
    return `${base} (${scope})`;
  }, [t, ui, importHeaderScopeLabels]);

  // Answers "which of these rows already exist?" before the user confirms, so a re-imported
  // file shows its rows as Saltada instead of surfacing them as post-send duplicates. Goes
  // through the same `criteria=` list query the grid itself uses, so it inherits the
  // window's org/client security filtering for free.
  const existingKeyFetchFn = useCallback(async (criteria, keyTargets) => {
    const params = new URLSearchParams();
    params.append('criteria', JSON.stringify(criteria));
    params.append('_startRow', '0');
    params.append('_endRow', '1000');
    const res = await apiFetch(`/${entity}?${params.toString()}`);
    if (!res.ok) throw new Error(`existing-record lookup failed: ${res.status}`);
    const json = await res.json().catch(() => null);
    const data = json?.response?.data ?? json?.data ?? [];
    // Only the key columns are read back; anything else the endpoint returns is ignored.
    return (Array.isArray(data) ? data : []).map((record) => Object.fromEntries(
      keyTargets.map((target) => [target, record[target]]),
    ));
  }, [apiFetch, entity]);

  // ETP-4669: the import flow (ImportDialog + every child) previously rendered its hardcoded
  // English DEFAULT_LABELS regardless of locale, because no `labels` was ever passed. Build
  // the nested `labels` object ImportDialog forwards to each child (shape documented in
  // app-shell-core's ImportDialog.jsx) and pass `translate={ui}` so the send pipeline
  // localizes backend errors too. Templated strings (mappedSummary/{mapped}/{total},
  // tooltips, bulkApply/{count}/{raw}/{value}) keep their {placeholders} — the child fills
  // them at render time; the (n) => string labels interpolate here. `save`/`cancel`/`retry`/
  // `close` reuse existing generic keys per the i18n guide's "reuse before adding" rule.
  const labels = useMemo(() => ({
    title: ui('importDialogTitle'),
    revalidating: ui('importRevalidating'),
    // `downloadTemplate` stays for back-compatibility (ImportDialog falls back to it for CSV
    // when the per-format key is absent); the two per-format captions are what actually render
    // now that a window can offer more than one template.
    downloadTemplate: ui('importDownloadTemplate'),
    downloadTemplateCsv: ui('importDownloadTemplateCsv'),
    downloadTemplateXlsx: ui('importDownloadTemplateXlsx'),
    importButton: (n) => ui('importButtonCount', { n }),
    dropzone: {
      dropHere: ui('importDropHere'),
      // Carries a {formats} placeholder that ImportDropzone fills from the window's own
      // `formats` declaration, so the hint can no longer name formats the input does not accept.
      dropHint: ui('importDropHintFormats'),
    },
    progress: {
      title: ui('importProgressTitle'),
      subtitle: ui('importProgressSubtitle'),
    },
    mapping: {
      notImported: ui('importNotImported'),
      mappedSummary: ui('importMappedSummary'),
      editMatch: ui('importEditMatch'),
      editTitle: ui('importEditColumnTitle'),
      save: ui('save'),
      cancel: ui('cancel'),
    },
    confirm: {
      title: ui('importConfirmTitle'),
      willImport: (n) => ui('importWillImport', { n }),
      willSkip: (n) => ui('importWillSkip', { n }),
      cancel: ui('cancel'),
      confirm: ui('importConfirmButton'),
    },
    fileError: {
      title: ui('importFileErrorTitle'),
      cancel: ui('cancel'),
      retry: ui('retry'),
    },
    reviewQueue: {
      filterAll: ui('importFilterAll'),
      filterOk: ui('importFilterOk'),
      filterError: ui('importFilterError'),
      skip: ui('importSkip'),
      skipped: ui('importSkipped'),
      unskip: ui('importUnskip'),
      downloadErrors: ui('importDownloadErrors'),
      status: ui('importStatus'),
      statusOk: ui('importStatusOk'),
      statusError: ui('importStatusError'),
      fieldErrorsTooltip: ui('importFieldErrorsTooltip'),
      bulkApplyTitle: ui('importBulkApplyTitle'),
      bulkApplyDescription: ui('importBulkApplyDescription'),
      bulkApplyOnlyThis: ui('importBulkApplyOnlyThis'),
      bulkApplyAll: ui('importBulkApplyAll'),
      retry: ui('retry'),
    },
    systemError: {
      title: ui('importSystemErrorTitle'),
      subtitle: ui('importSystemErrorSubtitle'),
      copy: ui('importSystemErrorCopy'),
      copied: ui('importSystemErrorCopied'),
      copyFailed: ui('importSystemErrorCopyFailed'),
      close: ui('close'),
      showReport: ui('importSystemErrorShowReport'),
      hideReport: ui('importSystemErrorHideReport'),
      rowData: ui('importSystemErrorRowData'),
      requestSent: ui('importSystemErrorRequestSent'),
      serverResponse: ui('importSystemErrorServerResponse'),
    },
  }), [ui]);

  return useMemo(() => ({
    token,
    postBatch: runBatch,
    simSearchFn: simSearch,
    labels,
    translate: ui,
    fieldLabelFn,
    existingKeyFetchFn,
  }), [token, runBatch, labels, ui, fieldLabelFn, existingKeyFetchFn]);
}

export default useWindowImportDialog;
