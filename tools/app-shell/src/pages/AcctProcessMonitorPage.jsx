import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Play, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useUI, useMenuLabel } from '@/i18n';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import {
  useAcctProcessMonitor,
  parseRunTimestamp,
} from './acct-process-monitor/useAcctProcessMonitor.js';
import RunStatusPill from './acct-process-monitor/RunStatusPill.jsx';

/**
 * ETP-5269 — admin-only operational page for the accounting server process.
 *
 * Shows what the process is doing right now, when it will next run on its own, and its recent
 * execution history; and lets an administrator launch a run without waiting for the schedule.
 *
 * **A manual run is IN ADDITION to the automatic cadence, never instead of it** — that is the
 * single most important thing this page has to communicate, because an admin who believes
 * "Run now" replaces the schedule will keep pressing it. The next-automatic-run time therefore
 * sits next to the button, with an explicit hint.
 *
 * **No logs, by design.** `AD_PROCESS_RUN.LOG` is a CLOB of raw process output; the backend never
 * puts it on the wire and there is no drill-down here. Status, timings and duration only. Do not
 * add a log column or a row-expand — see `SFAcctProcessMonitor`'s class javadoc.
 *
 * The admin gate is the backend's (`NeoAccessHelper.isAdminOrClientAdmin`); the menu entry's
 * feature flag and `capability` key are visual gating only.
 */

/** Renders the loading / error / no-access shells, extracted to keep the three shapes identical. */
function StatusCard({ testId, className, children }) {
  return (
    <Card data-testid={testId}>
      <CardContent
        className={`flex flex-col items-center justify-center text-center ${className}`}
        data-testid="CardContent__17e70d">
        {children}
      </CardContent>
    </Card>
  );
}

/** A server wall-clock instant, or an em dash when the run has not reached that point yet. */
function Timestamp({ value }) {
  const parsed = parseRunTimestamp(value);
  if (!parsed) return <span className="text-muted-foreground">{'—'}</span>;
  return <span>{parsed.toLocaleString()}</span>;
}

