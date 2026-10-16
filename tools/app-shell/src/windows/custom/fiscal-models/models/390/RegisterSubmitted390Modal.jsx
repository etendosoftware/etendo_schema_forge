// Modelo 390 — "Registrar como presentada", step 2 (ETP-5716): a declaration filed outside Etendo
// (AEAT portal, an advisor) is registered with its justificante number, its presentation date
// and, optionally, the justificante PDF. Confirming requires "Declaro que los datos de esta
// declaración son conformes". The page then saves `manualData.submission`, uploads the PDF and
// sets the 303/349 manual-register status: `submitted_ack` / `manual_ack` with the PDF,
// `submitted` / `manual_no_receipt` without it (manualRegistrationStatus).
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/windows/custom/shared/CheckboxField.jsx';
import { buildAcceptAttribute, buildTypesLabel, isFileTypeAllowed } from '@/components/attachments/attachmentPolicy.js';
import { todayCalendarISO } from '@/lib/dateOnly.js';
import { RECEIPT_ATTACHMENT_CONFIG } from '../../fiscalModelsUtils.js';
import { FORMER_STATEMENT_LENGTH, isValidFormerStatement, sanitizeFormerStatementInput } from '../../formerStatement.js';

/**
 * Why the form cannot be confirmed, or `null`: the justificante must be 13 digits, the date set
 * and not in the future, and the conformity check marked.
 */
export function registerFormError({ justificante, date, conform, today = todayCalendarISO() } = {}) {
  if (!isValidFormerStatement(justificante)) return 'fm.m390.register.justificante_invalid';
  if (!date) return 'fm.m390.register.date_required';
  if (date > today) return 'fm.m390.register.date_future';
  if (!conform) return 'fm.m390.register.conformity_required';
  return null;
}

export default function RegisterSubmitted390Modal({ onConfirm, onClose, busy = false }) {
  const t = useUI();
  const today = todayCalendarISO();
  const [justificante, setJustificante] = useState('');
  const [date, setDate] = useState(today);
  const [file, setFile] = useState(null);
  const [conform, setConform] = useState(false);
  const fileRef = useRef(null);

  const error = registerFormError({ justificante, date, conform, today });
  const justificanteInvalid = justificante.length > 0 && !isValidFormerStatement(justificante);

  function onPickFile(e) {
    const picked = e.target.files?.[0] ?? null;
    if (picked && !isFileTypeAllowed(picked, RECEIPT_ATTACHMENT_CONFIG)) {
      toast.error(t('attachmentsInvalidType'));
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(picked);
  }

  return (
    <div className="fm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fm-config-modal fm-aeat-modal" onClick={e => e.stopPropagation()} data-testid="RegisterSubmitted390Modal__dialog">
        <div className="fm-config-modal__header">
          <div className="fm-config-modal__titles">
            <div className="fm-config-modal__title">{t('fm.m390.register.title')}</div>
            <div className="fm-config-modal__sub">{t('fm.m390.register.sub')}</div>
          </div>
          <button className="fm-config-modal__close" onClick={onClose} aria-label={t('fm.action.close')}>✕</button>
        </div>

        <div className="fm-config-modal__body">
          <div className="fm-aeat-fields">
            <div className="fm-aeat-field">
              <label className="fm-aeat-field__label" htmlFor="fm-390-register-justificante">
                {t('fm.m390.register.justificante')}<span className="fm-aeat-required-mark" aria-hidden="true">*</span>
              </label>
              <Input
                id="fm-390-register-justificante"
                type="text"
                inputMode="numeric"
                maxLength={FORMER_STATEMENT_LENGTH}
                value={justificante}
                aria-invalid={justificanteInvalid || undefined}
                onChange={e => setJustificante(sanitizeFormerStatementInput(e.target.value))}
                placeholder={t('fm.m349.substitutive_banner.former_statement_placeholder')}
                data-testid="RegisterSubmitted390Modal__justificante" />
              {justificanteInvalid && (
                <span className="fm-390-inline-error" role="alert" data-testid="RegisterSubmitted390Modal__justificanteError">
                  {t('fm.m390.register.justificante_invalid')}
                </span>
              )}
            </div>
            <div className="fm-aeat-field">
              <label className="fm-aeat-field__label" htmlFor="fm-390-register-date">
                {t('fm.m390.register.date')}<span className="fm-aeat-required-mark" aria-hidden="true">*</span>
              </label>
              <Input
                id="fm-390-register-date"
                type="date"
                max={today}
                value={date}
                onChange={e => setDate(e.target.value)}
                data-testid="RegisterSubmitted390Modal__date" />
            </div>
            <div className="fm-aeat-field">
              <span className="fm-aeat-field__label">{t('fm.m390.register.pdf')}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="fm-btn"
                  title={file ? file.name : undefined}
                  onClick={() => fileRef.current?.click()}
                  data-testid="RegisterSubmitted390Modal__pickFile"
                >
                  {file ? file.name : t('fm.present.upload_acuse', { types: buildTypesLabel(RECEIPT_ATTACHMENT_CONFIG, t) })}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={buildAcceptAttribute(RECEIPT_ATTACHMENT_CONFIG)}
                  style={{ display: 'none' }}
                  onChange={onPickFile}
                  data-testid="RegisterSubmitted390Modal__fileInput" />
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'hsl(var(--foreground))', cursor: 'pointer' }}>
            <CheckboxField checked={conform} onToggle={setConform} data-testid="RegisterSubmitted390Modal__conformity" />
            {t('fm.present.conformity')}
          </label>
        </div>

        <div className="fm-config-modal__footer">
          <button className="fm-btn fm-btn--cancel-pill" onClick={onClose}>{t('fm.action.cancel')}</button>
          <button
            className={`fm-btn fm-btn--save-pill${!error && !busy ? ' fm-btn--save-pill--active' : ''}`}
            disabled={!!error || busy}
            title={error ? t(error) : undefined}
            onClick={() => onConfirm({ justificante: justificante.trim(), date, file })}
            data-testid="RegisterSubmitted390Modal__confirm"
          >
            {t('fm.action.confirm_presentation')}
          </button>
        </div>
      </div>
    </div>
  );
}
