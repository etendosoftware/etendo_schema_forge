// The result banner of an AEAT answer (success / test / error): icon, title, body and optional
// children (e.g. the AEAT error list). Extracted from AeatSubmitFlow so every modal that shows an
// AEAT result looks the same — the direct presentation and the 390 file validation (ETP-5716).
import React from 'react';

// Other props (e.g. `data-testid`) go to the root element.
export function AeatResultBanner({ tone, icon, title, body, children, ...rest }) {
  const vars = {
    success: ['var(--fm-success-bg)', 'var(--fm-success-border)', 'var(--fm-success-fg)'],
    warning: ['var(--fm-warning-bg)', 'var(--fm-warning-border)', 'var(--fm-warning-fg)'],
    danger:  ['var(--fm-danger-bg)',  'var(--fm-danger-border)',  'var(--fm-danger-fg)'],
    info:    ['var(--fm-info-bg)',    'var(--fm-info-border)',    'var(--fm-info-fg)'],
  }[tone] ?? ['var(--fm-info-bg)', 'var(--fm-info-border)', 'var(--fm-info-fg)'];
  const [bg, border, fg] = vars;
  return (
    <div style={{ padding: '12px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 12, color: fg, display: 'flex', gap: 10 }} {...rest}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {body && <div style={{ fontSize: 13, marginTop: 4, lineHeight: '18px' }}>{body}</div>}
        {children}
      </div>
    </div>
  );
}