function SummaryTile({ label, children, testId }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export default function AcctProcessMonitorPage() {
  const ui = useUI();
  const tMenu = useMenuLabel();
  const {
    loading,
    error,
    denied,
    notInstalled,
    data,
    running,
    triggering,
    triggerOutcome,
    trigger,
    reload,
  } = useAcctProcessMonitor();

  useSetPageMeta({
    title: ui('acctProcessPageTitle'),
    breadcrumb: `${tMenu('Settings')} / ${ui('acctProcessPageTitle')}`,
  });

  return (
    <div className="h-full overflow-y-auto space-y-6 p-6" data-testid="AcctProcessMonitorPage">
      {(() => {
        if (loading) {
          return (
            <div className="space-y-3" data-testid="AcctProcessMonitorPage__loading">
              <Skeleton className="h-32 w-full" data-testid="Skeleton__17e70d" />
              <Skeleton className="h-64 w-full" data-testid="Skeleton__17e70d" />
            </div>
          );
        }

        if (error) {
          return (
            <StatusCard
              testId="AcctProcessMonitorPage__error"
              className="gap-3 py-12"
              data-testid="StatusCard__17e70d">
              <p className="text-sm text-muted-foreground">{ui('acctProcessLoadError')}</p>
              <Button
                variant="outline"
                onClick={() => reload()}
                data-testid="AcctProcessMonitorPage__retry"
              >
                {ui('retry')}
              </Button>
            </StatusCard>
          );
        }

        if (denied) {
          return (
            <StatusCard
              testId="AcctProcessMonitorPage__noAccess"
              className="gap-2 py-16"
              data-testid="StatusCard__17e70d">
              <ShieldAlert
                className="h-10 w-10 text-muted-foreground/40 mb-2"
                data-testid="ShieldAlert__17e70d" />
              <h3 className="text-lg font-medium text-foreground">
                {ui('acctProcessNoAccessTitle')}
              </h3>
              <p className="text-sm text-muted-foreground">{ui('acctProcessNoAccessMessage')}</p>
            </StatusCard>
          );
        }

        if (notInstalled) {
          return (
            <StatusCard
              testId="AcctProcessMonitorPage__notInstalled"
              className="gap-2 py-16"
              data-testid="StatusCard__17e70d">
              <TriangleAlert
                className="h-10 w-10 text-muted-foreground/40 mb-2"
                data-testid="TriangleAlert__17e70d" />
              <h3 className="text-lg font-medium text-foreground">
                {ui('acctProcessNotInstalledTitle')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {ui('acctProcessNotInstalledMessage')}
              </p>
            </StatusCard>
          );
        }

        const history = data?.history || [];
        const lastRun = data?.lastRun || null;

        return (
          <div className="space-y-6" data-testid="AcctProcessMonitorPage__content">
            <Card data-testid="AcctProcessMonitorPage__statusCard">
              <CardContent className="flex flex-col gap-6 py-6" data-testid="CardContent__17e70d">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-lg font-medium text-foreground">
                      {data?.processName || ui('acctProcessPageTitle')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {ui('acctProcessPageSubtitle')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => reload()}
                      disabled={triggering}
                      aria-label={ui('acctProcessRefresh')}
                      data-testid="AcctProcessMonitorPage__refresh"
                    >
                      <RefreshCw className="h-4 w-4" data-testid="RefreshCw__17e70d" />
                    </Button>
                    <Button
                      onClick={trigger}
                      // Off while a trigger is in flight AND while the backend still reports a run
                      // in progress, so a second click cannot stack a duplicate one-shot request.
                      disabled={triggering || running || !data?.scheduled}
                      data-testid="AcctProcessMonitorPage__runNow"
                    >
                      {triggering
                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" data-testid="Loader2__17e70d" />
                        : <Play className="h-4 w-4 mr-2" data-testid="Play__17e70d" />}
                      {ui('acctProcessRunNow')}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <SummaryTile
                    label={ui('acctProcessLastStatus')}
                    testId="AcctProcessMonitorPage__lastStatus"
                    data-testid="SummaryTile__17e70d">
                    {lastRun
                      ? <RunStatusPill status={lastRun.status} data-testid="RunStatusPill__17e70d" />
                      : <span className="text-muted-foreground">{ui('acctProcessNeverRun')}</span>}
                  </SummaryTile>
                  <SummaryTile
                    label={ui('acctProcessLastRun')}
                    testId="AcctProcessMonitorPage__lastRun"
                    data-testid="SummaryTile__17e70d">
                    <Timestamp value={lastRun?.startTime} data-testid="Timestamp__17e70d" />
                  </SummaryTile>
                  <SummaryTile
                    label={ui('acctProcessNextRun')}
                    testId="AcctProcessMonitorPage__nextRun"
                    data-testid="SummaryTile__17e70d">
                    {data?.scheduled
                      ? <Timestamp value={data?.nextRunTime} data-testid="Timestamp__17e70d" />
                      : (
                        <span className="text-muted-foreground">
                          {ui('acctProcessNotScheduled')}
                        </span>
                      )}
                  </SummaryTile>
                </div>

                <p className="text-xs text-muted-foreground" data-testid="AcctProcessMonitorPage__cadenceHint">
                  {data?.scheduled
                    ? ui('acctProcessManualRunHint')
                    : ui('acctProcessNotScheduledHint')}
                </p>

                {running && (
                  <p
                    className="text-sm text-muted-foreground flex items-center gap-2"
                    data-testid="AcctProcessMonitorPage__running"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__17e70d" />
                    {ui('acctProcessRunningNow')}
                  </p>
                )}

                {triggerOutcome && (
                  <p
                    className={`text-sm ${triggerOutcome.started ? 'text-foreground' : 'text-destructive'}`}
                    data-testid="AcctProcessMonitorPage__triggerOutcome"
                    data-reason={triggerOutcome.reason}
                  >
                    {ui(triggerMessageKey(triggerOutcome))}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card data-testid="AcctProcessMonitorPage__historyCard">
              <CardContent className="py-6 space-y-4" data-testid="CardContent__17e70d">
                <h3 className="text-sm font-medium text-foreground">
                  {ui('acctProcessHistoryTitle')}
                </h3>
                {history.length === 0 ? (
                  <p
                    className="text-sm text-muted-foreground py-8 text-center"
                    data-testid="AcctProcessMonitorPage__historyEmpty"
                  >
                    {ui('acctProcessHistoryEmpty')}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table data-testid="AcctProcessMonitorPage__historyTable">
                      <TableHeader data-testid="TableHeader__17e70d">
                        <TableRow data-testid="TableRow__17e70d">
                          <TableHead data-testid="TableHead__17e70d">{ui('acctProcessColStatus')}</TableHead>
                          <TableHead data-testid="TableHead__17e70d">{ui('acctProcessColStart')}</TableHead>
                          <TableHead data-testid="TableHead__17e70d">{ui('acctProcessColEnd')}</TableHead>
                          <TableHead data-testid="TableHead__17e70d">{ui('acctProcessColDuration')}</TableHead>
                          <TableHead data-testid="TableHead__17e70d">{ui('acctProcessColTrigger')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody data-testid="TableBody__17e70d">
                        {history.map((run) => (
                          <TableRow key={run.id} data-testid={`AcctProcessMonitorPage__row-${run.id}`}>
                            <TableCell data-testid="TableCell__17e70d">
                              <RunStatusPill status={run.status} data-testid="RunStatusPill__17e70d" />
                            </TableCell>
                            <TableCell data-testid="TableCell__17e70d"><Timestamp value={run.startTime} data-testid="Timestamp__17e70d" /></TableCell>
                            <TableCell data-testid="TableCell__17e70d"><Timestamp value={run.endTime} data-testid="Timestamp__17e70d" /></TableCell>
                            <TableCell data-testid="TableCell__17e70d">
                              {run.duration || <span className="text-muted-foreground">{'—'}</span>}
                            </TableCell>
                            <TableCell className="text-muted-foreground" data-testid="TableCell__17e70d">
                              {run.manual
                                ? ui('acctProcessTriggerManual')
                                : ui('acctProcessTriggerAutomatic')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Maps a trigger outcome to its message key. A successful HTTP response still carries
 * `started: false` when the backend declined, so the reason — not the status code — decides what
 * the admin is told.
 */
function triggerMessageKey({ started, reason }) {
  if (started) return 'acctProcessTriggerStarted';
  switch (reason) {
    case 'alreadyRunning': return 'acctProcessTriggerAlreadyRunning';
    case 'notScheduled': return 'acctProcessTriggerNotScheduled';
    case 'schedulerUnavailable': return 'acctProcessTriggerSchedulerUnavailable';
    default: return 'acctProcessTriggerFailed';
  }
}
