// Test double for `@/components/ui/select` (Radix) that renders a plain native <select>.
//
// Radix Select opens through pointer events and a portal that jsdom cannot drive, so a test
// that only cares about "the user picked value X" uses this shim instead and keeps doing
// `fireEvent.change(select, { target: { value: 'X' } })`. Usage, from any fiscal-models test:
//
//   vi.mock('@/components/ui/select', () => import('<relative>/__tests__/testUtils/nativeSelectMock.jsx'));
//
// Mapping: <Select value onValueChange disabled> → <select>; <SelectValue placeholder> → an
// empty <option> carrying the placeholder text; <SelectItem value> → <option>. The trigger's
// className, aria-label and data-* attributes are forwarded to the <select> so tests can find
// it the same way they find the real trigger.
import React from 'react';

export function Select({ value, onValueChange, disabled, children }) {
  const triggerProps = {};
  React.Children.forEach(children, (child) => {
    if (child?.type === SelectTrigger) Object.assign(triggerProps, child.props);
  });
  const { children: _ignored, ...forwarded } = triggerProps;
  return (
    <select
      {...forwarded}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  );
}

export function SelectTrigger({ children }) {
  return <>{children}</>;
}

export function SelectValue({ placeholder }) {
  return <option value="">{placeholder}</option>;
}

export function SelectContent({ children }) {
  return <>{children}</>;
}

export function SelectItem({ value, children }) {
  return <option value={value}>{children}</option>;
}

export function SelectGroup({ children }) {
  return <>{children}</>;
}

export function SelectLabel() {
  return null;
}

export function SelectSeparator() {
  return null;
}
