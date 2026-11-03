import { useUI } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import RepresentantesLegalesSection from './RepresentantesLegalesSection.jsx';
import { RepresentativeTableFrame, RepresentativeHeaderCell } from './RepresentativeTableFrame.jsx';
import { AEAT390_INFO_MAX_LENGTH } from './representanteLegal.js';

// The natural-person identity fields of `AD_OrgInfo` (Classic: Organization > Information,
// "Modelo 390" group): [field, i18n label key]. ETP-5831 (CP-16) — rendered as the single row of a
// table with the representatives grid's format (RepresentativeTableFrame), one column per field.
// Required while "Persona física" is on (classic CHECK EM_AEAT390_ISPERSON_MAND_CH).
const REQUIRED_PERSON_FIELDS = new Set(['aeat390Firstname', 'aeat390Surname1']);

const PERSON_FIELDS = [
  ['aeat390Firstname', 'orgRepFirstNameLabel'],
  ['aeat390Surname1', 'orgRepLastname1Label'],
  ['aeat390Surname2', 'orgRepLastname2Label'],
  ['aeat390RepNif', 'org390RepNifLabel'],
  ['aeat390RepName', 'org390RepNameLabel'],
];

const personInputId = (field) => `org-${field}`;

/** Column header of one natural-person field; it labels that field's input in the row below. */
function PersonFieldHeader({ field, labelKey }) {
  const ui = useUI();
  return (
    <RepresentativeHeaderCell data-testid={`RepresentativeHeaderCell__${field}`}>
      <Label htmlFor={personInputId(field)} className="text-xs font-semibold text-foreground" data-testid={`Label__${field}`}>
        {ui(labelKey)}
        {REQUIRED_PERSON_FIELDS.has(field) && <span className="text-destructive"> *</span>}
      </Label>
    </RepresentativeHeaderCell>
  );
}

/** One editable cell of the natural-person row; its error shows inside the cell. */
function PersonFieldCell({ field, value, error, onChange }) {
  return (
    <td className="py-1.5 px-2 align-top">
      <Input
        id={personInputId(field)}
        value={value ?? ''}
        maxLength={AEAT390_INFO_MAX_LENGTH[field]}
        onChange={e => onChange(field, e.target.value)}
        aria-invalid={Boolean(error)}
        className={'h-8 bg-card hover:bg-muted focus-visible:bg-card' + (error ? ' border-destructive' : '')}
        data-testid={`Modelo390IdentitySection__${field}`} />
      {error && (
        <p role="alert" className="text-xs text-destructive mt-1" data-testid={`Modelo390IdentitySection__error-${field}`}>
          {error}
        </p>
      )}
    </td>
  );
}

/**
 * "Representante legal / Modelo 390" (ETP-5716) — replicates how Classic feeds the declarant
 * identity of the Modelo 390:
 *
 * - "Persona física" ON  → the organization IS a natural person: its own name/surnames and its
 *   representative's NIF/name live on `AD_OrgInfo` (`information.aeat390*`). Those values belong
 *   to the page's form, so they are saved with the page's Save button like every other field.
 *   Shown as a single-row table in the representatives grid's format, with no "add" button.
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
        // Exactly one row and no "add" affordance: the organization IS the natural person.
        <div data-testid="Modelo390IdentitySection__personFields">
          <RepresentativeTableFrame
            head={PERSON_FIELDS.map(([field, labelKey]) => (
              <PersonFieldHeader key={field} field={field} labelKey={labelKey} data-testid={`PersonFieldHeader__${field}`} />
            ))}
            data-testid="RepresentativeTableFrame__person390">
            <tr data-testid="Modelo390IdentitySection__personRow">
              {PERSON_FIELDS.map(([field]) => (
                <PersonFieldCell
                  key={field}
                  field={field}
                  value={form[field]}
                  error={fieldErrors[field]}
                  onChange={onFieldChange}
                  data-testid={`PersonFieldCell__${field}`} />
              ))}
            </tr>
          </RepresentativeTableFrame>
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
