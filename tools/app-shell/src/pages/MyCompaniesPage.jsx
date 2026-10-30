import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, MailOpen, MoreHorizontal, Plus } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch.js';
import { detectBasePath } from '@/lib/neoBaseUrl.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { UPGRADE_ERROR_CODES, createPortalSession } from '@/lib/upgrade/api.js';
import {
  environmentCommercialLabel,
  environmentPlanLabelKey,
  environmentTrialLabel,
  isProductiveEnvironment,
} from '@/lib/environmentPresentation.js';
import { ADMIN_NAME_I18N_KEY, resolveRoleDisplayName } from '@/lib/roleNameI18n.js';
import { fetchCompanyEnvironments, fetchMyInvitations } from '@/lib/myCompanies/api.js';
import { groupCompanies } from '@/lib/myCompanies/companies.js';
import {
  trackMyCompaniesEnterClicked,
  trackMyCompaniesEnterFailed,
  trackMyCompaniesViewed,
} from '@/lib/myCompanies/telemetry.js';

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' };

/**
 * The account's role in an invited company, labelled exactly as the user menu labels the
 * session's own role (ETP-5329): the localized admin label for a client-admin role, else the
 * translated template names composed into the personal role, else the raw role name.
 */
function roleLabel(env, ui) {
  if (env.roleIsClientAdmin === true) return ui(ADMIN_NAME_I18N_KEY);
  if (Array.isArray(env.roleTemplateNames) && env.roleTemplateNames.length > 0) {
    return env.roleTemplateNames.map((name) => resolveRoleDisplayName(ui, name)).join('-');
  }
  return env.roleName || '—';
}

/**
 * The renewal cell of an owned company: the renewal date of the productive environment's OWN
 * subscription, the trial countdown for a demo, plus the commercial warning (payment grace,
 * suspended) when the backend reports one. No amount.
 *
 * ETP-5051 O-1b — per row, whatever environment the session is in: the date is the row's
 * `renewalAt` from `GET /sws/go/environments`, which the backend sets only while that
 * environment's subscription is actually renewing (active or trialing, not past due, not
 * scheduled to cancel) and sends as null otherwise; the null check stays as a guard for an older
 * backend with no key. Never the environment's `renewalDueAt`: that is the payment-grace anchor,
 * empty while the subscription is current and the end of the last paid period once it is past due.
 */
function renewalLabel(env, ui, locale) {
  if (!isProductiveEnvironment(env)) return environmentTrialLabel(env, ui) || '—';
  return env.renewalAt ? formatCalendarDate(env.renewalAt, locale, SHORT_DATE) : '—';
}

function RenewalCell({ env, ui, locale }) {
  const commercial = environmentCommercialLabel(env, ui);
  const primary = renewalLabel(env, ui, locale);
  return (
    <div className="flex flex-col">
      <span>{primary}</span>
      {commercial && (
        <span className="text-xs text-destructive" data-testid={`my-companies-commercial-${env.clientId}`}>
          {commercial}
        </span>
      )}
    </div>
  );
}

function EnterButton({ env, isCurrent, switching, onEnter, ui }) {
  const busy = switching === env.clientId;
  return (
    <Button
      type="button"
      size="sm"
      variant={isCurrent ? 'outline' : 'default'}
      disabled={isCurrent || Boolean(switching)}
      onClick={() => onEnter(env)}
      data-testid={`my-companies-enter-${env.clientId}`}
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__my-companies-enter" />
        : ui('myCompaniesEnter')}
    </Button>
  );
}

function CompanyName({ env, isCurrent, ui }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{env.clientName}</span>
      {isCurrent && (
        <Badge variant="secondary" data-testid={`my-companies-current-${env.clientId}`}>
          {ui('myCompaniesCurrent')}
        </Badge>
      )}
    </div>
  );
}

