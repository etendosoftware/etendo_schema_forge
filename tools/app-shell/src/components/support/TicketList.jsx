import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { ValerIATile } from './ValerIATile.jsx';

function relativeTime(iso, ui) {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return ui('supportTimeNow');
    if (mins < 60) return ui('supportTimeMinutesAgo', { n: mins });
    const hours = Math.floor(mins / 60);
    const remainderMins = mins % 60;
    // Keep minute precision for a few hours so entries in the same hour don't
    // all collapse into the exact same label (e.g. "hace 58m" vs "hace 72m").
    if (hours < 6) {
      return remainderMins > 0
        ? ui('supportTimeHoursMinutesAgo', { h: hours, m: remainderMins })
        : ui('supportTimeHoursAgo', { h: hours });
    }
    if (hours < 24) return ui('supportTimeHoursAgo', { h: hours });
    const days = Math.floor(hours / 24);
    if (days === 1) return ui('supportTimeYesterday');
    if (days < 7) return ui('supportTimeDaysAgo', { d: days });
    const weeks = Math.floor(days / 7);
    return ui('supportTimeWeeksAgo', { w: weeks });
  } catch {
    return '';
  }
}

// Relative labels ("hace 1h 20m") only stay accurate if something re-renders the
// list as time passes — without this, a label computed at the last data change
// silently goes stale while the widget sits open with no new activity.
function useTick(intervalMs) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export function TicketList({ conversations, activeConversationId, isLoading, onSelect, onStartChat }) {
  const ui = useUI();
  useTick(30000);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center',
        fontSize: 13, color: 'var(--sc-fg-3)', padding: '24px' }}>
        {ui('loading')}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--sc-fg-3)' }}>
          <div style={{ fontSize: 13, lineHeight: '18px' }}>
            {ui('supportNoConversations')}
          </div>
        </div>
        {onStartChat && (
          <button className="sc-ask-cta" onClick={onStartChat}>
            {ui('supportAskQuestionCta')} <ChevronRight
            size={12}
            style={{ transform: 'rotate(0deg)' }}
            data-testid="ChevronRight__258569" />
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
                    : <ValerIATile size={28} radius={999} data-testid="ValerIATile__258569" />
                  }
                </div>
                <div className="sc-grow">
                  <div className="sc-ticket-head">
                    <div className="sc-t-title">{conv.subject || ui('supportDefaultSubject')}</div>
                    <div className="sc-t-time">{relativeTime(conv.lastActivity || conv.updatedAt, ui)}</div>
                  </div>
                  <div className="sc-t-preview">{conv.lastMessage || conv.preview || ''}</div>
                  <span className={`sc-t-status ${conv.status === 'closed' ? 'closed' : (conv.unread ? 'unread' : (conv.status || 'open'))}`}>
                    {conv.unread && conv.status !== 'closed' && (
                      <><svg width="6" height="6" viewBox="0 0 6 6" style={{ flexShrink: 0 }}>
                        <circle cx="3" cy="3" r="3" fill="currentColor" />
                      </svg>{ui('supportNewMessageBadge')}</>
                    )}
                    {!conv.unread && (!conv.status || conv.status === 'open') && (
                      <><svg width="6" height="6" viewBox="0 0 6 6" style={{ flexShrink: 0 }}>
                        <circle cx="3" cy="3" r="3" fill="currentColor" />
                      </svg>{ui('supportStatusOpen')}</>
                    )}
                    {conv.status === 'closed'  && ui('supportStatusClosed')}
                    {!conv.unread && conv.status === 'waiting' && ui('supportStatusWaiting')}
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
            {ui('supportAskQuestionCta')} <ChevronRight size={12} data-testid="ChevronRight__258569" />
          </button>
        </div>
      )}
    </div>
  );
}
