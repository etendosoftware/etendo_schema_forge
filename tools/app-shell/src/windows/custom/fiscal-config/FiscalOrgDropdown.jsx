import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const ORG_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-green-600', 'bg-orange-500', 'bg-purple-500', 'bg-teal-500'];

function orgAvatarColor(name) {
  return ORG_COLORS[(name?.charCodeAt(0) ?? 0) % ORG_COLORS.length];
}

export default function FiscalOrgDropdown({ selectedOrg, orgList, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const filtered = (orgList || []).filter(o => o.name !== '*');

  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (!selectedOrg) return null;
  const initial = selectedOrg.name?.[0]?.toUpperCase() ?? '?';
  const avatarColor = orgAvatarColor(selectedOrg.name);
  const canSwitch = filtered.length > 1;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => canSwitch && setOpen(v => !v)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border transition-colors
          ${canSwitch ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`w-5 h-5 rounded-full ${avatarColor} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
          {initial}
        </span>
        <span className="text-sm font-medium">{selectedOrg.name}</span>
        {canSwitch && <ChevronDown
          size={13}
          className="text-muted-foreground"
          data-testid="ChevronDown__e2fb94" />}
      </button>
      {open && canSwitch && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[200px] rounded-xl border border-border bg-background shadow-lg py-1">
          {filtered.map(org => (
            <button
              key={org.id}
              type="button"
              onClick={() => { onSelect(org); setOpen(false); }}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/40 text-left transition-colors
                ${org.id === selectedOrg.id ? 'font-semibold' : ''}`}
            >
              <span className={`w-5 h-5 rounded-full ${orgAvatarColor(org.name)} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
                {org.name[0]?.toUpperCase()}
              </span>
              {org.name}
              {org.id === selectedOrg.id && <span className="ml-auto text-muted-foreground">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
