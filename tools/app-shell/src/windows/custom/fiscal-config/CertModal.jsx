import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { FileText, Upload, Eye, EyeOff, Lock, TriangleAlert, Check, Info } from 'lucide-react';
import FiscalStepItem from './FiscalStepItem.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

function AlertBox({ type, title, body, onDismiss }) {
  if (type === 'error') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
        <TriangleAlert
          size={16}
          className="text-red-500 flex-shrink-0"
          data-testid="TriangleAlert__a22bc2" />
        <span className="flex-1">{title}</span>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="flex-shrink-0 text-muted-foreground hover:text-foreground">✕</button>
        )}
      </div>
    );
  }
  const styles = {
    success: {
      wrap: 'bg-green-50 border-l-[3px] border-l-green-500',
      icon: <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5"><Check
        size={13}
        strokeWidth={2.5}
        className="text-white"
        data-testid="Check__a22bc2" /></div>,
      title: 'text-green-800 font-semibold',
      body:  'text-green-700',
    },
    warning: {
      wrap: 'bg-amber-50 border-l-[3px] border-l-amber-400',
      icon: <div className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5"><Info
        size={13}
        strokeWidth={2.5}
        className="text-white"
        data-testid="Info__a22bc2" /></div>,
      title: 'text-amber-800 font-semibold',
      body:  'text-amber-700',
    },
  };
  const s = styles[type] ?? styles.warning;
  return (
    <div className={`flex gap-3 items-start p-4 rounded-r-xl ${s.wrap}`}>
      {s.icon}
      <div>
        <p className={`text-xs ${s.title}`}>{title}</p>
        {body && <p className={`text-xs mt-1 ${s.body}`}>{body}</p>}
      </div>
    </div>
  );
}

function MiniStepper({ step, ui }) {
  const STEPS = [
    { key: 'pick',   n: 1, label: ui('fiscal.cert.step.file') },
    { key: 'verify', n: 2, label: ui('fiscal.cert.step.verify') },
    { key: 'done',   n: 3, label: ui('fiscal.cert.step.confirm') },
  ];
  const displayStep = step === 'confirmNif' ? 'verify' : step;
  const idx = STEPS.findIndex(s => s.key === displayStep);
  return (
    <div className="flex items-center px-6 pb-4" style={{ gap: 6 }}>
      {STEPS.map((s, i) => (
        <FiscalStepItem
          key={s.key}
          n={s.n}
          label={s.label}
          done={i < idx}
          active={i === idx}
          isFirst={i === 0}
          data-testid="FiscalStepItem__a22bc2" />
      ))}
    </div>
  );
}

