const SHELL_STYLE = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '0px',
  width: '100%',
  height: '100%',
  border: '1px solid hsl(var(--border-subtle))',
  borderRadius: '8px',
};

const HEADER_BAR_STYLE = {
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '8px 12px',
  gap: '16px',
  width: '100%',
  height: '48px',
  background: 'hsl(var(--muted))',
  borderBottom: '1px solid hsl(var(--border-subtle))',
};

const TITLE_WRAPPER_STYLE = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '0px',
  gap: '10px',
  width: 'auto',
  height: '16px',
};

const TITLE_TEXT_STYLE = {
  height: '16px',
  fontFamily: 'Inter',
  fontStyle: 'normal',
  fontWeight: 500,
  fontSize: '12px',
  lineHeight: '16px',
  color: 'hsl(var(--foreground))',
  whiteSpace: 'nowrap',
};

export function DashboardCard({ title, headerExtra = null, children, testId }) {
  return (
    <div className="overflow-hidden bg-card" style={SHELL_STYLE} data-testid={testId}>
      <div style={HEADER_BAR_STYLE}>
        <div style={TITLE_WRAPPER_STYLE}>
          <span style={TITLE_TEXT_STYLE}>{title}</span>
        </div>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}
