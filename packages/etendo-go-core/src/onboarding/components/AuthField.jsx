import React from 'react';
import { Input } from '@etendosoftware/app-shell-core/components/ui/input';
import { Label } from '@etendosoftware/app-shell-core/components/ui/label';

export function AuthField({ id, label, required = false, icon: Icon, trailing, className = '', inputClassName = '', ...props }) {
  return (
    <div className={className}>
      <Label
        htmlFor={id}
        className="mb-2 block text-base font-medium tracking-[-0.02em] text-slate-900"
        data-testid="Label__79cf84">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </Label>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            data-testid="Icon__79cf84" />
        )}
        <Input
          id={id}
          className={`h-12 rounded-2xl border border-slate-300 bg-white text-base text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] placeholder:text-slate-400 focus-visible:border-slate-400 focus-visible:ring-4 focus-visible:ring-slate-900/5 ${Icon ? 'pl-12' : 'pl-4'} ${trailing ? 'pr-14' : 'pr-4'} ${inputClassName}`}
          {...props}
          data-testid="Input__79cf84" />
        {trailing && <div className="absolute inset-y-0 right-3 flex items-center">{trailing}</div>}
      </div>
    </div>
  );
}

export default AuthField;
