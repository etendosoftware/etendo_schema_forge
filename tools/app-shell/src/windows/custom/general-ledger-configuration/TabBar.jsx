/**
 * TabBar for the General Ledger Configuration window. Modeled after the
 * fiscal-config TabBar but adds an optional per-tab count badge (the "Documentos"
 * tab carries a count). Kept local rather than shared so the fiscal-config TabBar
 * stays untouched; promote if a third window needs badged tabs.
 *
 * @param {object} props
 * @param {Array<{label:string, badge?:number|string}>} props.tabs
 * @param {number} props.active
 * @param {(index:number)=>void} props.onChange
 */
export default function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex px-6 py-3">
      <div className="inline-flex gap-1 p-1 rounded-xl" style={{ background: '#F5F7F9' }}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => onChange(i)}
            data-testid={`glc-tab-${i}`}
            className={`flex items-center gap-2 px-4 py-[5px] text-sm rounded-lg transition-colors
              ${active === i
                ? 'bg-white font-medium text-[#121217] shadow-[0px_1px_3px_rgba(18,18,23,0.1),0px_1px_2px_rgba(18,18,23,0.06)]'
                : 'font-normal text-[#121217] hover:bg-white/50'}`}
          >
            {tab.label}
            {tab.badge != null && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-medium
                  ${active === i ? 'bg-[#121217] text-white' : 'bg-[#E2E5EA] text-[#5A5E6B]'}`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
