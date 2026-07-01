import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI, useMenuLabel } from '@/i18n';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.jsx';
import menuConfig from '../menu.json';

import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  FolderKanban,
  Settings,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  FolderKanban,
  Settings,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ui = useUI();
  const tMenu = useMenuLabel();

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (name) => {
    navigate(`/${name}`);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} data-testid="CommandDialog__73263e">
      <CommandInput placeholder={ui('searchPages')} data-testid="global-search-input" />
      <CommandList data-testid="CommandList__73263e">
        <CommandEmpty data-testid="CommandEmpty__73263e">{ui('noResultsFound')}</CommandEmpty>
        {menuConfig.menu.filter(g => !g.hidden).map((group) => {
          const Icon = ICON_MAP[group.icon] || Package;
          const visibleItems = group.items.filter(i => !i.hidden);
          if (visibleItems.length === 0) return null;
          return (
            <CommandGroup
              key={group.group}
              heading={tMenu(group.group)}
              data-testid="CommandGroup__73263e">
              {visibleItems.map((item) => {
                const translatedLabel = tMenu(item.label);
                return (
                  <CommandItem
                    key={item.name}
                    value={`${translatedLabel} ${item.label} ${item.name}`}
                    onSelect={() => handleSelect(item.name)}
                    data-testid="CommandItem__73263e">
                    <Icon className="mr-2 h-4 w-4" data-testid="Icon__73263e" />
                    <span>{translatedLabel}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
