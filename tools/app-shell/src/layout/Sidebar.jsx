import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';
import {
  Eye,
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  Settings,
  FolderKanban,
  Target,
  LogOut,
  FileJson,
} from 'lucide-react';
import { cn } from '@/lib/utils.js';
import { getSectionColor } from '@/lib/sectionColors.js';

const ICON_MAP = {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Calculator,
  Package,
  Users,
  Settings,
  FolderKanban,
  Target,
  Eye,
  FileJson,
};

/**
 * Determines which menu group is active based on current route.
 * Returns the group object or null.
 */
export function findActiveGroup(menuGroups, pathname) {
  const currentPath = pathname.replace(/^\//, '');
  return menuGroups.find((g) =>
    g.items.some((item) => item.name === currentPath)
  ) || null;
}

function SidebarIcon({ icon, label, to, isActive }) {
  const Icon = ICON_MAP[icon] || Package;
  const color = getSectionColor(label);

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            isActive
              ? 'text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          )}
          style={isActive ? {
            borderLeft: `3px solid ${color.accent}`,
            backgroundColor: color.accent + '25',
          } : undefined}
        >
          <Icon className="h-5 w-5" />
          <span className="sr-only">{label}</span>
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export default function AppSidebar({ menuGroups }) {
  const { username, logout } = useAuth();
  const location = useLocation();
  const activeGroup = findActiveGroup(menuGroups, location.pathname);

  return (
    <TooltipProvider>
      <nav className="fixed inset-y-0 left-0 z-50 flex w-[60px] flex-col items-center bg-[hsl(222,47%,11%)] py-3">
        {/* Logo */}
        <div className="mb-4 flex h-10 w-10 shrink-0 items-center justify-center">
          <img
            src="/favicon.png"
            alt="Etendo"
            className="h-9 w-9 rounded-lg"
          />
        </div>

        {/* Menu groups */}
        <div className="flex flex-1 flex-col items-center gap-1.5">
          {menuGroups.map((g) => (
            <SidebarIcon
              key={g.group}
              icon={g.icon}
              label={g.group}
              to={`/${g.items[0].name}`}
              isActive={activeGroup?.group === g.group}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-1.5 border-t border-white/10 pt-3">
          <SidebarIcon
            icon="Eye"
            label="Preview"
            to="/preview"
            isActive={location.pathname === '/preview'}
          />
          <SidebarIcon
            icon="FileJson"
            label="Artifacts"
            to="/artifacts"
            isActive={location.pathname.startsWith('/artifacts')}
          />

          {/* User avatar */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex h-10 w-10 items-center justify-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white">
                  <span className="text-xs font-semibold">
                    {username?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{username}</TooltipContent>
          </Tooltip>

          {/* Logout */}
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={logout}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Logout</TooltipContent>
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  );
}
