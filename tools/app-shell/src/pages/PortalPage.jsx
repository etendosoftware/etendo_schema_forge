import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CircleNotchIcon, EnvelopeSimpleOpenIcon, FileTextIcon, ProhibitIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { usePortalApiFetch } from '@/lib/portal/usePortalApiFetch.js';
import { usePortalFavicon } from './portal/usePortalFavicon.js';
import {
  PORTAL_ERROR,
  PORTAL_LINK_STATE,
  PORTAL_RENEWAL,
  fetchPortalHome,
  fetchPortalIdentity,
  fetchPortalLogoBlob,
  renewPortalLink,
  resolvePortalBaseUrl,
} from '@/lib/portal/portalApi.js';
import PortalShell from './portal/PortalShell.jsx';
import PortalHomeView from './portal/PortalHomeView.jsx';
import PortalDocumentListView from './portal/PortalDocumentListView.jsx';
import PortalDocumentDetailView from './portal/PortalDocumentDetailView.jsx';
import {
  PORTAL_KIND_META, readPortalView, writePortalView,
} from './portal/portalPresentation.js';

/**
 * Business Partner self-service portal — read-only MVP (ETP-5267).
 *
 * A customer of the tenant opens the magic link that rode along with their invoice email and
 * reads their own invoice history and outstanding balance. No account, no password, no
 * session: the token in the URL is the entire credential.
 *
 * Three properties of this page follow from that and are not free to change:
 *
 * - **It is public and unconditional.** The route is registered with no feature-flag check,
 *   because the flag (`bp-portal-link`, backend-only, targeted at the sending account) gates
 *   whether the *email carries a link* — it is a rollout control, never an authorization
 *   boundary. What protects the data is the token, enforced server-side. Nothing in the
 *   browser evaluates the flag, no key for it exists in `flag-keys.js`, and none must be
 *   added (plan §2.5).
 * - **It renders no tenant chrome.** Public routes mount outside `ShellLayout`, so the page
 *   owns its own full-page frame the way `InviteAcceptancePage` does.
 * - **Invalid, pending and deactivated links look identical.** The backend answers the same to
 *   all, and the UI keeps that property: one generic message, no retry offered, nothing to enumerate against
 *   (plan §5.2 / §6). A *transient* failure is a different screen — it says so and offers a
 *   retry — because telling a customer their link is dead when the network blinked would send
 *   them chasing a new link that they do not need.
 *
 * **Each link lives 48 hours after its email (ETP-6209).** An expired link renews itself: the page
 * asks for a new one once, on its own, and the backend emails it to the address the document was
 * sent to — never to whoever is looking at this page. The page then says a new link was sent (or
 * was sent recently). A customer who is blocked or inactive, or whose supplier's plan expired,
 * gets "contact the company" and no reason.
 *
 * The token is deliberately left in the address bar. The link is meant to be bookmarkable
 * (plan §1/§4.6), and scrubbing it would break the bookmark; what §5.4 forbids is the token
 * appearing in a *query string* on the wire, which is why every request sends it in the
 * `X-Portal-Token` header instead — see `lib/portal/portalApi.js`.
 */

/** The screens this page can be on. */
const VIEW = {
  loading: 'loading',
  ready: 'ready',
  invalid: 'invalid',
  transientFailure: 'transient-failure',
  renewing: 'renewing',
  renewed: 'renewed',
  recentlySent: 'recently-sent',
  unavailable: 'unavailable',
  renewFailed: 'renew-failed',
};

/** Full-page frame shared by every state, so the portal looks like one surface throughout. */
function PortalFrame({ children }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">{children}</div>
    </div>
  );
}

