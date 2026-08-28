import * as React from 'react';
import { toast } from 'sonner';
import {
  ChevronRight, MoreVertical, X, Plus, ArrowUp, Paperclip,
  Users, CheckCircle, Smile, Maximize2, Minimize2,
} from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { ValerIATile } from './ValerIATile.jsx';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useApiFetch } from '@/auth/useApiFetch';
import { playSendSound, playReceiveSound } from './chatSounds.js';

// Attachments accepted on every input path (file picker AND drag-and-drop):
// images (any subtype) plus a fixed set of common document formats.
// Keep this in sync with the file input's `accept` attribute below.
const ALLOWED_DOC_EXTENSIONS = ['pdf', 'csv', 'txt', 'xlsx', 'docx', 'md'];
const ALLOWED_DOC_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/markdown',
]);

// Real validation for files coming from the picker or drag-and-drop — the
// input's `accept` attribute is only a UI hint and does not block either path.
function isAllowedAttachmentFile(file) {
  if (file.type) {
    if (file.type.startsWith('image/')) return true;
    if (ALLOWED_DOC_MIME_TYPES.has(file.type)) return true;
  }
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  return !!ext && ALLOWED_DOC_EXTENSIONS.includes(ext);
}

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
  '😘','😗','🤗','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😫','😩','🥺','😢',
  '😭','😤','😠','😡','🤬','😈','💀','💩','🤡','👻','🙈','🙉','🙊',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💯','💥','✨','🔥','🎉','🎊','👏',
  '👋','✌️','🤞','👍','👎','🙌','🙏','💪','🤝','✅','❌','⚠️','💬',
  '😺','😸','😻','🙀','😿','😾',
  '🍕','🍔','🌮','🍣','🍦','🎂','☕','🍺','🥂',
  '⚽','🏀','🎮','🎵','🎤','🎸','📱','💻','📷',
  '🌞','⭐','🌈','❄️','⚡','🌸','🌺','🌻','🚀','✈️','🏠',
  '💰','💎','🎁','📚','📝','✉️','🔔',
];

// `\S.*` (not `.+`) after the whitespace run keeps the two quantifiers on disjoint
// character sets, so there's only one way to split a match — avoids the superlinear
// backtracking Sonar flags for adjacent overlapping quantifiers (javascript:S5852).
const HEADING_RE = /^(#{1,3})\s+(\S.*)$/;
const BULLET_RE = /^[-*]\s+(\S.*)$/;
const ORDERED_RE = /^\d+\.\s+(\S.*)$/;

// Zero-width-prefixed marker the backend appends to a message's text (see
// SupportIntegrationClient.SUGGESTS_ESCALATION_MARKER) when the ADK's response for that
// turn set pending_escalation=confirm — i.e. ValerIA just offered to escalate to a human.
// Stripped before rendering; its presence renders the one-click escalate button instead.
const SUGGESTS_ESCALATION_MARKER = '​##SUGGESTS_ESCALATION##';

// Consumes consecutive lines matching `re` (a bullet or ordered list marker) starting at
// `startIndex`, returning the rendered <ul>/<ol> node and the index of the first line past
// the list. Keyed by item text (not position) — list items are one-off parsed strings with no
// natural id, but content is stable within a single render and avoids an array-index key.
function consumeList(lines, startIndex, re, TagName) {
  let i = startIndex;
  const items = [];
  while (i < lines.length && re.test(lines[i].trim())) {
    items.push(lines[i].trim().match(re)[1]);
    i++;
  }
  const node = (
    <TagName key={`list-${startIndex}`} data-testid="TagName__50ab90">
      {items.map((item) => <li key={item}>{renderInline(item)}</li>)}
    </TagName>
  );
  return { node, nextIndex: i };
}

// Consumes consecutive non-blank, non-special lines starting at `startIndex` into a single
// paragraph (joined with <br/>), returning the rendered node and the next unconsumed index.
function consumeParagraph(lines, startIndex) {
  let i = startIndex;
  const paraLines = [];
  while (i < lines.length && lines[i].trim() !== ''
      && !HEADING_RE.test(lines[i].trim())
      && !BULLET_RE.test(lines[i].trim())
      && !ORDERED_RE.test(lines[i].trim())) {
    paraLines.push(lines[i]);
    i++;
  }
  const node = (
    <p key={`para-${startIndex}`}>
      {paraLines.map((l, j) => (
        <React.Fragment key={l}>
          {j > 0 && <br />}
          {renderInline(l)}
        </React.Fragment>
      ))}
    </p>
  );
  return { node, nextIndex: i };
}

// Block-level parser: headings, bullet/ordered lists, paragraphs — the same subset
// _md_to_adf_content (jira_client.py) already parses for the Jira side. The AI's markdown
// style isn't fully consistent between turns (sometimes **bold** + numbered lists, sometimes
// # headings + *italic*), so the chat bubble needs to understand the same range Jira does,
// or some replies show raw '#'/'*' characters instead of formatted text.
function renderText(txt) {
  if (!txt) return null;
  const lines = txt.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === '') { i++; continue; }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
      blocks.push(<p key={`h-${i}`}><strong>{renderInline(heading[2])}</strong></p>);
      i++;
      continue;
    }

    if (BULLET_RE.test(trimmed)) {
      const { node, nextIndex } = consumeList(lines, i, BULLET_RE, 'ul');
      blocks.push(node);
      i = nextIndex;
      continue;
    }

    if (ORDERED_RE.test(trimmed)) {
      const { node, nextIndex } = consumeList(lines, i, ORDERED_RE, 'ol');
      blocks.push(node);
      i = nextIndex;
      continue;
    }

    const { node, nextIndex } = consumeParagraph(lines, i);
    blocks.push(node);
    i = nextIndex;
  }
  return blocks;
}

