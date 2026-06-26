import React from 'react';
import { Input } from '@etendosoftware/app-shell-core/components/ui/input';
import { Label } from '@etendosoftware/app-shell-core/components/ui/label';

export function SetupField({ id, label, required = false, trailingLabel, className = '', ...props }) {
  return (
    <div className={className}>
      <Label
        htmlFor={id}
        className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900"
        data-testid="Label__79cf84">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
        {trailingLabel && <span className="ml-2 font-normal text-slate-500">{trailingLabel}</span>}
      </Label>
      <Input
        id={id}
        className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:border-slate-400 focus-visible:ring-4 focus-visible:ring-slate-900/5"
        {...props}
        data-testid="Input__79cf84" />
    </div>
  );
}

export default SetupField;
