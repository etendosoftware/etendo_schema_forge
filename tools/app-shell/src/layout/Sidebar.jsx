import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Eye, ChevronRight, ShoppingCart, Truck, Database, DollarSign, Settings } from 'lucide-react';

const ICON_MAP = {
  ShoppingCart,
  Truck,
  Database,
  DollarSign,
  Settings,
};

function MenuGroup({ group, icon, items, isOpen, onToggle }) {
  const Icon = ICON_MAP[icon] || Database;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/40 hover:text-white/60 transition-colors"
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{group}</span>
        <ChevronRight className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')} />
      </button>
      {isOpen && (
        <div className="ml-4 space-y-0.5">
          {items.map(item => (
            <NavLink
              key={item.name}
              to={`/${item.name}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ menuGroups }) {
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    for (const g of menuGroups) {
      initial[g.group] = true;
    }
    return initial;
  });

  const toggle = (group) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <aside className="w-60 flex flex-col" style={{ backgroundColor: 'hsl(var(--sidebar-bg))' }}>
      <div className="px-5 py-5 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight text-white">Schema Forge</h1>
        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--sidebar-text))' }}>ERP Generator</p>
      </div>
      <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
        {menuGroups.map(g => (
          <MenuGroup
            key={g.group}
            group={g.group}
            icon={g.icon}
            items={g.items}
            isOpen={openGroups[g.group]}
            onToggle={() => toggle(g.group)}
          />
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <NavLink
          to="/preview"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              isActive
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:bg-white/10 hover:text-white/80'
            )
          }
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </NavLink>
      </div>
    </aside>
  );
}
