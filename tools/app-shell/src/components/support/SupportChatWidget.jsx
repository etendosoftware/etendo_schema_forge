import * as React from 'react';
import { Home, MessageCircle, HelpCircle, ChevronRight, Search, X, ExternalLink } from 'lucide-react';
import { useUI } from '@/i18n';
import { useCopilot } from '@/components/CopilotContext';
import { useSupportChat } from './SupportChatContext.jsx';
import { ConversationView } from './ConversationView.jsx';
import { TicketList } from './TicketList.jsx';
import { ValerIATile } from './ValerIATile.jsx';
import { fetchHelpDocs, groupHelpCollections, searchHelpDocs, docUrl } from './helpDocs.js';
import './support-chat.css';

export { ValerIATile };

// ---- INICIO tab -----------------------------------------------------------
function InicioTab({ onStartChat, onSwitchTab, onClose }) {
  const ui = useUI();
  return (
    <>
      <div className="sc-head dark sc-inicio-hero">
        <div className="sc-grow">
          <ValerIATile size={28} radius={6} data-testid="ValerIATile__4d85ab" />
          <h1 className="sc-head-title sc-inicio-hero-title">
            {ui('supportHomeGreeting')}
          </h1>
        </div>
        <div className="sc-head-actions" style={{ position: 'absolute', top: 14, right: 14 }}>
          <button className="sc-head-icn" onClick={onClose} aria-label={ui('close')}>
            <X size={16} data-testid="X__4d85ab" />
          </button>
        </div>
      </div>
      <div className="sc-entry-stack">
        <div className="sc-entry-card featured" onClick={onStartChat} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onStartChat()}>
          <div className="sc-grow">
            <div className="sc-e-title">{ui('supportAskQuestionCta')}</div>
            <div className="sc-e-sub">{ui('supportTeamHelpDesc')}</div>
          </div>
          <div className="sc-avatars">
            <div className="sc-av" style={{ background: 'var(--status-info-bg)', color: 'var(--status-info-fg)' }}>J</div>
            <div className="sc-av" style={{ background: 'var(--status-warning-bg)', color: 'var(--status-warning-fg)' }}>L</div>
            <div className="sc-av bot"><ValerIATile size={20} radius={4} data-testid="ValerIATile__4d85ab" /></div>
          </div>
        </div>

        <div className="sc-inicio-search-card" style={{ marginTop: 24 }}>
          <div className="sc-entry-search" onClick={() => onSwitchTab('ayuda')}>
            <input placeholder={ui('supportSearchHelp')} readOnly />
            <Search size={16} data-testid="Search__4d85ab" />
          </div>
          <div className="sc-inicio-search-result" onClick={() => onSwitchTab('ayuda')}>
            <span>{ui('supportSampleSearchResult')}</span>
            <ChevronRight
              size={16}
              style={{ color: 'var(--sc-fg-3)' }}
              data-testid="ChevronRight__4d85ab" />
          </div>
        </div>
      </div>
    </>
  );
}