// Matches **bold**, *italic*, `code`, and markdown links [label](url) — links restricted to
// http(s) URLs only, so a crafted `javascript:`/`data:` href in a reply (AI-generated or
// relayed from a Jira comment) can never end up as a clickable link. **bold** is tried before
// *italic* so a bold span isn't misread as italic-star + literal star. Every span is length-capped
// (no plain `+`) — chat text is never a legitimate multi-KB bold/code run, and the cap bounds the
// worst-case backtracking cost of the two star-prefixed alternatives to a constant, regardless of
// message length (javascript:S5852).
const INLINE_PATTERN =
  /\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|`([^`\n]{1,500})`|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/g;

function renderInline(txt) {
  const nodes = [];
  let lastIndex = 0;
  let match;
  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(txt)) !== null) {
    if (match.index > lastIndex) nodes.push(txt.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={nodes.length}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={nodes.length}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      nodes.push(<code key={nodes.length}>{match[3]}</code>);
    } else {
      nodes.push(
        <a key={nodes.length} href={match[5]} target="_blank" rel="noopener noreferrer">
          {match[4]}
        </a>
      );
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < txt.length) nodes.push(txt.slice(lastIndex));
  return nodes;
}

function Bubble({ message, onQuickReply, getLocalImageUrl }) {
  const ui = useUI();
  const role = message.sender;
  const isHumanAgent = role === 'agent' || role === 'human';
  const ts = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const fullTs = ts ? `${ui('supportToday')} · ${ts}` : undefined;
  const bubbleRole = role === 'user' ? 'user' : 'bot';
  const suggestsEscalation = typeof message.text === 'string' && message.text.includes(SUGGESTS_ESCALATION_MARKER);
  const displayText = suggestsEscalation
    ? message.text.split(SUGGESTS_ESCALATION_MARKER).join('')
    : message.text;

  return (
    <div className={`sc-msg ${bubbleRole}`} data-time={fullTs}>
      {role !== 'user' && (
        <div className={`sc-bub-av${isHumanAgent ? ' human' : ''}`}>
          {isHumanAgent
            ? (message.senderInitials || message.senderName?.[0] || 'A')
            : <ValerIATile size={28} radius={999} data-testid="ValerIATile__50ab90" />
          }
        </div>
      )}
      <div className="sc-bubble">
        {message.typing ? (
          <span className="sc-typing"><i /><i /><i /></span>
        ) : (
          <>
            {renderText(displayText)}
            {message.attachments?.length > 0 && (
              <div className="sc-att-list">
                {message.attachments.map((a) => (
                  <AttachmentItem
                    key={a.id || a.filename || a.name}
                    attachment={a}
                    ui={ui}
                    getLocalImageUrl={getLocalImageUrl}
                    data-testid="AttachmentItem__50ab90" />
                ))}
              </div>
            )}
            {message.quickReplies?.length > 0 && (
              <div className="sc-quick-replies">
                {message.quickReplies.map((q) => (
                  <button key={q} onClick={() => onQuickReply?.(q)}>{q}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Renders one attachment on a message bubble:
// - own outgoing image (no `id` — the server never stores the raw bytes for
//   attachments the user sends, only `{filename, mimeType}`) → local blob URL
//   cached at pick-time by SupportChatContext, matched by filename. No fetch.
// - inbound image/*   → authenticated fetch → blob URL → <img> thumbnail
// - allowed non-image (pdf/csv/txt/xlsx/docx) → authenticated fetch → download link
// - anything else with a known mimeType (e.g. a video a human agent attached
//   directly in Jira) → neutral "unsupported" fallback, no fetch attempted
// - no id/mimeType and no matching local preview (legacy attachment) → plain filename
function AttachmentItem({ attachment, ui, getLocalImageUrl }) {
  const apiFetch = useApiFetch();
  const [blobUrl, setBlobUrl] = React.useState(null);
  const [status, setStatus] = React.useState('idle'); // idle | loading | ready | error
  const name = attachment.filename || attachment.name || '';
  const mimeType = attachment.mimeType || '';
  const isImage = mimeType.startsWith('image/');
  const isAllowedOther = ALLOWED_DOC_MIME_TYPES.has(mimeType);
  const canFetch = Boolean(attachment.id) && (isImage || isAllowedOther);
  const isUnsupported = Boolean(mimeType) && !isImage && !isAllowedOther;
  const localImageUrl = isImage && !attachment.id ? getLocalImageUrl?.(name) : null;

  React.useEffect(() => {
    if (!canFetch) return undefined;
    let currentUrl = null;
    let cancelled = false;
    setStatus('loading');
    apiFetch(`/sws/support/attachments/${attachment.id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch attachment');
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setBlobUrl(currentUrl);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [canFetch, attachment.id, apiFetch]);

  if (isUnsupported) {
    return (
      <div className="sc-att sc-att-unsupported">
        <Paperclip size={14} data-testid="Paperclip__50ab90" />
        <span className="sc-a-name">{ui('supportAttachmentUnsupported')}</span>
      </div>
    );
  }

  if (isImage) {
    const readyUrl = localImageUrl || (status === 'ready' ? blobUrl : null);
    if (readyUrl) {
      return (
        <a href={readyUrl} target="_blank" rel="noopener noreferrer" className="sc-att-img-link">
          <img src={readyUrl} alt={name} className="sc-att-img" />
        </a>
      );
    }
    return (
      <div className="sc-att">
        <Paperclip size={14} data-testid="Paperclip__50ab90" />
        <span className="sc-a-name">{name}</span>
      </div>
    );
  }

  if (canFetch) {
    const handleDownload = () => {
      if (!blobUrl) return;
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    return (
      <div className="sc-att">
        <Paperclip size={14} data-testid="Paperclip__50ab90" />
        <button
          type="button"
          className="sc-a-name sc-att-download"
          disabled={status !== 'ready'}
          onClick={handleDownload}
        >
          {name}
        </button>
      </div>
    );
  }

  return (
    <div className="sc-att">
      <Paperclip size={14} data-testid="Paperclip__50ab90" />
      <span className="sc-a-name">{name}</span>
    </div>
  );
}

