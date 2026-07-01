import * as React from 'react';
import { LoaderCircle, Star } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';

/**
 * AssistantSelector — grid picker for copilot agents/assistants.
 * Shows only featured agents (featured === 'Y') by default.
 * A star toggle lets the user disable the filter to see all agents.
 */
export function AssistantSelector({
  assistants = [],
  filter = '',
  onFilterChange,
  onSelect,
  isLoading = false,
  welcomeMessage,
  error = '',
}) {
  const ui = useUI();
  const [featuredOnly, setFeaturedOnly] = React.useState(true);

  const filteredAssistants = React.useMemo(() => {
    let list = assistants;
    if (featuredOnly) {
      list = list.filter((a) => a.featured === 'Y');
    }
    const term = filter.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (a) =>
        a.name?.toLowerCase().includes(term) ||
        a.description?.toLowerCase().includes(term),
    );
  }, [assistants, filter, featuredOnly]);

  return (
    <div className="flex flex-1 min-h-0 flex-col p-4">
      {/* Welcome message */}
      <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-foreground">
        {welcomeMessage || ui('copilotWelcome')}
      </div>
      {/* Filter row */}
      <div className="mt-4 flex items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => onFilterChange?.(e.target.value)}
          placeholder={ui('copilotFilterProfiles')}
          className="flex-1"
          data-testid="Input__8ea2ef" />
        <Button
          variant={featuredOnly ? 'default' : 'outline'}
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setFeaturedOnly((prev) => !prev)}
          aria-label={ui('copilotFeaturedOnly')}
          data-testid="Button__8ea2ef">
          <Star
            className={cn('h-4 w-4', featuredOnly && 'fill-current')}
            data-testid="Star__8ea2ef" />
        </Button>
      </div>
      {/* Assistant grid */}
      <div className="mt-4 flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" data-testid="LoaderCircle__8ea2ef" />
            <span>{ui('copilotLoadingAssistants')}</span>
          </div>
        )}
        {!isLoading && filteredAssistants.length > 0 && (
          <div className="flex flex-col gap-2">
            {filteredAssistants.map((assistant) => (
              <button
                key={assistant.app_id}
                type="button"
                onClick={() => onSelect?.(assistant)}
                className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-2 font-medium">
                  {assistant.featured === 'Y' && (
                    <Star
                      className="h-3.5 w-3.5 shrink-0 text-yellow-400 fill-yellow-400"
                      data-testid="Star__8ea2ef" />
                  )}
                  <span>{assistant.name}</span>
                </div>
                {assistant.description && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {assistant.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        {!isLoading && filteredAssistants.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {error || ui('copilotNoAssistants')}
          </div>
        )}
      </div>
    </div>
  );
}
