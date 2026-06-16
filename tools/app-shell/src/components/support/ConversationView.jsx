import * as React from 'react';
import {
  ChevronRight, MoreVertical, X, Plus, ArrowUp, Paperclip,
  Users, CheckCircle, Smile, Mic, Maximize2, Minimize2,
} from 'lucide-react';
import { ValerIATile } from './ValerIATile.jsx';
import { useAuth } from '@/auth/AuthContext.jsx';

const WELCOME_QUICK_REPLIES = ['¿Cómo creo una factura?', 'Importar contactos', 'Configurar impuestos', 'Cambiar plan'];

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
            <React.Fragment key={j}>
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
      ? <strong key={i}>{p}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

function Bubble({ message, onQuickReply, audioMap = {} }) {
  const role = message.sender;
  const isHumanAgent = role === 'agent' || role === 'human';
  const ts = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const fullTs = ts ? `Hoy · ${ts}` : undefined;
  const bubbleRole = role === 'user' ? 'user' : 'bot';

  const [playingName, setPlayingName] = React.useState(null);
  const audioRef = React.useRef(null);

  React.useEffect(() => () => { audioRef.current?.pause(); }, []);

  const toggleAudio = (name) => {
    const url = audioMap[name];
    if (!url) return;
    if (playingName === name) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingName(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingName(name);
    audio.play();
    audio.onended = () => { setPlayingName(null); audioRef.current = null; };
  };

  return (
    <div className={`sc-msg ${bubbleRole}`} data-time={fullTs}>
      {role !== 'user' && (
        <div className={`sc-bub-av${isHumanAgent ? ' human' : ''}`}>
          {isHumanAgent
            ? (message.senderInitials || message.senderName?.[0] || 'A')
            : <ValerIATile size={20} radius={999} />
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
                {message.attachments.map((a, i) => {
                  const name = a.filename || a.name || '';
                  const isAudio = name.match(/\.(webm|ogg|mp3|wav|m4a)$/i) || audioMap[name];
                  return (
                    <div key={i} className="sc-att">
                      {isAudio ? <Mic size={14} /> : <Paperclip size={14} />}
                      <span className="sc-a-name">{isAudio ? 'Audio' : name}</span>
                      {isAudio && audioMap[name] && (
                        <button
                          className="sc-audio-play"
                          onClick={() => toggleAudio(name)}
                          title={playingName === name ? 'Detener' : 'Reproducir'}
                        >
                          {playingName === name ? '■' : '▶'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {message.quickReplies?.length > 0 && (
              <div className="sc-quick-replies">
                {message.quickReplies.map((q, i) => (
                  <button key={i} onClick={() => onQuickReply?.(q)}>{q}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CSATCard({ onSubmit, onDismiss }) {
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
      <div className="sc-csat-q">¿Cómo fue tu experiencia?</div>
      <div className="sc-csat-sub">Tu opinión nos ayuda a mejorar el soporte.</div>
      <div className="sc-csat-faces">
        {faces.map((f, i) => (
          <button
            key={i}
            className={`sc-csat-face${rating === i + 1 ? ' selected' : ''}`}
            onClick={() => setRating(i + 1)}
            aria-label={`Valoración ${i + 1}`}
          >
            {f}
          </button>
        ))}
      </div>
      {rating != null && (
        <>
          <textarea
            placeholder="Cuéntanos algo más (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 280))}
            maxLength={280}
          />
          <div className="sc-csat-foot">
            <button className="sc-btn-tertiary" onClick={onDismiss}>Más tarde</button>
            <button className="sc-btn-primary" onClick={handleSubmit} disabled={submitting}>
              Enviar valoración
            </button>
          </div>
        </>
      )}
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
  const [draft, setDraft] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [recSeconds, setRecSeconds] = React.useState(0);

  const dragCounterRef = React.useRef(0);
  const fileRef = React.useRef(null);
  const threadRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const emojiRef = React.useRef(null);
  const mediaRecorderRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const recTimerRef = React.useRef(null);
  // Maps audio filename → object URL so bubbles can play locally recorded audio
  const audioMapRef = React.useRef({});
  // Flag: stop recording and send immediately when the user clicks ↑ while recording
  const pendingSendRef = React.useRef(false);
  // Refs to avoid stale closures inside MediaRecorder.onstop
  const draftRef = React.useRef(draft);
  const pendingFilesRef = React.useRef(pendingFiles);
  React.useEffect(() => { draftRef.current = draft; }, [draft]);
  React.useEffect(() => { pendingFilesRef.current = pendingFiles; }, [pendingFiles]);

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

  // ── Cleanup recording on unmount ───────────────────────────────────────────
  React.useEffect(() => {
    return () => {
      clearInterval(recTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

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

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = async () => {
    setShowEmoji(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        const ext = mr.mimeType?.includes('ogg') ? 'ogg' : 'webm';
        const filename = `audio-${Date.now()}.${ext}`;
        const file = new File([blob], filename, { type: blob.type });
        audioMapRef.current[filename] = URL.createObjectURL(blob);
        stream.getTracks().forEach((t) => t.stop());
        if (pendingSendRef.current) {
          pendingSendRef.current = false;
          playSendSound();
          onSend(draftRef.current.trim(), [...pendingFilesRef.current, file]);
          setDraft('');
          if (onInputChange) onInputChange('');
        } else {
          onAddFile(file);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      // microphone permission denied or not supported — silently skip
    }
  };

  const stopRecording = () => {
    clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    setRecSeconds(0);
  };

  const formatRecTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = () => {
    if (recording) {
      // Stop recording and send — onstop will fire the actual onSend call
      pendingSendRef.current = true;
      stopRecording();
      return;
    }
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

  const handleFile = (e) => {
    Array.from(e.target.files || []).forEach((f) => onAddFile(f));
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
    Array.from(e.dataTransfer.files || []).forEach((f) => onAddFile(f));
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
            <Paperclip size={28} />
            <span>{isClosed ? 'La conversación está cerrada' : 'Suelta aquí para adjuntar'}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sc-conv-head">
        <button className="sc-back" onClick={onBack} aria-label="Volver">
          <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div className={`sc-conv-av${isHuman ? ' human' : ''}`}>
          {isHuman
            ? (conversation?.assigneeInitials || assigneeName[0])
            : <ValerIATile size={26} radius={999} />
          }
          {!isClosed && <div className="sc-status-dot" />}
        </div>
        <div className="sc-grow">
          <div className="sc-conv-name">{assigneeName}</div>
          <div className="sc-conv-meta">
            {isClosed
              ? 'Conversación cerrada'
              : isHuman
                ? <><span className="sc-typing-dot" />Activo ahora</>
                : 'El equipo también puede ayudar'
            }
          </div>
        </div>
        <div className="sc-conv-actions" ref={menuRef} style={{ position: 'relative' }}>
          <button
            className="sc-head-icn"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Contraer ventana' : 'Ampliar ventana'}
            title={isExpanded ? 'Contraer ventana' : 'Ampliar ventana'}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          {conversation && !isClosed && (
            <>
              <button
                className="sc-head-icn"
                aria-label="Más opciones"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="sc-head-menu">
                  <button
                    className="danger"
                    onClick={() => { setMenuOpen(false); onCloseConversation?.(); }}
                  >
                    Cerrar conversación
                  </button>
                </div>
              )}
            </>
          )}
          <button className="sc-head-icn" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
      </div>

      {/* Thread */}
      <div className="sc-conv-thread" ref={threadRef}>
        <div className="sc-conv-greet">
          Estamos aquí para ayudarte con cualquier cosa que necesites.
        </div>

        {showWelcome && (
          <>
            <Bubble
              message={{ id: 'w1', sender: 'bot', text: `👋 ¡Hola${firstName ? `, ${firstName}` : ''}! Soy ValerIA, tu asistente de Etendo GO.` }}
            />
            <Bubble
              message={{ id: 'w2', sender: 'bot', text: 'Puedo ayudarte con dudas sobre facturación, contactos, configuración y más. Si no logro resolverlo, te paso con alguien del equipo.' }}
            />
            <Bubble
              message={{ id: 'w3', sender: 'bot', text: '¿Sobre qué necesitas ayuda hoy?', quickReplies: WELCOME_QUICK_REPLIES }}
              onQuickReply={(q) => setDraft(q)}
            />
          </>
        )}

        {isLoadingMessages ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--sc-fg-3)', fontSize: 13 }}>
            Cargando…
          </div>
        ) : (
          messages.map((m, i) => {
            if (m.handover) {
              return (
                <div key={i} className="sc-handover">
                  <div className="sc-handover-icn"><Users size={16} /></div>
                  <div>
                    <div className="sc-handover-txt">
                      <b>Te paso con {m.agentName}</b>, del equipo de soporte
                    </div>
                    <div className="sc-handover-sub">Activo · suele responder en menos de 5 min</div>
                  </div>
                </div>
              );
            }
            const prev = messages[i - 1];
            const mDate = m.timestamp ? new Date(m.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : null;
            const prevDate = prev?.timestamp ? new Date(prev.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : null;
            const showDivider = mDate && mDate !== prevDate;
            // Show "Nuevos" before the first message that arrived after the conversation was opened
            const showNewDivider = seenCountRef.current !== null
              && i === seenCountRef.current
              && messages.length > seenCountRef.current;
            return (
              <React.Fragment key={m.id || i}>
                {showNewDivider && (
                  <div className="sc-new-divider"><span>Nuevos</span></div>
                )}
                {showDivider && !showNewDivider && (
                  <div className="sc-day-divider"><span>{mDate}</span></div>
                )}
                <Bubble message={m} onQuickReply={(q) => { setDraft(q); }} audioMap={audioMapRef.current} />
              </React.Fragment>
            );
          })
        )}

        {isSending && (
          <div className="sc-msg bot">
            <div className="sc-bub-av"><ValerIATile size={20} radius={999} /></div>
            <div className="sc-bubble">
              <span className="sc-typing"><i /><i /><i /></span>
            </div>
          </div>
        )}

        {isClosed && (
          <div className="sc-closed-bar">
            <CheckCircle size={14} />
            Tu conversación ha finalizado
          </div>
        )}

        {showCSAT && (
          <CSATCard onSubmit={onSubmitRating} onDismiss={onDismissRating} />
        )}

        {isRated && (
          <div className="sc-csat-thanks">
            <CheckCircle />
            ¡Gracias por tu valoración! El equipo la revisará.
          </div>
        )}

        {isClosed && (
          <div className="sc-reopen-card">
            <div className="sc-grow">
              <div className="sc-r-title">¿Necesitas algo más sobre este tema?</div>
              <div className="sc-r-sub">Empezaremos una nueva conversación enlazada con esta.</div>
            </div>
            <button onClick={onReopenConversation}>Reabrir</button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className={`sc-composer${isClosed ? ' disabled' : ''}`}>
        {pendingFiles.length > 0 && (
          <div className="sc-att-bar">
            {pendingFiles.map((f, i) => {
              const isAudio = f.type?.startsWith('audio/');
              return (
                <div key={i} className="sc-att-chip">
                  <div className="sc-a-thumb">
                    {isAudio ? <Mic size={12} /> : <Paperclip size={12} />}
                  </div>
                  {isAudio ? (
                    <>
                      <span>Audio</span>
                      <button
                        className="sc-audio-play"
                        title="Escuchar"
                        onClick={() => {
                          const url = URL.createObjectURL(f);
                          const audio = new Audio(url);
                          audio.play();
                          audio.onended = () => URL.revokeObjectURL(url);
                        }}
                      >▶</button>
                      <span style={{ color: 'var(--sc-fg-3)', fontSize: 11 }}>
                        · {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="sc-a-name">{f.name}</span>
                      <span style={{ color: 'var(--sc-fg-3)', fontSize: 11 }}>
                        · {(f.size / 1024).toFixed(0)} KB
                      </span>
                    </>
                  )}
                  <span className="sc-x" onClick={() => onRemoveFile(i)}>
                    <X size={12} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="sc-input-row">
          {/* Attach file */}
          <button className="sc-clip" onClick={() => fileRef.current?.click()} aria-label="Adjuntar">
            <Plus size={16} />
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
              <Smile size={16} />
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
            placeholder={isClosed ? 'Esta conversación está cerrada' : 'Escribe un mensaje…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
          />

          {/* Mic / recording indicator */}
          {recording && (
            <span className="sc-rec-timer">{formatRecTime(recSeconds)}</span>
          )}
          <button
            className={`sc-clip sc-mic-btn${recording ? ' recording' : ''}`}
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? 'Detener grabación' : 'Grabar audio'}
          >
            <Mic size={16} />
          </button>

          <button
            className="sc-send"
            disabled={!recording && !draft.trim() && pendingFiles.length === 0}
            onClick={send}
            aria-label="Enviar"
          >
            <ArrowUp size={14} />
          </button>
        </div>
        <div className="sc-footer-hint">
          ValerIA puede equivocarse. Si necesitas, te pasamos con un agente.
        </div>
      </div>
    </div>
  );
}
