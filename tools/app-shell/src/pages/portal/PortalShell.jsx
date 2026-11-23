import {
  MagnifyingGlassIcon,
  SquaresFourIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  CaretRightIcon,
  FilesIcon,
  FileTextIcon,
  HouseSimpleIcon,
  PackageIcon,
  ReceiptIcon,
  RocketLaunchIcon,
  ShoppingCartSimpleIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

// The main screen's glyphs are the design's own Phosphor icons (spec of 2026-11-17), imported with
// the library's `*Icon` names like the rest of the app (`pages/first-steps/firstStepsIcons.js`).

import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { PORTAL_DOCUMENT_KINDS } from '@/lib/portal/portalApi.js';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LanguageMenuSection } from '@/components/LanguageMenuSection.jsx';
import { PortalCreatedWithTile, PortalTag } from './PortalBits.jsx';
import { PORTAL_HIGHLIGHTS, PORTAL_KIND_META } from './portalPresentation.js';

/**
 * Where the promo card's "Empieza gratis" sends the visitor to create an account (PO answer): the
 * app's own public sign-up route, `/onboarding` (`runtime-routes.jsx`), on app.etendo.ai.
 */
export const ETENDO_SIGNUP_URL = 'https://app.etendo.ai/onboarding';

/**
 * Icon per destination: the design's Phosphor glyphs, the same everywhere a kind is drawn (rail,
 * home tiles, mobile bottom bar). Phosphor sizes by its `size` prop.
 */
export const PORTAL_KIND_ICONS = Object.freeze({
  QUOTATION: FileTextIcon,
  ORDER: ShoppingCartSimpleIcon,
  SHIPMENT: PackageIcon,
  INVOICE: ReceiptIcon,
});

/** Where the rail's collapsed state is remembered: a per-viewer convenience, never required. */
const RAIL_COLLAPSED_KEY = 'etendo.portal.railCollapsed';

function readRailCollapsed() {
  try {
    return globalThis.localStorage?.getItem(RAIL_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeRailCollapsed(collapsed) {
  try {
    globalThis.localStorage?.setItem(RAIL_COLLAPSED_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Private window or blocked storage: the rail still works, it just is not remembered.
  }
}

/** The kinds the mobile bottom bar shows directly (design Movil-*); the rest live under "Más". */
const MOBILE_PRIMARY_KINDS = Object.freeze(['QUOTATION', 'INVOICE']);

/** Up to two initials of a company name, for the logo tile when the company has no logo. */
function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '·';
}

/**
 * The company's logo in the design's fixed rounded-square tile (32×32; 40×40 on the mobile bar):
 * the logo is contained in it on a neutral card background, so a wide logotype is shrunk to fit
 * instead of being squeezed into a strip; with no logo the tile shows the company's initials, the
 * way the app's avatars fall back. `round`: the rail header's round avatar (40×40, fully rounded).
 * `decorative`: the company's name is already written beside it, so the image stays silent.
 */
export function PortalLogoTile({ identity, logoUrl, size = 'sm', round = false, decorative = false }) {
  const large = size === 'lg';
  const sizes = {
    xs: 'h-6 w-6 rounded-md',
    sm: 'h-8 w-8 rounded-lg',
    lg: 'h-10 w-10 rounded-[10px]',
  };
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card',
        sizes[size] ?? sizes.sm,
        round ? 'rounded-full' : '',
      )}
      data-testid="portal-logo-tile"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          // The tenant name, not "logo": a screen reader should say the company; with no name the
          // empty alt correctly marks the image as decorative.
          alt={decorative ? '' : (identity?.tenantName ?? '')}
          className="h-full w-full object-contain p-0.5"
          data-testid="portal-logo"
        />
      ) : (
        <span className={cn('font-semibold text-muted-foreground', large ? 'text-sm' : 'text-xs')} aria-hidden="true">
          {initialsOf(identity?.tenantName)}
        </span>
      )}
    </span>
  );
}

/**
 * The tenant's brand block: the logo tile beside the company name and "Portal del cliente"
 * (story item 8). Either text line degrades on its own without breaking the layout.
 */
