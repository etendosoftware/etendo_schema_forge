import * as React from 'react';
import { Home, MessageCircle, HelpCircle, ChevronRight, Search, X, ExternalLink } from 'lucide-react';
import { useUI } from '@/i18n';
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
            <div className="sc-av" style={{ background: '#F4F1FD', color: '#4316CA' }}>J</div>
            <div className="sc-av" style={{ background: '#FFF2EE', color: '#EB3A00' }}>L</div>
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
  const showCollectionsList = !showSearchResults && !activeCollection;

  return (
    <>
      <div className="sc-head" style={{ paddingBottom: 8 }}>
        {showCollectionPages ? (
          <button className="sc-back" onClick={() => setActiveCollection(null)} aria-label={ui('back')}>
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
      {error ? (
        <div className="sc-help-empty">{ui('supportDocsLoadError')}</div>
      ) : !docs ? (
        <div className="sc-help-empty">{ui('supportDocsLoading')}</div>
      ) : showSearchResults ? (
        <div className="sc-help-collections">
          <div className="sc-help-count">{ui('supportResultsCount', { count: results.length })}</div>
          {results.length === 0 ? (
            <div className="sc-help-empty">{ui('supportNoArticlesFor', { query })}</div>
          ) : (
            results.map((r) => <HelpPageRow
              key={r.location}
              page={r}
              snippet={r.snippet}
              data-testid="HelpPageRow__4d85ab" />)
          )}
        </div>
      ) : showCollectionPages ? (
        <div className="sc-help-collections">
          <div className="sc-help-count">{ui('supportArticlesCount', { count: activeCollection.pages.length })}</div>
          {activeCollection.pages.map((p) => (
            <HelpPageRow key={p.location} page={p} data-testid="HelpPageRow__4d85ab" />
          ))}
        </div>
      ) : (
        <div className="sc-help-collections">
          <div className="sc-help-count">{ui('supportCollectionsCount', { count: collections.length })}</div>
          {collections.map((c) => (
            <div key={c.id} className="sc-help-coll" onClick={() => setActiveCollection(c)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setActiveCollection(c)}>
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
      )}
    </>
  );
}

// ---- MENSAJES tab wrapper -------------------------------------------------
function MensajesTab({ conversations, activeConversationId, isLoading, onSelect, onStartChat, onClose, unreadCount }) {
  const ui = useUI();
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
      <TicketList
        conversations={conversations}
        activeConversationId={activeConversationId}
        isLoading={isLoading}
        onSelect={onSelect}
        onStartChat={onStartChat}
        data-testid="TicketList__4d85ab" />
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
    handleStartChat();
  };

  const showConversation = activeConversationId !== null;

  if (!isOpen) {
    return (
      <button className="sc-fab" onClick={actions.open} aria-label={ui('supportOpenAria')}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {unreadCount > 0 && (
          <span className="sc-fab-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
    );
  }

  return (
    <div className="sc-overlay" aria-modal="true" role="dialog">
      <div className={`sc-panel${isExpanded ? ' expanded' : ''}`}>
        <div className="sc-scroll">
          {showConversation ? (
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
              data-testid="ConversationView__4d85ab" />
          ) : activeTab === 'inicio' ? (
            <InicioTab
              onStartChat={handleStartChat}
              onSwitchTab={actions.setTab}
              onClose={actions.close}
              data-testid="InicioTab__4d85ab" />
          ) : activeTab === 'mensajes' ? (
            <MensajesTab
              conversations={conversations}
              activeConversationId={activeConversationId}
              isLoading={isLoadingConversations}
              onSelect={handleSelectTicket}
              onStartChat={handleStartChat}
              onClose={actions.close}
              unreadCount={unreadCount}
              data-testid="MensajesTab__4d85ab" />
          ) : (
            <AyudaTab onClose={actions.close} data-testid="AyudaTab__4d85ab" />
          )}
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