function OwnedCompaniesTable({
  companies, currentClientId, switching, onEnter, onManage, managing, ui, locale,
}) {
  return (
    <Table data-testid="my-companies-owned-table">
      <TableHeader data-testid="TableHeader__44c7f5">
        <TableRow data-testid="TableRow__44c7f5">
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColCompany')}</TableHead>
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColPlan')}</TableHead>
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColRenewal')}</TableHead>
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColUsers')}</TableHead>
          <TableHead className="w-0" data-testid="TableHead__44c7f5" />
          <TableHead className="w-0" data-testid="TableHead__44c7f5" />
        </TableRow>
      </TableHeader>
      <TableBody data-testid="TableBody__44c7f5">
        {companies.map((env) => {
          const isCurrent = env.clientId === currentClientId;
          // ETP-5051 O-1b — the portal opened from a row is that row's environment's own (the
          // client id travels with the request), so it is offered only where something was paid.
          const canManage = isProductiveEnvironment(env);
          return (
            <TableRow key={env.clientId} data-testid={`my-companies-owned-${env.clientId}`}>
              <TableCell data-testid="TableCell__44c7f5"><CompanyName env={env} isCurrent={isCurrent} ui={ui} data-testid="CompanyName__44c7f5" /></TableCell>
              <TableCell data-testid="TableCell__44c7f5">{ui(environmentPlanLabelKey(env))}</TableCell>
              <TableCell data-testid="TableCell__44c7f5"><RenewalCell env={env} ui={ui} locale={locale} data-testid="RenewalCell__44c7f5" /></TableCell>
              <TableCell data-testid="TableCell__44c7f5">{Number.isInteger(env.userCount) ? env.userCount : '—'}</TableCell>
              <TableCell className="text-right" data-testid="TableCell__44c7f5">
                <EnterButton
                  env={env}
                  isCurrent={isCurrent}
                  switching={switching}
                  onEnter={onEnter}
                  ui={ui}
                  data-testid="EnterButton__44c7f5" />
              </TableCell>
              <TableCell data-testid="TableCell__44c7f5">
                {canManage && (
                  <DropdownMenu data-testid="DropdownMenu__44c7f5">
                    <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__44c7f5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={ui('myCompaniesActions')}
                        data-testid={`my-companies-actions-${env.clientId}`}
                      >
                        <MoreHorizontal className="h-4 w-4" data-testid="MoreHorizontal__my-companies" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" data-testid="DropdownMenuContent__44c7f5">
                      <DropdownMenuItem
                        disabled={managing}
                        onSelect={() => onManage(env)}
                        data-testid={`my-companies-manage-${env.clientId}`}
                      >
                        {ui('myCompaniesManageSubscription')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function InvitedCompaniesTable({ companies, currentClientId, switching, onEnter, ui }) {
  return (
    <Table data-testid="my-companies-invited-table">
      <TableHeader data-testid="TableHeader__44c7f5">
        <TableRow data-testid="TableRow__44c7f5">
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColCompany')}</TableHead>
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColRole')}</TableHead>
          <TableHead data-testid="TableHead__44c7f5">{ui('myCompaniesColOwner')}</TableHead>
          <TableHead className="w-0" data-testid="TableHead__44c7f5" />
        </TableRow>
      </TableHeader>
      <TableBody data-testid="TableBody__44c7f5">
        {companies.map((env) => {
          const isCurrent = env.clientId === currentClientId;
          return (
            <TableRow key={env.clientId} data-testid={`my-companies-invited-${env.clientId}`}>
              <TableCell data-testid="TableCell__44c7f5"><CompanyName env={env} isCurrent={isCurrent} ui={ui} data-testid="CompanyName__44c7f5" /></TableCell>
              <TableCell data-testid="TableCell__44c7f5">{roleLabel(env, ui)}</TableCell>
              <TableCell data-testid="TableCell__44c7f5">{env.ownerName || '—'}</TableCell>
              <TableCell className="text-right" data-testid="TableCell__44c7f5">
                <EnterButton
                  env={env}
                  isCurrent={isCurrent}
                  switching={switching}
                  onEnter={onEnter}
                  ui={ui}
                  data-testid="EnterButton__44c7f5" />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * List-only by scope decision: accepting still happens from the invitation email, whose token the
 * account cannot read back from the list. The notice says so instead of offering buttons that
 * could not work.
 */
function PendingInvitation({ invitation, ui, locale }) {
  const inviter = invitation.inviterName || invitation.inviterEmail;
  const invitedOn = invitation.invitedAt
    ? formatCalendarDate(new Date(invitation.invitedAt), locale, SHORT_DATE)
    : null;
  return (
    <div
      className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3"
      data-testid={`my-companies-invitation-${invitation.id}`}
    >
      <MailOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" data-testid="MailOpen__my-companies" />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {ui('myCompaniesInvitationTitle', { company: invitation.clientName })}
        </span>
        {inviter && invitedOn && (
          <span className="text-xs text-muted-foreground">
            {ui('myCompaniesInvitationFrom', { inviter, date: invitedOn })}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{ui('myCompaniesInvitationHint')}</span>
      </div>
    </div>
  );
}

function SectionTitle({ label, count }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label} · {count}
    </h3>
  );
}

/**
 * "Mis empresas" (ETP-5734): every company of the signed-in account, split into the ones it
 * owns and the ones it was invited to, plus the invitations still waiting for an answer.
 *
 * Entering a company reuses the environment switch of the side-menu picker — a re-login with a
 * full navigation, not a state change. The page reads its own detailed list, so the hook's own
 * list fetch is turned off.
 */
export default function MyCompaniesPage() {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const navigate = useNavigate();
  const { switchTo, switching, currentClientId } = useEnvironmentSwitch({ enabled: false });
  // 'loading' | 'loaded' | 'error'
  const [status, setStatus] = useState('loading');
  const [groups, setGroups] = useState({ owned: [], invited: [], pendingInvitations: [] });
  const [managing, setManaging] = useState(false);
  // One view per visit: a retry after a load error must not count the visit twice.
  const viewTracked = useRef(false);

  const load = useCallback(async () => {
    const { apiBase } = detectBasePath();
    setStatus('loading');
    try {
      const [environments, invitations] = await Promise.all([
        fetchCompanyEnvironments(apiBase),
        // Invitations are secondary: failing to read them must not hide the companies.
        fetchMyInvitations(apiBase).catch(() => []),
      ]);
      const grouped = groupCompanies(environments, invitations);
      setGroups(grouped);
      setStatus('loaded');
      if (!viewTracked.current) {
        viewTracked.current = true;
        trackMyCompaniesViewed(grouped.owned.length + grouped.invited.length);
      }
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEnter = useCallback(async (env) => {
    // Tracked before the switch: a successful one navigates away from inside the hook.
    trackMyCompaniesEnterClicked(env);
    const entered = await switchTo(env);
    if (!entered) {
      trackMyCompaniesEnterFailed(env);
      toast.error(ui('myCompaniesEnterError', { company: env.clientName }));
    }
  }, [switchTo, ui]);

  const handleManage = useCallback(async (env) => {
    setManaging(true);
    try {
      const session = await createPortalSession(detectBasePath().apiBase, env.clientId);
      if (!session?.url) throw new Error('Portal session carried no url');
      window.location.assign(session.url);
    } catch (err) {
      // A row with no subscription of its own is not a transient failure: no "please try again".
      toast.error(ui(err?.code === UPGRADE_ERROR_CODES.portalNoSubscription
        ? UPGRADE_ERROR_CODES.portalNoSubscription
        : 'subscriptionManageError'));
    } finally {
      setManaging(false);
    }
  }, [ui]);

  const { owned, invited, pendingInvitations } = groups;
  const isEmpty = owned.length === 0 && invited.length === 0 && pendingInvitations.length === 0;

  return (
    <div className="space-y-6 p-6" data-testid="MyCompaniesPage">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{ui('myCompaniesTitle')}</h2>
          <p className="text-muted-foreground">{ui('myCompaniesSubtitle')}</p>
        </div>
        <Button type="button" onClick={() => navigate('/upgrade')} data-testid="my-companies-new">
          <Plus className="mr-2 h-4 w-4" data-testid="Plus__my-companies" />
          {ui('myCompaniesNewCompany')}
        </Button>
      </div>

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="my-companies-loading">
          <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__my-companies" />
          {ui('loading')}
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3" data-testid="my-companies-error">
          <p className="text-sm text-muted-foreground">{ui('myCompaniesLoadError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={load} data-testid="my-companies-retry">
            {ui('retry')}
          </Button>
        </div>
      )}

      {status === 'loaded' && (
        <>
          {pendingInvitations.length > 0 && (
            <div className="space-y-2" data-testid="my-companies-invitations">
              {pendingInvitations.map((invitation) => (
                <PendingInvitation
                  key={invitation.id}
                  invitation={invitation}
                  ui={ui}
                  locale={locale}
                  data-testid="PendingInvitation__44c7f5" />
              ))}
            </div>
          )}

          {owned.length > 0 && (
            <section className="space-y-2" data-testid="my-companies-owned">
              <SectionTitle
                label={ui('myCompaniesOwnedSection')}
                count={owned.length}
                data-testid="SectionTitle__44c7f5" />
              <Card data-testid="Card__44c7f5">
                <CardContent className="p-0" data-testid="CardContent__44c7f5">
                  <OwnedCompaniesTable
                    companies={owned}
                    currentClientId={currentClientId}
                    switching={switching}
                    onEnter={handleEnter}
                    onManage={handleManage}
                    managing={managing}
                    ui={ui}
                    locale={locale}
                    data-testid="OwnedCompaniesTable__44c7f5" />
                </CardContent>
              </Card>
            </section>
          )}

          {invited.length > 0 && (
            <section className="space-y-2" data-testid="my-companies-invited">
              <SectionTitle
                label={ui('myCompaniesInvitedSection')}
                count={invited.length}
                data-testid="SectionTitle__44c7f5" />
              <Card data-testid="Card__44c7f5">
                <CardContent className="p-0" data-testid="CardContent__44c7f5">
                  <InvitedCompaniesTable
                    companies={invited}
                    currentClientId={currentClientId}
                    switching={switching}
                    onEnter={handleEnter}
                    ui={ui}
                    data-testid="InvitedCompaniesTable__44c7f5" />
                </CardContent>
              </Card>
            </section>
          )}

          {isEmpty && (
            <p className="text-sm text-muted-foreground" data-testid="my-companies-empty">
              {ui('myCompaniesEmpty')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