function CircularProgress({ progress }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="mx-auto">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#E8EAEF" strokeWidth="8" />
      <circle
        cx="70" cy="70" r={r}
        fill="none" stroke="#121217" strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 0.2s ease' }}
      />
      <text x="70" y="76" textAnchor="middle" fontSize="22" fontWeight="600" fill="#121217">
        {progress}%
      </text>
    </svg>
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
  const [progress,    setProgress]    = useState(0);
  const inputRef = useRef(null);

  const subtitle = CONTEXT_SUBTITLE[context] ?? ui('fiscal.cert.subtitle.default');

  // Animate circular progress when in verify step
  useEffect(() => {
    if (step !== 'verify') { setProgress(0); return; }
    setProgress(0);
    const id = setInterval(() => {
      setProgress(p => {
        if (p >= 90) { clearInterval(id); return 90; }
        return p + 4;
      });
    }, 80);
    return () => clearInterval(id);
  }, [step]);

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
    const start = Date.now();
    const waitMin = () => {
      const remaining = 1500 - (Date.now() - start);
      return remaining > 0 ? new Promise(r => setTimeout(r, remaining)) : Promise.resolve();
    };
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

      await waitMin();
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
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
      await waitMin();
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

  let dropzoneClass;
  if (drag) dropzoneClass = 'border-foreground bg-muted/40';
  else if (file) dropzoneClass = 'border-[#121217] bg-white';
  else dropzoneClass = 'border-dashed border-[#D1D4DB] hover:border-foreground/40 hover:bg-muted/20';

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

        <MiniStepper step={step} ui={ui} data-testid="MiniStepper__a22bc2" />

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
                className={`rounded-xl border-2 cursor-pointer p-7 text-center transition-all ${dropzoneClass}`}
              >
                <div className={`w-11 h-11 mx-auto mb-3 rounded-xl flex items-center justify-center
                  ${file ? 'bg-[#121217]' : 'bg-muted text-foreground'}`}>
                  {file
                    ? <FileText
                    size={20}
                    strokeWidth={1.5}
                    className="text-white"
                    data-testid="FileText__a22bc2" />
                    : <Upload size={20} strokeWidth={1.5} data-testid="Upload__a22bc2" />}
                </div>
                {file ? (
                  <>
                    <p className="text-sm font-semibold truncate w-full px-2">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                    <p className="text-xs text-amber-600 mt-1">{ui('fiscal.cert.dropzone.changeHint')}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">{ui('fiscal.cert.dropzone.drag')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ui('fiscal.cert.dropzone.formats')}</p>
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
                <AlertBox
                  type="error"
                  title={errMsg}
                  onDismiss={() => setErrMsg(null)}
                  data-testid="AlertBox__a22bc2" />
              )}

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  {ui('fiscal.cert.pwd.label')} <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 rounded-lg border border-[#D1D4DB] bg-white px-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={showPwd ? ui('fiscal.cert.pwd.hide') : ui('fiscal.cert.pwd.show')}
                  >
                    {showPwd ? <EyeOff size={14} strokeWidth={1.75} data-testid="EyeOff__a22bc2" /> : <Eye size={14} strokeWidth={1.75} data-testid="Eye__a22bc2" />}
                  </button>
                </div>
                <p className="text-xs text-[#121217] mt-1.5 flex items-center gap-1">
                  <Lock size={11} strokeWidth={2} data-testid="Lock__a22bc2" /> {ui('fiscal.cert.pwd.hint')}
                </p>
              </div>

              <AlertBox
                type="warning"
                title={ui('fiscal.cert.info.title')}
                body={ui('fiscal.cert.info.body')}
                data-testid="AlertBox__a22bc2" />
            </div>
          )}

          {step === 'verify' && (
            <div className="py-8 text-center">
              <CircularProgress progress={progress} data-testid="CircularProgress__a22bc2" />
              <p className="text-sm font-semibold mt-4">{ui('fiscal.cert.verifying.title')}</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                {ui('fiscal.cert.verifying.body')}
              </p>
            </div>
          )}

          {step === 'confirmNif' && (
            <div className="space-y-4">
              <AlertBox
                type="warning"
                title={ui('fiscal.cert.nif.warning.title')}
                body={ui('fiscal.cert.nif.warning.body', { nif: pendingNif })}
                data-testid="AlertBox__a22bc2" />
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
              <AlertBox
                type="success"
                title={ui('fiscal.cert.success.title')}
                body={ui('fiscal.cert.success.body')}
                data-testid="AlertBox__a22bc2" />

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
                <Lock size={11} strokeWidth={2} data-testid="Lock__a22bc2" /> {ui('fiscal.cert.success.encrypted')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border gap-3">
          {step === 'pick' && (
            <div className="flex items-center justify-end w-full">
              <Button
                onClick={verify}
                disabled={!file || !pwd}
                className="rounded-full"
                data-testid="Button__a22bc2">
                <Check size={14} className="mr-1.5" data-testid="Check__a22bc2" />{ui('fiscal.cert.btn.verify')}
              </Button>
            </div>
          )}
          {step === 'verify' && (
            <>
              <span />
              <Button variant="outline" disabled data-testid="Button__a22bc2">{ui('fiscal.cert.btn.cancel')}</Button>
            </>
          )}
          {step === 'confirmNif' && (
            <>
              <Button
                variant="outline"
                onClick={() => { setStep('pick'); setPendingNif(null); }}
                data-testid="Button__a22bc2">
                {ui('fiscal.cert.btn.change')}
              </Button>
              <Button
                onClick={confirmWithNif}
                className="rounded-full"
                data-testid="Button__a22bc2">
                {ui('fiscal.cert.btn.useNif', { nif: pendingNif })}
              </Button>
            </>
          )}
          {step === 'done' && (
            <>
              <span />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setStep('pick'); setFile(null); setPwd(''); setCertDetails(null); setPendingNif(null); }}
                  data-testid="Button__a22bc2">
                  {ui('fiscal.cert.btn.change')}
                </Button>
                <Button onClick={finish} className="rounded-full" data-testid="Button__a22bc2">{ui('fiscal.cert.btn.use')}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
