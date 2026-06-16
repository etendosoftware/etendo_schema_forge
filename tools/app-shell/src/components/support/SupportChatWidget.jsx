import * as React from 'react';
import { Home, MessageCircle, HelpCircle, ChevronRight, Search, X } from 'lucide-react';
import { useSupportChat } from './SupportChatContext.jsx';
import { ConversationView } from './ConversationView.jsx';
import { TicketList } from './TicketList.jsx';
import { ValerIATile } from './ValerIATile.jsx';
import './support-chat.css';

export { ValerIATile };

// ---- INICIO tab -----------------------------------------------------------
function InicioTab({ onStartChat, onSwitchTab, onClose }) {
  return (
    <>
      <div className="sc-head dark sc-inicio-hero">
        <div className="sc-grow">
          <ValerIATile size={28} radius={6} />
          <h1 className="sc-head-title sc-inicio-hero-title">
            ¡Hola!<br />¿Cómo podemos<br />ayudarte?
          </h1>
        </div>
        <div className="sc-head-actions" style={{ position: 'absolute', top: 14, right: 14 }}>
          <button className="sc-head-icn" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="sc-entry-stack">
        <div className="sc-entry-card featured" onClick={onStartChat} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onStartChat()}>
          <div className="sc-grow">
            <div className="sc-e-title">Hacer una pregunta</div>
            <div className="sc-e-sub">Nuestro bot y nuestro equipo te ayudarán</div>
          </div>
          <div className="sc-avatars">
            <div className="sc-av" style={{ background: '#F4F1FD', color: '#4316CA' }}>J</div>
            <div className="sc-av" style={{ background: '#FFF2EE', color: '#EB3A00' }}>L</div>
            <div className="sc-av bot"><ValerIATile size={20} radius={4} /></div>
          </div>
        </div>

        <div className="sc-inicio-search-card" style={{ marginTop: 24 }}>
          <div className="sc-entry-search" onClick={() => onSwitchTab('ayuda')}>
            <input placeholder="Buscar ayuda" readOnly />
            <Search size={16} />
          </div>
          <div className="sc-inicio-search-result" onClick={() => onSwitchTab('ayuda')}>
            <span>Importar la información de tu negocio</span>
            <ChevronRight size={16} style={{ color: 'var(--sc-fg-3)' }} />
          </div>
        </div>
      </div>
    </>
  );
}

// ---- AYUDA tab ------------------------------------------------------------
const HELP_COLLECTIONS = [
  { id: 'primeros-pasos',  title: 'Primeros pasos',                     desc: 'Introducción y guías de inicio', count: 26 },
  { id: 'cuenta',          title: 'Cuenta, empresa y suscripción',       desc: 'Gestiona tu cuenta, empresas, usuarios y suscripción', count: 21 },
  { id: 'contactos',       title: 'Contactos',                           desc: 'Gestión de contactos y portal del cliente', count: 11 },
  { id: 'ventas',          title: 'Ventas',                              desc: 'Facturas de venta, presupuestos, proformas y su configuración', count: 77 },
  { id: 'compras',         title: 'Compras',                             desc: 'Facturas de compra, gastos y proveedores', count: 34 },
  { id: 'tesoreria',       title: 'Tesorería',                           desc: 'Bancos, conciliación y movimientos', count: 19 },
];

function AyudaTab({ onClose }) {
  return (
    <>
      <div className="sc-head" style={{ paddingBottom: 8 }}>
        <div className="sc-grow" style={{ textAlign: 'center' }}>
          <h1 className="sc-head-title" style={{ fontSize: 16, lineHeight: '24px' }}>Ayuda</h1>
        </div>
        <div className="sc-head-actions" style={{ position: 'absolute', top: 14, right: 14 }}>
          <button className="sc-head-icn" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
      </div>
      <div className="sc-help-search">
        <div className="sc-help-search-inner">
          <Search size={16} />
          <input placeholder="Buscar artículos…" />
        </div>
      </div>
      <div className="sc-help-collections">
        <div className="sc-help-count">{HELP_COLLECTIONS.length} colecciones</div>
        {HELP_COLLECTIONS.map((c) => (
          <div key={c.id} className="sc-help-coll">
            <div className="sc-grow">
              <div className="sc-h-title">{c.title}</div>
              <div className="sc-h-desc">{c.desc}</div>
              <div className="sc-h-count-s">{c.count} artículos</div>
            </div>
            <ChevronRight size={16} style={{ color: 'var(--sc-fg-3)', flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </>
  );
}

// ---- MENSAJES tab wrapper -------------------------------------------------
function MensajesTab({ conversations, activeConversationId, isLoading, onSelect, onStartChat, onClose, unreadCount }) {
  return (
    <>
      <div className="sc-head" style={{ paddingBottom: 12 }}>
        <div className="sc-grow" style={{ textAlign: 'center' }}>
          <h1 className="sc-head-title" style={{ fontSize: 16, lineHeight: '24px' }}>Mensajes</h1>
        </div>
        <div className="sc-head-actions" style={{ position: 'absolute', top: 14, right: 14 }}>
          <button className="sc-head-icn" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
      </div>
      <TicketList
        conversations={conversations}
        activeConversationId={activeConversationId}
        isLoading={isLoading}
        onSelect={onSelect}
        onStartChat={onStartChat}
      />
    </>
  );
}

// ---- Main widget ----------------------------------------------------------
const TABS = [
  { id: 'inicio',    icon: <Home size={20} />,          label: 'Inicio' },
  { id: 'mensajes',  icon: <MessageCircle size={20} />, label: 'Mensajes' },
  { id: 'ayuda',     icon: <HelpCircle size={20} />,    label: 'Ayuda' },
];

export function SupportChatWidget() {
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
      <button className="sc-fab" onClick={actions.open} aria-label="Abrir soporte">
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
            />
          ) : activeTab === 'inicio' ? (
            <InicioTab onStartChat={handleStartChat} onSwitchTab={actions.setTab} onClose={actions.close} />
          ) : activeTab === 'mensajes' ? (
            <MensajesTab
              conversations={conversations}
              activeConversationId={activeConversationId}
              isLoading={isLoadingConversations}
              onSelect={handleSelectTicket}
              onStartChat={handleStartChat}
              onClose={actions.close}
              unreadCount={unreadCount}
            />
          ) : (
            <AyudaTab onClose={actions.close} />
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
