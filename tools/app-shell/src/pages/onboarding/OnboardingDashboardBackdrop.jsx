import React from 'react';
import { Headphones } from 'lucide-react';
import {
  HouseIcon as House,
  StarIcon as Star,
  IdentificationCardIcon as IdentificationCard,
  TrendUpIcon as TrendUp,
  ReceiptIcon as Receipt,
  PackageIcon as Package,
  BriefcaseIcon as Briefcase,
  BankIcon as Bank,
  PlugIcon as Plug,
  GearIcon as Gear,
  FlaskIcon as Flask,
  StorefrontIcon as Storefront,
  UserIcon as User,
} from '@phosphor-icons/react';
import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton.jsx';

// Visual-only replica of the product shell (navigation rail + topbar +
// Dashboard "Inicio"), used as the onboarding loading background (ETP-4446).
// It shows the first thing the user will see once their space is ready, with
// every text collapsed to skeleton bars so it reads as an empty, still-loading
// screen. Copies the layout only — it never mounts the live Dashboard (which
// needs a session, data, routing and i18n that do not exist yet during setup).
// aria-hidden, non-interactive and blurred so it reads as a backdrop.

// Same icons/order as the collapsed SideMenu (components/layout/SideMenu).
const RAIL_ICONS = [
  { id: 'home', Icon: House },
  { id: 'favorites', Icon: Star },
  { id: 'people', Icon: IdentificationCard },
  { id: 'sales', Icon: TrendUp },
  { id: 'purchases', Icon: Receipt },
  { id: 'inventory', Icon: Package },
  { id: 'projects', Icon: Briefcase },
  { id: 'finance', Icon: Bank },
  { id: 'connections', Icon: Plug },
  { id: 'settings', Icon: Gear },
  { id: 'proof-of-concept', Icon: Flask },
  { id: 'marketplace', Icon: Storefront },
];

function RailSkeleton() {
  return (
    <nav className="flex h-full w-14 shrink-0 flex-col overflow-hidden bg-page-bg">
      <div className="flex flex-col overflow-hidden py-2 px-2 gap-3">
        {RAIL_ICONS.map(({ id, Icon }) => (
          <div key={id} className="flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground">
              <Icon weight="regular" className="h-5 w-5" data-testid="Icon__2c996d" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col shrink-0 gap-1 px-2 pb-2">
        <div className="mb-1 w-10 self-center border-t border-[hsl(var(--border-subtle))]" />
        <div className="flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground">
            <Headphones className="h-5 w-5" data-testid="Headphones__2c996d" />
          </div>
        </div>
        <div className="flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground">
            <User weight="regular" className="h-5 w-5" data-testid="User__2c996d" />
          </div>
        </div>
      </div>
    </nav>
  );
}

// Mirrors components/layout/TopBar/TopBar.jsx: 62px bar with a centered search
// pill and three action buttons on the right, all reduced to skeleton shapes.
function TopBarSkeleton() {
  return (
    <header className="relative flex h-[62px] shrink-0 items-center gap-4 pl-4 pr-6 bg-page-bg">
      <div className="h-4 w-16 rounded bg-muted" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
        <div className="h-9 w-full max-w-xl rounded-full bg-search-bg" />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="h-10 w-10 rounded-lg bg-muted" />
      </div>
    </header>
  );
}

export function OnboardingDashboardBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none flex h-full w-full overflow-hidden bg-page-bg blur-[1px]"
      data-testid="OnboardingDashboardBackdrop__ETP4446"
    >
      <RailSkeleton data-testid="RailSkeleton__2c996d" />
      {/* Main column: topbar + content card, mirroring AppLayout */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBarSkeleton data-testid="TopBarSkeleton__2c996d" />
        <div className="relative flex min-h-0 flex-1 flex-col pr-3 pb-3">
          {/* [&_.animate-pulse]:animate-none — DashboardSkeleton pulses when used
              as a real loader; as a static backdrop we keep it still so it does
              not compete with the loader ring animation. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/30 bg-card [&_.animate-pulse]:animate-none">
            <DashboardSkeleton data-testid="DashboardSkeleton__2c996d" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingDashboardBackdrop;