/** Centered notice used by the loading, invalid-link and transient-failure states. */
function PortalNotice({ testId, icon, title, description, children }) {
  return (
    <div
      className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-12 text-center shadow-sm"
      data-testid={testId}
    >
      {icon}
      <h1 className="mt-5 text-xl font-semibold text-foreground">{title}</h1>
      {description && (
        <p className="mt-2 max-w-md text-sm text-muted-foreground" data-testid={`${testId}-description`}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}

/**
 * The full-page screen of every state but "ready" (loading, dead link, renewal, unavailable,
 * failures), or {@code null} when the portal itself is shown.
 */
function portalStatusScreen(view, ui, tenantName, onRetry) {
  if (view === VIEW.loading) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-loading"
          icon={<CircleNotchIcon
            className="h-8 w-8 animate-spin text-primary"
            data-testid="Loader2__3db5f6" />}
          title={ui('portalLoading')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  // No retry button here, deliberately: there is nothing for the reader to retry, and a
  // retry loop against a token-validating endpoint is exactly what the rate limit is for.
  if (view === VIEW.invalid) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-invalid-link"
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileTextIcon className="h-6 w-6" data-testid="FileText__3db5f6" />
            </span>
          )}
          title={ui('portalInvalidLinkTitle')}
          description={ui('portalInvalidLinkDescription')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  if (view === VIEW.renewing) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-renewing"
          icon={<CircleNotchIcon
            className="h-8 w-8 animate-spin text-primary"
            data-testid="Loader2__3db5f6" />}
          title={ui('portalRenewingTitle')}
          description={ui('portalRenewingDescription')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  if (view === VIEW.renewed || view === VIEW.recentlySent) {
    const recently = view === VIEW.recentlySent;
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId={recently ? 'portal-recently-sent' : 'portal-renewed'}
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <EnvelopeSimpleOpenIcon className="h-6 w-6" data-testid="MailCheck__3db5f6" />
            </span>
          )}
          title={ui(recently ? 'portalRecentlySentTitle' : 'portalRenewedTitle')}
          description={ui(recently ? 'portalRecentlySentDescription' : 'portalRenewedDescription')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  // One message for blocked, inactive and plan-expired alike: the reason is the company's
  // business, not the customer's.
  if (view === VIEW.unavailable) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-unavailable"
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ProhibitIcon className="h-6 w-6" data-testid="Ban__3db5f6" />
            </span>
          )}
          title={ui('portalUnavailableTitle')}
          description={tenantName
            ? ui('portalUnavailableDescription', { tenantName })
            : ui('portalUnavailableDescriptionGeneric')}
          data-testid="PortalNotice__3db5f6" />
      </PortalFrame>
    );
  }

  if (view === VIEW.renewFailed) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-renew-error"
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <WarningCircleIcon className="h-6 w-6" data-testid="AlertCircle__3db5f6" />
            </span>
          )}
          title={ui('portalRenewErrorTitle')}
          description={ui('portalRenewErrorDescription')}
          data-testid="PortalNotice__3db5f6">
          <Button
            variant="outline"
            className="mt-6"
            onClick={onRetry}
            data-testid="portal-renew-retry"
          >
            {ui('retry')}
          </Button>
        </PortalNotice>
      </PortalFrame>
    );
  }

  if (view === VIEW.transientFailure) {
    return (
      <PortalFrame data-testid="PortalFrame__3db5f6">
        <PortalNotice
          testId="portal-load-error"
          icon={(
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <WarningCircleIcon className="h-6 w-6" data-testid="AlertCircle__3db5f6" />
            </span>
          )}
          title={ui('portalLoadErrorTitle')}
          description={ui('portalLoadErrorDescription')}
          data-testid="PortalNotice__3db5f6">
          <Button
            variant="outline"
            className="mt-6"
            onClick={onRetry}
            data-testid="portal-retry"
          >
            {ui('retry')}
          </Button>
        </PortalNotice>
      </PortalFrame>
    );
  }

  return null;
}

/** The portal's mobile breakpoint, Tailwind's `md` (the layout switches there). */
const PORTAL_MD_QUERY = '(min-width: 768px)';

/**
 * Whether the viewport is below `md`, following resizes. Portal-local rather than the core's
 * `useIsMobile`: that hook needs `window.matchMedia`, which jsdom lacks, and this one falls back to
 * `innerWidth` so the page also renders where it is missing.
 */
