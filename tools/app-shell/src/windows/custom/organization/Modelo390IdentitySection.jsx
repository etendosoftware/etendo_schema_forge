import { useUI } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import RepresentantesLegalesSection from './RepresentantesLegalesSection.jsx';
import { AEAT390_INFO_MAX_LENGTH } from './representanteLegal.js';

// The natural-person identity fields of `AD_OrgInfo` (Classic: Organization > Information,
// "Modelo 390" group), split into the two blocks the AEAT model distinguishes (ETP-5831, CP-16):
// the declarant ("titular") and, optionally, the representative it acts through.
// [field, i18n label key]. Nombre and Primer apellido are required while "Persona física" is on
// (classic CHECK EM_AEAT390_ISPERSON_MAND_CH); the representative pair is both-or-neither
// (EM_AEAT390_REPR_FIS_CH), so neither of its fields is required on its own.
const REQUIRED_PERSON_FIELDS = new Set(['aeat390Firstname', 'aeat390Surname1']);

const HOLDER_FIELDS = [
  ['aeat390Firstname', 'orgRepFirstNameLabel'],
  ['aeat390Surname1', 'orgRepLastname1Label'],
  ['aeat390Surname2', 'orgRepLastname2Label'],
];

const REPRESENTATIVE_FIELDS = [
  ['aeat390RepNif', 'org390RepNifLabel'],
  ['aeat390RepName', 'org390RepNameLabel'],
];

const personInputId = (field) => `org-${field}`;

const INPUT_CLASS = 'bg-card hover:bg-muted focus-visible:bg-card';

/** A titled block of the natural-person branch: heading, explanatory hint(s), field grid. */
function PersonBlock({ titleKey, hintKeys, gridClassName, children, testId }) {
  const ui = useUI();
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <div className="flex flex-col gap-0.5">
        <h4 id={`${testId}-title`} className="text-sm font-semibold text-foreground" data-testid={`${testId}-title`}>
          {ui(titleKey)}
        </h4>
        {hintKeys.map(key => (
          <p key={key} className="text-xs leading-[18px] text-muted-foreground" data-testid={`${testId}-hint-${key}`}>
            {ui(key)}
          </p>
        ))}
      </div>
      <div className={`grid gap-4 ${gridClassName}`} data-testid={`${testId}-grid`}>{children}</div>
    </section>
  );
}

/** One labelled, editable natural-person field; its error shows right below the input. */
function PersonField({ field, labelKey, value, error, onChange }) {
  const ui = useUI();
  return (
    <div className="flex flex-col gap-1.5 min-w-0" data-testid={`Modelo390IdentitySection__field-${field}`}>
      <Label htmlFor={personInputId(field)} className="text-sm text-foreground font-medium" data-testid={`Label__${field}`}>
        {ui(labelKey)}
        {REQUIRED_PERSON_FIELDS.has(field) && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={personInputId(field)}
        value={value ?? ''}
        maxLength={AEAT390_INFO_MAX_LENGTH[field]}
        onChange={e => onChange(field, e.target.value)}
        aria-invalid={Boolean(error)}
        className={INPUT_CLASS + (error ? ' border-destructive' : '')}
        data-testid={`Modelo390IdentitySection__${field}`} />
      {error && (
        <p role="alert" className="text-xs text-destructive" data-testid={`Modelo390IdentitySection__error-${field}`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The declarant's NIF, read-only: it is the organization's own tax id (`information.taxID`, the
 * "Datos fiscales" NIF of the same page form), shown here only so the holder block is complete.
 */
function HolderNifField({ value }) {
  const ui = useUI();
  return (
    <div className="flex flex-col gap-1.5 min-w-0" data-testid="Modelo390IdentitySection__field-holderNif">
      <Label htmlFor="org-aeat390-holder-nif" className="text-sm text-foreground font-medium" data-testid="Label__aeat390HolderNif">
        {ui('orgNifLabel')}
      </Label>
      <Input
        id="org-aeat390-holder-nif"
        value={value ?? ''}
        readOnly
        aria-describedby="org-aeat390-holder-nif-hint"
        className="bg-muted text-muted-foreground cursor-default"
        data-testid="Modelo390IdentitySection__holderNif" />
      <p id="org-aeat390-holder-nif-hint" className="text-xs text-muted-foreground" data-testid="Modelo390IdentitySection__holderNifHint">
        {ui('org390HolderNifHint')}
      </p>
    </div>
  );
}

/**
 * "Representante legal / Modelo 390" (ETP-5716) — replicates how Classic feeds the declarant
 * identity of the Modelo 390:
 *
 * - "Persona física" ON  → the organization IS a natural person (self-employed). Two blocks
 *   (ETP-5831, CP-16): "Datos del titular" (the org NIF, read-only, plus the declarant's own name
 *   and surnames, which the AEAT needs separately) and "Representante (opcional)" (NIF + name, only
 *   if the natural person acts through a representative). All of them are `AD_OrgInfo` fields
 *   (`information.aeat390*`) that belong to the page's form, saved with the page's Save button.
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
          <p className="text-xs leading-[18px] text-muted-foreground" data-testid="Modelo390IdentitySection__isPersonHint">{ui('org390IsPersonHint')}</p>
        </div>
      </div>

      {isPerson ? (
        <div className="flex flex-col gap-4" data-testid="Modelo390IdentitySection__personFields">
          <PersonBlock
            titleKey="org390HolderTitle"
            hintKeys={['org390HolderHint']}
            gridClassName="grid-cols-2"
            testId="Modelo390IdentitySection__holder"
            data-testid="PersonBlock__holder">
            <HolderNifField value={form.taxID} data-testid="HolderNifField__holder" />
            {HOLDER_FIELDS.map(([field, labelKey]) => (
              <PersonField
                key={field}
                field={field}
                labelKey={labelKey}
                value={form[field]}
                error={fieldErrors[field]}
                onChange={onFieldChange}
                data-testid={`PersonField__${field}`} />
            ))}
          </PersonBlock>
          <PersonBlock
            titleKey="org390RepTitle"
            hintKeys={['org390RepHint', 'org390RepPairHint']}
            gridClassName="grid-cols-2"
            testId="Modelo390IdentitySection__representative"
            data-testid="PersonBlock__representative">
            {REPRESENTATIVE_FIELDS.map(([field, labelKey]) => (
              <PersonField
                key={field}
                field={field}
                labelKey={labelKey}
                value={form[field]}
                error={fieldErrors[field]}
                onChange={onFieldChange}
                data-testid={`PersonField__${field}`} />
            ))}
          </PersonBlock>
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
