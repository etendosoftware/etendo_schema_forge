import React from 'react';

export function AuthBrand({ label }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/favicon.png"
        alt={label}
        className="h-14 w-14 rounded-2xl border border-white/80 bg-white object-contain p-1 shadow-[0_12px_30px_rgba(250,204,21,0.45)]"
      />
      <span className="text-xl font-semibold tracking-[-0.03em] text-slate-900 sm:text-2xl">
        {label}
      </span>
    </div>
  );
}

export default AuthBrand;