function usePortalIsMobile() {
  const read = () => (typeof window.matchMedia === 'function'
    ? !window.matchMedia(PORTAL_MD_QUERY).matches
    : window.innerWidth < 768);
  const [isMobile, setIsMobile] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(PORTAL_MD_QUERY);
    const onChange = () => setIsMobile(!query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

/**
 * Where the page is: the view the URL asks for, else the document the link was sent with.
 *
 * An entry document of a kind this page does not know (a backend newer than the bundle) falls
 * back to home rather than indexing PORTAL_KIND_META with it, as readPortalView does for the URL.
 * A link whose own document is no longer visible (entryDocument null, entryKind set) opens that
 * kind's list, or home when the kind is unknown, with a notice (plan §A.8.8).
 * Only when the backend said so (entryKind): a valid link with neither field just opens home.
 */
function resolvePortalLocation(requested, identity) {
  const entry = identity?.entryDocument;
  const entryHidden = !requested && identity?.state === PORTAL_LINK_STATE.valid && !entry
    && Boolean(identity?.entryKind);
  const fallbackKind = PORTAL_KIND_META[identity?.entryKind] ? identity.entryKind : null;
  let current = { view: 'home' };
  if (requested) {
    current = requested;
  } else if (entry?.id && PORTAL_KIND_META[entry.kind]) {
    current = { view: 'doc', kind: entry.kind, id: entry.id };
  } else if (entryHidden && fallbackKind) {
    current = { view: 'list', kind: fallbackKind };
  }
  return { current, entryHidden };
}

/**
 * The current view's content. Each view draws its own headers (desktop and mobile) and content
 * card, as the design does: they differ per screen (search pill, count chip, back button, mobile
 * top bars).
 */
function portalViewBody({
  current, isMobile, apiFetch, token, identity, logoUrl, home, months, onMonthsChange, onNavigate,
  onInvalid,
}) {
  if (current.view !== 'list' && current.view !== 'doc') {
    return (
      <PortalHomeView
        apiFetch={apiFetch}
        token={token}
        identity={identity}
        logoUrl={logoUrl}
        home={home}
        months={months}
        onMonthsChange={onMonthsChange}
        onNavigate={onNavigate}
        onInvalid={onInvalid}
        data-testid="PortalHomeView__3db5f6" />
    );
  }
  // Desktop (Figma prototype): a document opens as a drawer OVER its kind's list, which stays
  // mounted underneath — closing returns to it with its tab, range and scroll as they were. A
  // deep link to a document (the email's) renders that kind's list behind it too. Mobile keeps
  // the full-page detail, so its list is hidden (still mounted) while a document is open.
  const showDoc = current.view === 'doc';
  return (
    <>
      <div className={showDoc && isMobile ? 'hidden' : 'contents'}>
        <PortalDocumentListView
          apiFetch={apiFetch}
          token={token}
          kind={current.kind}
          group={current.group ?? null}
          identity={identity}
          kindCount={home?.tiles?.[current.kind]?.count}
          onNavigate={onNavigate}
          onInvalid={onInvalid}
          data-testid="PortalDocumentListView__3db5f6" />
      </div>
      {showDoc ? (
        <PortalDocumentDetailView
          key={`${current.kind}:${current.id}`}
          apiFetch={apiFetch}
          token={token}
          kind={current.kind}
          id={current.id}
          listGroup={current.group ?? null}
          presentation={isMobile ? 'page' : 'drawer'}
          identity={identity}
          logoUrl={logoUrl}
          onNavigate={onNavigate}
          onInvalid={onInvalid}
          data-testid="PortalDocumentDetailView__3db5f6" />
      ) : null}
    </>
  );
}

export default function PortalPage() {
  // The token arrives as a path segment because an email link cannot carry a header.
  const { token = '' } = useParams();
  const ui = useUI();
  // Desktop opens a document as a drawer over its list; mobile keeps the full-page detail.
  const isMobile = usePortalIsMobile();
  // The tab icon: index.html's relative favicon does not resolve under /portal/<token>.
  usePortalFavicon();
  // `/sws/portal/*` is its own bounded context, so this is NOT the router's `apiBaseUrl`
  // (which already points at `/sws/neo`). Memoized because `apiFetch` is memoized on it.
  // Outside the app's session scope: see `usePortalApiFetch` for why (ETP-6209).
  const baseUrl = useMemo(() => resolvePortalBaseUrl(), []);
  const apiFetch = usePortalApiFetch(baseUrl);

  const [view, setView] = useState(VIEW.loading);
  const [identity, setIdentity] = useState(null);
  const [home, setHome] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [logoUrl, setLogoUrl] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // The home chart's period ("Últimos 12 meses"); a change refetches only the home aggregates.
  const [months, setMonths] = useState(12);
  const monthsRef = useRef(months);
  monthsRef.current = months;
  // The renewal already requested in this page's life, `{ token, request }` (see renewOnce).
  const renewalRef = useRef(null);

  useEffect(() => {
    const trimmed = token.trim();
    // A truncated or hand-typed link has nothing to validate, and it must look exactly like a
    // revoked one — anything else would tell a probe whether a token shape is worth trying.
    if (!trimmed) {
      setView(VIEW.invalid);
      return undefined;
    }

    let active = true;
    setView(VIEW.loading);

    const showError = (error) => {
      if (!active) return;
      setView(
        error?.code === PORTAL_ERROR.invalidLink ? VIEW.invalid : VIEW.transientFailure,
      );
    };

    // The renewal goes out once per token: a re-render or a remount of the same expired link
    // (StrictMode runs this effect twice) joins the request already in flight instead of emailing
    // the customer again. A retry after a failed renewal clears the guard.
    const renewOnce = () => {
      if (renewalRef.current?.token !== trimmed) {
        renewalRef.current = { token: trimmed, request: renewPortalLink(apiFetch, trimmed) };
      }
      setView(VIEW.renewing);
      renewalRef.current.request.then((result) => {
        if (!active) return;
        if (result.state === PORTAL_LINK_STATE.unavailable) {
          setView(VIEW.unavailable);
        } else if (result.state === PORTAL_LINK_STATE.renewed) {
          setView(result.renewal === PORTAL_RENEWAL.recentlySent ? VIEW.recentlySent : VIEW.renewed);
        } else {
          // The link had not expired after all (clock skew): load the portal normally.
          renewalRef.current = null;
          setAttempt((value) => value + 1);
        }
      }).catch((error) => {
        if (!active) return;
        if (error?.code === PORTAL_ERROR.invalidLink) {
          setView(VIEW.invalid);
          return;
        }
        renewalRef.current = null;
        setView(VIEW.renewFailed);
      });
    };

    // The link's state decides what loads next: only a valid link may read documents.
    fetchPortalIdentity(apiFetch, trimmed).then((loadedIdentity) => {
      if (!active) return null;
      setIdentity(loadedIdentity);
      if (loadedIdentity.state === PORTAL_LINK_STATE.expired) {
        renewOnce();
        return null;
      }
      if (loadedIdentity.state === PORTAL_LINK_STATE.unavailable) {
        setView(VIEW.unavailable);
        return null;
      }
      // Part B: the home aggregates feed the home view and the sidebar's counts.
      return fetchPortalHome(apiFetch, trimmed, { months: monthsRef.current }).then((loadedHome) => {
        if (!active) return;
        setHome(loadedHome);
        setView(VIEW.ready);
      });
    }).catch(showError);

    return () => { active = false; };
  }, [token, apiFetch, attempt]);

  // The logo loads separately from the page's own gate, and never blocks it: branding arriving a
  // moment late is invisible, whereas making the invoice list wait on an image would be felt.
  // Only requested when /me said there is one, so a tenant without a logo costs no request.
  useEffect(() => {
    if (!identity?.hasLogo) return undefined;
    let objectUrl = null;
    let active = true;
    fetchPortalLogoBlob(apiFetch, token.trim()).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setLogoUrl(objectUrl);
    });
    // Revoked on unmount: an object URL pins its blob in memory until it is released, and this
    // page can be reopened repeatedly from a bookmarked link.
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [identity?.hasLogo, apiFetch, token]);

  const trimmedToken = token.trim();

  // A data read answering 401 after /me said "valid" means the link changed state mid-session
  // (expired, or the customer was blocked): re-run /me once, so the expired path renews and the
  // unavailable path shows its own screen. Only a token that is still refused after that re-check
  // ends on the dead-link page. One re-check per navigation, so a backend that keeps refusing a
  // read /me accepts cannot loop the page.
  const recheckedRef = useRef(false);
  const showInvalid = useCallback(() => {
    if (recheckedRef.current) {
      setView(VIEW.invalid);
      return;
    }
    recheckedRef.current = true;
    setAttempt((value) => value + 1);
  }, []);

  // A new period refetches the home aggregates alone: the page stays where it is.
  const changeMonths = useCallback((next) => {
    setMonths(next);
    fetchPortalHome(apiFetch, trimmedToken, { months: next }).then(setHome).catch((error) => {
      if (error?.code === PORTAL_ERROR.invalidLink) showInvalid();
    });
  }, [apiFetch, trimmedToken, showInvalid]);

  // The view lives in the search string (`?view=list&kind=INVOICE`), never the token: back and
  // forward work, and the link the customer bookmarks still opens the document it was sent with.
  const requested = readPortalView(searchParams);
  const { current, entryHidden } = resolvePortalLocation(requested, identity);

  const navigate = useCallback((target) => {
    recheckedRef.current = false;
    setSearchParams(writePortalView(target));
  }, [setSearchParams]);

  const statusScreen = portalStatusScreen(view, ui, identity?.tenantName,
    () => setAttempt((value) => value + 1));
  if (statusScreen) return statusScreen;

  const body = portalViewBody({
    current,
    isMobile,
    apiFetch,
    token: trimmedToken,
    identity,
    logoUrl,
    home,
    months,
    onMonthsChange: changeMonths,
    onNavigate: navigate,
    onInvalid: showInvalid,
  });

  return (
    <PortalShell
      identity={identity}
      logoUrl={logoUrl}
      current={current}
      tiles={home?.tiles}
      onNavigate={navigate}
      data-testid="PortalShell__3db5f6">
      {entryHidden && (
        <p
          role="status"
          className="mx-6 mt-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground md:mx-1 md:mb-2 md:mt-0"
          data-testid="portal-entry-unavailable"
        >
          {ui('portalEntryDocumentUnavailable')}
        </p>
      )}
      {body}
    </PortalShell>
  );
}
