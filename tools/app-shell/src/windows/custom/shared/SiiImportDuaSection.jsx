import { TriangleAlert } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import RequiredMark from '@/components/ui/required-mark.jsx';
import SegmentedTabs from '@/components/contract-ui/SegmentedTabs.jsx';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import SiiPanelCard from '@/windows/custom/shared/SiiPanelCard.jsx';
import { useFeatureFlag, SII_IMPORT_DUA } from '@/lib/flags';

/**
 * ETP-6284 — "Importación (DUA)" card of the purchase-invoice SII panel (SifTab.jsx), behind the
 * `sii-import-dua` flag. Renders nothing when the flag is off, so the SIF tab stays as it was.
 *
 * Mirrors the Classic display logic of the purchase invoice header (C_Invoice, module SII):
 *   - Multiple DUA (`aeatsiiMultiDua`): org in SII AND invoice type key is F5 or LC. Shown as the
 *     "Un DUA | Varios DUA" segmented control at the top right of the card (same field).
 *   - DUA (`aeatsiiDua`) and DUA date (`aeatsiiFechaDua`): the same AND Multiple DUA unchecked
 *     ("Un DUA"). With "Varios DUA" they move to each import tax line (SiiImportTaxesSection).
 * "Org in SII" is the caller's `showSii` gate: the card is mounted inside the SII panel only.
 *
 * Read-only: every control follows the lock of the invoice type key it depends on (`readOnly`,
 * SifTab's `siiFieldReadOnly`: sent to SII, processed, or a read-only role) — a superset of
 * Classic's `(estado CO | AE | DocStatus VO) & Processed`.
 *
 * Required: Classic (`FacturasEventHandler.checkDUAFields`) refuses an F5 or an LC without DUA
 * and DUA date unless Multiple DUA is checked, so both carry the red `*` (and the error outline
 * while empty) in that case.
 *
 * MRN format: an MRN has 18 characters. The counter and the warning are a hint only — the SII
 * module checks the DUA format for IGIC organizations only, so for IVA it must never block a save.
 *
 * Writes go through `onChange` into DetailView's shared editing state, like every other SIF
 * field; the header save persists them.
 */
const DUA_TYPE_KEYS = new Set(['F5', 'LC']);
export const MRN_LENGTH = 18;
const ERROR_OUTLINE = 'border-destructive focus-visible:ring-destructive focus-within:ring-destructive';

function isChecked(value) {
  return value === true || value === 'Y';
}

/** True when a non-empty DUA does not have the 18 characters of an MRN (hint only, never blocks). */
export function isMrnLengthOff(value) {
  const length = String(value ?? '').trim().length;
  return length > 0 && length !== MRN_LENGTH;
}

function DuaField({ label, htmlFor, required, aside, helper, children }) {
  return (
    <div className="space-y-1 min-w-0" data-testid={`DuaField__${htmlFor}`}>
      <div className="flex items-baseline justify-between gap-2" data-testid={`DuaField__${htmlFor}_labelRow`}>
        <Label
          htmlFor={htmlFor}
          className="text-sm text-foreground font-medium"
          data-testid={`Label__siiDua_${htmlFor}`}>
          {label}
          {required && <RequiredMark aria-hidden="true" data-testid={`RequiredMark__sif_${htmlFor}`} />}
        </Label>
        {aside}
      </div>
      {children}
      {helper && <p className="text-xs text-muted-foreground" data-testid={`DuaField__${htmlFor}_helper`}>{helper}</p>}
    </div>
  );
}

export default function SiiImportDuaSection({ ui, siiTypeKey, getVal, getDateVal, onChange, readOnly, step }) {
  const enabled = useFeatureFlag(SII_IMPORT_DUA) === true;
  if (!enabled || !DUA_TYPE_KEYS.has(siiTypeKey)) return null;

  const multiDua = isChecked(getVal('aeatsiiMultiDua'));
  const duaRequired = !multiDua && !readOnly;
  const dua = String(getVal('aeatsiiDua') ?? '');
  const duaDate = getDateVal('aeatsiiFechaDua');
  const duaMissing = duaRequired && !dua.trim();
  const dateMissing = duaRequired && !duaDate;

  const modeControl = (
    <fieldset disabled={readOnly} className={readOnly ? 'opacity-60' : undefined} data-testid="SiiImportDuaSection__mode">
      <SegmentedTabs
        items={[
          { key: 'single', label: ui('sifDataTabs.dua.single'), testId: 'SegmentedTabs__siiDuaSingle' },
          { key: 'multiple', label: ui('sifDataTabs.dua.multiple'), testId: 'SegmentedTabs__siiDuaMultiple' },
        ]}
        active={multiDua ? 1 : 0}
        onChange={index => onChange?.('aeatsiiMultiDua', index === 1)}
        ariaLabel={ui('sifDataTabs.field.multiDua')}
        data-testid="SegmentedTabs__siiDuaMode" />
    </fieldset>
  );

  return (
    <SiiPanelCard
      step={step}
      title={ui('sifDataTabs.option.importDua')}
      subtitle={ui('sifDataTabs.dua.subtitle')}
      action={modeControl}
      testId="SiiImportDuaSection__card"
      data-testid="SiiPanelCard__siiImportDua">
      {!multiDua && (
        <div className="grid grid-cols-2 gap-3" data-testid="SiiImportDuaSection__fields">
          <DuaField
            label={ui('sifDataTabs.field.dua')}
            htmlFor="sif-dua"
            required={duaRequired}
            aside={(
              <span
                className={`text-xs tabular-nums ${isMrnLengthOff(dua) ? 'text-status-warning-foreground' : 'text-muted-foreground'}`}
                data-testid="SiiImportDuaSection__mrnCounter">
                {`${dua.trim().length} / ${MRN_LENGTH}`}
              </span>
            )}
            data-testid="DuaField__dua">
            <Input
              id="sif-dua"
              type="text"
              maxLength={255}
              value={dua}
              onChange={e => onChange?.('aeatsiiDua', e.target.value)}
              disabled={readOnly}
              aria-required={duaRequired || undefined}
              aria-invalid={duaMissing || undefined}
              className={`bg-card ${duaMissing ? ERROR_OUTLINE : ''}`}
              data-testid="Input__siiDua" />
          </DuaField>
          <DuaField
            label={ui('sifDataTabs.field.duaDate')}
            htmlFor="sif-duaDate"
            required={duaRequired}
            helper={ui('sifDataTabs.dua.dateHelper')}
            data-testid="DuaField__duaDate">
            <DateField
              id="sif-duaDate"
              value={duaDate}
              onChange={iso => onChange?.('aeatsiiFechaDua', iso)}
              disabled={readOnly}
              className={dateMissing ? ERROR_OUTLINE : undefined}
              data-testid="DateField__siiDuaDate" />
          </DuaField>
          {isMrnLengthOff(dua) && (
            <InfoBanner
              tone="warning"
              icon={TriangleAlert}
              dismissible={false}
              className="col-span-2"
              data-testid="SiiImportDuaSection__mrnHint">
              {ui('sifDataTabs.dua.mrnHint')}
            </InfoBanner>
          )}
        </div>
      )}
    </SiiPanelCard>
  );
}
