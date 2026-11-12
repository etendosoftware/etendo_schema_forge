import { FileText, Home, Receipt, ShoppingBag, Truck } from 'lucide-react';
import { useLocaleSwitch, useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { StatusTag } from '@/components/ui/status-tag';
import { PORTAL_DOCUMENT_KINDS } from '@/lib/portal/portalApi.js';
import { PORTAL_KIND_META } from './portalPresentation.js';

/** Icon per destination; the design's own glyphs, from the app's icon family (Lucide). */
export const PORTAL_KIND_ICONS = Object.freeze({
  QUOTATION: FileText,
  ORDER: ShoppingBag,
  SHIPMENT: Truck,
  INVOICE: Receipt,
});

/**
 * The tenant's brand block: logo and name, on every view (story item 8). Either part degrades
 * on its own — no logo, no name — without breaking the layout.
 */
export function PortalBrand({ identity, logoUrl, compact = false }) {
  const ui = useUI();
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-testid="portal-brand">
      {logoUrl ? (
        <img
          src={logoUrl}
          // The tenant name, not "logo": a screen reader should say the company; with no name the
          // empty alt correctly marks the image as decorative.
          alt={identity?.tenantName ?? ''}
          className={cn('shrink-0 rounded-lg object-contain', compact ? 'h-8 w-8' : 'h-8 w-8')}
          data-testid="portal-logo"
        />
      ) : null}
      <div className="flex min-w-0 flex-col">
        {identity?.tenantName ? (
          <span className="truncate text-sm font-semibold text-foreground" data-testid="portal-tenant-name">
            {identity.tenantName}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">{ui('portalPageTitle')}</span>
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

/** A small count chip in the sidebar, through the app's own status tag tones. */
function NavCount({ count, tone }) {
  if (!count) return null;
  return <StatusTag tone={tone} label={String(count)} />;
}

function navCountOf(tiles, kind) {
  const highlight = tiles?.[kind]?.highlight;
  if (!highlight || !highlight.count) return null;
  if (highlight.code === 'awaitingAnswer') return { count: highlight.count, tone: 'info' };
  if (highlight.code === 'overdue') return { count: highlight.count, tone: 'destructive' };
  return null;
}

/**
 * The portal's frame (ETP-6209 Part B, design "Escritorio" / "Móvil").
 *
 * Desktop: a left sidebar with Inicio and one entry per document kind ("Mis documentos"), and the
 * view on a white card. Mobile: a top bar with the brand and a bottom navigation bar. There is no
 * account or avatar menu — the portal has no login.
 */
export default function PortalShell({
  identity, logoUrl, current, tiles, onNavigate, title, subtitle, headerStart, children,
}) {
  const ui = useUI();
  const isActive = (target) => current?.view === target.view
    && (target.view === 'home' || current?.kind === target.kind);

  const destinations = [
    { view: 'home', labelKey: 'portalNavHome', Icon: Home },
    ...PORTAL_DOCUMENT_KINDS.map((kind) => ({
      view: 'list',
      kind,
      labelKey: PORTAL_KIND_META[kind].pluralKey,
      Icon: PORTAL_KIND_ICONS[kind],
    })),
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground" data-testid="portal-shell">
      {/* Desktop sidebar */}
      <nav
        aria-label={ui('portalPageTitle')}
        className="sticky top-0 hidden h-screen w-[216px] shrink-0 flex-col gap-5 overflow-y-auto py-3 md:flex"
        data-testid="portal-sidebar"
      >
        <div className="px-3">
          <PortalBrand identity={identity} logoUrl={logoUrl} />
        </div>
        <div className="flex flex-col">
          <span className="px-3 pb-1.5 text-xs text-muted-foreground">{ui('portalNavGeneral')}</span>
          <SidebarLink
            active={isActive(destinations[0])}
            onClick={() => onNavigate({ view: 'home' })}
            Icon={Home}
            label={ui('portalNavHome')}
            testId="portal-nav-home"
          />
        </div>
        <div className="flex flex-col">
          <span className="px-3 pb-1.5 text-xs text-muted-foreground">{ui('portalNavMyDocuments')}</span>
          <div className="ml-5 flex flex-col border-l border-border">
            {destinations.slice(1).map((destination) => {
              const badge = navCountOf(tiles, destination.kind);
              return (
                <button
                  key={destination.kind}
                  type="button"
                  aria-current={isActive(destination) ? 'page' : undefined}
                  onClick={() => onNavigate({ view: 'list', kind: destination.kind })}
                  className={cn(
                    'flex items-center justify-between py-1.5 pl-3.5 pr-3 text-left text-sm transition-colors hover:text-primary',
                    isActive(destination) ? 'border-y border-border bg-card font-medium' : '',
                  )}
                  data-testid={`portal-nav-${destination.kind.toLowerCase()}`}
                >
                  {ui(destination.labelKey)}
                  {badge ? <NavCount count={badge.count} tone={badge.tone} /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1" />
        <div className="border-t border-border px-4 pt-3">
          <PortalLanguageSwitch />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:p-2 md:pb-2 md:pl-0">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
          <PortalBrand identity={identity} logoUrl={logoUrl} compact />
          <PortalLanguageSwitch />
        </header>

        {/* View header */}
        <header className="flex items-center gap-3 px-4 pb-3 pt-3 md:px-1 md:pt-1">
          {headerStart}
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate text-lg font-semibold leading-7" data-testid="portal-view-title">{title}</h1>
            {subtitle ? <span className="truncate text-xs text-muted-foreground">{subtitle}</span> : null}
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-3 bg-card p-3 md:rounded-lg" data-testid="portal-main">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={ui('portalMainNavigation')}
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-card md:hidden"
        data-testid="portal-bottom-nav"
      >
        {destinations.map((destination) => {
          const { Icon } = destination;
          const active = isActive(destination);
          return (
            <button
              key={destination.kind ?? 'home'}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onNavigate(destination.view === 'home'
                ? { view: 'home' } : { view: 'list', kind: destination.kind })}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
              data-testid={`portal-bottom-nav-${(destination.kind ?? 'home').toLowerCase()}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {ui(destination.labelKey)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarLink({ active, onClick, Icon, label, testId }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:text-primary',
        active ? 'border-y border-border bg-card font-medium' : '',
      )}
      data-testid={testId}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
