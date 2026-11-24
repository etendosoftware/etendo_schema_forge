/**
 * ETP-6284 — one step card of the purchase-invoice SII panel (design: white bordered rounded card
 * with a small grey step number, a bold title, a muted one-line subtitle and an optional control
 * at the top right). Spans both columns of the panel grid (`Panel` in SifTab.jsx).
 *
 * Presentational only; every string arrives already translated.
 */
export default function SiiPanelCard({ step, title, subtitle, action, children, testId }) {
  return (
    <section
      className="col-span-2 rounded-lg border border-border bg-card p-4 space-y-4"
      data-testid={testId}>
      <header className="flex items-start justify-between gap-3" data-testid={`${testId}__header`}>
        <div className="flex items-baseline gap-2 min-w-0" data-testid={`${testId}__heading`}>
          {step != null && (
            <span
              className="text-xs font-medium text-muted-foreground tabular-nums leading-5"
              data-testid={`${testId}__step`}>
              {step}
            </span>
          )}
          <div className="flex flex-col gap-0.5 min-w-0" data-testid={`${testId}__titles`}>
            <span className="text-sm font-semibold text-foreground leading-5" data-testid={`${testId}__title`}>
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-muted-foreground" data-testid={`${testId}__subtitle`}>{subtitle}</span>
            )}
          </div>
        </div>
        {action && <div className="shrink-0" data-testid={`${testId}__action`}>{action}</div>}
      </header>
      {children}
    </section>
  );
}
