// Modelo 390 — "Generar fichero 390" popup (ETP-5716): file name (default = the backend's own
// `390_0A_<year>.txt`) and a read-only summary of what is being generated. Same shell as the 303
// popup (`FileGenModal303`, `.fm-config-modal`); generating saves pending changes first — that is
// the page's job (FmModel390Page.handleGenerate), this popup only collects the name.
import React, { useState } from 'react';
import { formatAmount } from '../../fiscalModelsUtils.js';
import { generatedFileName } from './fm390Api.js';

export default function FileGenModal390({ decl, summary, typeLabel, resultLabel, onConfirm, onClose, t }) {
  const [fileName, setFileName] = useState(generatedFileName(decl));
  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()} data-testid="FileGenModal390">
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.action.gen390')}</div>
            <div className="fm-config-modal__sub">{t('fm.m390.filegen.sub', { year: decl?.year })}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>
        <div className="fm-config-modal__body" style={{ minHeight: 'auto', padding: '16px 20px' }}>
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
        </div>
        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>{t('fm.action.cancel')}</button>
          <button
            className="fm-btn fm-btn--save-pill fm-btn--save-pill--active"
            onClick={() => { onConfirm?.({ fileName: fileName.trim() || undefined }); onClose(); }}
            data-testid="FileGenModal390__confirm"
          >
            {t('fm.filegen.generate')}
          </button>
        </div>
      </div>
    </div>
  );
}
