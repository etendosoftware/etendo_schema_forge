import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import RequiredMark from '@/components/ui/required-mark.jsx';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { useFeatureFlag, SII_IMPORT_DUA } from '@/lib/flags';

/**
 * ETP-6284 — "Importación (DUA)" block of the purchase-invoice SII panel (SifTab.jsx), behind the
 * `sii-import-dua` flag. Renders nothing when the flag is off, so the SIF tab stays as it was.
 *
 * Mirrors the Classic display logic of the purchase invoice header (C_Invoice, module SII):
 *   - Multiple DUA (`aeatsiiMultiDua`): org in SII AND invoice type key is F5 or LC.
 *   - DUA (`aeatsiiDua`) and DUA date (`aeatsiiFechaDua`): the same AND Multiple DUA unchecked.
 * "Org in SII" is the caller's `showSii` gate: the block is mounted inside the SII panel only.
 *
 * Read-only: every field follows the lock of the invoice type key it depends on (`readOnly`,
 * SifTab's `siiFieldReadOnly`: sent to SII, processed, or a read-only role). That lock is a
 * superset of Classic's `(estado CO | AE | DocStatus VO) & Processed`, so the fields are locked
 * everywhere Classic locks them, plus on a completed invoice not yet accepted (ETP-5229 policy).
 *
 * Required mark: Classic refuses an F5 ("Importación (DUA)") without DUA and DUA date unless
 * Multiple DUA is checked, so both carry the red `*` in that case.
 *
 * Writes go through `onChange` into DetailView's shared editing state, like every other SIF
 * field; the header save persists them.
 */
const DUA_TYPE_KEYS = new Set(['F5', 'LC']);

function isChecked(value) {
  return value === true || value === 'Y';
}

function DuaField({ label, htmlFor, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-sm text-foreground font-medium"
        data-testid={`Label__siiDua_${htmlFor}`}>
        {label}
        {required && <RequiredMark aria-hidden="true" data-testid={`RequiredMark__sif_${htmlFor}`} />}
      </Label>
      {children}
    </div>
  );
}

export default function SiiImportDuaSection({ ui, siiTypeKey, getVal, getDateVal, onChange, readOnly }) {
  const enabled = useFeatureFlag(SII_IMPORT_DUA) === true;
  if (!enabled || !DUA_TYPE_KEYS.has(siiTypeKey)) return null;

  const multiDua = isChecked(getVal('aeatsiiMultiDua'));
  const duaRequired = siiTypeKey === 'F5' && !multiDua && !readOnly;

  return (
    <>
      <div className="col-span-2 pt-2 mt-1 border-t border-border/40" data-testid="SiiImportDuaSection__title">
        <span className="text-xs font-semibold text-foreground">
          {ui('sifDataTabs.option.importDua')}
        </span>
      </div>
      <DuaField label={ui('sifDataTabs.field.multiDua')} htmlFor="sif-multiDua" data-testid="DuaField__multiDua">
        <div className="h-10 flex items-center">
          <CheckboxField
            id="sif-multiDua"
            checked={multiDua}
            disabled={readOnly}
            onToggle={val => onChange?.('aeatsiiMultiDua', val)}
            data-testid="CheckboxField__siiMultiDua" />
        </div>
      </DuaField>
      {!multiDua && (
        <>
          <DuaField
            label={ui('sifDataTabs.field.dua')}
            htmlFor="sif-dua"
            required={duaRequired}
            data-testid="DuaField__dua">
            <Input
              id="sif-dua"
              type="text"
              maxLength={255}
              value={getVal('aeatsiiDua')}
              onChange={e => onChange?.('aeatsiiDua', e.target.value)}
              disabled={readOnly}
              aria-required={duaRequired || undefined}
              className="bg-card"
              data-testid="Input__siiDua" />
          </DuaField>
          <DuaField
            label={ui('sifDataTabs.field.duaDate')}
            htmlFor="sif-duaDate"
            required={duaRequired}
            data-testid="DuaField__duaDate">
            <DateField
              id="sif-duaDate"
              value={getDateVal('aeatsiiFechaDua')}
              onChange={iso => onChange?.('aeatsiiFechaDua', iso)}
              disabled={readOnly}
              data-testid="DateField__siiDuaDate" />
          </DuaField>
        </>
      )}
    </>
  );
}
