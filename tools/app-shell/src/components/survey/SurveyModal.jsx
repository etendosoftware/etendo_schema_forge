import { useState, useEffect } from 'react';
import { useUI, useLocaleSwitch } from '@/i18n/index.js';
import { getRemoteCannedResponses } from '@/lib/surveys/survey-config.js';

// ─── Design tokens (mapped from Etendo design system) ───────────────────────
const T = {
  ink:       'hsl(var(--foreground))',
  fg1:       'hsl(var(--foreground))',
  fg2:       'hsl(var(--muted-foreground))',
  fg3:       'hsl(var(--muted-foreground))',
  fg4:       'hsl(var(--text-disabled))',
  border2:   'hsl(var(--border-control))',
  bgSubtle:  'hsl(var(--muted))',
  successBg: 'var(--status-success-bg)',
  successFg: 'var(--status-success-fg)',
  yellowTop: 'hsl(var(--primary))',
  yellowBot: 'hsl(var(--primary))',
  // NPS segments
  detractorBg: 'var(--status-destructive-bg)', detractorFg: 'hsl(var(--destructive))', detractorRing: 'hsl(var(--destructive) / 0.3)',
  passiveBg:   'var(--status-warning-bg)', passiveFg:   'var(--status-warning-fg)', passiveRing:   'var(--status-warning-border)',
  promoterBg:  'var(--status-success-bg)', promoterFg:  'var(--status-success-fg)', promoterRing:  'var(--status-success-border)',
  // Stars
  starFill:    'var(--status-warning-fg)',
  starStroke:  'var(--status-warning-fg)',
  starEmpty:   'hsl(var(--border-control))',
};

const font = (size, weight = 400, lh = undefined) =>
  `${weight} ${size}px/${lh ? lh + 'px' : 1} Inter, ui-sans-serif, system-ui, sans-serif`;

// ─── Close icon ──────────────────────────────────────────────────────────────
function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  );
}

// ─── Arrow right icon ─────────────────────────────────────────────────────────
function ArrowRight() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7h10M8 3l4 4-4 4"/>
    </svg>
  );
}

// ─── Arrow left icon ──────────────────────────────────────────────────────────
function ArrowLeft() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 7H2M6 3 2 7l4 4"/>
    </svg>
  );
}

// ─── Check circle icon ────────────────────────────────────────────────────────
function CheckCircle() {
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13" cy="13" r="11"/>
      <path d="M8 13l3.5 3.5L18 9"/>
    </svg>
  );
}

