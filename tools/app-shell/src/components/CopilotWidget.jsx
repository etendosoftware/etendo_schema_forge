import * as React from 'react';
import { ArrowLeft, Bot, History, Maximize2, Minimize2, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useCopilot } from './CopilotContext';
import { useCurrentWindowContext } from './CurrentWindowContext';
import { Button } from '@/components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Separator } from '@/components/ui/separator.jsx';
import { cn } from '@/lib/utils';
import { useUI } from '@/i18n';
import { AssistantSelector } from './copilot/AssistantSelector.jsx';
import { ConversationSidebar } from './copilot/ConversationSidebar.jsx';
import { ChatView } from './copilot/ChatView.jsx';

const LEFT_SIDE_ROUTES = ['/quick-sales-order', '/quick-purchase-order'];

export function CopilotWidget({ hideTrigger = false }) {
  const { isOpen: open, close: closePanel, toggle, state, actions } = useCopilot();
  const { current: currentWindow } = useCurrentWindowContext();
  const location = useLocation();
  const ui = useUI();
  const isLeftSide = LEFT_SIDE_ROUTES.includes(location.pathname);
  const dockShift = isLeftSide ? '0px' : 'calc(100vw - 100% - 3rem)';

  const [showSidebar, setShowSidebar] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);

  // Stable ref for actions — avoids re-render loops in effects.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;

  const welcomeMessage = state.labels.ETCOP_Welcome_Message || ui('copilotWelcome');
  const inputPlaceholder = state.labels.ETCOP_Message_Placeholder || ui('askSomething');

  // Bootstrap data when panel opens + auto-attach current window context.
  // Auto-attach fires ONLY when attachments is empty and a window route is active.
  const hasAttachments = state.attachments.length > 0;
  React.useEffect(() => {
    if (open) {
      actionsRef.current.loadBootstrap();
      if (!hasAttachments && currentWindow) {
        actionsRef.current.attachCurrentWindow(currentWindow);
      }
    }
    // We intentionally don't depend on `currentWindow` — navigating must NOT
    // re-trigger auto-attach. The flag `hasAttachments` gates re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live-sync attachments while the panel is open and a window route is active.
  // Mirrors currentWindow -> attachments with dismissal tracking. When the user
  // leaves a window route (currentWindow == null) we FREEZE to preserve chips.
  //
  // We key on a stable JSON signature so unrelated re-renders (e.g. keystrokes
  // in unrelated state) don't thrash the sync. CurrentWindowContext already
  // stabilizes `current`, but this is a cheap safety net.
  const currentWindowSig = React.useMemo(
    () => (currentWindow ? JSON.stringify(currentWindow) : null),
    [currentWindow]
  );
  React.useEffect(() => {
    if (!open) return;
    if (currentWindow == null) return; // freeze on non-window routes
    actionsRef.current.syncAttachments(currentWindow);
    // currentWindow is read fresh from the closure; the effect only RUNS when
    // `open` flips or the window signature changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentWindowSig]);

  // Load conversations when maximized + assistant selected (sidebar always visible)
  // Also reload when conversationId changes (new conv created mid-chat).
  const assistantAppId = state.selectedAssistant?.app_id;
  const conversationId = state.conversationId;
  React.useEffect(() => {
    if (maximized && assistantAppId) {
      actionsRef.current.loadConversations();
      actionsRef.current.loadArchivedConversations();
    }
  }, [maximized, assistantAppId, conversationId]);

  // Escape key: un-maximize first, then close
  React.useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && open) {
        if (maximized) {
          setMaximized(false);
        } else {
          closePanel();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePanel, open, maximized]);

  const handleSelectAssistant = React.useCallback((assistant) => {
    actions.selectAssistant(assistant);
    actions.setFilter('');
    setShowSidebar(false);
  }, [actions]);

  const handleBackToSelection = React.useCallback(() => {
    actions.selectAssistant(null);
    actions.resetConversation();
    actions.setFilter('');
    setShowSidebar(false);
  }, [actions]);

  const handleSendMessage = React.useCallback(() => {
    actions.sendMessage(state.input);
  }, [actions, state.input]);

  const handleFileChange = React.useCallback(async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    for (const file of selectedFiles) {
      await actions.uploadFile(file);
    }
    event.target.value = '';
  }, [actions]);

  const handleSelectConversation = React.useCallback((conv) => {
    actions.selectConversation(conv);
    actions.setInput('');
    setShowSidebar(false);
  }, [actions]);

  const handleNewConversation = React.useCallback(() => {
    actions.startNewConversation();
    actions.setInput('');
    setShowSidebar(false);
  }, [actions]);

  const toggleSidebar = React.useCallback(() => {
    if (!showSidebar) {
      actions.loadConversations();
      actions.loadArchivedConversations();
    }
    setShowSidebar(prev => !prev);
  }, [showSidebar, actions]);

  const toggleMaximize = React.useCallback(() => {
    setMaximized(prev => {
      if (!prev && state.selectedAssistant) {
        // Entering maximized: sidebar is always visible, hide the toggle view
        setShowSidebar(false);
      }
      return !prev;
    });
  }, [state.selectedAssistant]);

  // --- Shared sub-component props ---

  const sidebarProps = {
    conversations: state.conversations,
    archivedConversations: state.archivedConversations,
    activeConversationId: state.conversationId,
    onSelect: handleSelectConversation,
    onNew: handleNewConversation,
    onDelete: actions.deleteConversation,
    onRestore: actions.restoreConversation,
    onPermanentDelete: actions.permanentDelete,
    onRename: actions.renameConversation,
    isLoading: state.isLoadingConversations,
    isLoadingArchived: state.isLoadingConversations,
  };

  const chatProps = {
    messages: state.messages,
    input: state.input,
    onInputChange: actions.setInput,
    onSubmit: handleSendMessage,
    onFileChange: handleFileChange,
    onRemoveFile: actions.removeFile,
    files: state.files,
    attachments: state.attachments,
    onRemoveAttachment: actions.removeAttachment,
    isSending: state.isSending,
    welcomeMessage,
    inputPlaceholder,
  };

  // --- Render body based on mode ---

  function renderBody() {
    // Assistant selector (same in both modes)
    if (!state.selectedAssistant) {
      return (
        <AssistantSelector
          assistants={state.assistants}
          filter={state.filter}
          onFilterChange={actions.setFilter}
          onSelect={handleSelectAssistant}
          isLoading={state.isLoadingAssistants}
          welcomeMessage={welcomeMessage}
          error={state.error}
          data-testid="AssistantSelector__bbc4ba" />
      );
    }

    // Maximized: sidebar always visible on the left, chat on the right
    if (maximized) {
      return (
        <div className="flex flex-1 min-h-0">
          <div className="w-64 shrink-0 border-r border-border overflow-y-auto">
            <ConversationSidebar {...sidebarProps} data-testid="ConversationSidebar__bbc4ba" />
          </div>
          <div className="flex flex-1 flex-col min-w-0">
            <ChatView {...chatProps} data-testid="ChatView__bbc4ba" />
          </div>
        </div>
      );
    }

    // Compact: toggle between sidebar view and chat view
    if (showSidebar) {
      return <ConversationSidebar {...sidebarProps} data-testid="ConversationSidebar__bbc4ba" />;
    }

    return <ChatView {...chatProps} data-testid="ChatView__bbc4ba" />;
  }

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          'fixed z-50 transition-all duration-300 ease-out',
          maximized
            ? 'inset-4'
            : 'bottom-6 left-6 w-full max-w-md h-[min(36rem,calc(100vh-6rem))] translate-x-[var(--copilot-shift)]',
          open
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-4 opacity-0 pointer-events-none'
        )}
        style={maximized ? undefined : { '--copilot-shift': dockShift }}
      >
        <Card
          className="flex h-full flex-col overflow-hidden border-border/50 shadow-2xl"
          data-testid="Card__bbc4ba">
          {/* Header */}
          <CardHeader
            className="flex flex-row items-center justify-between space-y-0 p-4"
            data-testid="CardHeader__bbc4ba">
            <div className="flex min-w-0 items-center gap-2">
              {state.selectedAssistant ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleBackToSelection}
                  aria-label={ui('copilotBackToProfiles')}
                  data-testid="Button__bbc4ba">
                  <ArrowLeft className="h-4 w-4" data-testid="ArrowLeft__bbc4ba" />
                </Button>
              ) : (
                <Sparkles
                  className="h-4 w-4 shrink-0 text-primary animate-pulse"
                  data-testid="Sparkles__bbc4ba" />
              )}
              <CardTitle className="truncate text-base" data-testid="CardTitle__bbc4ba">
                {state.selectedAssistant ? state.selectedAssistant.name : ui('copilot')}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              {state.selectedAssistant && !maximized && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleSidebar}
                  aria-label={ui('copilotConversations')}
                  data-testid="Button__bbc4ba">
                  <History className="h-4 w-4" data-testid="History__bbc4ba" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleMaximize}
                aria-label={maximized ? ui('copilotMinimize') : ui('copilotMaximize')}
                data-testid="Button__bbc4ba">
                {maximized ? (
                  <Minimize2 className="h-4 w-4" data-testid="Minimize2__bbc4ba" />
                ) : (
                  <Maximize2 className="h-4 w-4" data-testid="Maximize2__bbc4ba" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={closePanel}
                aria-label={ui('closeCopilot')}
                data-testid="Button__bbc4ba">
                <X className="h-4 w-4" data-testid="X__bbc4ba" />
              </Button>
            </div>
          </CardHeader>

          <Separator data-testid="Separator__bbc4ba" />

          {/* Body */}
          <CardContent
            className="flex flex-1 min-h-0 flex-col p-0"
            data-testid="CardContent__bbc4ba">
            {renderBody()}
          </CardContent>
        </Card>
      </div>
      {/* FAB button */}
      {!hideTrigger && <Button
        onClick={toggle}
        size="icon"
        className={cn(
          'fixed bottom-6 left-6 z-70 h-12 w-12 rounded-full shadow-lg translate-x-[var(--copilot-shift)] transition-transform duration-300 ease-out',
          !open && 'animate-pulse shadow-primary/25 shadow-xl'
        )}
        style={{ '--copilot-shift': dockShift }}
        aria-label={open ? ui('closeCopilot') : ui('openCopilot')}
        data-testid="Button__bbc4ba">
        {open ? (
          <X className="h-5 w-5" data-testid="X__bbc4ba" />
        ) : (
          <span className="relative">
            <Bot className="h-5 w-5" data-testid="Bot__bbc4ba" />
            <Sparkles
              className="absolute -top-1 -right-1 h-3 w-3 text-yellow-300 animate-spin [animation-duration:3s]"
              data-testid="Sparkles__bbc4ba" />
          </span>
        )}
      </Button>}
    </>
  );
}
