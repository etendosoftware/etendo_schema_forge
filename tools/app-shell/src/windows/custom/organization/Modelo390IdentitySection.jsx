import { useUI } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import RepresentantesLegalesSection from './RepresentantesLegalesSection.jsx';
import { AEAT390_INFO_MAX_LENGTH } from './representanteLegal.js';

// The natural-person identity fields of `AD_OrgInfo` (Classic: Organization > Information,
// "Modelo 390" group). Laid out in pairs, like the rest of the page.
const PERSON_FIELD_ROWS = [
  [['aeat390Firstname', 'orgRepFirstNameLabel'], ['aeat390Surname1', 'orgRepLastname1Label']],
  [['aeat390Surname2', 'orgRepLastname2Label'], null],
  [['aeat390RepNif', 'org390RepNifLabel'], ['aeat390RepName', 'org390RepNameLabel']],
];

function PersonField({ field, labelKey, value, error, onChange }) {
  const ui = useUI();
  const inputId = `org-${field}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} className="text-sm text-foreground font-medium" data-testid={`Label__${field}`}>
        {ui(labelKey)}
      </Label>
      <Input
        id={inputId}
        value={value ?? ''}
        maxLength={AEAT390_INFO_MAX_LENGTH[field]}
        onChange={e => onChange(field, e.target.value)}
        aria-invalid={Boolean(error)}
        className={'bg-card hover:bg-muted focus-visible:bg-card' + (error ? ' border-destructive' : '')}
        data-testid={`Modelo390IdentitySection__${field}`} />
      {error && (
        <p role="alert" className="text-xs text-destructive mt-0.5" data-testid={`Modelo390IdentitySection__error-${field}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * "Representante legal / Modelo 390" (ETP-5716) — replicates how Classic feeds the declarant
 * identity of the Modelo 390:
 *
 * - "Persona física" ON  → the organization IS a natural person: its own name/surnames and its
 *   representative's NIF/name live on `AD_OrgInfo` (`information.aeat390*`). Those values belong
 *   to the page's form, so they are saved with the page's Save button like every other field.
 * - "Persona física" OFF → the legal representatives grid (`representanteLegal`), which persists
 *   row by row on its own, like the IAE grid.
 *
 * The toggle itself is also an `information` field (`aeat390Isperson`); the visible branch
 * follows the form value, so flipping it previews the other branch before saving.
 */
export default function Modelo390IdentitySection({ form, fieldErrors = {}, onFieldChange, apiBaseUrl, orgId }) {
  const ui = useUI();
  const isPerson = Boolean(form.aeat390Isperson);

  return (
    <div className="flex flex-col gap-4" data-testid="Modelo390IdentitySection__root">
      <div className="flex items-start gap-3">
        <Switch
          id="org-aeat390-isperson"
          checked={isPerson}
          onCheckedChange={v => onFieldChange('aeat390Isperson', Boolean(v))}
          aria-label={ui('org390IsPersonLabel')}
          data-testid="Modelo390IdentitySection__isPerson" />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="org-aeat390-isperson" className="text-sm text-foreground font-medium" data-testid="Label__aeat390Isperson">
            {ui('org390IsPersonLabel')}
          </Label>
          <p className="text-xs leading-[18px] text-muted-foreground">{ui('org390IsPersonHint')}</p>
        </div>
      </div>

      {isPerson ? (
        <div className="flex flex-col gap-4" data-testid="Modelo390IdentitySection__personFields">
          {PERSON_FIELD_ROWS.map((pair) => (
            <div key={pair[0][0]} className="grid grid-cols-2 gap-4">
              {pair.map((cell) => (cell ? (
                <PersonField
                  key={cell[0]}
                  field={cell[0]}
                  labelKey={cell[1]}
                  value={form[cell[0]]}
                  error={fieldErrors[cell[0]]}
                  onChange={onFieldChange}
                  data-testid={`PersonField__${cell[0]}`} />
              ) : <div key="empty" />))}
            </div>
          ))}
        </div>
      ) : (
        <RepresentantesLegalesSection
          apiBaseUrl={apiBaseUrl}
          orgId={orgId}
          data-testid="RepresentantesLegalesSection__modelo390" />
      )}
    </div>
  );
}
