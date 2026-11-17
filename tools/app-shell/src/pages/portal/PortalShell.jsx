import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftToLine, ArrowRightToLine, Files, FileText, Home, Languages, LayoutGrid, Package, Receipt,
  Rocket, Search, ShoppingCart, User,
} from 'lucide-react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PORTAL_DOCUMENT_KINDS } from '@/lib/portal/portalApi.js';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APP_LOCALES, LanguageMenuSection } from '@/components/LanguageMenuSection.jsx';
import { PortalTag } from './PortalBits.jsx';
import { PORTAL_HIGHLIGHTS, PORTAL_KIND_META } from './portalPresentation.js';

/**
 * The product's site (no shared constant exists for it): the rail's etendo.ai brand and the promo
 * card's "Empieza gratis" (pending with the PO: Jira comment 149666 — one place to change it).
 */
export const ETENDO_AI_URL = 'https://etendo.ai';

/**
 * Icon per destination: the design's Phosphor glyphs (FileText, Receipt, ShoppingCartSimple,
 * Package) mapped to their closest equivalents in the app's icon family (Lucide).
 */
export const PORTAL_KIND_ICONS = Object.freeze({
  QUOTATION: FileText,
  ORDER: ShoppingCart,
  SHIPMENT: Package,
  INVOICE: Receipt,
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
 * way the app's avatars fall back.
 */
export function PortalLogoTile({ identity, logoUrl, size = 'sm' }) {
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
      )}
      data-testid="portal-logo-tile"
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          // The tenant name, not "logo": a screen reader should say the company; with no name the
          // empty alt correctly marks the image as decorative.
          alt={identity?.tenantName ?? ''}
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
 * The language choice (§B.8), the way the app offers it. In the app it is the "Idioma" section of
 * the user menu (`UserAvatarButton`); the portal has no user menu, so a discreet trigger — the
 * `Languages` icon with the current flag and name — opens the app's own `DropdownMenu` holding
 * that same section (`LanguageMenuSection`: the app's `APP_LOCALES`, rows and active marker).
 * Spanish is the default; the choice is the viewer's.
 */
export function PortalLanguageSwitch({ align = 'start', side = 'top', compact = false }) {
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();
  if (!setLocale) return null;
  const current = APP_LOCALES.find((entry) => entry.code === locale)
    ?? APP_LOCALES.find((entry) => entry.code === 'es_ES');
  return (
    <DropdownMenu data-testid="DropdownMenu__a5d12f">
      <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__a5d12f">
        <button
          type="button"
          aria-label={ui('language')}
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="portal-language-switch"
        >
          <Languages
            className="h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
            data-testid="Languages__a5d12f" />
          <span className="text-sm leading-none" aria-hidden="true">{current.flag}</span>
          {/* `compact` (mobile top bars): icon + flag only, so the brand keeps the room; the
              trigger's label still names it, and the same menu opens. */}
          {compact ? null : <span className="truncate">{current.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        className="w-48"
        data-testid="DropdownMenuContent__a5d12f">
        <LanguageMenuSection
          locale={locale}
          setLocale={setLocale}
          testIdFor={(code) => `portal-language-${code.slice(0, 2).toLowerCase()}`}
          data-testid="LanguageMenuSection__a5d12f" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The customer the link belongs to (`/me`'s `businessPartnerName`), shown where the design puts
 * its user (Main: the sidebar's user row; Movil-*: the avatar on the top bar's right). Purely
 * informative: the portal has no login, so there is no account menu, no chevron and nothing to
 * click. Nothing renders without a name.
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
      <span
        role="img"
        aria-label={name}
        title={name}
        // ≈40 px on a phone (360), the board's 48 px from 640 up (the 720 board).
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background sm:h-12 sm:w-12"
        data-testid="portal-customer-avatar"
      >
        {initialsOf(name)}
      </span>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={name} data-testid="portal-customer">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <User className="h-4 w-4" aria-hidden="true" data-testid="User__a5d12f" />
      </span>
      <span className="min-w-0 flex-1 truncate" data-testid="portal-customer-name">{name}</span>
    </div>
  );
}

/**
 * The mobile top bar of Inicio (design Movil-Inicio): the brand, a search button and the language
 * switch in place of the design's account avatar (the portal has no account).
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
        {onSearch ? (
          <button
            type="button"
            aria-label={ui('portalSearch')}
            onClick={onSearch}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-border bg-card sm:h-12 sm:w-12"
            data-testid="portal-mobile-search"
          >
            <Search className="h-5 w-5" aria-hidden="true" data-testid="Search__a5d12f" />
          </button>
        ) : null}
        <PortalLanguageSwitch
          align="end"
          side="bottom"
          compact
          data-testid="PortalLanguageSwitch__a5d12f" />
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

/** The rail's 36×36 icon button (collapsed rail), the design's active state included. */
const RAIL_ICON_BUTTON = 'relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground';
/** The design's active nav item: white, a 1px border and the extra-small shadow (Tailwind 3's `shadow-sm`). */
const RAIL_ACTIVE = 'border border-border bg-card text-foreground shadow-sm';

/**
 * The portal's frame (ETP-6209 Part B, design "Escritorio" / "Móvil"; the main screen aligned with
 * the designer's spec of 2026-11-17).
 *
 * Desktop: the design's left rail beside the view's own column. Expanded (the default): the
 * etendo.ai brand with the collapse button, the company the portal belongs to, "General · Inicio",
 * "Mis documentos" with one entry per kind and its count chip, the promo card ("Lleva tu negocio más
 * lejos" — only while expanded), and at the bottom the customer and the ES/EN switch. Collapsed
 * (56 px): icons only — Inicio, and "Mis documentos" with the total count, which expands the rail
 * to choose a kind. The choice is remembered per browser. Mobile: the view's own top bar (each
 * view draws it) and the bottom navigation (Inicio, Presupuestos, Facturas, Más). There is no
 * account menu and no help link: the portal has no login and no support channel yet.
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
    <div className="flex h-screen min-h-0 bg-background text-base text-foreground md:text-sm" data-testid="portal-shell">
      {/* Desktop rail */}
      <nav
        aria-label={ui('portalPageTitle')}
        className={cn(
          'hidden h-screen shrink-0 flex-col overflow-y-auto py-3 md:flex',
          collapsed ? 'w-14 items-center gap-3' : 'w-[240px] gap-4',
        )}
        data-collapsed={collapsed ? 'true' : 'false'}
        data-testid="portal-sidebar"
      >
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-3' : 'justify-between gap-2 px-3')}>
          <a
            href={ETENDO_AI_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={ui('portalCreatedWith')}
            className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="portal-created-with"
          >
            <img src="/logo-etendo-ai.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
            {collapsed ? null : <span className="text-lg font-semibold leading-7">etendo.ai</span>}
          </a>
          <button
            type="button"
            aria-label={ui(collapsed ? 'expandMenu' : 'collapseMenu')}
            aria-expanded={!collapsed}
            onClick={toggleRail}
            className={RAIL_ICON_BUTTON}
            data-testid="portal-rail-toggle"
          >
            {collapsed
              ? <ArrowRightToLine className="h-5 w-5" aria-hidden="true" data-testid="ArrowRightToLine__a5d12f" />
              : <ArrowLeftToLine className="h-5 w-5" aria-hidden="true" data-testid="ArrowLeftToLine__a5d12f" />}
          </button>
        </div>

        <PortalCompany
          identity={identity}
          logoUrl={logoUrl}
          collapsed={collapsed}
          data-testid="PortalCompany__a5d12f" />

        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              aria-label={ui('portalNavHome')}
              aria-current={isActive('home') ? 'page' : undefined}
              onClick={() => onNavigate({ view: 'home' })}
              className={cn(RAIL_ICON_BUTTON, isActive('home') ? RAIL_ACTIVE : 'bg-muted')}
              data-testid="portal-nav-home"
            >
              <Home className="h-5 w-5" aria-hidden="true" data-testid="Home__a5d12f" />
            </button>
            <button
              type="button"
              aria-label={ui('portalNavMyDocuments')}
              onClick={toggleRail}
              className={cn(RAIL_ICON_BUTTON, documentsActive ? RAIL_ACTIVE : 'bg-muted')}
              data-testid="portal-nav-documents"
            >
              <Files className="h-5 w-5" aria-hidden="true" data-testid="Files__a5d12f" />
              {totalBadge > 0 ? (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-destructive-foreground"
                  data-testid="portal-nav-documents-count"
                >
                  {totalBadge}
                </span>
              ) : null}
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 px-3">
              <span className="px-1 pb-1 text-xs text-muted-foreground">{ui('portalNavGeneral')}</span>
              <button
                type="button"
                aria-current={isActive('home') ? 'page' : undefined}
                onClick={() => onNavigate({ view: 'home' })}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-lg px-3 text-left transition-colors hover:text-primary',
                  isActive('home') ? `${RAIL_ACTIVE} font-medium` : '',
                )}
                data-testid="portal-nav-home"
              >
                <Home className="h-5 w-5 text-muted-foreground" aria-hidden="true" data-testid="Home__a5d12f" />
                {ui('portalNavHome')}
              </button>
            </div>
            <div className="flex flex-col gap-1 px-3">
              <span className="px-1 pb-1 text-xs text-muted-foreground">{ui('portalNavMyDocuments')}</span>
              {kinds.map((kind) => {
                const badge = navBadgeOf(tiles, kind);
                const active = isActive('list', kind) || isActive('doc', kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onNavigate({ view: 'list', kind })}
                    className={cn(
                      'flex h-9 items-center justify-between rounded-lg px-3 text-left transition-colors hover:text-primary',
                      active ? `${RAIL_ACTIVE} font-medium` : '',
                    )}
                    data-testid={`portal-nav-${kind.toLowerCase()}`}
                  >
                    {ui(PORTAL_KIND_META[kind].pluralKey)}
                    {badge ? (
                      <PortalTag
                        tone={badge.tone}
                        className="h-5 min-w-5 justify-center rounded-full px-1.5 py-0 font-normal"
                        testId="portal-nav-count"
                        data-testid="PortalTag__a5d12f">
                        {badge.count}
                      </PortalTag>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="flex-1" />

        {collapsed ? null : <PortalPromo data-testid="PortalPromo__a5d12f" />}

        {/* The customer, then the language; one line each. */}
        <div
          className={cn(
            'flex flex-col gap-2 border-t border-border pt-3',
            collapsed ? 'items-center px-2' : 'mx-3 px-1',
          )}
        >
          {collapsed ? (
            <PortalCustomerIcon identity={identity} data-testid="PortalCustomerIcon__a5d12f" />
          ) : (
            <PortalCustomer identity={identity} data-testid="PortalCustomer__a5d12f" />
          )}
          <PortalLanguageSwitch compact={collapsed} data-testid="PortalLanguageSwitch__a5d12f" />
        </div>
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

/**
 * The company the portal belongs to, where the design draws its company selector: the tenant's
 * logo tile and name. There is only ever one company in a portal link, so nothing opens from it
 * (no chevron). Collapsed: the logo tile alone, named by its tooltip.
 */
function PortalCompany({ identity, logoUrl, collapsed }) {
  if (collapsed) {
    return (
      <span title={identity?.tenantName ?? undefined} data-testid="portal-company">
        <PortalLogoTile identity={identity} logoUrl={logoUrl} data-testid="PortalLogoTile__a5d12f" />
      </span>
    );
  }
  return (
    <div className="mx-3 flex h-10 min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-1.5" data-testid="portal-company">
      <PortalLogoTile identity={identity} logoUrl={logoUrl} size="xs" data-testid="PortalLogoTile__a5d12f" />
      {identity?.tenantName ? (
        <span className="truncate text-muted-foreground" data-testid="portal-tenant-name">{identity.tenantName}</span>
      ) : null}
    </div>
  );
}

/** Collapsed rail: the customer as an icon, named by its tooltip; nothing without a name. */
function PortalCustomerIcon({ identity }) {
  const name = identity?.businessPartnerName;
  if (!name) return null;
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
      data-testid="portal-customer"
    >
      <User className="h-4 w-4" aria-hidden="true" data-testid="User__a5d12f" />
    </span>
  );
}

/**
 * The expanded rail's promo card ("Lleva tu negocio más lejos"). "Empieza gratis" opens the
 * product's site in a new tab; its final destination is pending with the PO (Jira comment 149666).
 */
function PortalPromo() {
  const ui = useUI();
  return (
    <aside className="mx-3 flex flex-col gap-2 rounded-lg border border-border bg-card p-3" data-testid="portal-promo">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">
        <Rocket className="h-4 w-4 text-muted-foreground" aria-hidden="true" data-testid="Rocket__a5d12f" />
      </span>
      <span className="text-sm font-semibold">{ui('portalPromoTitle')}</span>
      <span className="text-xs text-muted-foreground">{ui('portalPromoDescription')}</span>
      <Button asChild className="mt-1 w-full" data-testid="Button__a5d12f">
        <a href={ETENDO_AI_URL} target="_blank" rel="noopener noreferrer" data-testid="portal-promo-cta">
          {ui('portalPromoCta')}
        </a>
      </Button>
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
    { key: 'home', Icon: Home, label: ui('portalNavHome'), active: isActive('home'), onClick: () => go({ view: 'home' }) },
    ...MOBILE_PRIMARY_KINDS.map((kind) => ({
      key: kind.toLowerCase(),
      Icon: PORTAL_KIND_ICONS[kind],
      label: ui(PORTAL_KIND_META[kind].pluralKey),
      active: isActive('list', kind) || isActive('doc', kind),
      onClick: () => go({ view: 'list', kind }),
    })),
    {
      key: 'more', Icon: LayoutGrid, label: ui('portalMore'), active: moreActive,
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
                <Icon className="h-5 w-5" aria-hidden="true" data-testid="Icon__a5d12f" />
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
            <Icon className="h-5 w-5" aria-hidden="true" data-testid="Icon__a5d12f" />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
