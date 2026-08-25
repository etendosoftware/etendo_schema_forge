import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { EnumSearchSelect } from '@/components/contract-ui/EnumSearchSelect.jsx';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFiscalConfig } from '@/windows/custom/fiscal-config/useFiscalConfig.js';
import { isEtendoTrue } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';
import { fetchById, fetchByCriteria, patchById } from '@/components/related-documents/helpers.js';
import { selectSifFields, pickRegimeChild } from './TaxSifField.jsx';

// The Taxes window's own spec/entity name (kebab-case spec, `tax` entity — see
// artifacts/tax/decisions.json / contract.json). Both fetchById/patchById are
// cross-spec helpers keyed by (specName, entityName), so this modal reaches the
// tax record via the SAME NEO base its caller's own apiBaseUrl already resolves to
// (neoBase() strips the caller's own `/{spec}` segment — see helpers.js).
const TAX_SPEC_NAME = 'tax';
const TAX_ENTITY_NAME = 'tax';

/**
 * TaxSifModal — quick-fix dialog letting the user complete a tax's missing
 * TBAI/Verifactu SIF (Sistemas de Información de Facturación) configuration
 * directly from an invoice line, without leaving to the standalone Impuestos
 * (Taxes) window (ETP-4888 point 5).
 *
 * Reuses `selectSifFields()` (the same pure function `TaxSifField.jsx` uses on
 * the Tax window's own header form) to pick the same 0–2 applicable fields, then
 * renders each one directly with `EnumSearchSelect` — NOT through `EntityForm`
 * like `TaxSifField` does (that component splices bare grid cells into an
 * existing header grid; this modal owns its own vertical layout: a single-line
 * label above a searchable code+description picker, so the label never wraps
 * regardless of which of the 3 fiscal systems' label text is longest — ETP-4888
 * design polish round). SII never reaches this modal in practice:
 * `selectSifFields()` returns `[]` for it, so the row-action trigger that opens
 * this modal (see `useTaxSifLineRowActions.jsx`) never shows for an SII-only tax.
 *
 * **Compound/summary-tax resolution (ETP-4888 follow-up):** an order/invoice line's
 * OWN `tax` field can point at a SUMMARY tax (`c_tax.issummary='Y'`, e.g. "Entregas
 * IVA+RE 21+5.2% ISP") that decomposes into rate-component children via
 * `parent_tax_id`. The régimen key Classic's completion validation actually reads
 * lives on the CHILD tax (the base-rate component, `em_obspti_isequivalentcharge='N'`
 * — see `pickRegimeChild()`'s doc for the verified backend criterion), never on the
 * summary tax itself — so editing the summary's own (always-blank) SIF columns looked
 * like a fix but never satisfied Classic's check. `taxId` therefore names the record
 * the modal was OPENED against (typically the line's own — possibly summary — tax);
 * the effect below resolves the actual EDIT TARGET (`resolvedTaxId`/`editing`/
 * `original`) separately, which may be a different record. The badge shows the
 * RESOLVED record's own name (`resolvedComponent?.name`) whenever resolution picked
 * a child, falling back to the summary's name (`summaryRecord`) otherwise — the user
 * should see the name of the tax they're actually configuring, not the one they
 * clicked from the line, per ETP-4888 review feedback (an earlier version showed
 * the summary's name plus a "kept for reference only" caption; that read as more
 * confusing than just naming the real target). A non-compound tax resolves to
 * itself, unchanged, so the badge is unaffected in that case.
 *
 * @param {object}   props
 * @param {string|null} props.taxId      C_Tax_ID of the record the modal is opened
 *                                       against (the line's own tax — possibly a
 *                                       compound/summary tax, resolved down internally;
 *                                       see the compound-resolution note above). Modal is
 *                                       open whenever this is non-null (controlled by parent).
 * @param {string}   props.apiBaseUrl    The CALLING window's own NEO base (e.g.
 *                                       `/sws/neo/sales-invoice`) — cross-spec helpers
 *                                       derive the shared NEO root from it.
 * @param {Function} props.onClose       () => void — called on cancel/backdrop/save.
 * @param {Function} props.onSaved       (updatedTaxRecord) => void — called after a
 *                                       successful PATCH, so the caller can refresh its
 *                                       local tax-completeness cache without a full reload.
 */
