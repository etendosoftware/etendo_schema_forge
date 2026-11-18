// Modelo 390 — "Generar fichero 390" popup (ETP-5716): file name (default = the backend's own
// `390_0A_<year>.txt`) and a read-only summary of what is being generated. Same shell as the 303
// popup (`FileGenModal303`, `.fm-config-modal`); generating saves pending changes first — that is
// the page's job (FmModel390Page.handleGenerate), this popup only collects the name. While the
// file is generated and validated by the AEAT it stays open on the loading state of the fiscal
// certificate upload (CircularProgress) and nothing in it can be clicked again. A file the AEAT
// rejected or could not validate then shows the result step (same banner as the direct
// presentation's result); the file is downloaded in every case.
import React, { useState } from 'react';
import { WarningIcon, WarningOctagonIcon } from '@phosphor-icons/react';
import { CircularProgress, useSimulatedProgress } from '@/windows/custom/fiscal-config/CircularProgress.jsx';
import { formatAmount } from '../../fiscalModelsUtils.js';
import { AeatResultBanner } from '../303/AeatResultBanner.jsx';
import { FILE_VALIDATION } from './fileValidation390.js';
import { generatedFileName } from './fm390Api.js';

// The AEAT validator's answer about the file that was just downloaded — the result step, with the
// banner of the direct presentation's result (AeatResultBanner): the AEAT errors with their codes
// (red), its warnings on an accepted file (amber), or "could not be validated" (amber). The file
// is downloaded in every case.
function entryText(e, t) {
  return e.code ? t('fm.m390.file_validation.error_line', { code: e.code, message: e.message }) : e.message;
}

// The AEAT warnings (`avisos`), as the direct presentation lists them under its result.
function AeatWarnings({ warnings, t, 'data-testid': testId }) {
  if (!warnings?.length) return null;
  return (
    <div style={{ marginTop: 16, fontSize: 13, color: 'hsl(var(--muted-foreground))' }} data-testid={testId}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('fm.aeat.warnings.title')}</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {warnings.map(w => <li key={`${w.code}|${w.message}`}>{entryText(w, t)}</li>)}
      </ul>
    </div>
  );
}

// The result step: its wrapper takes the `data-testid` given by the popup.
function ValidationResult({ validation, t, 'data-testid': testId }) {
  return <div data-testid={testId}>{validationBanner(validation, t)}</div>;
}

function validationBanner(validation, t) {
  if (validation.outcome === FILE_VALIDATION.ACCEPTED) {
    // Accepted with AEAT warnings: the warning banner, the warnings inside it.
    return (
      <AeatResultBanner
        tone="warning"
        icon={<WarningIcon size={18} data-testid="TriangleAlert__filegen390Warnings" />}
        title={t('fm.m390.file_validation.warnings.title')}
        data-testid="AeatResultBanner__filegen390Warnings">
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} data-testid="FileGenModal390__warnings">
          {validation.warnings.map(w => <li key={`${w.code}|${w.message}`}>{entryText(w, t)}</li>)}
        </ul>
        <div style={{ fontSize: 13, marginTop: 8, lineHeight: '18px' }}>{t('fm.m390.file_validation.warnings.body')}</div>
      </AeatResultBanner>
    );
  }
  if (validation.outcome === FILE_VALIDATION.REJECTED) {
    return (
      <>
      <AeatResultBanner
        tone="danger"
        icon={<WarningOctagonIcon size={18} data-testid="OctagonAlert__filegen390" />}
        title={t('fm.m390.file_validation.rejected.title')}
        data-testid="AeatResultBanner__filegen390Rejected">
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} data-testid="FileGenModal390__errors">
          {validation.errors.map(e => (
            <li key={`${e.code}|${e.message}`}>{entryText(e, t)}</li>
          ))}
        </ul>
        <div style={{ fontSize: 13, marginTop: 8, lineHeight: '18px' }}>{t('fm.m390.file_validation.rejected.body')}</div>
      </AeatResultBanner>
      <AeatWarnings warnings={validation.warnings} t={t} data-testid="FileGenModal390__warnings" />
      </>
    );
  }
  return (
    <AeatResultBanner
      tone="warning"
      icon={<WarningIcon size={18} data-testid="TriangleAlert__filegen390" />}
      title={t('fm.m390.file_validation.unavailable.title')}
      body={t('fm.m390.file_validation.unavailable.body')}
      data-testid="AeatResultBanner__filegen390Unavailable" />
  );
}

