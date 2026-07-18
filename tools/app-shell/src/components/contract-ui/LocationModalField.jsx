import { useState } from 'react';
import { MapPin, ChevronRight, Pencil } from 'lucide-react';
import { useUI } from '@/i18n';
import { Label } from '@/components/ui/label';
import LocationEditorModal from '../../windows/custom/shared/LocationEditorModal';

/**
 * LocationModalField — renders a single-FK Location/Address field (column C_Location_ID)
 * as a clickable control that opens the shared LocationEditorModal instead of a lookup
 * dropdown of existing records.
 *
 * Behaviour (ETP-4526):
 *   - Empty value  → clicking opens the modal in CREATE mode (blank form).
 *   - Has a value  → clicking opens the modal in EDIT mode (fields pre-loaded by id).
 * The modal persists a plain C_Location immediately (saveMode="location", no Business
 * Partner link, no Shipping/Invoicing checkboxes) and returns { id, name }; on save we
 * set the FK on the parent form via onChange(id, name).
 *
 * Props:
 *   field        — contract field descriptor (needs id, key)
 *   value        — current C_Location_ID (string | '')
 *   displayValue — current identifier text (e.g. "Santa Fe - 446 - 5800 - Rio Cuarto - España")
 *   onChange     — (id, label) => void  (EntityForm's searchOnChange; sets key + $_identifier)
 *   apiBaseUrl   — NEO base for this window (e.g. "/sws/neo/warehouse")
 *   token        — auth token
 *   resolvedLabel, required, selectorContext
 */
export default function LocationModalField({
  field,
  value,
  displayValue,
  onChange,
  apiBaseUrl,
  token,
  resolvedLabel,
  required,
  selectorContext = {},
}) {
  const ui = useUI();
  const [open, setOpen] = useState(false);
  const hasValue = Boolean(value);

  const handleSaved = (id, name) => {
    onChange?.(id, name);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={field.key}
        className="text-sm text-foreground font-medium"
        data-testid="Label__location-modal-field">
        {resolvedLabel}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <button
        type="button"
        id={field.key}
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
        data-testid={'LocationModalField__' + field.id}>
        <MapPin size={15} className="shrink-0 text-muted-foreground" data-testid="MapPin__location-modal-field" />
        <span
          className={
            'flex-1 truncate ' + (hasValue ? 'text-foreground' : 'text-muted-foreground')
          }>
          {hasValue ? displayValue || value : ui('locationFieldPlaceholder')}
        </span>
        {hasValue
          ? <Pencil size={14} className="shrink-0 text-muted-foreground" data-testid="Pencil__location-modal-field" />
          : <ChevronRight size={15} className="shrink-0 text-muted-foreground" data-testid="ChevronRight__location-modal-field" />}
      </button>
      <LocationEditorModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={handleSaved}
        rowId={hasValue ? value : null}
        apiBase={apiBaseUrl}
        token={token}
        saveMode="location"
        showAddressTypeCheckboxes={false}
        selectorContext={selectorContext}
        data-testid={'LocationEditorModal__' + field.id} />
    </div>
  );
}
