import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { FileText, Upload } from 'lucide-react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import CertModal from './CertModal.jsx';

export default function CertSection({ context, orgId, apiBaseUrl }) {
  const ui = useUI();
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
  }, [apiFetch, ui, orgId, apiBaseUrl]);

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
                {ui('fiscal.cert.validUntil', { date: cert.validTo })}
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
            onUpload={(c) => { setCert(c); setOpen(false); }}
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
            : 'border-[#D1D4DB] hover:border-foreground/40 hover:bg-muted/20'}`}
      >
        <div className="mx-auto mb-2 w-9 h-9 rounded-xl border border-[#E8EAEF] bg-white flex items-center justify-center shadow-[0_1px_2px_rgba(18,18,23,0.05)]">
          <Upload
            size={16}
            strokeWidth={1.75}
            className="text-[#8A94A6]"
            data-testid="Upload__e7cbc5" />
        </div>
        <p className="text-sm font-medium text-[#121217]">{ui('fiscal.cert.dropzone.drag')}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{ui('fiscal.cert.dropzone.formats')}</p>
      </div>
      {open && (
        <CertModal
          context={context}
          orgId={orgId}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setOpen(false)}
          onUpload={(c) => { setCert(c); setOpen(false); }}
          data-testid="CertModal__e7cbc5" />
      )}
    </>
  );
}
