import React from 'react';
import { Label } from '@etendosoftware/app-shell-core/components/ui/label';

export function SetupSelect({ id, label, required = false, value, onChange, children, className = '' }) {
  return (
    <div className={className}>
      <Label
        htmlFor={id}
        className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900"
        data-testid="Label__79cf84">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </Label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-4 focus:ring-slate-900/5"
      >
        {children}
      </select>
    </div>
  );
}

export default SetupSelect;
