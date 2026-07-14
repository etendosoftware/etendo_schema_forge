import React from 'react';
import { Headphones } from 'lucide-react';
import {
  House,
  Star,
  IdentificationCard,
  TrendUp,
  Receipt,
  Package,
  Briefcase,
  Bank,
  Plug,
  Gear,
  Flask,
  Storefront,
  User,
} from '@phosphor-icons/react';

// Visual-only replica of the collapsed SideMenu rail (see
// components/layout/SideMenu/SideMenu.jsx), used as the onboarding loading
// background (ETP-4446). There is no environment to navigate to yet, so this
// never renders links, tooltips, or context providers — just the same icons,
// order, sizes and colors, aria-hidden and non-interactive. Nothing is marked
// active (no current route during onboarding) and it is blurred to read as a
// backdrop rather than a live, clickable rail.
const RAIL_ITEMS = [
  House,
  Star,
  IdentificationCard,
  TrendUp,
  Receipt,
  Package,
  Briefcase,
  Bank,
  Plug,
  Gear,
  Flask,
  Storefront,
];

export function OnboardingRailBackdrop() {
  return (
    <nav
      aria-hidden="true"
      className="pointer-events-none flex h-full w-14 shrink-0 flex-col overflow-hidden bg-page-bg blur-[1px]"
      data-testid="OnboardingRailBackdrop__ETP4446"
    >
      <div className="flex flex-col overflow-auto py-2 px-2 gap-3">
        {RAIL_ITEMS.map((Icon, idx) => (
          <div key={idx} className="flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground">
              <Icon weight="regular" className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col shrink-0 gap-1 px-2 pb-2">
        <div className="mb-1 w-10 self-center border-t border-[#E8EAEF]" />
        <div className="flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground">
            <Headphones className="h-5 w-5" />
          </div>
        </div>
        <div className="flex justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-page-bg text-muted-foreground">
            <User weight="regular" className="h-5 w-5" />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default OnboardingRailBackdrop;
