import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { ValerIATile } from './ValerIATile.jsx';

function relativeTime(iso) {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days}d`;
    const weeks = Math.floor(days / 7);
    return `hace ${weeks} sem`;
  } catch {
    return '';
  }
}

export function TicketList({ conversations, activeConversationId, isLoading, onSelect, onStartChat }) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center',
        fontSize: 13, color: 'var(--sc-fg-3)', padding: '24px' }}>
        Cargando…
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--sc-fg-3)' }}>
          <div style={{ fontSize: 13, lineHeight: '18px' }}>
            Aún no tienes conversaciones.<br />Empieza una nueva con ValerIA.
          </div>
        </div>
        {onStartChat && (
          <button className="sc-ask-cta" onClick={onStartChat}>
            Hacer una pregunta <ChevronRight size={12} style={{ transform: 'rotate(0deg)' }} />
          </button>
        )}
      </div>
    );
  }

  const isHumanConv = (conv) => conv.assigneeKind === 'human';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div className="sc-ticket-list">
          {conversations.map((conv) => {
            const human = isHumanConv(conv);
            return (
              <div
                key={conv.id}
                className={`sc-ticket-row${conv.unread ? ' unread' : ''}`}
                onClick={() => onSelect(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect(conv.id)}
              >
                <div className={`sc-ticket-av${human ? ' human' : ''}`}>
                  {human
                    ? (conv.assigneeInitials || (conv.assigneeName?.[0]) || 'A')
                    : <ValerIATile size={28} radius={999} />
                  }
                </div>
                <div className="sc-grow">
                  <div className="sc-ticket-head">
                    <div className="sc-t-title">{conv.subject || 'Conversación'}</div>
                    <div className="sc-t-time">{relativeTime(conv.lastActivity || conv.updatedAt)}</div>
                  </div>
                  <div className="sc-t-preview">{conv.lastMessage || conv.preview || ''}</div>
                  <span className={`sc-t-status ${conv.status === 'closed' ? 'closed' : (conv.unread ? 'unread' : (conv.status || 'open'))}`}>
                    {conv.unread && conv.status !== 'closed' && (
                      <><svg width="6" height="6" viewBox="0 0 6 6" style={{ flexShrink: 0 }}>
                        <circle cx="3" cy="3" r="3" fill="currentColor" />
                      </svg>Nuevo mensaje</>
                    )}
                    {!conv.unread && (!conv.status || conv.status === 'open') && (
                      <><svg width="6" height="6" viewBox="0 0 6 6" style={{ flexShrink: 0 }}>
                        <circle cx="3" cy="3" r="3" fill="currentColor" />
                      </svg>Abierto</>
                    )}
                    {conv.status === 'closed'  && 'Cerrado'}
                    {!conv.unread && conv.status === 'waiting' && 'Esperando respuesta'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {onStartChat && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px', flexShrink: 0 }}>
          <button className="sc-ask-cta" onClick={onStartChat}>
            Hacer una pregunta <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