// ---- AYUDA tab ------------------------------------------------------------
// Real Etendo Go documentation — fetched from the published docs site's search
// index (docs/helpDocs.js). No mocked articles.
function HelpPageRow({ page, snippet }) {
  return (
    <a
      className="sc-help-coll link"
      href={docUrl(page.location)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="sc-grow">
        <div className="sc-h-title">{page.title}</div>
        {snippet ? <div className="sc-h-desc">{snippet}…</div> : null}
      </div>
      <ExternalLink
        size={16}
        style={{ color: 'var(--sc-fg-3)', flexShrink: 0 }}
        data-testid="ExternalLink__4d85ab" />
    </a>
  );
}

function AyudaTabHeader({ showCollectionPages, activeCollection, onBack, onClose, ui }) {
  return (
    <div className="sc-head" style={{ paddingBottom: 8 }}>
      {showCollectionPages ? (
        <button className="sc-back" onClick={onBack} aria-label={ui('back')}>
          <ChevronRight
            size={16}
            style={{ transform: 'rotate(180deg)' }}
            data-testid="ChevronRight__4d85ab" />
        </button>
      ) : null}
      <div className="sc-grow" style={{ textAlign: 'center' }}>
        <h1 className="sc-head-title" style={{ fontSize: 16, lineHeight: '24px' }}>
          {showCollectionPages ? activeCollection.title : ui('supportTabHelp')}
        </h1>
      </div>
      <div className="sc-head-actions" style={{ position: 'absolute', top: 14, right: 14 }}>
        <button className="sc-head-icn" onClick={onClose} aria-label={ui('close')}><X size={16} data-testid="X__4d85ab" /></button>
      </div>
    </div>
  );
}

function AyudaTabResults({ results, query, ui }) {
  if (results.length === 0) {
    return <div className="sc-help-empty">{ui('supportNoArticlesFor', { query })}</div>;
  }
  return results.map((r) => (
    <HelpPageRow key={r.location} page={r} snippet={r.snippet} data-testid="HelpPageRow__4d85ab" />
  ));
}

function AyudaTabCollectionsList({ collections, onSelectCollection, ui }) {
  return (
    <div className="sc-help-collections">
      <div className="sc-help-count">{ui('supportCollectionsCount', { count: collections.length })}</div>
      {collections.map((c) => (
        <div key={c.id} className="sc-help-coll" onClick={() => onSelectCollection(c)} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelectCollection(c)}>
          <div className="sc-grow">
            <div className="sc-h-title">{c.title}</div>
            <div className="sc-h-count-s">{ui('supportArticlesCount', { count: c.pages.length })}</div>
          </div>
          <ChevronRight
            size={16}
            style={{ color: 'var(--sc-fg-3)', flexShrink: 0 }}
            data-testid="ChevronRight__4d85ab" />
        </div>
      ))}
    </div>
  );
}

function AyudaTabBody({
  error, docs, showSearchResults, showCollectionPages, query, results, activeCollection, collections, onSelectCollection, ui,
}) {
  if (error) return <div className="sc-help-empty">{ui('supportDocsLoadError')}</div>;
  if (!docs) return <div className="sc-help-empty">{ui('supportDocsLoading')}</div>;

  if (showSearchResults) {
    return (
      <div className="sc-help-collections">
        <div className="sc-help-count">{ui('supportResultsCount', { count: results.length })}</div>
        <AyudaTabResults
          results={results}
          query={query}
          ui={ui}
          data-testid="AyudaTabResults__4d85ab" />
      </div>
    );
  }

  if (showCollectionPages) {
    return (
      <div className="sc-help-collections">
        <div className="sc-help-count">{ui('supportArticlesCount', { count: activeCollection.pages.length })}</div>
        {activeCollection.pages.map((p) => (
          <HelpPageRow key={p.location} page={p} data-testid="HelpPageRow__4d85ab" />
        ))}
      </div>
    );
  }

  return (
    <AyudaTabCollectionsList
      collections={collections}
      onSelectCollection={onSelectCollection}
      ui={ui}
      data-testid="AyudaTabCollectionsList__4d85ab" />
  );
}

