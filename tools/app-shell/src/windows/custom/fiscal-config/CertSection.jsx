import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useUI, useLocaleSwitch } from '@/i18n';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import { FileText, Upload } from 'lucide-react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import CertModal from './CertModal.jsx';

/**
 * The organization's digital certificate: its state and "Reemplazar", or the upload dropzone.
 * The org has ONE certificate shared by every fiscal system, so the same block appears in the SII,
 * TicketBAI and VERI*FACTU sections (ETP-5831). `refreshKey` re-reads it (the page bumps it when the
 * certificate is replaced from another section); `onUploaded` reports a replacement upwards.
 * `validTo` arrives as ISO `yyyy-MM-dd` (both `GET /certificate` and the upload details) and is
 * formatted for the UI locale here (ETP-6053).
 */
export default function CertSection({ context, orgId, apiBaseUrl, refreshKey = 0, onUploaded }) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [cert, setCert]   = useState(null);
  const [open, setOpen]   = useState(false);
  const [drag, setDrag]   = useState(false);

  useEffect(() => {
    if (!orgId || !apiBaseUrl) return;
    apiFetch(`/certificate?${new URLSearchParams({ orgId })}`)
      .then(r => r.json())
      .then(data => {
        if (data?.exists) setCert({ name: ui('fiscal.cert.loaded'), validTo: data.validTo ?? '' });
      })
      .catch(() => {});
  }, [apiFetch, ui, orgId, apiBaseUrl, refreshKey]);

  if (cert) {
    return (
      <>
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-3 gap-4">
          <div className="flex items-center gap-2.5">
            <FileText
              size={16}
              className="text-muted-foreground flex-shrink-0"
              data-testid="FileText__e7cbc5" />
            <div>
              <div className="text-sm font-medium">{cert.name}</div>
              <div className="text-xs text-muted-foreground">
                {ui('fiscal.cert.validUntil', { date: formatCalendarDate(cert.validTo, locale || 'es_ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) })}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            data-testid="Button__e7cbc5">
            {ui('fiscal.cert.replace')}
          </Button>
        </div>
        {open && (
          <CertModal
            context={context}
            orgId={orgId}
            apiBaseUrl={apiBaseUrl}
            onClose={() => setOpen(false)}
            onUpload={(c) => { setCert(c); setOpen(false); onUploaded?.(c); }}
            data-testid="CertModal__e7cbc5" />
        )}
      </>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); setOpen(true); }}
        className={`rounded-xl border border-dashed cursor-pointer py-5 px-8 text-center transition-all
          ${drag
            ? 'border-foreground bg-muted/40'
            : 'border-[hsl(var(--border-control))] hover:border-foreground/40 hover:bg-muted/20'}`}
      >
        <div className="mx-auto mb-2 w-9 h-9 rounded-xl border border-[hsl(var(--border-subtle))] bg-card flex items-center justify-center shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)]">
          <Upload
            size={16}
            strokeWidth={1.75}
            className="text-[hsl(var(--text-disabled))]"
            data-testid="Upload__e7cbc5" />
        </div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{ui('fiscal.cert.dropzone.drag')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{ui('fiscal.cert.dropzone.formats')}</p>
      </div>
      {open && (
        <CertModal
          context={context}
          orgId={orgId}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setOpen(false)}
          onUpload={(c) => { setCert(c); setOpen(false); onUploaded?.(c); }}
          data-testid="CertModal__e7cbc5" />
      )}
    </>
  );
}