export function PortalBrand({ identity, logoUrl, size = 'sm' }) {
  const ui = useUI();
  const large = size === 'lg';
  return (
    <div className={cn('flex min-w-0 items-center', large ? 'gap-3' : 'gap-2.5')} data-testid="portal-brand">
      <PortalLogoTile
        identity={identity}
        logoUrl={logoUrl}
        size={size}
        data-testid="PortalLogoTile__a5d12f" />
      <div className="flex min-w-0 flex-col">
        {identity?.tenantName ? (
          <span
            className={cn('truncate font-semibold text-foreground', large ? 'text-base' : 'text-sm')}
            data-testid="portal-tenant-name"
          >
            {identity.tenantName}
          </span>
        ) : null}
        <span className={cn('truncate whitespace-nowrap text-muted-foreground', large ? 'text-[13px] leading-[18px]' : 'text-xs leading-4')}>
          {ui('portalPageTitle')}
        </span>
      </div>
    </div>
  );
}

/**
 * The user menu (PO answer): as in the app, clicking the user opens the app's user popup look — a
 * header with the customer's name and email (`/me`), then the language (§B.8) through the app's
 * own `DropdownMenu` and `LanguageMenuSection` (`APP_LOCALES`, rows and active marker), as the
 * app's `UserAvatarButton` shows them. The rest of that menu (account, companies, logout) needs a
 * login the portal does not have. Spanish is the default; the choice is the viewer's.
 */
