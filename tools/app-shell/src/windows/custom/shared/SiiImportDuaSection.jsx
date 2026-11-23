import { WarningIcon } from '@phosphor-icons/react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import RequiredMark from '@/components/ui/required-mark.jsx';
import { Switch } from '@/components/ui/switch';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { parseCalendarDate } from '@/lib/dateOnly.js';
import SiiPanelCard from '@/windows/custom/shared/SiiPanelCard.jsx';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
import { SII_IMPORT_DUA_CAPABILITY, isCapabilityVisible } from '@/lib/capabilityVisibility.js';

/**
 * ETP-6284 — "Importación (DUA)" card of the purchase-invoice SII panel (SifTab.jsx), behind the
 * `siiImportDua` capability (backend flag `sii-import-dua`, see `useSiiImportDuaEnabled`).
 * Renders nothing while it is off or unknown, so the SIF tab stays as it was.
 *
 * Mirrors the Classic display logic of the purchase invoice header (C_Invoice, module SII):
 *   - Multiple DUA (`aeatsiiMultiDua`): org in SII AND invoice type key is F5 or LC. Shown as the
 *     "Múltiple DUA" switch at the top right of the card (Classic label, same field).
 *   - DUA (`aeatsiiDua`) and DUA date (`aeatsiiFechaDua`): the same AND Multiple DUA unchecked
 *     (switch off). With Multiple DUA on they move to each import tax line (SiiImportTaxesSection).
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
 * LC (customs complementary liquidation): the field holds the liquidation number, not a DUA —
 * no 18-character counter; a non-blocking warning when it does not start with the accepted
 * prefixes (IVA: LC, A01, A02 — AEAT error 1271; IGIC: CLC, 599), see `isLcNumberPrefixOff`.
 *
 * DUA format: a DUA has 18 characters. The counter and the warning are a hint only — the SII
 * module checks the DUA format for IGIC organizations only, so for IVA it must never block a save.
 *
 * DUA date vs accounting register date: a non-blocking warning when the DUA date is later than
 * Fecha registro contable (`aeatsiiFechaRegCont`). Classic checks it only at send time
 * (`SIIUtils.invoicePreviousValidations`), and the automatic background send skips the invoice
 * without a message, so the user is told here. With Multiple DUA the same warning is shown by the
 * import-taxes card over its rows' dates (`isDuaDateAfterAccountingDate`).
 *
 * Writes go through `onChange` into DetailView's shared editing state, like every other SIF
 * field; the header save persists them.
 */
const DUA_TYPE_KEYS = new Set(['F5', 'LC']);
export const DUA_LENGTH = 18;
const ERROR_OUTLINE = 'border-destructive focus-visible:ring-destructive focus-within:ring-destructive';

function isChecked(value) {
  return value === true || value === 'Y';
}

// Prefixes of a customs complementary-liquidation number (Tipo factura LC). AEAT SII for IVA
// rejects others with error 1271; Classic's IGIC validation
// (SII2025ReceivedInvoicesValidations.evaluateDocNoForF5OrLCInvoices) requires CLC or 599.
export const LC_PREFIXES = Object.freeze({ IVA: ['LC', 'A01', 'A02'], IGIC: ['CLC', '599'] });

/**
 * True when a non-empty LC number does not start with an accepted prefix (hint only, never
 * blocks). With an unknown tax type, either set is accepted.
 *
 * @param {string} value the DUA field value
 * @param {'IVA'|'IGIC'|null} taxType the organization's SII tax type
 */
export function isLcNumberPrefixOff(value, taxType) {
  const v = String(value ?? '').trim().toUpperCase();
  if (!v) return false;
  const prefixes = LC_PREFIXES[taxType] ?? [...LC_PREFIXES.IVA, ...LC_PREFIXES.IGIC];
  return !prefixes.some(prefix => v.startsWith(prefix));
}

/** i18n key of the LC prefix hint for the organization's tax type. */
export function lcHintKey(taxType) {
  if (taxType === 'IGIC') return 'sifDataTabs.dua.lcHintIgic';
  if (taxType === 'IVA') return 'sifDataTabs.dua.lcHintIva';
  return 'sifDataTabs.dua.lcHintAny';
}

