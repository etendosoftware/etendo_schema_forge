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

// Attachments accepted on every input path (file picker AND drag-and-drop):
// images (any subtype) plus a fixed set of common document formats.
// Keep this in sync with the file input's `accept` attribute below.
const ALLOWED_DOC_EXTENSIONS = ['pdf', 'csv', 'txt', 'xlsx', 'docx'];
const ALLOWED_DOC_MIME_TYPES = new Set([
  'application/pdf',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword',
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

function playSendSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Short descending "pop" — outgoing feel
    osc.frequency.setValueAtTime(1100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.11);
    osc.onended = () => ctx.close();
  } catch { /* ignore if AudioContext not supported */ }
}

function playReceiveSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Warm glass-bell: two partials that decay naturally
    const bell = (freq, start, vol) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.start(start);
      osc.stop(start + 0.55);
    };
    bell(784, ctx.currentTime, 0.14);        // G5 — fundamental
    bell(1047, ctx.currentTime + 0.07, 0.09); // C6 — upper partial
    setTimeout(() => ctx.close(), 700);
  } catch { /* ignore if AudioContext not supported */ }
}

function renderText(txt) {
  if (!txt) return null;
  const lines = txt.split('\n');
  const out = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      out.push(
        <p key={out.length}>
          {para.map((l, j) => (
            <React.Fragment key={l}>
              {j > 0 && <br />}
              {renderBold(l)}
            </React.Fragment>
          ))}
        </p>
      );
      para = [];
    }
  };
  for (const line of lines) {
    if (line.trim() === '') { flush(); }
    else { para.push(line); }
  }
  flush();
  return out;
}

function renderBold(txt) {
  const parts = txt.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={p}>{p}</strong>
      : <React.Fragment key={p}>{p}</React.Fragment>
  );
}

function Bubble({ message, onQuickReply }) {
  const ui = useUI();
  const role = message.sender;
  const isHumanAgent = role === 'agent' || role === 'human';
  const ts = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const fullTs = ts ? `${ui('supportToday')} · ${ts}` : undefined;
  const bubbleRole = role === 'user' ? 'user' : 'bot';

  return (
    <div className={`sc-msg ${bubbleRole}`} data-time={fullTs}>
      {role !== 'user' && (
        <div className={`sc-bub-av${isHumanAgent ? ' human' : ''}`}>
          {isHumanAgent
            ? (message.senderInitials || message.senderName?.[0] || 'A')
            : <ValerIATile size={20} radius={999} data-testid="ValerIATile__50ab90" />
          }
        </div>
      )}
      <div className="sc-bubble">
        {message.typing ? (
          <span className="sc-typing"><i /><i /><i /></span>
        ) : (
          <>
            {renderText(message.text)}
            {message.attachments?.length > 0 && (
              <div className="sc-att-list">
                {message.attachments.map((a) => (
                  <AttachmentItem
                    key={a.id || a.filename || a.name}
                    attachment={a}
                    ui={ui}
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

// Renders one inbound attachment on a message bubble:
// - image/*   → authenticated fetch → blob URL → <img> thumbnail
// - allowed non-image (pdf/csv/txt/xlsx/docx) → authenticated fetch → download link
// - anything else with a known mimeType (e.g. a video a human agent attached
//   directly in Jira) → neutral "unsupported" fallback, no fetch attempted
// - no id/mimeType (legacy or still-optimistic local echo) → plain filename
function AttachmentItem({ attachment, ui }) {
  const apiFetch = useApiFetch();
  const [blobUrl, setBlobUrl] = React.useState(null);
  const [status, setStatus] = React.useState('idle'); // idle | loading | ready | error
  const name = attachment.filename || attachment.name || '';
  const mimeType = attachment.mimeType || '';
  const isImage = mimeType.startsWith('image/');
  const isAllowedOther = ALLOWED_DOC_MIME_TYPES.has(mimeType);
  const canFetch = Boolean(attachment.id) && (isImage || isAllowedOther);
  const isUnsupported = Boolean(mimeType) && !isImage && !isAllowedOther;

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
    if (status === 'ready' && blobUrl) {
      return (
        <a href={blobUrl} target="_blank" rel="noopener noreferrer" className="sc-att-img-link">
          <img src={blobUrl} alt={name} className="sc-att-img" />
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

function ConversationMessageItem({ message, index, messages, seenCount, dateLocale, onQuickReply, ui }) {
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
        data-testid="Bubble__50ab90" />
    </>
  );
}

function ConvMeta({ isClosed, isHuman, ui }) {
  if (isClosed) return ui('supportConversationClosedMeta');
  if (isHuman) return <><span className="sc-typing-dot" />{ui('supportActiveNow')}</>;
  return ui('supportTeamCanHelp');
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
      <div className={`sc-conv-av${isHuman ? ' human' : ''}`}>
        {isHuman
          ? (conversation?.assigneeInitials || assigneeName[0])
          : <ValerIATile size={26} radius={999} data-testid="ValerIATile__50ab90" />
        }
        {!isClosed && <div className="sc-status-dot" />}
      </div>
      <div className="sc-grow">
        <div className="sc-conv-name">{assigneeName}</div>
        <div className="sc-conv-meta">
          <ConvMeta
            isClosed={isClosed}
            isHuman={isHuman}
            ui={ui}
            data-testid="ConvMeta__50ab90" />
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
  React.useEffect(() => {
    threadRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.text]);

  // ── Sync external input to local draft on conversation change ──────────────
  React.useEffect(() => {
    setDraft(input || '');
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

  // ── Send ───────────────────────────────────────────────────────────────────
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
                data-testid="ConversationMessageItem__50ab90" />
            </React.Fragment>
          ))
        )}

        {isSending && (
          <div className="sc-msg bot">
            <div className="sc-bub-av"><ValerIATile size={20} radius={999} data-testid="ValerIATile__50ab90" /></div>
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

        {isRated && (
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
            accept="image/*,.pdf,.csv,.txt,.xlsx,.docx"
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
