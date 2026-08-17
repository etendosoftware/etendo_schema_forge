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
import { fetchById, patchById } from '@/components/related-documents/helpers.js';
import { selectSifFields } from './TaxSifField.jsx';

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
 * @param {object}   props
 * @param {string|null} props.taxId      C_Tax_ID of the record to edit. Modal is open
 *                                       whenever this is non-null (controlled by parent).
 * @param {string}   props.apiBaseUrl    The CALLING window's own NEO base (e.g.
 *                                       `/sws/neo/sales-invoice`) — cross-spec helpers
 *                                       derive the shared NEO root from it.
 * @param {string}   props.token         NEO bearer token.
 * @param {Function} props.onClose       () => void — called on cancel/backdrop/save.
 * @param {Function} props.onSaved       (updatedTaxRecord) => void — called after a
 *                                       successful PATCH, so the caller can refresh its
 *                                       local tax-completeness cache without a full reload.
 */
export default function TaxSifModal({ taxId, apiBaseUrl, token, onClose, onSaved }) {
  const ui = useUI();
  const { selectedOrg } = useAuth();
  const orgId = selectedOrg?.id ?? null;
  const { profile, verifactuRecord } = useFiscalConfig(orgId, apiBaseUrl);

  const [original, setOriginal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!taxId) {
      setOriginal(null);
      setEditing(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    fetchById(TAX_SPEC_NAME, TAX_ENTITY_NAME, taxId, token, apiBaseUrl).then((record) => {
      if (cancelled) return;
      setOriginal(record);
      setEditing(record ? { ...record } : null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [taxId, token, apiBaseUrl]);

  const selectedFields = useMemo(
    () => (editing ? selectSifFields({ profile, verifactuRecord, data: editing, ui }) : []),
    [profile, verifactuRecord, editing, ui],
  );

  const handleChange = useCallback((key, value) => {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const handleOpenChange = useCallback((open) => { if (!open) onClose?.(); }, [onClose]);

  const handleSave = useCallback(async () => {
    if (!editing || !original || !taxId) return;
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
      await patchById(TAX_SPEC_NAME, TAX_ENTITY_NAME, taxId, payload, token, apiBaseUrl);
      toast.success(ui('taxSif.modal.saveSuccess'));
      // `patchById`'s response uses the tax entity's own camelCase field names (e.g.
      // `tbaiClaveregimeniva`), but the caller's completeness cache (built from the
      // SIF-enriched tax SELECTOR response — see useTaxSifLineRowActions.jsx) is keyed by
      // the raw AD column names (e.g. `EM_Tbai_Claveregimeniva`, matching `field.column`
      // in `selectSifFields()`'s descriptors). Translate via `selectedFields` so the
      // caller's cache update actually lands on the SAME keys `isTaxSifMissing()` reads —
      // merging the raw camelCase response directly would silently leave the stale
      // raw-column value in place and the trigger would keep showing after a successful save.
      const savedByColumn = { id: taxId };
      for (const field of selectedFields) {
        savedByColumn[field.column] = editing[field.key];
      }
      onSaved?.(savedByColumn);
    } catch (err) {
      toast.error(err?.message || ui('networkError'));
    } finally {
      setSaving(false);
    }
  }, [editing, original, selectedFields, taxId, token, apiBaseUrl, onSaved, onClose, ui]);

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
            {original?.name && (
              <span
                className="inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                data-testid="tax-sif-modal-tax-badge"
              >
                {original.name}
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
                    testId={`tax-sif-modal-field-${field.key}`} />
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