/**
 * @param {Function} props.onConfirm       ({ fileName }) => Promise<validation|null> — the page
 *   generates, validates and downloads; it resolves the validator's answer (`fileValidationOf`),
 *   or null when there is nothing to show (generation failed: the page already said why).
 * @param {Function} [props.onViewIncidents] opens the Incidencias tab (rejected file)
 */
export default function FileGenModal390({ decl, summary, typeLabel, resultLabel, onConfirm, onViewIncidents, onClose, t }) {
  const [fileName, setFileName] = useState(generatedFileName(decl));
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const progress = useSimulatedProgress(working);
  const close = () => { if (!working) onClose(); };
  // Stays open (loading, not re-clickable) until the page's generation settles. A file the AEAT
  // rejected, accepted with warnings or could not validate moves to the result step; a clean one
  // (or a failed generation) closes the popup.
  async function confirm() {
    if (working) return;
    setWorking(true);
    let validation = null;
    try {
      validation = await onConfirm?.({ fileName: fileName.trim() || undefined });
    } catch (_) {
      validation = null;
    }
    setWorking(false);
    const clean = validation?.outcome === FILE_VALIDATION.ACCEPTED && !validation.warnings?.length;
    if (validation && !clean) setResult(validation);
    else onClose();
  }
  // Whatever the AEAT said is also in Incidencias; "could not be validated" stored nothing.
  const hasIncidents = result?.outcome === FILE_VALIDATION.REJECTED || result?.outcome === FILE_VALIDATION.ACCEPTED;
  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" aria-busy={working} onClick={close}>
      <div className="fm-config-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} data-testid="FileGenModal390">
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.action.gen390')}</div>
            <div className="fm-config-modal__sub">{t('fm.m390.filegen.sub', { year: decl?.year })}</div>
          </div>
          <button className="fm-config-modal__close" onClick={close} disabled={working} aria-label={t('fm.action.close')}>✕</button>
        </div>
        <div className="fm-config-modal__body" style={{ minHeight: 'auto', padding: '16px 20px' }}>
          {working && (
            <div className="py-8 text-center" role="status" data-testid="FileGenModal390__validating">
              <CircularProgress progress={progress} data-testid="CircularProgress__filegen390" />
              <p className="text-sm font-semibold mt-4">{t('fm.m390.file_validation.validating')}</p>
            </div>
          )}
          {!working && result && (
            <ValidationResult validation={result} t={t} data-testid="FileGenModal390__result" />
          )}
          {!working && !result && (<>
          <label className="fm-390-filegen__label" htmlFor="fm390-filegen-name">{t('fm.filegen.filename')}</label>
          <input
            id="fm390-filegen-name"
            className="fm-390-filegen__input"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            data-testid="FileGenModal390__fileName"
          />
          <dl className="fm-390-filegen__summary" data-testid="FileGenModal390__summary">
            <dt>{t('fm.m349.type.label')}</dt><dd>{typeLabel}</dd>
            <dt>{t('fm.m303.summary.result')}</dt><dd>{`${formatAmount(summary?.result ?? 0)} · ${resultLabel}`}</dd>
          </dl>
          </>)}
        </div>
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={close} disabled={working} data-testid="FileGenModal390__close">
            {t(result ? 'fm.action.close' : 'fm.action.cancel')}
          </button>
          {hasIncidents && onViewIncidents && (
            <button
              className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
              onClick={() => { onViewIncidents(); onClose(); }}
              data-testid="FileGenModal390__viewIncidents"
            >
              {t('fm.m390.file_validation.view_incidents')}
            </button>
          )}
          {!result && (<button
            className={`fm-btn fm-btn--save-pill${working ? '' : ' fm-btn--save-pill--active'}`}
            onClick={confirm}
            disabled={working}
            data-testid="FileGenModal390__confirm"
          >
            {t('fm.filegen.generate')}
          </button>)}
        </div>
      </div>
    </div>
  );
}
