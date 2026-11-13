// Modelo 390 — what the AEAT validator said about the file "Generar fichero 390" just downloaded
// (ETP-5716). The file is downloaded in every case; this is the system notice banner telling the
// user it carries AEAT errors (each with its AEAT code, also stored in Incidencias) or that it
// could not be validated at all. A clean validation shows nothing: the download is the feedback.
import React from 'react';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { FILE_VALIDATION } from './fileValidation390.js';

/**
 * @param {object}   props.validation        `fileValidationOf()` result, or null
 * @param {Function} [props.onViewIncidents] opens the Incidencias tab (AEAT errors only)
 * @param {Function} props.onDismiss         closes the notice
 */
export default function FileValidationNotice390({ validation, onViewIncidents, onDismiss, t }) {
  if (!validation || validation.outcome === FILE_VALIDATION.ACCEPTED) return null;
  const rejected = validation.outcome === FILE_VALIDATION.REJECTED;
  return (
    <div className="fm-390-notices" data-testid="FileValidationNotice390">
      <InfoBanner
        tone="warning"
        icon={TriangleAlert}
        role="alert"
        onDismiss={onDismiss}
        dismissTestId="FileValidationNotice390__dismiss"
        data-testid={rejected ? 'FileValidationNotice390__rejected' : 'FileValidationNotice390__unavailable'}
        action={rejected && onViewIncidents && (
          <button
            type="button"
            className="fm-btn fm-btn--cancel-pill fm-390-reconcile__btn"
            onClick={onViewIncidents}
            data-testid="FileValidationNotice390__viewIncidents"
          >
            {t('fm.m390.file_validation.view_incidents')}
            <ArrowRight size={14} strokeWidth={1.75} data-testid="ArrowRight__fileValidation390" />
          </button>
        )}
      >
        <strong className="fm-390-notice__lead">
          {t(rejected ? 'fm.m390.file_validation.rejected' : 'fm.m390.file_validation.unavailable')}
        </strong>
        {rejected && validation.errors.map(e => (
          <span className="fm-390-notice__line" key={`${e.code}|${e.message}`} data-testid="FileValidationNotice390__error">
            {e.code ? t('fm.m390.file_validation.error_line', { code: e.code, message: e.message }) : e.message}
          </span>
        ))}
      </InfoBanner>
    </div>
  );
}
