/* eslint-disable react/prop-types */

export function isCheckedYN(v) {
  return v === true || v === 'Y' || v === 'true';
}

export default function CheckboxGroup({ label, items, data, readOnly, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[#121217]">{label}</p>
      <div className="flex items-center gap-5 h-10">
        {items.map(item => {
          const checked = isCheckedYN(data?.[item.key]);
          return (
            <label key={item.key} className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={readOnly}
                data-testid={`field-${item.key}`}
                onClick={() => !readOnly && onChange?.(item.key, !checked, item.column)}
                className={[
                  'peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow',
                  'flex items-center justify-center',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  checked ? 'bg-primary text-primary-foreground' : 'bg-transparent',
                ].join(' ')}
              >
                {checked && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                    strokeLinejoin="round" className="h-4 w-4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <span className="text-sm text-foreground font-medium">{item.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
