import { useUI } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { cn } from '@/lib/utils.js';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip.jsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.jsx';
import {
  Search,
  Mic,
  Sparkles,
  Plus,
  Bell,
  MoreVertical,
  Star,
  HelpCircle,
  ArrowLeft,
} from 'lucide-react';

function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true })
  );
}

export default function TopBar({
  onBack,
  title,
  titleExtra,
  breadcrumb,
  recordCount,
  menuAction,
  onAddToFavorites,
  isFavorite = false,
  onPageHelp = () => {},
  onSearchClick,
  searchPlaceholder,
  onAIClick,
  onNewClick,
  onBellClick,
  rightExtras,
  className,
}) {
  const ui = useUI();
  const copilot = useCopilot();

  const resolvedPlaceholder = searchPlaceholder ?? ui('searchPlaceholder');
  const handleSearchClick = onSearchClick ?? openCommandPalette;
  const handleAIClick = onAIClick ?? copilot?.toggle;

  const hasMenu = onAddToFavorites || onPageHelp || menuAction;

  return (
    <TooltipProvider data-testid="TooltipProvider__133e64">
      <header
        className={cn(
          'relative flex h-[62px] shrink-0 items-center gap-4 pl-0 pr-6 bg-page-bg',
          className
        )}
      >
        {/* Left: back button + title + breadcrumb + 3-dot menu */}
        {(title || onBack) && (
          <div className="flex items-center gap-1 shrink-0 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={ui('back')}
                data-testid="topbar-back"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-topbar-icon hover:bg-muted hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__133e64" />
              </button>
            )}
            <div className="flex flex-col justify-center items-start min-w-0 h-12">
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold leading-8 text-text-primary truncate">
                  {title}
                </span>
                {recordCount != null && (
                  <span className="inline-flex items-center justify-center w-7 h-6 px-2 py-1 text-xs font-medium text-muted-foreground bg-page-bg border border-[#D1D4DB] rounded-lg shrink-0">
                    {recordCount}
                  </span>
                )}
                {titleExtra && (
                  <span className="flex items-center shrink-0">{titleExtra}</span>
                )}
              </div>
              {breadcrumb && (
                <span className="text-xs text-topbar-breadcrumb truncate">
                  {breadcrumb}
                </span>
              )}
            </div>

            {hasMenu && (
              <DropdownMenu data-testid="DropdownMenu__133e64">
                <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__133e64">
                  <button
                    type="button"
                    aria-label={ui('more')}
                    data-testid="topbar-more-actions"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-topbar-icon hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <MoreVertical className="h-4 w-4" data-testid="MoreVertical__133e64" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52" data-testid="DropdownMenuContent__133e64">
                  {onAddToFavorites && (
                    <DropdownMenuItem onClick={onAddToFavorites} data-testid="DropdownMenuItem__133e64">
                      <Star
                        className={cn(
                          'h-4 w-4 mr-2',
                          isFavorite
                            ? 'fill-accent-highlight text-accent-highlight'
                            : 'text-muted-foreground'
                        )}
                        data-testid="Star__133e64" />
                      {isFavorite ? ui('removeFromFavorites') : ui('addToFavorites')}
                    </DropdownMenuItem>
                  )}
                  {onPageHelp && (
                    <DropdownMenuItem onClick={onPageHelp} data-testid="DropdownMenuItem__133e64">
                      <HelpCircle
                        className="h-4 w-4 mr-2 text-muted-foreground"
                        data-testid="HelpCircle__133e64" />
                      {ui('pageHelp')}
                    </DropdownMenuItem>
                  )}
                  {menuAction && (onAddToFavorites || onPageHelp) && (
                    <DropdownMenuSeparator data-testid="DropdownMenuSeparator__133e64" />
                  )}
                  {menuAction && (
                    <DropdownMenuItem
                      onClick={menuAction.onClick}
                      disabled={menuAction.disabled}
                      data-testid="DropdownMenuItem__133e64">
                      {menuAction.icon && (
                        <menuAction.icon className="h-4 w-4 mr-2 text-muted-foreground" />
                      )}
                      {menuAction.label}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

        {/* Center: search — absolutely centered so it never shifts with title width */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
          <button
            type="button"
            onClick={handleSearchClick}
            data-testid="global-search-trigger"
            className="pointer-events-auto relative flex h-9 w-full max-w-xl items-center gap-2 rounded-full bg-search-bg px-4 text-sm hover:bg-search-bg/80 transition-colors"
          >
            <Search
              className="h-4 w-4 shrink-0 text-search-placeholder"
              data-testid="Search__133e64" />
            <span className="flex-1 text-left truncate text-search-placeholder">
              {resolvedPlaceholder}
            </span>
            <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
              <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={ui('searchWithVoice')}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-search-placeholder"
                >
                  <Mic className="h-4 w-4" data-testid="Mic__133e64" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('searchWithVoice')}</TooltipContent>
            </Tooltip>
          </button>
        </div>

        {/* Right: action icons */}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
            <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
              <button
                type="button"
                onClick={handleAIClick}
                aria-label={ui('aiAssistant')}
                className="copilot-btn flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon transition-colors"
              >
                <Sparkles className="h-5 w-5" data-testid="Sparkles__133e64" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('aiAssistant')}</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
            <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
              <button
                type="button"
                onClick={onNewClick}
                aria-label={ui('newRecord')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon hover:text-foreground hover:bg-muted transition-colors"
              >
                <Plus className="h-5 w-5" data-testid="Plus__133e64" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('newRecord')}</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0} data-testid="Tooltip__133e64">
            <TooltipTrigger asChild data-testid="TooltipTrigger__133e64">
              <button
                type="button"
                onClick={onBellClick}
                aria-label={ui('notifications')}
                data-testid="topbar-notifications"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-topbar-icon hover:text-foreground hover:bg-muted transition-colors"
              >
                <Bell className="h-5 w-5" data-testid="Bell__133e64" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" data-testid="TooltipContent__133e64">{ui('notifications')}</TooltipContent>
          </Tooltip>

          {rightExtras}
        </div>
      </header>
    </TooltipProvider>
  );
}