function PortalUserMenu({ identity, align = 'end', side = 'bottom', children }) {
  const { locale, setLocale } = useLocaleSwitch();
  const name = identity?.businessPartnerName;
  const email = identity?.email;
  return (
    <DropdownMenu data-testid="DropdownMenu__a5d12f">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__a5d12f">
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        className="w-56"
        data-testid="DropdownMenuContent__a5d12f">
        <div className="border-b px-4 py-3" data-testid="portal-user-menu-header">
          <p className="truncate text-sm font-semibold" title={name ?? undefined}>{name || '—'}</p>
          {email ? (
            <p className="mt-1 truncate text-xs text-muted-foreground" title={email} data-testid="portal-user-menu-email">
              {email}
            </p>
          ) : null}
        </div>
        {setLocale ? (
          <LanguageMenuSection
            locale={locale}
            setLocale={setLocale}
            testIdFor={(code) => `portal-language-${code.slice(0, 2).toLowerCase()}`}
            data-testid="LanguageMenuSection__a5d12f" />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The customer the link belongs to (`/me`'s `businessPartnerName`), shown where the design puts
 * its user (Main: the sidebar's user row; Movil-*: the avatar on the top bar's right). It is
 * the trigger of the user menu ({@link PortalUserMenu}: name, email and language). Nothing
 * renders without a name.
 *
 * The app has no shared initials helper — `UserAvatarButton` takes the first letter inline and
 * `OrgLogoField` keeps its own private function — so the initials come from this file's
 * `initialsOf` (the logo tile's fallback), and the styles from `UserAvatarButton`: its sidebar row
 * (person icon on a muted circle, then the name) and its round initials avatar.
 *
 * @param {'row'|'avatar'} variant the sidebar row (desktop) or the round avatar (mobile)
 */
export function PortalCustomer({ identity, variant = 'row' }) {
  const name = identity?.businessPartnerName;
  if (!name) return null;
  if (variant === 'avatar') {
    return (
      <PortalUserMenu identity={identity} data-testid="PortalUserMenu__a5d12f">
        <button
          type="button"
          aria-label={name}
          title={name}
          // ≈40 px on a phone (360), the board's 48 px from 640 up (the 720 board).
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-12 sm:w-12"
          data-testid="portal-customer-avatar"
        >
          {initialsOf(name)}
        </button>
      </PortalUserMenu>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={name} data-testid="portal-customer">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <UserIcon size={16} aria-hidden="true" data-testid="User__a5d12f" />
      </span>
      <span className="min-w-0 flex-1 truncate" data-testid="portal-customer-name">{name}</span>
    </div>
  );
}

/**
 * The mobile top bar of Inicio (design Movil-Inicio): the brand, then on the right the compact
 * "Creado con Etendo" tile, a search button and the customer's avatar, which opens the user menu
 * (the language).
 */
export function PortalMobileBrandBar({ identity, logoUrl, onSearch }) {
  const ui = useUI();
  return (
    <header
      className="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:gap-4 sm:px-6 md:hidden"
      data-testid="portal-mobile-topbar"
    >
      {/* The brand takes the room left by the controls and truncates only a very long name. */}
      <div className="min-w-0 flex-1">
        <PortalBrand
          identity={identity}
          logoUrl={logoUrl}
          size="lg"
          data-testid="PortalBrand__a5d12f" />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Provisional placement until the mobile design arrives (user decision, 2026-11-20). */}
        <PortalCreatedWithTile data-testid="PortalCreatedWithTile__a5d12f" />
        {onSearch ? (
          <button
            type="button"
            aria-label={ui('portalSearch')}
            onClick={onSearch}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-card sm:h-12 sm:w-12"
            data-testid="portal-mobile-search"
          >
            <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" data-testid="Search__a5d12f" />
          </button>
        ) : null}
        <PortalCustomer identity={identity} variant="avatar" data-testid="PortalCustomer__a5d12f" />
      </div>
    </header>
  );
}

/** The sidebar's count chip: quotations to answer (info), overdue invoices (destructive). */
function navBadgeOf(tiles, kind) {
  const highlight = tiles?.[kind]?.highlight;
  if (!highlight?.count) return null;
  if (highlight.code === 'awaitingAnswer' || highlight.code === 'overdue') {
    return { count: highlight.count, tone: PORTAL_HIGHLIGHTS[highlight.code].tone };
  }
  return null;
}

/*
 * The rail's exact values from the Figma component "Portal Cliente Navigation Rail" (variants
 * Expandido / Comprimido, 2026-11-17): hex colours and the Figma's shadow-xs, not app tokens, since
 * the user asked for the main screen to match the Figma exactly.
 */
/** Figma shadow-xs. */
const RAIL_SHADOW = 'shadow-[0_1px_2px_rgba(27,26,31,0.05)]';
/** A 36×36 icon button on the rail's grey (collapse/expand, collapsed items). */
const RAIL_ICON_BUTTON = 'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F9] text-[#81848F] transition-colors hover:text-[#1B1A1F]';
/** The active item: white, 1px #C7CBD3, shadow-xs. */
const RAIL_ACTIVE = `border border-[#C7CBD3] bg-white ${RAIL_SHADOW}`;
/** A 32px expanded item (padding 4px 8px). */
const RAIL_ITEM = 'flex h-8 w-full items-center rounded-lg border border-transparent px-2 py-1 text-left text-sm leading-6 text-[#1B1A1F] transition-colors hover:bg-white/60';
/** A group heading ("General", "Mis documentos"). */
const RAIL_HEADING = 'px-4 py-1 text-xs leading-6 tracking-[-0.005em] text-[#6B7280]';

/**
 * The rail's header (62px, padding 0 8px): the issuing company's round logo (40×40; its initials
 * without a logo) and, expanded, its name and the button that collapses the rail. The company is
 * shown only here (Figma, 2026-11-20): neither rail state repeats it in the menu below.
 */
function RailHeader({ identity, logoUrl, collapsed, onToggle }) {
  const ui = useUI();
  const tenantName = identity?.tenantName;
  return (
    <div className={cn('flex h-[62px] shrink-0 items-center px-2', collapsed ? 'justify-center' : 'justify-between gap-2')}>
      <div
        className="flex min-w-0 items-center gap-2"
        title={collapsed ? (tenantName ?? undefined) : undefined}
        data-testid="portal-rail-company"
      >
        <PortalLogoTile
          identity={identity}
          logoUrl={logoUrl}
          size="lg"
          round
          decorative={!collapsed && Boolean(tenantName)}
          data-testid="PortalLogoTile__a5d12f" />
        {!collapsed && tenantName ? (
          <span className="min-w-0 truncate text-sm font-semibold leading-6 text-[#1B1A1F]" data-testid="portal-tenant-name">
            {tenantName}
          </span>
        ) : null}
      </div>
      {collapsed ? null : (
        <button
          type="button"
          aria-label={ui('collapseMenu')}
          aria-expanded
          onClick={onToggle}
          className={RAIL_ICON_BUTTON}
          data-testid="portal-rail-toggle"
        >
          <ArrowLineLeftIcon size={20} aria-hidden="true" data-testid="ArrowLineLeft__a5d12f" />
        </button>
      )}
    </div>
  );
}

/**
 * The collapsed rail's icons: expand, Inicio and "Mis documentos" with its total. The company is
 * not an item here: it is the header's avatar.
 */
function RailCollapsedMenu({
  isActive, documentsActive, totalBadge, onToggle, onNavigate,
}) {
  const ui = useUI();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label={ui('expandMenu')}
        aria-expanded={false}
        onClick={onToggle}
        className={RAIL_ICON_BUTTON}
        data-testid="portal-rail-toggle"
      >
        <ArrowLineRightIcon size={20} aria-hidden="true" data-testid="ArrowLineRight__a5d12f" />
      </button>
      <button
        type="button"
        aria-label={ui('portalNavHome')}
        aria-current={isActive('home') ? 'page' : undefined}
        onClick={() => onNavigate({ view: 'home' })}
        className={cn(RAIL_ICON_BUTTON, isActive('home') ? RAIL_ACTIVE : '')}
        data-testid="portal-nav-home"
      >
        <HouseSimpleIcon size={20} weight={isActive('home') ? 'fill' : 'regular'} aria-hidden="true" data-testid="HouseSimple__a5d12f" />
      </button>
      <button
        type="button"
        aria-label={ui('portalNavMyDocuments')}
        onClick={onToggle}
        className={cn(RAIL_ICON_BUTTON, documentsActive ? RAIL_ACTIVE : '')}
        data-testid="portal-nav-documents"
      >
        <FilesIcon size={20} aria-hidden="true" data-testid="Files__a5d12f" />
        {totalBadge > 0 ? (
          <span
            className="absolute -top-1.5 left-5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F3164E] px-1 text-[11px] font-semibold leading-3 text-white"
            data-testid="portal-nav-documents-count"
          >
            {/* A 36px icon cannot carry a 4-digit badge: past 99 it reads "99+"; the
                expanded rail shows each kind's exact count. */}
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

/** One kind of the expanded rail: its name and, when something needs attention, its count chip. */
function RailKindItem({ kind, badge, active, onNavigate }) {
  const ui = useUI();
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate({ view: 'list', kind })}
      className={cn(RAIL_ITEM, active ? `${RAIL_ACTIVE} font-medium` : '')}
      data-testid={`portal-nav-${kind.toLowerCase()}`}
    >
      <span className="min-w-0 flex-1 truncate pl-2 pr-4">{ui(PORTAL_KIND_META[kind].pluralKey)}</span>
      {badge ? (
        <PortalTag
          tone={badge.tone}
          palette="figma"
          // Figma pill: 24px tall, 10px each side from the outer edge (1px border + 9px), not a circle.
          className="h-6 rounded-full px-[9px] py-0 font-normal"
          testId="portal-nav-count"
          data-testid="PortalTag__a5d12f">
          {badge.count}
        </PortalTag>
      ) : null}
    </button>
  );
}

/**
 * The expanded rail's menu: "General", "Mis documentos" and the promo card. The company is the
 * header's (logo and name), so it is not repeated here.
 */
function RailExpandedMenu({ kinds, tiles, isActive, onNavigate }) {
  const ui = useUI();
  return (
    <div className="flex flex-1 flex-col gap-2 pb-2">
      <div className="flex flex-col gap-1">
        <span className={RAIL_HEADING}>{ui('portalNavGeneral')}</span>
        <button
          type="button"
          aria-current={isActive('home') ? 'page' : undefined}
          onClick={() => onNavigate({ view: 'home' })}
          className={cn(RAIL_ITEM, isActive('home') ? `${RAIL_ACTIVE} font-medium` : '')}
          data-testid="portal-nav-home"
        >
          <span className="flex shrink-0 pl-1">
            <HouseSimpleIcon
              size={20}
              weight={isActive('home') ? 'fill' : 'regular'}
              className="text-[#81848F]"
              aria-hidden="true"
              data-testid="HouseSimple__a5d12f" />
          </span>
          <span className="min-w-0 flex-1 truncate pl-2 pr-4">{ui('portalNavHome')}</span>
        </button>
      </div>
      {/* Figma layer "Operaciones": no leading icon, a trailing count. */}
      <div className="flex flex-col gap-1">
        <span className={RAIL_HEADING}>{ui('portalNavMyDocuments')}</span>
        {kinds.map((kind) => (
          <RailKindItem
            key={kind}
            kind={kind}
            badge={navBadgeOf(tiles, kind)}
            active={isActive('list', kind) || isActive('doc', kind)}
            onNavigate={onNavigate}
            data-testid="RailKindItem__a5d12f" />
        ))}
      </div>
      <div className="flex-1" />
      <PortalPromo data-testid="PortalPromo__a5d12f" />
    </div>
  );
}

/**
 * The portal's frame (ETP-6209 Part B, design "Escritorio" / "Móvil"; the main screen aligned with
 * the designer's spec of 2026-11-17).
 *
 * Desktop: the design's left rail beside the view's own column. Expanded (the default): the
 * issuing company (round logo and name) with the collapse button, "General · Inicio",
 * "Mis documentos" with one entry per kind and its count chip, the promo card ("Lleva tu negocio más
 * lejos" — only while expanded), and at the bottom the help link and the customer, which opens the
 * user menu (the language). Collapsed
 * (56 px): the company's round logo, then icons only — Inicio, and "Mis documentos" with the total
 * count, which expands the rail
 * to choose a kind. The choice is remembered per browser. Mobile: the view's own top bar (each
 * view draws it) and the bottom navigation (Inicio, Presupuestos, Facturas, Más). The user menu
 * holds only the language: the portal has no login.
 */
export default function PortalShell({ identity, logoUrl, current, tiles, onNavigate, children }) {
  const ui = useUI();
  const [collapsed, setCollapsed] = useState(readRailCollapsed);
  const isActive = (view, kind) => current?.view === view
    && (view === 'home' || current?.kind === kind);
  const toggleRail = () => setCollapsed((value) => {
    writeRailCollapsed(!value);
    return !value;
  });
  // Alphabetical in the viewer's language, as the design lists them ("Albaranes, Facturas,
  // Pedidos, Presupuestos").
  const kinds = [...PORTAL_DOCUMENT_KINDS].sort((a, b) => ui(PORTAL_KIND_META[a].pluralKey)
    .localeCompare(ui(PORTAL_KIND_META[b].pluralKey)));
  const documentsActive = kinds.some((kind) => isActive('list', kind) || isActive('doc', kind));
  const totalBadge = kinds.reduce((sum, kind) => sum + (navBadgeOf(tiles, kind)?.count ?? 0), 0);

  return (
    // `group/shell` + `data-rail`: a view can size itself by the rail state (the main screen's
    // first row keeps a different proportion with the rail collapsed, as the Figma frames do).
    <div
      // Desktop page background: the Figma's #F3F5F9 (the rail's grey buttons sit on it unseen).
      className="group/shell flex h-screen min-h-0 bg-background text-base text-foreground md:bg-[#F3F5F9] md:text-sm"
      data-rail={collapsed ? 'collapsed' : 'expanded'}
      data-testid="portal-shell"
    >
      {/* Desktop rail (Figma "Portal Cliente Navigation Rail") */}
      <nav
        aria-label={ui('portalPageTitle')}
        className={cn('hidden h-screen shrink-0 flex-col md:flex', collapsed ? 'w-14' : 'w-[240px]')}
        data-collapsed={collapsed ? 'true' : 'false'}
        data-testid="portal-sidebar"
      >
        {/* Cabecera: 62px */}
        <RailHeader
          identity={identity}
          logoUrl={logoUrl}
          collapsed={collapsed}
          onToggle={toggleRail}
          data-testid="RailHeader__a5d12f" />

        {/* Menu list */}
        <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto', collapsed ? 'pl-2' : 'px-2')}>
          {collapsed ? (
            <RailCollapsedMenu
              isActive={isActive}
              documentsActive={documentsActive}
              totalBadge={totalBadge}
              onToggle={toggleRail}
              onNavigate={onNavigate}
              data-testid="RailCollapsedMenu__a5d12f" />
          ) : (
            <RailExpandedMenu
              kinds={kinds}
              tiles={tiles}
              isActive={isActive}
              onNavigate={onNavigate}
              data-testid="RailExpandedMenu__a5d12f" />
          )}
        </div>

        <PortalRailFooter identity={identity} collapsed={collapsed} data-testid="PortalRailFooter__a5d12f" />
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:p-2 md:pl-0">
        {children}
      </div>

      <PortalBottomNav
        current={current}
        onNavigate={onNavigate}
        isActive={isActive}
        data-testid="PortalBottomNav__a5d12f" />
    </div>
  );
}

/** The customer's 20px avatar: the user glyph on the rail's grey, as the Figma draws it. */
function RailUserAvatar() {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F3F5F9]">
      <UserIcon size={13} weight="fill" className="text-[#C7CBD3]" aria-hidden="true" data-testid="User__a5d12f" />
    </span>
  );
}

/**
 * The rail's footer ("Pie"): a top rule, then the customer, a 32px item with the Figma's chevron;
 * collapsed, a 36×36 grey button. The customer opens the user menu (name, email and language, as
 * the app's user popup; PO answer). "Ayuda y soporte" was removed (PO answer, 2026-11-18). Nothing
 * renders without a customer.
 */
function PortalRailFooter({ identity, collapsed }) {
  const name = identity?.businessPartnerName;
  if (!name) return null;
  if (collapsed) {
    return (
      <div className="shrink-0 px-2">
        <div className="flex flex-col justify-end gap-1 border-t border-[#E3E7EC] py-2">
          <PortalUserMenu identity={identity} side="right" align="end" data-testid="PortalUserMenu__a5d12f">
            <button type="button" aria-label={name} title={name} className={RAIL_ICON_BUTTON} data-testid="portal-customer">
              <RailUserAvatar data-testid="RailUserAvatar__a5d12f" />
            </button>
          </PortalUserMenu>
        </div>
      </div>
    );
  }
  return (
    <div className="shrink-0 px-2">
      <div className="flex flex-col gap-1 border-t border-[#E3E7EC] py-2">
        {name ? (
          <PortalUserMenu identity={identity} side="right" align="end" data-testid="PortalUserMenu__a5d12f">
            <button type="button" className={RAIL_ITEM} title={name} data-testid="portal-customer">
              <RailUserAvatar data-testid="RailUserAvatar__a5d12f" />
              <span className="min-w-0 flex-1 truncate pl-2 pr-4" data-testid="portal-customer-name">{name}</span>
              <CaretRightIcon size={20} className="shrink-0 text-[#81848F]" aria-hidden="true" data-testid="CaretRight__a5d12f" />
            </button>
          </PortalUserMenu>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The expanded rail's banner ("Lleva tu negocio más lejos"), at the bottom of the menu list.
 * "Empieza gratis" opens the app's sign-up (`ETENDO_SIGNUP_URL`) in a new tab (PO answer).
 */
function PortalPromo() {
  const ui = useUI();
  return (
    <aside className="flex w-full flex-col gap-3 rounded-lg border border-[#E3E7EC] bg-white p-3" data-testid="portal-promo">
      <div className="flex flex-col gap-1">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[#C7CBD3] bg-white ${RAIL_SHADOW}`}>
          <RocketLaunchIcon size={20} className="text-[#81848F]" aria-hidden="true" data-testid="RocketLaunch__a5d12f" />
        </span>
        <span className="text-sm font-medium leading-5 text-[#1B1A1F]">{ui('portalPromoTitle')}</span>
        <span className="text-xs leading-4 text-[#6B7280]">{ui('portalPromoDescription')}</span>
      </div>
      <a
        href={ETENDO_SIGNUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-full items-center justify-center rounded-lg bg-[#325CFF] px-2 py-1 text-sm font-medium leading-6 text-white hover:bg-[#2849CC]"
        data-testid="portal-promo-cta"
      >
        {ui('portalPromoCta')}
      </a>
    </aside>
  );
}

/** The mobile bottom navigation: Inicio, Presupuestos, Facturas, and "Más" for the rest. */
function PortalBottomNav({ onNavigate, isActive }) {
  const ui = useUI();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const secondary = PORTAL_DOCUMENT_KINDS.filter((kind) => !MOBILE_PRIMARY_KINDS.includes(kind));
  const moreActive = secondary.some((kind) => isActive('list', kind) || isActive('doc', kind));

  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event) => {
      if (moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [moreOpen]);

  const go = (target) => {
    setMoreOpen(false);
    onNavigate(target);
  };

  const items = [
    { key: 'home', Icon: HouseSimpleIcon, label: ui('portalNavHome'), active: isActive('home'), onClick: () => go({ view: 'home' }) },
    ...MOBILE_PRIMARY_KINDS.map((kind) => ({
      key: kind.toLowerCase(),
      Icon: PORTAL_KIND_ICONS[kind],
      label: ui(PORTAL_KIND_META[kind].pluralKey),
      active: isActive('list', kind) || isActive('doc', kind),
      onClick: () => go({ view: 'list', kind }),
    })),
    {
      key: 'more', Icon: SquaresFourIcon, label: ui('portalMore'), active: moreActive,
      onClick: () => setMoreOpen((open) => !open), expanded: moreOpen,
    },
  ];

  return (
    <nav
      ref={moreRef}
      aria-label={ui('portalMainNavigation')}
      className="fixed inset-x-0 bottom-0 z-20 grid h-[88px] grid-cols-4 border-t border-border bg-card px-3 py-2 md:hidden"
      data-testid="portal-bottom-nav"
    >
      {moreOpen ? (
        <div
          className="absolute bottom-full right-3 mb-2 flex min-w-48 flex-col rounded-xl border border-border bg-card py-1.5 shadow-lg"
          data-testid="portal-more-menu"
        >
          {secondary.map((kind) => {
            const Icon = PORTAL_KIND_ICONS[kind];
            return (
              <button
                key={kind}
                type="button"
                onClick={() => go({ view: 'list', kind })}
                className="flex items-center gap-3 px-4 py-3 text-left text-base hover:bg-muted"
                data-testid={`portal-bottom-nav-${kind.toLowerCase()}`}
              >
                <Icon size={20} aria-hidden="true" data-testid="Icon__a5d12f" />
                {ui(PORTAL_KIND_META[kind].pluralKey)}
              </button>
            );
          })}
        </div>
      ) : null}
      {items.map(({ key, Icon, label, active, onClick, expanded }) => (
        <button
          key={key}
          type="button"
          aria-current={active && key !== 'more' ? 'page' : undefined}
          aria-expanded={expanded}
          onClick={onClick}
          className={cn(
            'flex flex-col items-center justify-center gap-1 text-[13px]',
            active ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
          data-testid={`portal-bottom-nav-${key}`}
        >
          <span
            className={cn(
              'flex h-8 w-14 items-center justify-center rounded-full',
              active ? 'bg-[hsl(var(--accent-highlight))] text-[hsl(var(--accent-highlight-foreground))]' : '',
            )}
          >
            <Icon size={20} aria-hidden="true" data-testid="Icon__a5d12f" />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
