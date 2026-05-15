import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { FileText, Upload, Eye, EyeOff, Lock, TriangleAlert, CircleCheck } from 'lucide-react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

function MiniStepper({ step, ui }) {
  const STEPS = [
    { key: 'pick',   n: '1', label: ui('fiscal.cert.step.file') },
    { key: 'verify', n: '2', label: ui('fiscal.cert.step.verify') },
    { key: 'done',   n: '3', label: ui('fiscal.cert.step.confirm') },
  ];
  // 'confirmNif' is logically part of the verification step
  const displayStep = step === 'confirmNif' ? 'verify' : step;
  const idx = STEPS.findIndex(s => s.key === displayStep);
  return (
    <div className="flex items-center gap-2 px-6 pb-4 text-xs text-muted-foreground">
      {STEPS.map((s, i) => {
        const done   = i < idx;
        const active = i === idx;
        return (
          <span key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="flex-1 h-px bg-border w-6" />}
            <span className={`flex items-center gap-1.5 font-medium ${active || done ? 'text-foreground' : 'text-muted-foreground'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0
                ${done   ? 'bg-foreground text-background' :
                  active ? 'bg-yellow-400 text-foreground ring-2 ring-black/10' :
                           'bg-muted text-muted-foreground'}`}>
                {done ? '✓' : s.n}
              </span>
              {s.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default function CertModal({ context, orgId, apiBaseUrl, onClose, onUpload, debugInitialState }) {
  const ui = useUI();
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  const CONTEXT_SUBTITLE = {
    tbai:      ui('fiscal.cert.subtitle.tbai'),
    sii:       ui('fiscal.cert.subtitle.sii'),
    verifactu: ui('fiscal.cert.subtitle.verifactu'),
  };

  const [drag,        setDrag]        = useState(false);
  const [file,        setFile]        = useState(debugInitialState?.file ?? null);
  const [pwd,         setPwd]         = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [step,        setStep]        = useState(debugInitialState?.step ?? 'pick');
  const [errMsg,      setErrMsg]      = useState(debugInitialState?.errMsg ?? null);
  const [certDetails, setCertDetails] = useState(debugInitialState?.certDetails ?? null);
  const [pendingNif,  setPendingNif]  = useState(debugInitialState?.pendingNif ?? null);
  const inputRef = useRef(null);

  const subtitle = CONTEXT_SUBTITLE[context] ?? ui('fiscal.cert.subtitle.default');

  function pickFile(f) {
    if (!f) return;
    setErrMsg(null);
    setPendingNif(null);
    if (!/\.(p12|pfx)$/i.test(f.name)) {
      setErrMsg(ui('fiscal.cert.err.format'));
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setErrMsg(ui('fiscal.cert.err.size'));
      return;
    }
    setFile(f);
  }

  async function performUpload(setOrgNif = false) {
    setStep('verify');
    setErrMsg(null);
    try {
      const formData = new FormData();
      formData.append('certificate', file);
      formData.append('orgId', orgId ?? '');
      formData.append('password', pwd);
      if (setOrgNif) formData.append('setOrgNif', 'true');

      const res = await apiFetch(`/certificate`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 422 = NIF mismatch — use localized message; other errors show raw backend text
        const raw = data?.error?.message ?? data?.message;
        const errText = res.status === 422
          ? ui('fiscal.cert.err.nifMismatch')
          : (typeof raw === 'string' ? raw : raw?.text) ?? ui('fiscal.cert.err.default');
        setErrMsg(errText);
        setStep('pick');
        return;
      }

      // Org has no NIF — backend asks the user to confirm using the cert NIF
      if (data.pendingNifConfirmation && data.certNif) {
        setPendingNif(data.certNif);
        setStep('confirmNif');
        return;
      }

      setCertDetails(data.cert ?? null);
      setStep('done');
    } catch {
      setErrMsg(ui('fiscal.cert.err.connection'));
      setStep('pick');
    }
  }

  function verify() {
    if (!file || !pwd) return;
    performUpload(false);
  }

  function confirmWithNif() {
    performUpload(true);
  }

  function finish() {
    onUpload({ name: file.name, validTo: certDetails?.validTo ?? '' });
    onClose();
  }

  function parseCN(dn) {
    const match = /CN=([^,]+)/.exec(dn ?? '');
    return match ? match[1].trim() : dn;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-[540px] mx-4 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div>
            <h2 className="text-base font-bold">{ui('fiscal.cert.modal.title')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label={ui('fiscal.cert.close')}
          >
            ✕
          </button>
        </div>

        <MiniStepper step={step} ui={ui} />

        {/* Body */}
        <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">

          {step === 'pick' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={e => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
                className={`rounded-xl border-2 border-dashed cursor-pointer p-7 text-center transition-all
                  ${drag    ? 'border-foreground bg-muted/40' :
                    file    ? 'border-green-400 bg-green-50' :
                              'border-border hover:border-foreground/40 hover:bg-muted/20'}`}
              >
                <div className={`w-11 h-11 mx-auto mb-3 rounded-xl flex items-center justify-center
                  ${file ? 'bg-green-100 text-green-700' : 'bg-muted text-foreground'}`}>
                  {file ? <FileText size={22} strokeWidth={1.5} /> : <Upload size={22} strokeWidth={1.5} />}
                </div>
                {file ? (
                  <>
                    <p className="text-sm font-semibold truncate w-full px-2">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB · {ui('fiscal.cert.dropzone.changeHint')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{ui('fiscal.cert.dropzone.drag')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ui('fiscal.cert.dropzone.click')}</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".p12,.pfx"
                  className="hidden"
                  onChange={e => pickFile(e.target.files[0])}
                />
              </div>

              {errMsg && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                  <span className="flex-shrink-0">✕</span>
                  <span>{errMsg}</span>
                </div>
              )}

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-1.5">{ui('fiscal.cert.pwd.label')}</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? ui('fiscal.cert.pwd.hide') : ui('fiscal.cert.pwd.show')}
                  >
                    {showPwd ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Lock size={11} strokeWidth={2} /> {ui('fiscal.cert.pwd.hint')}
                </p>
              </div>

              {/* Info */}
              <div className="rounded-[10px] border border-blue-200 bg-blue-50 p-3 flex gap-2 text-xs text-blue-800">
                <span className="flex-shrink-0">ℹ</span>
                <div>
                  <strong>{ui('fiscal.cert.info.title')}</strong>
                  <p className="text-blue-700/80 mt-0.5">{ui('fiscal.cert.info.body')}</p>
                </div>
              </div>
            </div>
          )}

          {step === 'verify' && (
            <div className="py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border-4 border-muted border-t-foreground animate-spin" />
              <p className="text-sm font-semibold">{ui('fiscal.cert.verifying.title')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {ui('fiscal.cert.verifying.body')}
              </p>
            </div>
          )}

          {step === 'confirmNif' && (
            <div className="space-y-4">
              <div className="flex gap-2.5 items-start p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
                <TriangleAlert size={16} strokeWidth={1.75} className="flex-shrink-0" />
                <div>
                  <p className="font-semibold">{ui('fiscal.cert.nif.warning.title')}</p>
                  <p className="text-xs text-amber-800/80 mt-1">
                    {ui('fiscal.cert.nif.warning.body', { nif: pendingNif })}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border divide-y divide-border text-sm">
                <div className="flex items-center px-4 py-2.5 gap-4">
                  <span className="text-muted-foreground flex-shrink-0 min-w-[7rem]">{ui('fiscal.cert.nif.row.file')}</span>
                  <span className="font-medium truncate min-w-0 text-right ml-auto">{file?.name}</span>
                </div>
                <div className="flex items-center px-4 py-2.5 gap-4">
                  <span className="text-muted-foreground flex-shrink-0 min-w-[7rem]">{ui('fiscal.cert.nif.row.nif')}</span>
                  <span className="font-medium font-mono truncate min-w-0 text-right ml-auto">{pendingNif}</span>
                </div>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="space-y-4">
              <div className="flex gap-2.5 items-start p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                <CircleCheck size={16} strokeWidth={1.75} className="flex-shrink-0" />
                <div>
                  <strong>{ui('fiscal.cert.success.title')}</strong>
                  <p className="text-xs text-green-700/80 mt-0.5">{ui('fiscal.cert.success.body')}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border divide-y divide-border text-sm">
                {[
                  [ui('fiscal.cert.detail.file'),      file?.name],
                  [ui('fiscal.cert.detail.holder'),    parseCN(certDetails?.subject)],
                  [ui('fiscal.cert.detail.issuer'),    parseCN(certDetails?.issuer)],
                  [ui('fiscal.cert.detail.validFrom'), certDetails?.validFrom],
                  [ui('fiscal.cert.detail.validTo'),   certDetails?.validTo],
                  [ui('fiscal.cert.detail.algorithm'), certDetails?.algorithm],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex items-center px-4 py-2.5 gap-4">
                    <span className="text-muted-foreground flex-shrink-0 min-w-[7rem]">{k}</span>
                    <span className="font-medium truncate min-w-0 text-right ml-auto">{v}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock size={11} strokeWidth={2} /> {ui('fiscal.cert.success.encrypted')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-3">
          {step === 'pick' && (
            <>
              <span className="text-xs text-muted-foreground">{ui('fiscal.cert.footer.formats')}</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>{ui('fiscal.cert.btn.cancel')}</Button>
                <Button onClick={verify} disabled={!file || !pwd}>{ui('fiscal.cert.btn.verify')}</Button>
              </div>
            </>
          )}
          {step === 'verify' && (
            <>
              <span />
              <Button variant="outline" disabled>{ui('fiscal.cert.btn.cancel')}</Button>
            </>
          )}
          {step === 'confirmNif' && (
            <>
              <Button variant="outline" onClick={() => { setStep('pick'); setPendingNif(null); }}>
                {ui('fiscal.cert.btn.cancel')}
              </Button>
              <Button onClick={confirmWithNif}>
                {ui('fiscal.cert.btn.useNif', { nif: pendingNif })}
              </Button>
            </>
          )}
          {step === 'done' && (
            <>
              <span />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setStep('pick'); setFile(null); setPwd(''); setCertDetails(null); setPendingNif(null); }}>
                  {ui('fiscal.cert.btn.change')}
                </Button>
                <Button onClick={finish}>{ui('fiscal.cert.btn.use')}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
