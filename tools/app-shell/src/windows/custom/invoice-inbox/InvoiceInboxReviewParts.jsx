import { AlertCircle, AlertTriangle, Calendar, CheckCircle2, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusTag } from '@/components/ui/status-tag';

/**
 * ETP-6050 — small building blocks shared by the review panel's sections: the section title, the
 * labelled field, tags, the field error line, a banner, the "AI proposes" chip and the full-row
 * option button with its custom radio. Kept here so each section file stays about its own states.
 * Typography is the system's (no font family is set anywhere in the panel).
 */

/** Section title: small, uppercase, letter-spaced, bold. */
export const SECTION_TITLE_CLASS = 'text-[11px] font-bold uppercase leading-none tracking-[0.08em] text-foreground';

export function SectionTitle({ children, testId, aside = null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className={SECTION_TITLE_CLASS} data-testid={testId}>{children}</h3>
      {aside}
    </div>
  );
}

/** A tone-coloured tag; `StatusTag` takes no test id of its own, so it is wrapped. */
export function ReviewTag({ tone = 'neutral', label, testId, icon: Icon = null }) {
  return (
    <span className="inline-flex flex-none items-center" data-testid={testId}>
      <StatusTag
        tone={tone}
        label={Icon ? (<span className="inline-flex items-center gap-1"><Icon className="h-3 w-3" aria-hidden="true" data-testid="Icon__review-tag" />{label}</span>) : label}
        data-testid="StatusTag__review-tag" />
    </span>
  );
}

/** The "Etendo AI proposes" chip: sparkles icon on the info (lavender) tone. */
export function AiChip({ label, testId }) {
  return <ReviewTag tone="info" label={label} testId={testId} icon={Sparkles} data-testid="ReviewTag__ai-chip" />;
}

/** The red line under a field or a section that blocks confirmation. */
export function FieldError({ children, testId }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs leading-snug text-destructive [overflow-wrap:anywhere]" role="alert" data-testid={testId}>
      {children}
    </p>
  );
}

/**
 * A labelled field. Read only it shows the value in a read-only (or disabled) input; `invalid`
 * paints the red border and `aria-invalid`; `required` marks the label with the asterisk;
 * `icon` draws an icon inside the input at the right (the date field's calendar). `tag` sits at
 * the right of the label (the "Revisar" tag). A later `readOnly={false}` turns the same input
 * into an editable one (the caller then supplies `onChange`).
 */
export function ReviewField({
  label, value, readOnly = true, disabled = false, required = false, invalid = false, tag = null,
  error = null, placeholder, onChange, testId, className = '', icon: Icon = null,
}) {
  return (
    <div className={className} data-testid={`${testId}-field`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label htmlFor={testId} className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
        </Label>
        {tag}
      </div>
      <div className="relative">
        <Input
          id={testId}
          value={value ?? ''}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          onChange={onChange}
          aria-invalid={invalid || undefined}
          className={`${Icon ? 'pr-9 ' : ''}${invalid ? 'border-destructive bg-[var(--status-destructive-bg)]' : ''}`}
          data-testid={testId} />
        {Icon && (
          <Icon
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
            data-testid={`${testId}-icon`} />
        )}
      </div>
      <FieldError testId={`${testId}-error`}>{error}</FieldError>
    </div>
  );
}

/** The calendar icon of the date field, exported so the form does not import lucide twice. */
export const DATE_FIELD_ICON = Calendar;

const BANNER_TONES = {
  warning: { box: 'border-status-warning-border/40 bg-status-warning/15 text-status-warning-foreground', Icon: AlertTriangle },
  destructive: { box: 'border-destructive/30 bg-[var(--status-destructive-bg)] text-destructive', Icon: AlertCircle },
  success: { box: 'border-status-success-border/40 bg-status-success/15 text-status-success-foreground', Icon: CheckCircle2 },
};

/** A banner: a title, an optional body. */
export function ReviewBanner({ tone = 'warning', title, children = null, testId }) {
  const { box, Icon } = BANNER_TONES[tone] ?? BANNER_TONES.warning;
  return (
    <div
      className={`flex gap-2.5 rounded-xl border p-3 text-sm ${box}`}
      role={tone === 'destructive' ? 'alert' : 'status'}
      data-testid={testId}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" data-testid="Icon__review-banner" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p className="font-semibold" data-testid={`${testId}-title`}>{title}</p>
        {children && <div className="mt-0.5 min-w-0 text-xs [overflow-wrap:anywhere]" data-testid={`${testId}-body`}>{children}</div>}
      </div>
    </div>
  );
}

/** 18px (16px in a panel) round radio drawn by hand: selected = a thick primary ring. */
function RadioDot({ on, size }) {
  return (
    <span
      aria-hidden="true"
      className={`flex-none rounded-full box-border ${on ? 'border-[5px] border-primary' : 'border-[1.5px] border-border-control'}`}
      style={{ width: size, height: size }} />
  );
}

/**
 * A candidate as a full-row button with a custom radio (`role="radio"`): padding 10/12, radius
 * 10, border; selected = primary border + a 3px ring. Disabled while `readOnly` (S1: the choice
 * is S3). `compact` is the smaller variant of the product panel.
 */
export function OptionRow({
  value, checked = false, readOnly = true, onSelect, testId, badge = null, compact = false, children,
}) {
  const pad = compact ? 'px-2.5 py-2 rounded-lg' : 'px-3 py-2.5 rounded-[10px]';
  const state = checked ? 'border-primary ring-[3px] ring-primary/20' : 'border-border';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={readOnly}
      onClick={() => onSelect?.(value)}
      className={`flex w-full items-center gap-3 border bg-card text-left ${pad} ${state} ${readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-muted/50'}`}
      data-testid={testId}>
      <RadioDot on={checked} size={compact ? 16 : 18} data-testid="RadioDot__review" />
      <span className="min-w-0 flex-1">{children}</span>
      {badge}
    </button>
  );
}