function PendingAttachmentChip({ file, onRemove }) {
  return (
    <div className="sc-att-chip">
      <div className="sc-a-thumb">
        <Paperclip size={12} data-testid="Paperclip__50ab90" />
      </div>
      <span className="sc-a-name">{file.name}</span>
      <span style={{ color: 'var(--sc-fg-3)', fontSize: 11 }}>
        · {(file.size / 1024).toFixed(0)} KB
      </span>
      <span className="sc-x" onClick={onRemove}>
        <X size={12} data-testid="X__50ab90" />
      </span>
    </div>
  );
}

function CSATCard({ onSubmit, onDismiss }) {
  const ui = useUI();
  const [rating, setRating] = React.useState(null);
  const [comment, setComment] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const faces = ['😞', '😐', '🙂', '😄', '🤩'];

  const handleSubmit = async () => {
    if (!rating || submitting) return;
    setSubmitting(true);
    try { await onSubmit(rating, comment); } finally { setSubmitting(false); }
  };

  return (
    <div className="sc-csat-card">
      <div className="sc-csat-q">{ui('supportRateExperience')}</div>
      <div className="sc-csat-sub">{ui('supportFeedbackHelps')}</div>
      <div className="sc-csat-faces">
        {faces.map((f, i) => (
          <button
            key={f}
            className={`sc-csat-face${rating === i + 1 ? ' selected' : ''}`}
            onClick={() => setRating(i + 1)}
            aria-label={ui('supportRatingAriaLabel', { n: i + 1 })}
          >
            {f}
          </button>
        ))}
      </div>
      {rating != null && (
        <>
          <textarea
            placeholder={ui('supportAddComment')}
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 280))}
            maxLength={280}
          />
          <div className="sc-csat-foot">
            <button className="sc-btn-tertiary" onClick={onDismiss}>{ui('supportLater')}</button>
            <button className="sc-btn-primary" onClick={handleSubmit} disabled={submitting}>
              {ui('supportSubmitRating')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ConversationMessageItem({ message, index, messages, seenCount, dateLocale, onQuickReply, ui, getLocalImageUrl }) {
  if (message.handover) {
    return (
      <div className="sc-handover">
        <div className="sc-handover-icn"><Users size={16} data-testid="Users__50ab90" /></div>
        <div>
          <div className="sc-handover-txt">
            {ui('supportHandoverIntro', { name: message.agentName })}
          </div>
          <div className="sc-handover-sub">{ui('supportHandoverStatus')}</div>
        </div>
      </div>
    );
  }
  const prev = messages[index - 1];
  const mDate = message.timestamp ? new Date(message.timestamp).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) : null;
  const prevDate = prev?.timestamp ? new Date(prev.timestamp).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) : null;
  const showDivider = mDate && mDate !== prevDate;
  // Show "Nuevos" before the first message that arrived after the conversation was opened
  const showNewDivider = seenCount !== null && index === seenCount && messages.length > seenCount;
  return (
    <>
      {showNewDivider && (
        <div className="sc-new-divider"><span>{ui('supportNewDivider')}</span></div>
      )}
      {showDivider && !showNewDivider && (
        <div className="sc-day-divider"><span>{mDate}</span></div>
      )}
      <Bubble
        message={message}
        onQuickReply={onQuickReply}
        getLocalImageUrl={getLocalImageUrl}
        data-testid="Bubble__50ab90" />
    </>
  );
}

