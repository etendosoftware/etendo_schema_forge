import { useEffect, useState } from 'react';
import { useUI } from '@/i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FIELD_HEIGHT } from '@/components/ui/formDensity';
import { InfoTooltipButton } from '@/components/currency-summary/InfoTooltipButton.jsx';

export const SCHEME_CORE = 'CORE';
export const SCHEME_B2B = 'B2B';

const FIELD_LABEL = 'inline-flex items-center gap-1 text-sm leading-6 font-medium text-foreground';

/** The values shown: what the user chose in this session, else what the server holds (default Core, not financed). */
export function advancedOptionValues(info, draft) {
  return {
    scheme: draft.scheme ?? (info?.directDebitScheme === SCHEME_B2B ? SCHEME_B2B : SCHEME_CORE),
    financed: draft.financed ?? info?.financed === true,
  };
}

/**
 * ETP-6247 — the two options of a COLLECTION remittance, rendered as bare grid cells (a fragment) so, through the
 * footer's `inlineInHeaderCard` slot, they flow into the free columns 3 and 4 of the header form's own grid (row
 * Nombre | Fecha | Esquema | Financiada), label above: «Esquema de adeudo» (Core | B2B) and «Remesa financiada». Both are
 * columns of the remittance (`directDebitScheme`, `financed`) written by the header's CRUD: a change is handed to
 * the header form (`onChange(key, value)`) and saved by its «Guardar», like the IBAN, also on create. Editable
 * until the remittance is processed, read-only afterwards: the scheme as the same disabled grey input the other read-only header fields use, «Remesa financiada» as the same switch, disabled. The caller renders it only for a
 * collection type (never for a payment).
 */
export default function RemittanceAdvancedOptions({ info, processed, onChange, onTouched }) {
  const ui = useUI();
  const [draft, setDraft] = useState({});
  // A different value on the server (after a save, or another remittance) replaces what was chosen.
  useEffect(() => { setDraft({}); }, [info?.directDebitScheme, info?.financed]);
  const { scheme, financed } = advancedOptionValues(info, draft);

  const chooseScheme = (value) => {
    setDraft((prev) => ({ ...prev, scheme: value }));
    onTouched?.();
    onChange?.('directDebitScheme', value);
  };
  const chooseFinanced = (value) => {
    setDraft((prev) => ({ ...prev, financed: value }));
    onTouched?.();
    onChange?.('financed', value);
  };

  return (
    <>
      <div className="flex min-w-0 flex-col gap-2" data-testid="remittance-scheme-row">
        <Label htmlFor="remittance-scheme" className={FIELD_LABEL} data-testid="Label__scheme">
          {ui('remittanceDirectDebitScheme')}
          <InfoTooltipButton label={ui('remittanceDirectDebitSchemeInfo')} testId="remittance-scheme-info" contentTestId="remittance-scheme-info-tooltip" data-testid="InfoTooltipButton__scheme" />
        </Label>
        {processed ? (
          <Input
            id="remittance-scheme"
            value={ui(scheme === SCHEME_B2B ? 'remittanceSchemeB2b' : 'remittanceSchemeCore')}
            disabled
            readOnly
            data-testid="remittance-scheme-value" />
        ) : (
          <Select value={scheme} onValueChange={chooseScheme} data-testid="Select__scheme">
            <SelectTrigger id="remittance-scheme" className="bg-card" data-testid="remittance-scheme-trigger">
              <SelectValue data-testid="SelectValue__scheme" />
            </SelectTrigger>
            <SelectContent data-testid="SelectContent__scheme">
              <SelectItem value={SCHEME_CORE} data-testid="remittance-scheme-option-core">{ui('remittanceSchemeCore')}</SelectItem>
              <SelectItem value={SCHEME_B2B} data-testid="remittance-scheme-option-b2b">{ui('remittanceSchemeB2b')}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2" data-testid="remittance-financed-row">
        <Label htmlFor="remittance-financed" className={FIELD_LABEL} data-testid="Label__financed">
          {ui('remittanceFinanced')}
          <InfoTooltipButton label={ui('remittanceFinancedInfo')} testId="remittance-financed-info" contentTestId="remittance-financed-info-tooltip" data-testid="InfoTooltipButton__financed" />
        </Label>
        <div className={`flex ${FIELD_HEIGHT} items-center`}>
          <Switch
            id="remittance-financed"
            checked={financed}
            disabled={processed}
            onCheckedChange={chooseFinanced}
            data-testid="remittance-financed-switch" />
        </div>
      </div>
    </>
  );
}
