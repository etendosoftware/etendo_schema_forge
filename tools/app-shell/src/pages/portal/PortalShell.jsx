import { useEffect, useRef, useState } from 'react';
import {
  FileText, Home, LayoutGrid, Receipt, Search, ShoppingBag, Truck,
} from 'lucide-react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { PORTAL_DOCUMENT_KINDS } from '@/lib/portal/portalApi.js';
import { PortalTag } from './PortalBits.jsx';
import { PORTAL_HIGHLIGHTS, PORTAL_KIND_META } from './portalPresentation.js';

/** Icon per destination; the design's own glyphs, from the app's icon family (Lucide). */
export const PORTAL_KIND_ICONS = Object.freeze({
  QUOTATION: FileText,
  ORDER: ShoppingBag,
  SHIPMENT: Truck,
  INVOICE: Receipt,
});

/** The kinds the mobile bottom bar shows directly (design Movil-*); the rest live under "Más". */
const MOBILE_PRIMARY_KINDS = Object.freeze(['QUOTATION', 'INVOICE']);

/**
 * The tenant's brand block: logo, name and "Portal del cliente" (story item 8). Either part
 * degrades on its own — no logo, no name — without breaking the layout.
 */
export function PortalBrand({ identity, logoUrl, size = 'sm' }) {
  const ui = useUI();
  const large = size === 'lg';
  return (
    <div className={cn('flex min-w-0 items-center', large ? 'gap-3' : 'gap-2.5')} data-testid="portal-brand">
      {logoUrl ? (
        <img
          src={logoUrl}
          // The tenant name, not "logo": a screen reader should say the company; with no name the
          // empty alt correctly marks the image as decorative.
          alt={identity?.tenantName ?? ''}
          className={cn('shrink-0 object-contain', large ? 'h-10 w-10 rounded-[10px]' : 'h-8 w-8 rounded-lg')}
          data-testid="portal-logo"
        />
      ) : null}
      <div className="flex min-w-0 flex-col">
        {identity?.tenantName ? (
          <span
            className={cn('truncate font-semibold text-foreground', large ? 'text-base' : 'text-sm')}
            data-testid="portal-tenant-name"
          >
            {identity.tenantName}
          </span>
        ) : null}
        <span className={cn('text-muted-foreground', large ? 'text-[13px] leading-[18px]' : 'text-xs leading-4')}>
          {ui('portalPageTitle')}
        </span>
      </div>
    </div>
  );
}

/** ES / EN switch (§B.8). Spanish is the default; the choice is the viewer's. */
export function PortalLanguageSwitch() {
  const ui = useUI();
  const { locale, setLocale } = useLocaleSwitch();
  if (!setLocale) return null;
  const options = [
    { code: 'es_ES', short: 'ES', labelKey: 'portalSwitchToSpanish' },
    { code: 'en_US', short: 'EN', labelKey: 'portalSwitchToEnglish' },
  ];
  return (
    <div
      role="group"
      aria-label={ui('portalLanguage')}
      className="inline-flex rounded-lg bg-muted p-0.5"
      data-testid="portal-language-switch"
    >
      {options.map((option) => {
        const active = (locale || 'es_ES').startsWith(option.code.slice(0, 2));
        return (
          <button
            key={option.code}
            type="button"
            aria-pressed={active}
            aria-label={ui(option.labelKey)}
            onClick={() => setLocale(option.code)}
            className={cn(
              'h-7 rounded-md px-2 text-xs font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`portal-language-${option.short.toLowerCase()}`}
          >
            {option.short}
          </button>
        );
      })}
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
      className="flex h-20 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-6 md:hidden"
      data-testid="portal-mobile-topbar"
    >
      <PortalBrand identity={identity} logoUrl={logoUrl} size="lg" />
      <div className="flex items-center gap-2">
        {onSearch ? (
          <button
            type="button"
            aria-label={ui('portalSearch')}
            onClick={onSearch}
            className="flex h-12 w-12 items-center justify-center rounded-[10px] border border-border bg-card"
            data-testid="portal-mobile-search"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
        <PortalLanguageSwitch />
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
    <div className="flex h-screen min-h-0 bg-background text-sm text-foreground" data-testid="portal-shell">
      {/* Desktop sidebar */}
      <nav
        aria-label={ui('portalPageTitle')}
        className="hidden h-screen w-[216px] shrink-0 flex-col gap-[18px] overflow-y-auto py-3 md:flex"
        data-testid="portal-sidebar"
      >
        <div className="px-3">
          <PortalBrand identity={identity} logoUrl={logoUrl} />
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
            <Home className="h-4 w-4" aria-hidden="true" />
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
                    <PortalTag tone={badge.tone} className="px-1.5 py-0 font-normal" testId="portal-nav-count">
                      {badge.count}
                    </PortalTag>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex flex-col gap-2.5 border-t border-border px-4 pt-2.5">
          <PortalLanguageSwitch />
          <span className="text-xs text-muted-foreground" data-testid="portal-created-with">
            {ui('portalCreatedWith')}
          </span>
        </div>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:p-2 md:pl-0">
        {children}
      </div>

      <PortalBottomNav current={current} onNavigate={onNavigate} isActive={isActive} />
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
                <Icon className="h-5 w-5" aria-hidden="true" />
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
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
