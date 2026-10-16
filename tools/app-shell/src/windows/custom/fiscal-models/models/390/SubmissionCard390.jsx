// Modelo 390 — "Presentación en la AEAT" card of a submitted declaration (ETP-5716): date and
// time, justificante number, CSV and the user who filed or registered it, from
// `manualData.submission` (submission390.js). A declaration presented before this data existed
// shows only what it has; every missing value reads "—".
import React from 'react';
import { Landmark } from 'lucide-react';
import { formatCalendarDate } from '@/lib/dateOnly.js';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The presentation date as shown: a date-only value (manual registration) through the calendar
 * formatter, the AEAT's own timestamp text verbatim, otherwise the recorded `submittedAt`.
 */
export function presentationDateLabel(submission, bcpLocale = 'es-ES') {
  const raw = String(submission?.presentationDate ?? '').trim();
  if (DATE_ONLY_RE.test(raw)) return formatCalendarDate(raw, bcpLocale);
  if (raw) return raw;
  const at = submission?.submittedAt ? new Date(submission.submittedAt) : null;
  return at && !Number.isNaN(at.getTime())
    ? at.toLocaleString(bcpLocale, { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function Row({ label, value, testId }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span style={{ fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 500, overflowWrap: 'anywhere' }} data-testid={testId}>
        {value || '—'}
      </span>
    </div>
  );
}

export default function SubmissionCard390({ submission, t, bcpLocale }) {
  const manual = submission?.method !== 'aeat_telematic';
  return (
    <section
      style={{
        margin: '0 20px 12px', padding: '12px 16px', borderRadius: 12,
        border: '1px solid hsl(var(--border-subtle))', background: 'hsl(var(--card))',
      }}
      aria-label={t('fm.m390.submission.title')}
      data-testid="SubmissionCard390"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Landmark size={16} strokeWidth={1.75} style={{ color: 'hsl(var(--muted-foreground))' }} data-testid="Landmark__submission390" />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'hsl(var(--foreground))' }}>{t('fm.m390.submission.title')}</span>
        <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }} data-testid="SubmissionCard390__method">
          {t(manual ? 'fm.m390.submission.method_manual' : 'fm.m390.submission.method_telematic')}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Row label={t('fm.m390.submission.date')} value={presentationDateLabel(submission, bcpLocale)} testId="SubmissionCard390__date" />
        <Row label={t('fm.m390.submission.justificante')} value={submission?.justificante} testId="SubmissionCard390__justificante" />
        <Row label={t('fm.m390.submission.csv')} value={submission?.csv} testId="SubmissionCard390__csv" />
        <Row label={t('fm.m390.submission.user')} value={submission?.user} testId="SubmissionCard390__user" />
      </div>
    </section>
  );
}