export default function TaxSifModal({ taxId, apiBaseUrl, onClose, onSaved }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile, verifactuRecord } = useFiscalConfig(orgId, apiBaseUrl);

  // `summaryRecord` is ALWAYS the record fetched for `taxId` itself — used only for the
  // context badge (its name), never for reading/writing SIF fields. `original`/`editing`
  // are the resolved EDIT TARGET: the same record when `taxId` is not a compound/summary
  // tax, or the resolved child when it is (see `pickRegimeChild()`). `resolvedTaxId` is
  // the id the Save button actually PATCHes. `resolvedComponent` is non-null only when
  // resolution picked a DIFFERENT record than `taxId` — it drives the clarifying caption
  // so the user isn't left wondering why the fields don't match the summary tax's name.
  const [summaryRecord, setSummaryRecord] = useState(null);
  const [original, setOriginal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [resolvedTaxId, setResolvedTaxId] = useState(null);
  const [resolvedComponent, setResolvedComponent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!taxId) {
      setSummaryRecord(null);
      setOriginal(null);
      setEditing(null);
      setResolvedTaxId(null);
      setResolvedComponent(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // The epic's compound-tax resolution is kept in full; only the `token`
      // argument is gone — ETP-4576 moved the credential into the shared builders,
      // so threading it here offered a value the cookie scheme never holds.
      const record = await fetchById(TAX_SPEC_NAME, TAX_ENTITY_NAME, taxId, apiBaseUrl);
      if (cancelled) return;
      setSummaryRecord(record);

      if (!record || !isEtendoTrue(record.summaryLevel)) {
        // Non-compound (or missing) tax — behaves exactly as before.
        setOriginal(record);
        setEditing(record ? { ...record } : null);
        setResolvedTaxId(taxId);
        setResolvedComponent(null);
        setLoading(false);
        return;
      }

      // Compound/summary tax — resolve down to the ONE rate-component child that
      // actually carries the régimen key (see pickRegimeChild()'s doc).
      const children = await fetchByCriteria(
        TAX_SPEC_NAME, TAX_ENTITY_NAME, 'parentTaxRate', taxId, apiBaseUrl,
      );
      if (cancelled) return;
      const child = pickRegimeChild(children);

      if (child) {
        setOriginal(child);
        setEditing({ ...child });
        setResolvedTaxId(child.id);
        setResolvedComponent(child);
      } else {
        // Unresolved (0 or >1 non-equivalent-charge children) — an unanticipated
        // compound structure. Fall back to editing the summary tax directly (the
        // pre-ETP-4888-followup behavior) rather than guessing wrong.
        // eslint-disable-next-line no-console -- deliberate operator-facing warning,
        // not routine logging: signals this compound tax needs manual attention.
        console.warn(
          `[TaxSifModal] Could not uniquely resolve a rate-component child for compound ` +
            `tax ${taxId} (found ${children.length} non-equivalent-charge candidates, ` +
            `expected exactly 1) — falling back to editing the summary tax directly.`,
        );
        setOriginal(record);
        setEditing({ ...record });
        setResolvedTaxId(taxId);
        setResolvedComponent(null);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [taxId, apiBaseUrl]);

  const selectedFields = useMemo(
    () => (editing ? selectSifFields({ profile, verifactuRecord, data: editing, ui }) : []),
    [profile, verifactuRecord, editing, ui],
  );

  const handleChange = useCallback((key, value) => {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleOpenChange = useCallback((open) => { if (!open) onClose?.(); }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!editing || !original || !resolvedTaxId) return;
    const payload = {};
    for (const field of selectedFields) {
      if (editing[field.key] !== original[field.key]) payload[field.key] = editing[field.key];
    }
    if (Object.keys(payload).length === 0) {
      onClose?.();
      return;
    }
    setSaving(true);
    try {
      // PATCHes `resolvedTaxId` — the resolved rate-component child for a compound tax,
      // or `taxId` itself otherwise (see the resolution effect above). Never the summary
      // tax id when a child was resolved: that is exactly the bug this follow-up fixes.
      await patchById(TAX_SPEC_NAME, TAX_ENTITY_NAME, resolvedTaxId, payload, apiBaseUrl);
      toast.success(ui('taxSif.modal.saveSuccess'));
      // `patchById`'s response uses the tax entity's own camelCase field names (e.g.
      // `tbaiClaveregimeniva`), but the caller's completeness cache (built from the
      // SIF-enriched tax SELECTOR response — see useTaxSifLineRowActions.jsx) is keyed by
      // the raw AD column names (e.g. `EM_Tbai_Claveregimeniva`, matching `field.column`
      // in `selectSifFields()`'s descriptors). Translate via `selectedFields` so the
      // caller's cache update actually lands on the SAME keys `isTaxSifMissing()` reads —
      // merging the raw camelCase response directly would silently leave the stale
      // raw-column value in place and the trigger would keep showing after a successful save.
      // `id: resolvedTaxId` so the caller's `taxById` cache updates the CHILD's own entry
      // (not the summary tax's) — see useTaxSifLineRowActions.jsx's `onSaved` handler.
      const savedByColumn = { id: resolvedTaxId };
      for (const field of selectedFields) {
        savedByColumn[field.column] = editing[field.key];
      }
      onSaved?.(savedByColumn);
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setSaving(false);
    }
  }, [editing, original, selectedFields, resolvedTaxId, apiBaseUrl, onSaved, onClose, ui]);

  // Drives the Save button's disabled state: nothing to persist until at least one
  // selected field's value actually differs from the record as originally loaded.
  const hasChanges = useMemo(
    () => selectedFields.some((field) => editing?.[field.key] !== original?.[field.key]),
    [selectedFields, editing, original],
  );

  return (
    <Dialog open={Boolean(taxId)} onOpenChange={handleOpenChange} data-testid="Dialog__taxsifmodal">
      <DialogContent className="max-w-lg rounded-2xl" data-testid="tax-sif-modal">
        <DialogHeader data-testid="DialogHeader__taxsifmodal">
          <DialogTitle
            className="text-lg font-semibold text-foreground"
            data-testid="DialogTitle__taxsifmodal">
            {ui('taxSif.modal.title')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-sm text-muted-foreground" data-testid="tax-sif-modal-loading">
            {ui('loading')}
          </div>
        ) : (
          <>
            {(resolvedComponent?.name || summaryRecord?.name) && (
              <span
                className="inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                data-testid="tax-sif-modal-tax-badge"
              >
                {resolvedComponent?.name || summaryRecord?.name}
              </span>
            )}

            <div className="space-y-4">
              {selectedFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label
                    htmlFor={`tax-sif-field-${field.key}`}
                    className="block whitespace-nowrap text-sm font-medium text-foreground"
                    data-testid={`tax-sif-modal-label-${field.key}`}
                  >
                    {field.label}
                  </label>
                  <EnumSearchSelect
                    id={`tax-sif-field-${field.key}`}
                    options={field.options}
                    value={editing?.[field.key]}
                    onChange={(value) => handleChange(field.key, value)}
                    placeholder={ui('taxSif.modal.searchPlaceholder')}
                    ui={ui}
                    testId={`tax-sif-modal-field-${field.key}`}
                    data-testid={"EnumSearchSelect__" + field.id} />
                </div>
              ))}
            </div>

            <p className="text-xs italic text-muted-foreground" data-testid="tax-sif-modal-caption">
              {ui('taxSif.modal.caption')}
            </p>
          </>
        )}

        <DialogFooter className="gap-2 pt-2" data-testid="DialogFooter__taxsifmodal">
          <button
            type="button"
            data-testid="tax-sif-modal-cancel"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] bg-card border border-[hsl(var(--border-control))] rounded-full shadow-sm hover:bg-[hsl(var(--muted))] disabled:opacity-50 transition-colors"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            data-testid="tax-sif-modal-save"
            onClick={handleSave}
            disabled={saving || loading || !hasChanges}
            className="px-5 py-2 text-sm font-medium text-primary-foreground bg-[hsl(var(--foreground))] rounded-full hover:bg-[hsl(var(--foreground))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? ui('loading') : ui('save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
