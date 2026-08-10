import { Building2, User, Briefcase, Check } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * BusinessTypeCards — selectable cards for AD_Org.EM_Etgo_Business_Type (ETP-4749).
 *
 * Value codes come from the real AD_Ref_List rows created for this column
 * (see engram topic etp4749/organization-settings-exploration): CO=Company,
 * FL=Freelancer, AD=Advisory. Rendered as selection cards per the ticket design
 * ("no editable como dropdown" = a picker widget, not a <select>), matching the
 * reference HTML: icon + name + short description + a check-dot when selected.
 *
 * Selected-state colors use the `--eg-yellow*`/`--eg-ink` CSS custom properties defined
 * in `schema_forge_core/packages/app-shell-core/src/styles.css` (ETP-4749, QA review round 4)
 * — real design tokens, not inline hex literals, per semanticThemeUsage.test.js. They came
 * from the reference HTML's `:root` block; moved to the core package's canonical token file
 * alongside the app's `--status-*` tokens. Requires `LOCAL_CORE=1` (or a published core
 * bump) to resolve — see docs/generated-custom-windows/organization.md ("Token location"):
 *   --eg-yellow:            selected check-dot background
 *   --eg-yellow-soft:       selected card background
 *   --eg-yellow-line:       selected card border
 *   --eg-yellow-dot-border: selected check-dot border
 * Icon/label ink color on selected stays --eg-ink, it does NOT turn yellow.
 */
const OPTIONS = [
  { value: 'CO', labelKey: 'orgBusinessTypeCompany', descKey: 'orgBusinessTypeCompanyDesc', Icon: Building2 },
  { value: 'FL', labelKey: 'orgBusinessTypeFreelancer', descKey: 'orgBusinessTypeFreelancerDesc', Icon: User },
  { value: 'AD', labelKey: 'orgBusinessTypeAdvisory', descKey: 'orgBusinessTypeAdvisoryDesc', Icon: Briefcase },
];

export default function BusinessTypeCards({ value, onChange, readOnly = false }) {
  const ui = useUI();

  return (
    <div className="grid grid-cols-3 gap-2.5 max-w-xl" data-testid="BusinessTypeCards__root">
      {OPTIONS.map(({ value: optValue, labelKey, descKey, Icon }) => {
        const selected = value === optValue;
        return (
          <button
            key={optValue}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(optValue)}
            aria-pressed={selected}
            data-testid={`BusinessTypeCards__option-${optValue}`}
            className={
              'relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors ' +
              (selected
                ? 'border-[var(--eg-yellow-line)] bg-[var(--eg-yellow-soft)]'
                : 'border-border bg-background hover:border-ring') +
              (readOnly ? ' cursor-default opacity-70' : ' cursor-pointer')
            }>
            <Icon
              className={'h-[18px] w-[18px] ' + (selected ? 'text-foreground' : 'text-muted-foreground')}
              data-testid={`BusinessTypeCards__icon-${optValue}`} />
            <span className="text-sm font-medium text-foreground">{ui(labelKey)}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{ui(descKey)}</span>
            <span
              className={
                'absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full border ' +
                (selected ? 'border-[var(--eg-yellow-dot-border)] bg-[var(--eg-yellow)]' : 'border-border bg-background')
              }
              data-testid={`BusinessTypeCards__dot-${optValue}`}>
              {selected && (
                <Check className="h-2.5 w-2.5 text-[var(--eg-ink)]" data-testid={`BusinessTypeCards__check-${optValue}`} />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