// ─── Etendo branded survey header ────────────────────────────────────────────
function SurveyHeader({ onClose, eyebrow }) {
  const ui = useUI();
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src="/favicon.png"
          width="24"
          height="24"
          alt="Etendo"
          style={{ borderRadius: 6, flexShrink: 0 }}
        />
        <span style={{ font: font(11, 600, 14), color: T.fg3, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          {eyebrow}
        </span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label={ui('surveyClose')}
          style={{
            width: 28, height: 28, borderRadius: 6, border: 0,
            background: 'transparent', color: T.fg3,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
          data-testid="SurveyModal__close"
        >
          <CloseIcon data-testid="CloseIcon__91aeca" />
        </button>
      )}
    </div>
  );
}

// ─── NPS 0–10 colored scale ───────────────────────────────────────────────────
function npsColor(n) {
  if (n <= 5) return { bg: T.detractorBg, fg: T.detractorFg, ring: T.detractorRing };
  if (n <= 7) return { bg: T.passiveBg,   fg: T.passiveFg,   ring: T.passiveRing };
  return { bg: T.promoterBg, fg: T.promoterFg, ring: T.promoterRing };
}

function NPSScale({ value, onChange, labelLow, labelHigh }) {
  const items = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return (
    <div data-testid="SurveyModal__nps-scale">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: 6 }}>
        {items.map(n => {
          const sel = value === n;
          const c = npsColor(n);
          return (
            <button
              key={n}
              onClick={() => onChange(n)}
              style={{
                aspectRatio: '1/1', borderRadius: 8,
                border: sel ? `2px solid ${c.fg}` : `1px solid ${c.ring}`,
                background: sel ? c.fg : c.bg,
                color: sel ? 'hsl(var(--card))' : c.fg,
                font: font(13, 600),
                cursor: 'pointer', transition: 'all .15s',
              }}
              data-testid={`SurveyModal__nps-${n}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, font: font(11, 400, 14), color: T.fg3 }}>
        <span data-testid="SurveyModal__nps-label-low">{labelLow}</span>
        <span data-testid="SurveyModal__nps-label-high">{labelHigh}</span>
      </div>
    </div>
  );
}

// ─── CSAT 1–5 star scale ─────────────────────────────────────────────────────
function StarScale({ value, onChange, labelLow, labelHigh }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  const items = [1, 2, 3, 4, 5];
  return (
    <div data-testid="SurveyModal__star-scale">
      <div
        style={{ display: 'flex', justifyContent: 'center' }}
        onMouseLeave={() => setHover(0)}
      >
        <div style={{ display: 'inline-flex', gap: 14, padding: '2px 0' }}>
          {items.map(n => {
            const on = n <= shown;
            return (
              <button
                key={n}
                onClick={() => onChange(n)}
                onMouseEnter={() => setHover(n)}
                aria-label={String(n)}
                style={{
                  width: 40, height: 40, borderRadius: 10, padding: 0,
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                data-testid={`SurveyModal__star-${n}`}
              >
                <svg
                  viewBox="0 0 24 24" width="30" height="30"
                  fill={on ? T.starFill : 'transparent'}
                  stroke={on ? T.starStroke : T.starEmpty}
                  strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
                  style={{ transition: 'fill .15s, stroke .15s, transform .12s', transform: on && hover === n ? 'scale(1.08)' : 'scale(1)' }}
                >
                  <path d="M12 3.6 14.55 9.05 20.4 9.9 16.2 14 17.2 19.85 12 17.1 6.8 19.85 7.8 14 3.6 9.9 9.45 9.05Z"/>
                </svg>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px auto 0', maxWidth: 280, font: font(11, 400, 14), color: T.fg3 }}>
        <span>{labelLow}</span>
        <span>{labelHigh}</span>
      </div>
    </div>
  );
}

// ─── Chip group (Q2 tag selection) ───────────────────────────────────────────
function ChipGroup({ options, value, onChange }) {
  function toggle(o) {
    onChange(value.includes(o) ? value.filter(v => v !== o) : [...value, o]);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const sel = value.includes(o);
        return (
          <button
            key={o}
            onClick={() => toggle(o)}
            style={{
              padding: '6px 12px', borderRadius: 999,
              border: sel ? `1.5px solid ${T.ink}` : `1px solid ${T.border2}`,
              background: sel ? T.ink : 'hsl(var(--card))',
              color: sel ? 'hsl(var(--card))' : T.fg2,
              font: font(12, 500), cursor: 'pointer',
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ─── Canned-response grid (CSAT Q2) ──────────────────────────────────────────
// Click a phrase to prefill the free-text field below — same "click to fill, then keep
// editing" pattern as ConversationView's support-chat quick replies (onQuickReply sets the
// draft text, doesn't lock it). Fulfills ETP-4352's "predefined answers, still editable" ask.
// options is [{ icon, label }] — icon is decorative only (aria-hidden), onPick always
// receives the plain translated label, never the icon, so feedback data/Mixpanel payloads
// stay icon-free. Content is per-survey (survey.canned in surveys.js), not a shared generic
// list, so invoicing and order surveys each surface phrases tied to their own flow.
function CannedResponseGrid({ options, onPick }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
      {options.map(({ icon, label }) => (
        <button
          key={label}
          type="button"
          onClick={() => onPick(label)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 10, textAlign: 'left',
            border: `1px solid ${T.border2}`,
            background: '#fff', color: T.fg2,
            font: font(12, 500), cursor: 'pointer',
          }}
        >
          <span aria-hidden="true">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Ghost button (skip) ─────────────────────────────────────────────────────
function GhostBtn({ children, onClick, ...rest }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 32, padding: '0 10px', borderRadius: 6,
        border: 'none', background: 'transparent', color: T.fg3,
        font: font(12, 500), cursor: 'pointer',
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Primary button (submit) ──────────────────────────────────────────────────
function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 38, padding: '0 16px', borderRadius: 8,
        border: 0,
        background: disabled ? T.bgSubtle : T.ink,
        color: disabled ? T.fg4 : 'hsl(var(--card))',
        font: font(13, 600), cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'all .15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── Survey footer ────────────────────────────────────────────────────────────
function SurveyFooter({ onBack, backLabel, onSkip, onSubmit, submitLabel, disabled, skipLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: onBack ? 'space-between' : 'flex-end', gap: 8, marginTop: 16 }}>
      {onBack ? (
        <GhostBtn onClick={onBack} data-testid="SurveyModal__back">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ArrowLeft data-testid="ArrowLeft__91aeca" /> {backLabel}
          </span>
        </GhostBtn>
      ) : <span />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onSkip && <GhostBtn onClick={onSkip} data-testid="GhostBtn__91aeca">{skipLabel}</GhostBtn>}
        <PrimaryBtn onClick={onSubmit} disabled={disabled} data-testid="PrimaryBtn__91aeca">
          {submitLabel} <ArrowRight data-testid="ArrowRight__91aeca" />
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Thank-you body ───────────────────────────────────────────────────────────
function ThanksBody({ title, line }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 4px 4px' }} data-testid="SurveyModal__thank-you">
      <div style={{
        width: 48, height: 48, borderRadius: '50%', margin: '4px auto 12px',
        background: T.successBg, color: T.successFg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircle data-testid="CheckCircle__91aeca" />
      </div>
      <div style={{ font: font(16, 700, 22), color: T.fg1, marginBottom: 6, letterSpacing: '-0.005em' }}>
        {title}
      </div>
      <div style={{ font: font(13, 400, 18), color: T.fg3, maxWidth: 300, margin: '0 auto' }}>
        {line}
      </div>
    </div>
  );
}

// ─── NPS survey content ───────────────────────────────────────────────────────
function npsSegment(score) {
  if (score <= 5) return 'detractor';
  if (score <= 7) return 'passive';
  return 'promoter';
}

function npsQ2Copy(segment, ui) {
  if (segment === 'detractor') return ui('surveyNpsQ2Detractor');
  if (segment === 'passive') return ui('surveyNpsQ2Passive');
  return ui('surveyNpsQ2Promoter');
}

function NPSSurveyContent({ phase, setPhase, score, setScore, feedback, setFeedback, tags, setTags, onDismiss, ui }) {

  if (phase === 'thanks') {
    return (
      <ThanksBody
        title={ui('surveyThankYou')}
        line={ui('surveyNpsThanksLine')}
        data-testid="ThanksBody__91aeca" />
    );
  }

  if (phase === 'followup') {
    const segment = npsSegment(score);
    const q2 = npsQ2Copy(segment, ui);
    const chipOptions = segment === 'promoter'
      ? [ui('surveyChipSpeed'), ui('surveyChipDesign'), ui('surveyChipFeatures'), ui('surveyChipSupport'), ui('surveyChipPrice'), ui('surveyChipDocs'), ui('surveyChipAI')]
      : [ui('surveyChipSpeed'), ui('surveyChipDesign'), ui('surveyChipFeatures'), ui('surveyChipSupport'), ui('surveyChipPrice'), ui('surveyChipDocs')];
    return (
      <>
        <div style={{ font: font(17, 700, 24), color: T.fg1, letterSpacing: '-0.005em', marginBottom: 2 }}>{q2}</div>
        <div style={{ font: font(13, 400, 18), color: T.fg3, marginBottom: 14 }}>{ui('surveyQ2Optional')}</div>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder={ui('surveyNpsQ2Placeholder')}
          rows={4}
          style={{
            width: '100%', resize: 'none',
            padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border2}`,
            font: font(13, 400, 18), color: T.fg1, background: 'hsl(var(--card))',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ marginTop: 10 }}>
          <ChipGroup
            options={chipOptions}
            value={tags}
            onChange={setTags}
            data-testid="ChipGroup__91aeca" />
        </div>
        <SurveyFooter
          onBack={() => {
            // Clear followup input before returning to score selection: otherwise a stale
            // feedback/tags combo typed against the previous score/segment could be resubmitted
            // unchanged against a new score picked after Back (see docs/surveys.md "Back Navigation").
            setFeedback('');
            setTags([]);
            setPhase('initial');
          }}
          backLabel={ui('surveyBack')}
          onSubmit={() => setPhase('thanks')}
          submitLabel={ui('surveySubmit')}
          data-testid="SurveyFooter__91aeca" />
      </>
    );
  }

  return (
    <>
      <div style={{ font: font(17, 700, 24), color: T.fg1, letterSpacing: '-0.005em', marginBottom: 2 }}>
        {ui('surveyNpsTitle')}
      </div>
      <NPSScale
        value={score}
        onChange={setScore}
        labelLow={ui('surveyNpsLow')}
        labelHigh={ui('surveyNpsHigh')}
        data-testid="NPSScale__91aeca" />
      <SurveyFooter
        onSkip={onDismiss}
        onSubmit={() => setPhase('followup')}
        submitLabel={ui('surveyNext')}
        skipLabel={ui('surveySkip')}
        disabled={score === null}
        data-testid="SurveyFooter__91aeca" />
    </>
  );
}

// ─── CSAT survey content ──────────────────────────────────────────────────────
// Prefers canned responses configured in the backoffice "Survey Configuration" window
// (already resolved to plain, language-specific text — no ui() lookup needed) over the
// hardcoded locale-key list in surveys.js, which only serves as an offline/unreachable-
// backend fallback. Remote entries carry a { minScore, maxScore } band (configurable per
// phrase in the backoffice) — filtered against the score the user actually picked, so e.g.
// a 1-star and a 3-star CSAT response can surface different phrases. The hardcoded fallback
// list has no ranges and keeps showing unconditionally within the followup phase (offline
// degradation only, not expected to need this granularity).
function resolveCannedOptions(survey, locale, ui, score) {
  const remote = getRemoteCannedResponses(survey.id, locale);
  if (remote) {
    return remote
      .filter(({ minScore, maxScore }) => score >= minScore && score <= maxScore)
      .map(({ icon, text }) => ({ icon, label: text }));
  }
  return (survey.canned ?? []).map(({ icon, key }) => ({ icon, label: ui(key) }));
}

function CSATSurveyContent({ survey, phase, setPhase, score, setScore, feedback, setFeedback, onDismiss, ui }) {
  const { locale } = useLocaleSwitch();

  if (phase === 'thanks') {
    return (
      <ThanksBody
        title={ui('surveyThankYou')}
        line={ui(survey.thanksKey)}
        data-testid="ThanksBody__91aeca" />
    );
  }

  if (phase === 'followup') {
    return (
      <>
        <div style={{ font: font(17, 700, 24), color: T.fg1, letterSpacing: '-0.005em', marginBottom: 2 }}>
          {ui(survey.q2TitleKey)}
        </div>
        <div style={{ font: font(13, 400, 18), color: T.fg3, marginBottom: 14 }}>{ui('surveyQ2Optional')}</div>
        <CannedResponseGrid
          options={resolveCannedOptions(survey, locale, ui, score)}
          onPick={setFeedback}
          data-testid="CannedResponseGrid__91aeca" />
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder={ui(survey.q2PlaceholderKey)}
          rows={4}
          style={{
            width: '100%', resize: 'none',
            padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border2}`,
            font: font(13, 400, 18), color: T.fg1, background: 'hsl(var(--card))',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        <SurveyFooter
          onBack={() => {
            // Clear the typed feedback before returning to star selection. CSAT's initial-phase
            // submit branches on score (<=3 -> followup, >3 -> thanks), so without this a score
            // typed against e.g. a 2-star rating could be silently resubmitted attached to a
            // 5-star rating that skips followup entirely (see docs/surveys.md "Back Navigation").
            setFeedback('');
            setPhase('initial');
          }}
          backLabel={ui('surveyBack')}
          onSubmit={() => setPhase('thanks')}
          submitLabel={ui('surveySubmit')}
          data-testid="SurveyFooter__91aeca" />
      </>
    );
  }

  return (
    <>
      <div style={{ font: font(17, 700, 24), color: T.fg1, letterSpacing: '-0.005em', marginBottom: 14 }}>
        {ui(survey.titleKey)}
      </div>
      <StarScale
        value={score}
        onChange={setScore}
        labelLow={ui('csatLabelLow')}
        labelHigh={ui('csatLabelHigh')}
        data-testid="StarScale__91aeca" />
      <SurveyFooter
        onSkip={onDismiss}
        onSubmit={() => {
          if (score === null) return;
          if (score <= 3) setPhase('followup');
          else setPhase('thanks');
        }}
        submitLabel={ui('surveySubmit')}
        skipLabel={ui('surveySkip')}
        disabled={score === null}
        data-testid="SurveyFooter__91aeca" />
    </>
  );
}

// ─── Main SurveyModal ─────────────────────────────────────────────────────────
export function SurveyModal({ survey, open, onScoreSelected, onRespond, onDismiss, onClose }) {
  const ui = useUI();
  const [score, setScore] = useState(null);
  const [phase, setPhase] = useState('initial');
  const [feedback, setFeedback] = useState('');
  const [tags, setTags] = useState([]);

  useEffect(() => {
    if (open) {
      setScore(null);
      setPhase('initial');
      setFeedback('');
      setTags([]);
    }
  }, [open]);

  if (!open || !survey) return null;

  const isNps = survey.type === 'nps';

  function handleScoreSelect(n) {
    setScore(n);
  }

  // Fires the "abandoned vote" signal exactly once, only when the survey is left without a
  // final submit — never on every click (that would fire N times for N score changes) and
  // never when the user actually submits (survey_responded already carries the score there).
  function handleDismissWithScore() {
    if (score !== null) {
      onScoreSelected?.(score);
    }
    onDismiss();
  }

  function handleClose() {
    if (phase !== 'thanks') handleDismissWithScore();
  }

  function handleSetPhase(next) {
    if (next === 'thanks') {
      onRespond(score, feedback, tags);
    }
    setPhase(next);
    if (next === 'thanks') {
      setTimeout(() => {
        onClose();
      }, 2000);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      data-testid="SurveyModal__overlay"
    >
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'hsl(var(--foreground) / 0.32)',
          backdropFilter: 'blur(2px)',
          animation: 'sf-survey-fade .2s ease-out',
        }}
        data-testid="SurveyModal__backdrop"
      />
      {/* Modal card */}
      <div
        style={{
          position: 'relative',
          width: 520, maxWidth: '92vw',
          background: 'hsl(var(--card))', borderRadius: 16,
          boxShadow: '0 24px 64px hsl(var(--foreground) / 0.18), 0 4px 12px hsl(var(--foreground) / 0.06)',
          animation: 'sf-survey-pop .25s cubic-bezier(.2,.9,.3,1.2)',
        }}
        data-testid="SurveyModal__card"
      >
        <SurveyHeader
          eyebrow={ui('surveyEyebrow')}
          onClose={phase !== 'thanks' ? handleClose : undefined}
          data-testid="SurveyHeader__91aeca" />

        <div style={{ padding: '12px 20px 20px' }}>
          {isNps ? (
            <NPSSurveyContent
              phase={phase}
              setPhase={handleSetPhase}
              score={score}
              setScore={handleScoreSelect}
              feedback={feedback}
              setFeedback={setFeedback}
              tags={tags}
              setTags={setTags}
              onDismiss={handleDismissWithScore}
              ui={ui}
              data-testid="NPSSurveyContent__91aeca" />
          ) : (
            <CSATSurveyContent
              survey={survey}
              phase={phase}
              setPhase={handleSetPhase}
              score={score}
              setScore={handleScoreSelect}
              feedback={feedback}
              setFeedback={setFeedback}
              onDismiss={handleDismissWithScore}
              ui={ui}
              data-testid="CSATSurveyContent__91aeca" />
          )}
        </div>
      </div>
      <style>{`
        @keyframes sf-survey-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes sf-survey-pop {
          from { opacity: 0; transform: scale(.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