function ConvMeta({ isClosed, isHuman, ui }) {
  if (isClosed) return ui('supportConversationClosedMeta');
  if (isHuman) return <><span className="sc-typing-dot" />{ui('supportActiveNow')}</>;
  return null;
}

function ConversationHeader({
  onBack, isHuman, isClosed, conversation, assigneeName, isExpanded, onToggleExpand,
  menuOpen, onToggleMenu, onCloseConversation, onClose, menuRef, ui,
}) {
  return (
    <div className="sc-conv-head">
      <button className="sc-back" onClick={onBack} aria-label={ui('back')}>
        <ChevronRight
          size={16}
          style={{ transform: 'rotate(180deg)' }}
          data-testid="ChevronRight__50ab90" />
      </button>
      <div className="sc-conv-av-wrap">
        <div className={`sc-conv-av${isHuman ? ' human' : ''}`}>
          {isHuman
            ? (conversation?.assigneeInitials || assigneeName[0])
            : <ValerIATile size={32} radius={999} data-testid="ValerIATile__50ab90" />
          }
        </div>
        {!isClosed && <div className="sc-status-dot" />}
      </div>
      <div className="sc-grow">
        <div className="sc-conv-name">{assigneeName}</div>
        <div className="sc-conv-meta">
          {conversation?.jiraTicketKey ? conversation.jiraTicketKey : (
            <ConvMeta
              isClosed={isClosed}
              isHuman={isHuman}
              ui={ui}
              data-testid="ConvMeta__50ab90" />
          )}
        </div>
      </div>
      <div className="sc-conv-actions" ref={menuRef} style={{ position: 'relative' }}>
        <button
          className="sc-head-icn"
          onClick={onToggleExpand}
          aria-label={isExpanded ? ui('collapse') : ui('expand')}
          title={isExpanded ? ui('collapse') : ui('expand')}
        >
          {isExpanded ? <Minimize2 size={16} data-testid="Minimize2__50ab90" /> : <Maximize2 size={16} data-testid="Maximize2__50ab90" />}
        </button>
        {conversation && !isClosed && (
          <>
            <button
              className="sc-head-icn"
              aria-label={ui('moreOptions')}
              onClick={onToggleMenu}
            >
              <MoreVertical size={16} data-testid="MoreVertical__50ab90" />
            </button>
            {menuOpen && (
              <div className="sc-head-menu">
                <button
                  className="danger"
                  onClick={onCloseConversation}
                >
                  {ui('supportCloseConversation')}
                </button>
              </div>
            )}
          </>
        )}
        <button className="sc-head-icn" onClick={onClose} aria-label={ui('close')}><X size={16} data-testid="X__50ab90" /></button>
      </div>
    </div>
  );
}