function AyudaTab({ onClose }) {
  const ui = useUI();
  const [docs, setDocs] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [query, setQuery] = React.useState('');
  const [activeCollection, setActiveCollection] = React.useState(null);

  React.useEffect(() => {
    fetchHelpDocs()
      .then(setDocs)
      .catch((e) => setError(e.message));
  }, []);

  const collections = React.useMemo(() => (docs ? groupHelpCollections(docs) : []), [docs]);
  const results = React.useMemo(
    () => (docs && query.trim() ? searchHelpDocs(docs, query) : []),
    [docs, query],
  );

  const showSearchResults = query.trim().length > 0;
  const showCollectionPages = !showSearchResults && activeCollection;

  return (
    <>
      <AyudaTabHeader
        showCollectionPages={showCollectionPages}
        activeCollection={activeCollection}
        onBack={() => setActiveCollection(null)}
        onClose={onClose}
        ui={ui}
        data-testid="AyudaTabHeader__4d85ab" />
      <div className="sc-help-search">
        <div className="sc-help-search-inner">
          <Search size={16} data-testid="Search__4d85ab" />
          <input
            placeholder={ui('supportSearchArticles')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <AyudaTabBody
        error={error}
        docs={docs}
        showSearchResults={showSearchResults}
        showCollectionPages={showCollectionPages}
        query={query}
        results={results}
        activeCollection={activeCollection}
        collections={collections}
        onSelectCollection={setActiveCollection}
        ui={ui}
        data-testid="AyudaTabBody__4d85ab" />
    </>
  );
}

// ---- MENSAJES tab wrapper -------------------------------------------------
function MensajesTab({ conversations, activeConversationId, isLoading, onSelect, onStartChat, onClose, unreadCount }) {
  const ui = useUI();
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredConversations = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const subject = (conv.subject || ui('supportDefaultSubject')).toLowerCase();
      const preview = (conv.lastMessage || conv.preview || '').toLowerCase();
      // Customers now get the Jira ticket key (e.g. "EGS-165") via the JSM notification email,
      // so they may search for it directly instead of remembering the chat's own subject/preview.
      const ticketKey = (conv.jiraTicketKey || '').toLowerCase();
      return subject.includes(q) || preview.includes(q) || ticketKey.includes(q);
    });
  }, [conversations, searchQuery, ui]);

  const hasNoSearchResults = searchQuery.trim().length > 0
    && conversations.length > 0
    && filteredConversations.length === 0;

  return (
    <>
      <div className="sc-head" style={{ paddingBottom: 12 }}>
        <div className="sc-grow" style={{ textAlign: 'center' }}>
          <h1 className="sc-head-title" style={{ fontSize: 16, lineHeight: '24px' }}>{ui('supportTabMessages')}</h1>
        </div>
        <div className="sc-head-actions" style={{ position: 'absolute', top: 14, right: 14 }}>
          <button className="sc-head-icn" onClick={onClose} aria-label={ui('close')}><X size={16} data-testid="X__4d85ab" /></button>
        </div>
      </div>
      {conversations.length > 0 && (
        <div className="sc-msg-search">
          <div className="sc-msg-search-inner">
            <Search size={16} data-testid="Search__4d85ab" />
            <input
              placeholder={ui('supportSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}
      {hasNoSearchResults ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--sc-fg-3)' }}>
            <div style={{ fontSize: 13, lineHeight: '18px' }}>
              {ui('supportNoSearchResults')}
            </div>
          </div>
        </div>
      ) : (
        <TicketList
          conversations={filteredConversations}
          activeConversationId={activeConversationId}
          isLoading={isLoading}
          onSelect={onSelect}
          onStartChat={onStartChat}
          data-testid="TicketList__4d85ab" />
      )}
    </>
  );
}

// ---- Main widget ----------------------------------------------------------
export function SupportChatWidget() {
  const ui = useUI();
  const TABS = [
    { id: 'inicio',    icon: <Home size={20} data-testid="Home__4d85ab" />,          label: ui('supportTabHome') },
    { id: 'mensajes',  icon: <MessageCircle size={20} data-testid="MessageCircle__4d85ab" />, label: ui('supportTabMessages') },
    { id: 'ayuda',     icon: <HelpCircle size={20} data-testid="HelpCircle__4d85ab" />,    label: ui('supportTabHelp') },
  ];
  const { state, actions } = useSupportChat();
  const {
    isOpen, activeTab, conversations, activeConversationId,
    messages, input, isSending, isLoadingConversations,
    isLoadingMessages, pendingFiles, unreadCount,
  } = state;
  // Copilot's own panel docks to the same bottom-right corner — shift ours clear of it
  // while both are open instead of the two floating windows stacking on top of each other.
  const { isOpen: copilotIsOpen } = useCopilot();

  const [isExpanded, setIsExpanded] = React.useState(false);

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  React.useEffect(() => {
    if (isOpen && activeTab === 'mensajes') {
      actions.loadConversations();
    }
  }, [isOpen, activeTab]);

  React.useEffect(() => {
    if (isOpen && activeConversationId && activeConversationId !== 'new' && messages.length === 0) {
      actions.loadMessages(activeConversationId);
    }
  }, [isOpen, activeConversationId]);

  const handleStartChat = () => {
    // Deliberately always a fresh conversation (own id, own ticket) — the user may have
    // several open conversations at once, each pinned to a different Jira ticket. Continuity
    // is handled by navigating to an EXISTING conversation from Mensajes (handleSelectTicket
    // below), not by guessing which one to resume from here.
    actions.selectConversation('new');
    actions.setTab('mensajes');
  };

  const handleSelectTicket = (id) => {
    actions.selectConversation(id);
  };

  const handleSend = (text, files) => {
    const attachments = files || pendingFiles;
    if (activeConversationId && activeConversationId !== 'new') {
      actions.sendMessage(activeConversationId, text || input, attachments);
    } else {
      actions.startConversation(text || input, attachments);
    }
  };

  const handleSubmitRating = async (score, comment) => {
    if (activeConversationId && activeConversationId !== 'new') {
      await actions.submitRating(activeConversationId, score, comment);
    }
  };

  const handleDismissRating = () => {
    if (activeConversationId && activeConversationId !== 'new') {
      actions.dismissRating(activeConversationId);
    }
  };

  const handleCloseConversation = () => {
    if (activeConversationId && activeConversationId !== 'new') {
      actions.closeConversation(activeConversationId);
    }
  };

  const handleReopenConversation = () => {
    // Reopen the SAME conversation (same thread, same ADK session — the agent keeps the prior
    // context automatically) via the backend's /reopen endpoint. This used to just call
    // handleStartChat(), which opened an unrelated brand-new conversation instead — the whole
    // point of "Hacer seguimiento" is continuity, not a fresh start.
    if (activeConversationId && activeConversationId !== 'new') {
      actions.reopenConversation(activeConversationId);
    }
  };

  const showConversation = activeConversationId !== null;

  let panelContent;
  if (showConversation) {
    panelContent = (
      <ConversationView
        conversation={activeConversation}
        messages={messages}
        input={input}
        onInputChange={actions.setInput}
        onSend={handleSend}
        isSending={isSending}
        isLoadingMessages={isLoadingMessages}
        pendingFiles={pendingFiles}
        onAddFile={actions.addPendingFile}
        onRemoveFile={actions.removePendingFile}
        onBack={() => {
          actions.selectConversation(null);
          actions.setTab('mensajes');
        }}
        onClose={actions.close}
        onSubmitRating={handleSubmitRating}
        onDismissRating={handleDismissRating}
        onCloseConversation={handleCloseConversation}
        onReopenConversation={handleReopenConversation}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded((v) => !v)}
        getLocalImageUrl={actions.getLocalImageUrl}
        data-testid="ConversationView__4d85ab" />
    );
  } else if (activeTab === 'inicio') {
    panelContent = (
      <InicioTab
        onStartChat={handleStartChat}
        onSwitchTab={actions.setTab}
        onClose={actions.close}
        data-testid="InicioTab__4d85ab" />
    );
  } else if (activeTab === 'mensajes') {
    panelContent = (
      <MensajesTab
        conversations={conversations}
        activeConversationId={activeConversationId}
        isLoading={isLoadingConversations}
        onSelect={handleSelectTicket}
        onStartChat={handleStartChat}
        onClose={actions.close}
        unreadCount={unreadCount}
        data-testid="MensajesTab__4d85ab" />
    );
  } else {
    panelContent = <AyudaTab onClose={actions.close} data-testid="AyudaTab__4d85ab" />;
  }

  if (!isOpen) {
    // Once dismissed, stays hidden for this page load only (in-memory state — see
    // SupportChatContext) since it can sit on top of another window's own buttons. Reloading
    // the page or reopening the chat brings it back; "Ayuda y soporte" in the left nav is a
    // second, always-reachable way into this same chat, so hiding it here strands no one.
    if (state.fabDismissed) return null;
    return (
      <div className="sc-fab-wrap">
        <button className="sc-fab" onClick={actions.open} aria-label={ui('supportOpenAria')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {unreadCount > 0 && (
            <span className="sc-fab-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
        <button
          type="button"
          className="sc-fab-dismiss"
          onClick={actions.dismissFab}
          aria-label={ui('supportDismissFab')}
          title={ui('supportDismissFab')}
        >
          <X size={12} data-testid="X__4d85ab" />
        </button>
      </div>
    );
  }

  return (
    <div className="sc-overlay" aria-modal="true" role="dialog">
      <div className={`sc-panel${isExpanded ? ' expanded' : ''}${copilotIsOpen ? ' sc-panel--copilot-open' : ''}`}>
        <div className="sc-scroll">
          {panelContent}
        </div>

        {!showConversation && (
          <div className="sc-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`sc-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => actions.setTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.id === 'mensajes' && unreadCount > 0 && <span className="sc-ind-dot" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
