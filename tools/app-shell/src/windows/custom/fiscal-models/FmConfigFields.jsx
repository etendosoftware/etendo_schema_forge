// Shared building blocks of the fiscal-models config drawer (ETP-5716: moved verbatim out of
// FmOverlays.jsx so each model's own config section — `models/<id>/ConfigSection<id>.jsx` — can
// use them without importing FmOverlays.jsx back, which would be an import cycle).
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CfgSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'hsl(var(--foreground))', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export function CfgField({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <div style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

export const INPUT_ST = {
  width: '100%', fontSize: 14, padding: '8px 12px',
  border: '1px solid hsl(var(--border-control))', borderRadius: 8, height: 40,
  boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none',
  background: 'hsl(var(--card))',
};

// CfgSelect — the app's shared Select (Radix) for the config modal's option
// pickers. Replaces the former browser-native select elements (ETP-5584: no
// browser-styled selects in this window). Uncontrolled, like the native ones
// were: these options are not persisted yet, so only the initial value matters.
// The content is lifted above `.fm-modal-overlay` (z-index 100) so the list is
// never painted behind the modal that opened it.
export function CfgSelect({ options, defaultValue, ariaLabel, testId }) {
  return (
    <Select defaultValue={defaultValue ?? options[0]?.value} data-testid={`${testId}__select`}>
      <SelectTrigger aria-label={ariaLabel} data-testid={testId}>
        <SelectValue data-testid={`${testId}__value`} />
      </SelectTrigger>
      <SelectContent className="z-[110]" data-testid={`${testId}__content`}>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} data-testid={`${testId}__item`}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