/**
 * True when both dates are set and the DUA date is a later calendar day than the accounting
 * register date (hint only, never blocks). Compared as calendar dates, never as instants.
 */
export function isDuaDateAfterAccountingDate(duaDate, accountingRegisterDate) {
  const dua = parseCalendarDate(duaDate);
  const reg = parseCalendarDate(accountingRegisterDate);
  return Boolean(dua && reg) && dua.getTime() > reg.getTime();
}

/** True when a non-empty DUA does not have its 18 characters (hint only, never blocks). */
export function isDuaLengthOff(value) {
  const length = String(value ?? '').trim().length;
  return length > 0 && length !== DUA_LENGTH;
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

/**
 * Whether imports with DUA are on for this user: `capabilities.siiImportDua` off
 * `SFWindowAccessMap`, which mirrors the backend-only `sii-import-dua` flag. Fails closed (an
 * unloaded map or no AuthProvider reads off). The one reader of the capability on the SPA side.
 */
export function useSiiImportDuaEnabled() {
  return isCapabilityVisible(useCapabilitiesSafe(), SII_IMPORT_DUA_CAPABILITY);
}

export default function SiiImportDuaSection({
  ui, siiTypeKey, getVal, getDateVal, onChange, readOnly, step, siiTaxType = null,
}) {
  const enabled = useSiiImportDuaEnabled();
  if (!enabled || !DUA_TYPE_KEYS.has(siiTypeKey)) return null;

  const multiDua = isChecked(getVal('aeatsiiMultiDua'));
  const duaRequired = !multiDua && !readOnly;
  const dua = String(getVal('aeatsiiDua') ?? '');
  const duaDate = getDateVal('aeatsiiFechaDua');
  const duaMissing = duaRequired && !dua.trim();
  const dateMissing = duaRequired && !duaDate;
  // LC: the field holds the customs complementary-liquidation number, not an 18-char DUA.
  const isLc = siiTypeKey === 'LC';
  const showLengthHint = !isLc && isDuaLengthOff(dua);
  const showLcHint = isLc && isLcNumberPrefixOff(dua, siiTaxType);
  const showDateHint = isDuaDateAfterAccountingDate(duaDate, getDateVal('aeatsiiFechaRegCont'));

  const modeControl = (
    <div className="flex items-center gap-2" data-testid="SiiImportDuaSection__mode">
      <Switch
        id="sif-multiDua"
        checked={multiDua}
        onCheckedChange={val => onChange?.('aeatsiiMultiDua', val)}
        disabled={readOnly}
        data-testid="Switch__siiMultiDua" />
      <Label htmlFor="sif-multiDua" className="text-sm text-foreground font-medium" data-testid="Label__siiMultiDua">
        {ui('sifDataTabs.field.multiDua')}
      </Label>
    </div>
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
            aside={isLc ? null : (
              <span
                className={`text-xs tabular-nums ${showLengthHint ? 'text-status-warning-foreground' : 'text-muted-foreground'}`}
                data-testid="SiiImportDuaSection__duaCounter">
                {`${dua.trim().length} / ${DUA_LENGTH}`}
              </span>
            )}
            helper={isLc ? ui('sifDataTabs.dua.lcHelper') : undefined}
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
          {showLengthHint && (
            <InfoBanner
              tone="warning"
              icon={WarningIcon}
              dismissible={false}
              className="col-span-2"
              data-testid="SiiImportDuaSection__duaHint">
              {ui('sifDataTabs.dua.lengthHint')}
            </InfoBanner>
          )}
          {showLcHint && (
            <InfoBanner
              tone="warning"
              icon={WarningIcon}
              dismissible={false}
              className="col-span-2"
              data-testid="SiiImportDuaSection__lcHint">
              {ui(lcHintKey(siiTaxType))}
            </InfoBanner>
          )}
          {showDateHint && (
            <InfoBanner
              tone="warning"
              icon={WarningIcon}
              dismissible={false}
              className="col-span-2"
              data-testid="SiiImportDuaSection__dateHint">
              {ui('sifDataTabs.dua.dateAfterAccountingDate')}
            </InfoBanner>
          )}
        </div>
      )}
    </SiiPanelCard>
  );
}
