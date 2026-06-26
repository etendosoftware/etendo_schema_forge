import React from 'react';
import { Check } from 'lucide-react';

export function AuthFeaturePill({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/70 px-4 py-2 text-xs font-medium text-slate-600 shadow-sm backdrop-blur sm:text-sm">
      <Check
        className="h-4 w-4 text-slate-500"
        strokeWidth={2.5}
        data-testid="Check__79cf84" />
      {children}
    </span>
  );
}

export default AuthFeaturePill;
