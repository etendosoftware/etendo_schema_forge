const TITLE_STYLE = {
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: '28px',
  textAlign: 'center',
  color: 'hsl(var(--foreground))',
};

const SUBTITLE_STYLE = {
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '16px',
  textAlign: 'center',
  color: 'hsl(var(--foreground))',
};

const BTN_BASE = {
  padding: '4px 8px',
  height: '32px',
  borderRadius: '8px',
  gap: '4px',
  cursor: 'pointer',
};

const BTN_VARIANTS = {
  secondary: {
    ...BTN_BASE,
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border-control))',
    boxShadow: '0px 1px 2px hsl(var(--foreground) / 0.05)',
    color: 'hsl(var(--foreground))',
    iconColor: 'hsl(var(--text-disabled))',
  },
  primary: {
    ...BTN_BASE,
    background: 'hsl(var(--foreground))',
    border: 'none',
    color: 'hsl(var(--card))',
    iconColor: 'hsl(var(--background) / 0.9)',
  },
};

export function DashboardEmptyState({ title, subtitle, actions = [], width, textPadding }) {
  const hasActions = actions.length > 0;
  const containerStyle = { gap: '12px', ...(width ? { width } : {}) };
  const textBlockStyle = { gap: '4px', ...(textPadding ? { padding: textPadding } : {}) };
  const labelStyle = {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: '24px',
  };

  return (
    <div className="flex-1 flex items-center justify-center w-full">
      <div className="flex flex-col items-center" style={containerStyle}>
        <div className="flex flex-col items-center" style={textBlockStyle}>
          <p style={TITLE_STYLE}>{title}</p>
          <p style={SUBTITLE_STYLE}>{subtitle}</p>
        </div>
        {hasActions && (
          <div className="flex flex-row items-center" style={{ gap: '12px' }}>
            {actions.map((action, i) => {
              const variant = BTN_VARIANTS[action.variant || 'secondary'];
              const Icon = action.icon;
              const { iconColor, color, ...buttonStyle } = variant;
              return (
                <button
                  key={action.key || i}
                  type="button"
                  onClick={action.onClick}
                  className="flex items-center justify-center"
                  style={buttonStyle}
                >
                  {Icon ? <Icon
                    style={{ width: '20px', height: '20px', color: iconColor }}
                    data-testid="Icon__7fdef5" /> : null}
                  <span style={{ ...labelStyle, color }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
