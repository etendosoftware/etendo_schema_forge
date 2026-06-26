import React from 'react';

export function BusinessTypeCard({ icon: Icon, label, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-[1.5rem] border bg-white p-4 text-left shadow-sm transition ${selected ? 'border-slate-900 shadow-[0_14px_30px_rgba(15,23,42,0.10)]' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <span className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-slate-900 text-slate-900' : 'border-slate-300 text-transparent'}`}>
        <span className={`h-3 w-3 rounded-full ${selected ? 'bg-slate-900' : 'bg-transparent'}`} />
      </span>
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        {Icon && <Icon className="h-6 w-6 text-slate-500" data-testid="Icon__79cf84" />}
      </div>
      <p className="text-lg font-medium tracking-[-0.02em] text-slate-900 sm:text-xl">{label}</p>
    </button>
  );
}

export default BusinessTypeCard;
