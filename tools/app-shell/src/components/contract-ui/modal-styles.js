export const MODAL_STYLES = {
  dialog: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '8px 0px',
    gap: '8px',
    width: '1080px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    background: 'hsl(var(--card))',
    boxShadow: '0px 0px 0px 1px hsl(var(--foreground) / 0.1), 0px 24px 48px hsl(var(--foreground) / 0.03), 0px 10px 18px hsl(var(--foreground) / 0.03), 0px 5px 8px hsl(var(--foreground) / 0.04), 0px 2px 4px hsl(var(--foreground) / 0.04)',
    borderRadius: '8px',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },

  header: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 20px 16px',
    gap: '20px',
    width: '100%',
    height: '64px',
    borderBottom: '1px solid hsl(var(--border-subtle))',
    flexShrink: 0,
    alignSelf: 'stretch',
  },

  title: {
    margin: 0,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
    fontSize: '20px',
    lineHeight: '28px',
    color: 'hsl(var(--foreground))',
    flexShrink: 0,
  },

  tabBar: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '0px 20px',
    gap: '10px',
    isolation: 'isolate',
    width: '100%',
    height: '48px',
    borderBottom: '1px solid hsl(var(--border-subtle))',
    flexShrink: 0,
    alignSelf: 'stretch',
  },

  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '20px 20px 24px',
    gap: '20px',
    width: '100%',
    background: 'hsl(var(--foreground) / 0.02)',
    flex: 1,
    overflow: 'auto',
    alignSelf: 'stretch',
    boxSizing: 'border-box',
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '0px',
    gap: '8px',
    height: '72px',
    borderRadius: '0px',
    flex: 1,
    boxSizing: 'border-box',
  },

  footer: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px 12px',
    gap: '10px',
    width: '100%',
    height: '68px',
    flexShrink: 0,
    alignSelf: 'stretch',
    background: 'hsl(var(--card))',
  },

  btnGroup: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '0px',
    gap: '10px',
    height: '40px',
  },

  btnCancel: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px 12px',
    width: '100px',
    height: '40px',
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border-control))',
    boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
    borderRadius: '360px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'hsl(var(--foreground))',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },

  btnSaveDisabled: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px 12px',
    width: '158px',
    height: '40px',
    background: 'hsl(var(--border-control))',
    borderRadius: '360px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    color: 'hsl(var(--card))',
    cursor: 'not-allowed',
    fontFamily: 'Inter, sans-serif',
  },

  fieldLabel: {
    display: 'block',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: '24px',
    color: 'hsl(var(--foreground))',
    padding: 0,
    marginBottom: 0,
  },

  btnSaveEnabled: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '8px 12px',
    width: '158px',
    height: '40px',
    background: 'hsl(var(--foreground))',
    borderRadius: '360px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 500,
    color: 'hsl(var(--card))',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
  },

  // ETP-5398 — the close (X) control. `--muted-foreground` is the ONLY accepted colour:
  // it is the role tuned for WCAG AA. `--icon-secondary` is for decorative icons and
  // `--text-disabled` for disabled text; both render the X too faint to find, which is
  // the ticket's item 3.
  closeBtn: {
    background: 'none',
    border: 'none',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '20px',
    lineHeight: 1,
    color: 'hsl(var(--muted-foreground))',
    cursor: 'pointer',
  },

  // ETP-5398 — the document summary strip: N equal columns, each `label` above `value`.
  // Deliberately NEUTRAL. It carries document data, not a status, so tinting it with the
  // `--status-info-*` family (as the quotation modals did) both miscolours it and leaves
  // the real informational message with no banner to sit in.
  summaryCard: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: '16px',
    width: '100%',
    padding: '12px 16px',
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border-control))',
    borderRadius: '8px',
  },

  // One column. The columns SHARE the strip evenly (`flex: 1`) instead of hugging their
  // content, which is what left every value bunched against the left edge.
  // `minWidth: 0` is what lets the value below actually ellipsize: a flex item defaults
  // to `min-width: auto`, which refuses to shrink under its content.
  summaryCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: '1 1 0',
    minWidth: 0,
  },

  summaryLabel: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '16px',
    color: 'hsl(var(--muted-foreground))',
  },

  // Wraps rather than truncates. The design frame itself shows a long partner name
  // ("Distribuciones Iberia S.A.") running onto a second line and the strip growing to
  // fit, so an ellipsis here would hide data the frame deliberately shows. `anywhere`
  // rather than `break-word` so a single unbroken token (a long document number) still
  // folds instead of pushing the column past its share of the strip.
  summaryValue: {
    fontFamily: 'Inter, sans-serif',
    fontSize: '16px',
    fontWeight: 500,
    lineHeight: '24px',
    color: 'hsl(var(--foreground))',
    overflowWrap: 'anywhere',
  },

  // ETP-5398 — the informational banner. It is an ACCENT surface, not a status message:
  // the design system gives it `color/background/accent/blue` over
  // `color/text/accent/blue-secondary`, which the `--status-info-*` family does NOT match
  // (that one is a different, indigo-leaning blue). Both tokens are declared in this app's
  // own index.css; see the comment there for why they are not in the core.
  // The icon inherits `currentColor`, so it can never drift from the text.
  banner: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    background: 'hsl(var(--accent-blue-bg))',
    borderRadius: '10px',
    fontFamily: 'Inter, sans-serif',
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '20px',
    color: 'hsl(var(--accent-blue-secondary))',
  },
};
