import React from 'react';
import { Label } from '@etendosoftware/app-shell-core/components/ui/label';

export function OnboardingLanguageSelect({ label, locale, onChange, options }) {
  return (
    <div className="min-w-[132px]">
      <Label
        htmlFor="onboarding-language"
        className="mb-2 block text-xs font-medium uppercase tracking-[0.08em] text-slate-500"
        data-testid="Label__79cf84">
        {label}
      </Label>
      <select
        id="onboarding-language"
        aria-label={label}
        value={locale}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-slate-900/5"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

export default OnboardingLanguageSelect;