export function ConversationView({
  conversation,
  messages,
  input,
  onInputChange,
  onSend,
  isSending,
  isLoadingMessages,
  pendingFiles,
  onAddFile,
  onRemoveFile,
  onBack,
  onClose,
  onSubmitRating,
  onDismissRating,
  onCloseConversation,
  onReopenConversation,
  isExpanded,
  onToggleExpand,
  getLocalImageUrl,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const dateLocale = (locale || 'es_ES').replace('_', '-');
  const welcomeQuickReplies = React.useMemo(() => ([
    ui('supportQuickReply1'), ui('supportQuickReply2'), ui('supportQuickReply3'), ui('supportQuickReply4'),
  ]), [ui]);
  const [draft, setDraft] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showEmoji, setShowEmoji] = React.useState(false);

  const dragCounterRef = React.useRef(0);
  const fileRef = React.useRef(null);
  const threadRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const emojiRef = React.useRef(null);

  // Tracks the message count at the moment the conversation was opened,
  // so we can render a "Nuevos" divider before messages that arrived after.
  const seenCountRef = React.useRef(null);
  const wasLoadingRef = React.useRef(false);
  const prevIsSendingRef = React.useRef(false);

  // ── Close menu on outside click ────────────────────────────────────────────
  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // ── Close emoji picker on outside click ────────────────────────────────────
  React.useEffect(() => {
    if (!showEmoji) return;
    const handler = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmoji]);

  // ── Reset tracking when switching conversations ────────────────────────────
  React.useEffect(() => {
    seenCountRef.current = null;
    wasLoadingRef.current = false;
    prevIsSendingRef.current = false;
  }, [conversation?.id]);

  // ── Play sound when bot responds (isSending: true → false) ────────────────
  React.useEffect(() => {
    if (prevIsSendingRef.current && !isSending && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last && last.sender !== 'user' && !last.typing) {
        playReceiveSound();
      }
    }
    prevIsSendingRef.current = isSending;
  }, [isSending]);

  // ── Mark initially loaded messages as "seen" when loading completes ────────
  React.useEffect(() => {
    if (wasLoadingRef.current && !isLoadingMessages) {
      seenCountRef.current = messages.length;
    }
    wasLoadingRef.current = isLoadingMessages;
  }, [isLoadingMessages]);

  // ── Scroll ─────────────────────────────────────────────────────────────────
  // Also re-scroll when the conversation's status changes: closing it reveals the CSAT
  // card/reopen prompt below the last message without adding any new message of its own, so
  // messages.length alone wouldn't trigger this.
  React.useEffect(() => {
    threadRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.text, conversation?.status]);

  // ── Sync external input to local draft on conversation change ──────────────
  React.useEffect(() => {
    setDraft(input || '');
  }, [conversation?.id]);

  // ── "Talk to a human" bar dismissal (per conversation) ──────────────────────
  const [escalateBarDismissed, setEscalateBarDismissed] = React.useState(false);
  React.useEffect(() => {
    setEscalateBarDismissed(false);
  }, [conversation?.id]);

  const { username } = useAuth();
  const firstName = React.useMemo(() => {
    if (!username) return '';
    const raw = username.split(/[.\s@_]/)[0];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }, [username]);

  const showWelcome = !conversation && !isLoadingMessages && messages.length === 0;
  const isClosed = conversation?.status === 'closed';
  const isRated  = conversation?.rated === true;
  const csatDismissed = conversation?.csatDismissed === true;
  const showCSAT = isClosed && !isRated && !csatDismissed;
  const isHuman  = conversation?.assigneeKind === 'human';
  const assigneeName = conversation?.assigneeName || 'ValerIA';

  // Once ValerIA has EVER offered to escalate in this conversation, keep the one-click
  // "talk to a human" option available for the rest of it — not just on the offering
  // message, which scrolls out of view as the conversation goes on. The offering message
  // itself never leaves `messages`, so this naturally stays true from that point on.
  const showEscalateSticky = !isHuman && !isClosed && !escalateBarDismissed && messages.some(
    (m) => typeof m.text === 'string' && m.text.includes(SUGGESTS_ESCALATION_MARKER)
  );

  // ── Send ───────────────────────────────────────────────────────────────────
  // Sends a fixed, unambiguous request text through the normal message pipeline —
  // reuses the ADK's existing conversational escalation flow (intent classification,
  // confirmation turn, Jira ticket transition) instead of a separate backend path.
  const handleEscalateToHuman = () => {
    playSendSound();
    // Hide the bar the instant the user clicks it, rather than waiting for the full
    // LLM + Jira round trip (a few seconds) to come back and flip assigneeKind — clicking
    // this button IS the user's explicit confirmation to escalate, so there's no reason to
    // keep showing "talk to a human" while that's already in flight.
    setEscalateBarDismissed(true);
    onSend(ui('supportEscalateMessage'), []);
  };

  const send = () => {
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) return;
    playSendSound();
    onSend(text, pendingFiles);
    setDraft('');
    if (onInputChange) onInputChange('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isClosed && !isSending) send();
    }
  };

  // Adds a file only if it matches the allowed set (images or documents);
  // otherwise surfaces a visible, translated error instead of silently
  // dropping it. `accept` on the file input is only a UI hint, so this is
  // the real enforcement point — shared with the drag-and-drop path below.
  const addFileIfAllowed = (file) => {
    if (!isAllowedAttachmentFile(file)) {
      toast.error(ui('supportUnsupportedFileType', { name: file.name }));
      return;
    }
    onAddFile(file);
  };

  const handleFile = (e) => {
    Array.from(e.target.files || []).forEach(addFileIfAllowed);
    e.target.value = '';
  };

  const handleDragEnter = (e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (isClosed) return;
    Array.from(e.dataTransfer.files || []).forEach(addFileIfAllowed);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="sc-conv-wrap"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className={`sc-drop-overlay${isClosed ? ' closed' : ''}`}>
          <div className="sc-drop-inner">
            <Paperclip size={28} data-testid="Paperclip__50ab90" />
            <span>{isClosed ? ui('supportClosedConversation') : ui('supportDropToAttach')}</span>
          </div>
        </div>
      )}
      {/* Header */}
      <ConversationHeader
        onBack={onBack}
        isHuman={isHuman}
        isClosed={isClosed}
        conversation={conversation}
        assigneeName={assigneeName}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onCloseConversation={() => { setMenuOpen(false); onCloseConversation?.(); }}
        onClose={onClose}
        menuRef={menuRef}
        ui={ui}
        data-testid="ConversationHeader__50ab90" />
      {showEscalateSticky && (
        <div className="sc-escalate-bar">
          <div className="sc-escalate-bar-inner">
            <button className="sc-escalate-btn" onClick={handleEscalateToHuman}>
              {ui('supportEscalateToHuman')}
            </button>
            <button
              type="button"
              className="sc-escalate-dismiss"
              onClick={() => setEscalateBarDismissed(true)}
              aria-label={ui('supportDismissEscalateBar')}
              title={ui('supportDismissEscalateBar')}
            >
              <X size={12} data-testid="X__50ab90" />
            </button>
          </div>
        </div>
      )}
      {/* Thread */}
      <div className="sc-conv-thread" ref={threadRef}>
        <div className="sc-conv-greet">
          {ui('supportGreetingBanner')}
        </div>

        {showWelcome && (
          <>
            <Bubble
              message={{ id: 'w1', sender: 'bot', text: ui('supportWelcomeBubble1', { name: firstName ? `, ${firstName}` : '' }) }}
              data-testid="Bubble__50ab90" />
            <Bubble
              message={{ id: 'w2', sender: 'bot', text: ui('supportWelcomeBubble2') }}
              data-testid="Bubble__50ab90" />
            <Bubble
              message={{ id: 'w3', sender: 'bot', text: ui('supportWelcomeBubble3'), quickReplies: welcomeQuickReplies }}
              onQuickReply={(q) => setDraft(q)}
              data-testid="Bubble__50ab90" />
          </>
        )}

        {isLoadingMessages ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--sc-fg-3)', fontSize: 13 }}>
            {ui('loading')}
          </div>
        ) : (
          messages.map((m, i) => (
            <React.Fragment key={m.id}>
              <ConversationMessageItem
                message={m}
                index={i}
                messages={messages}
                seenCount={seenCountRef.current}
                dateLocale={dateLocale}
                onQuickReply={(q) => setDraft(q)}
                ui={ui}
                getLocalImageUrl={getLocalImageUrl}
                data-testid="ConversationMessageItem__50ab90" />
            </React.Fragment>
          ))
        )}

        {isSending && (
          <div className="sc-msg bot">
            <div className="sc-bub-av"><ValerIATile size={28} radius={999} data-testid="ValerIATile__50ab90" /></div>
            <div className="sc-bubble">
              <span className="sc-typing"><i /><i /><i /></span>
            </div>
          </div>
        )}

        {isClosed && (
          <div className="sc-closed-bar">
            <CheckCircle size={14} data-testid="CheckCircle__50ab90" />
            {ui('supportConversationEnded')}
          </div>
        )}

        {showCSAT && (
          <CSATCard
            onSubmit={onSubmitRating}
            onDismiss={onDismissRating}
            data-testid="CSATCard__50ab90" />
        )}

        {isClosed && isRated && (
          <div className="sc-csat-thanks">
            <CheckCircle data-testid="CheckCircle__50ab90" />
            {ui('supportRatingThanks')}
          </div>
        )}

        {isClosed && (
          <div className="sc-reopen-card">
            <div className="sc-grow">
              <div className="sc-r-title">{ui('supportNeedMoreHelp')}</div>
              <div className="sc-r-sub">{ui('supportNewLinkedConversation')}</div>
            </div>
            <button onClick={onReopenConversation}>{ui('supportReopen')}</button>
          </div>
        )}
      </div>
      {/* Composer */}
      <div className={`sc-composer${isClosed ? ' disabled' : ''}`}>
        {pendingFiles.length > 0 && (
          <div className="sc-att-bar">
            {pendingFiles.map((f, i) => (
              <PendingAttachmentChip
                key={`${f.name}-${f.size}-${f.lastModified}`}
                file={f}
                onRemove={() => onRemoveFile(i)}
                data-testid="PendingAttachmentChip__50ab90" />
            ))}
          </div>
        )}
        <div className="sc-input-row">
          {/* Attach file */}
          <button className="sc-clip" onClick={() => fileRef.current?.click()} aria-label={ui('supportAttachFile')}>
            <Plus size={16} data-testid="Plus__50ab90" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            accept="image/*,.pdf,.csv,.txt,.xlsx,.docx,.md"
            onChange={handleFile}
          />

          {/* Emoji picker */}
          <div ref={emojiRef} style={{ position: 'relative' }}>
            <button
              className={`sc-clip${showEmoji ? ' active' : ''}`}
              onClick={() => setShowEmoji((v) => !v)}
              aria-label="Emoji"
            >
              <Smile size={16} data-testid="Smile__50ab90" />
            </button>
            {showEmoji && (
              <div className="sc-emoji-picker">
                {EMOJIS.map((e) => (
                  <button key={e} className="sc-emoji-btn" onClick={() => setDraft((d) => d + e)}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <textarea
            placeholder={isClosed ? ui('supportClosedConversation') : ui('supportTypeMessage')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
          />

          <button
            className="sc-send"
            disabled={!draft.trim() && pendingFiles.length === 0}
            onClick={send}
            aria-label={ui('send')}
          >
            <ArrowUp size={14} data-testid="ArrowUp__50ab90" />
          </button>
        </div>
        <div className="sc-footer-hint">
          {ui('supportAiDisclaimer')}
        </div>
      </div>
    </div>
  );
}
