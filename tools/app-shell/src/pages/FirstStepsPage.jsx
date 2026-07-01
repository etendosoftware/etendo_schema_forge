import {
  CheckCircle,
  Circle,
  Clock,
  Sparkles,
  Settings,
  Building2,
  FileText,
  Landmark,
  CreditCard,
  Users,
  Receipt,
} from 'lucide-react';
import { useUI } from '@/i18n';
import TopBar from '@/components/layout/TopBar/TopBar.jsx';

const STEPS = [
  {
    id: 1,
    icon: Users,
    titleKey: 'firstStepsCreateAccount',
    time: null,
    done: true,
  },
  {
    id: 2,
    icon: Building2,
    titleKey: 'firstStepsCompanyData',
    descKey: 'firstStepsCompanyDataDesc',
    time: 2,
    done: false,
    expanded: true,
  },
  {
    id: 3,
    icon: FileText,
    titleKey: 'firstStepsCustomizeInvoices',
    time: 3,
    done: false,
  },
  {
    id: 4,
    icon: Landmark,
    titleKey: 'firstStepsConnectBank',
    time: 4,
    done: false,
  },
  {
    id: 5,
    icon: CreditCard,
    titleKey: 'firstStepsSetupPayments',
    time: 2,
    done: false,
  },
  {
    id: 6,
    icon: Users,
    titleKey: 'firstStepsInviteTeam',
    time: 2,
    done: false,
  },
  {
    id: 7,
    icon: Receipt,
    titleKey: 'firstStepsFirstInvoice',
    time: 2,
    done: false,
  },
];

const completed = STEPS.filter(s => s.done).length;
const total = STEPS.length;

export default function FirstStepsPage() {
  const ui = useUI();
  return (
    <div className="flex flex-col h-full">
      <TopBar title={ui("firstStepsPageTitle")} data-testid="TopBar__45a28a" />
      <div className="flex-1 overflow-auto bg-page-bg">
        <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">

          {/* Copilot banner */}
          <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Settings className="h-5 w-5 shrink-0" data-testid="Settings__45a28a" />
              <span>{ui("firstStepsCopilotBanner")}</span>
            </div>
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground opacity-60 cursor-default"
            >
              <Sparkles className="h-4 w-4" data-testid="Sparkles__45a28a" />
              {ui("firstStepsStart")}
            </button>
          </div>

          {/* Header + progress */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-text-primary">
              {ui("firstStepsPrepareAccount")}
            </h1>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {ui("firstStepsSubtitle")}
              </span>
              <span className="shrink-0 ml-4 font-medium text-muted-foreground">
                {completed}/{total} {ui("firstStepsCompleted")}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          </div>

          {/* Steps card */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.id}
                  className="px-5 py-4 bg-card"
                >
                  <div className="flex items-start gap-4">
                    {/* Left icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="h-5 w-5" data-testid="Icon__45a28a" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${step.done ? 'line-through text-muted-foreground' : 'text-text-primary'}`}>
                        {ui(step.titleKey)}
                      </p>

                      {step.expanded && step.descKey && (
                        <div className="mt-1 space-y-3">
                          <p className="text-xs text-muted-foreground">{ui(step.descKey)}</p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled
                              className="rounded-md border px-3 py-1 text-xs font-medium text-foreground cursor-default hover:bg-muted/50"
                            >
                              {ui("firstStepsConfigure")}
                            </button>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" data-testid="Clock__45a28a" />
                              {step.time} {ui("minutes")}
                            </span>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-default select-none">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border" />
                            {ui("markAsCompleted")}
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Right status */}
                    <div className="shrink-0 flex items-center gap-2 mt-0.5">
                      {!step.done && !step.expanded && Boolean(step.time) && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" data-testid="Clock__45a28a" />
                          {step.time} {ui('minutes')}
                        </span>
                      )}
                      {step.done ? (
                        <CheckCircle
                          className="h-6 w-6 text-green-500 fill-green-500 stroke-white"
                          data-testid="CheckCircle__45a28a" />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground/30" data-testid="Circle__45a28a" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
