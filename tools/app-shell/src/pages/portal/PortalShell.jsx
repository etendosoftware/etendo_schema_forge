import { useEffect, useRef, useState } from 'react';
import { FileTextIcon, HouseIcon, MagnifyingGlassIcon, ReceiptIcon, ShoppingBagIcon, SquaresFourIcon, TranslateIcon, TruckIcon, UserIcon } from '@phosphor-icons/react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { PORTAL_DOCUMENT_KINDS } from '@/lib/portal/portalApi.js';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { APP_LOCALES, LanguageMenuSection } from '@/components/LanguageMenuSection.jsx';
import { PortalTag } from './PortalBits.jsx';
import { PORTAL_HIGHLIGHTS, PORTAL_KIND_META } from './portalPresentation.js';

/** The credit links to the product's site (no shared constant exists for it). */
const ETENDO_AI_URL = 'https://etendo.ai';

/** Icon per destination; the design's own glyphs, from the app's icon family (Phosphor). */
export const PORTAL_KIND_ICONS = Object.freeze({
  QUOTATION: FileTextIcon,
  ORDER: ShoppingBagIcon,
  SHIPMENT: TruckIcon,
  INVOICE: ReceiptIcon,
});

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
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden border border-border bg-card',
        large ? 'h-10 w-10 rounded-[10px]' : 'h-8 w-8 rounded-lg',
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
 * `TranslateIcon` icon with the current flag and name — opens the app's own `DropdownMenu` holding
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
          <TranslateIcon
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
        <UserIcon className="h-4 w-4" aria-hidden="true" data-testid="User__a5d12f" />
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
            <MagnifyingGlassIcon className="h-5 w-5" aria-hidden="true" data-testid="Search__a5d12f" />
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

/**
 * The portal's frame (ETP-6209 Part B, design "Escritorio" / "Móvil").
 *
 * Desktop: the design's left sidebar — brand, "General · Inicio", "Mis documentos" with one entry
 * per kind and its count chip, and at the bottom the ES/EN switch and "Creado con etendo.ai" —
 * beside the view's own column. Mobile: the view's own top bar (each view draws it) and the
 * bottom navigation (Inicio, Presupuestos, Facturas, Más). There is no account menu and no help
 * link: the portal has no login and no support channel (agreed OUT items).
 */
export default function PortalShell({ identity, logoUrl, current, tiles, onNavigate, children }) {
  const ui = useUI();
  const isActive = (view, kind) => current?.view === view
    && (view === 'home' || current?.kind === kind);

  return (
    <div className="flex h-screen min-h-0 bg-background text-base text-foreground md:text-sm" data-testid="portal-shell">
      {/* Desktop sidebar */}
      <nav
        aria-label={ui('portalPageTitle')}
        className="hidden h-screen w-[216px] shrink-0 flex-col gap-[18px] overflow-y-auto py-3 md:flex"
        data-testid="portal-sidebar"
      >
        <div className="px-3">
          <PortalBrand identity={identity} logoUrl={logoUrl} data-testid="PortalBrand__a5d12f" />
        </div>
        <div className="flex flex-col">
          <span className="px-3 pb-1.5 text-xs text-muted-foreground">{ui('portalNavGeneral')}</span>
          <button
            type="button"
            aria-current={isActive('home') ? 'page' : undefined}
            onClick={() => onNavigate({ view: 'home' })}
            className={cn(
              'flex items-center gap-2.5 px-3 py-[7px] text-left transition-colors hover:text-primary',
              isActive('home') ? 'border-y border-border bg-card font-semibold' : '',
            )}
            data-testid="portal-nav-home"
          >
            <HouseIcon className="h-4 w-4" aria-hidden="true" data-testid="Home__a5d12f" />
            {ui('portalNavHome')}
          </button>
        </div>
        <div className="flex flex-col">
          <span className="px-3 pb-1.5 text-xs text-muted-foreground">{ui('portalNavMyDocuments')}</span>
          <div className="ml-5 flex flex-col border-l border-border">
            {PORTAL_DOCUMENT_KINDS.map((kind) => {
              const badge = navBadgeOf(tiles, kind);
              const active = isActive('list', kind) || isActive('doc', kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNavigate({ view: 'list', kind })}
                  className={cn(
                    'flex items-center justify-between py-1.5 pl-3.5 pr-3 text-left transition-colors hover:text-primary',
                    active ? 'border-y border-border bg-card font-semibold' : '',
                  )}
                  data-testid={`portal-nav-${kind.toLowerCase()}`}
                >
                  {ui(PORTAL_KIND_META[kind].pluralKey)}
                  {badge ? (
                    <PortalTag
                      tone={badge.tone}
                      className="px-1.5 py-0 font-normal"
                      testId="portal-nav-count"
                      data-testid="PortalTag__a5d12f">
                      {badge.count}
                    </PortalTag>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1" />
        {/* Customer, then language, then the credit — one line each, so all read in full at 216 px. */}
        <div className="flex flex-col gap-2 border-t border-border px-4 pt-2.5">
          <PortalCustomer identity={identity} data-testid="PortalCustomer__a5d12f" />
          <PortalLanguageSwitch data-testid="PortalLanguageSwitch__a5d12f" />
          <a
            href={ETENDO_AI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground hover:underline"
            data-testid="portal-created-with"
          >
            <img src="/logo-etendo-ai.png" alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
            {ui('portalCreatedWith')}
          </a>
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
    { key: 'home', Icon: HouseIcon, label: ui('portalNavHome'), active: isActive('home'), onClick: () => go({ view: 'home' }) },
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
