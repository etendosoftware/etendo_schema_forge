import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SiiSection.jsx'), 'utf8');

describe('SiiSection — structure', () => {
  it('exports a forwardRef component', () => {
    assert.match(src, /forwardRef\(function SiiSection/);
  });

  it('exposes a save() method via useImperativeHandle', () => {
    assert.match(src, /useImperativeHandle/);
    assert.match(src, /\(\) => \({ save \}/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /useUI.*from.*@\/i18n/);
  });

  it('imports mapSiiRecordToForm from fiscalConfig.utils', () => {
    assert.match(src, /mapSiiRecordToForm/);
    assert.match(src, /from.*fiscalConfig\.utils/);
  });
});

describe('SiiSection — Navarra badge', () => {
  it('accepts a variant prop', () => {
    assert.match(src, /variant/);
  });
});

describe('SiiSection — form fields', () => {
  it('does not render the enrolled (acogidaAlSII) toggle (ETP-4783: always forced to Y)', () => {
    assert.doesNotMatch(src, /fiscal\.sii\.field\.enrolled/);
  });

  it('acogidaAlSII is still sent in the PUT body with forced value Y', () => {
    assert.match(src, /acogidaAlSII/);
  });

  it('does not render the production environment toggle (ETP-4783: always forced to Y)', () => {
    assert.doesNotMatch(src, /fiscal\.sii\.field\.production/);
  });

  it('entornoDeProduccin is still sent in the PUT body with forced value Y', () => {
    assert.match(src, /entornoDeProduccin/);
  });

  it('does not render enrollment date fields (ETP-4783: always set to creation date)', () => {
    assert.doesNotMatch(src, /fiscal\.sii\.field\.enrollDate/);
    assert.doesNotMatch(src, /fiscal\.sii\.field\.monitorDate/);
  });

  it('enrollment dates are still sent in the PUT body from the record', () => {
    assert.match(src, /fechaAcogidaSII/);
    assert.match(src, /monitordate/);
  });

  // ETP-4783: the entire "Envíos" section (plazo/cadencia/postedInvoices) was removed
  // from SiiSection. Validation of the deadline is gone; the field is not sent in the PUT body.
  it('does not render the submission deadline field (ETP-4783: Envíos section removed)', () => {
    assert.doesNotMatch(src, /fiscal\.sii\.field\.deadline/);
    assert.doesNotMatch(src, /plazoLmiteDeEnvoASII/);
  });

  it('does not validate the submission deadline before saving (ETP-4783: validation removed)', () => {
    assert.doesNotMatch(src, /fiscal\.sii\.err\.deadline/);
  });
});

describe('SiiSection — certificate section', () => {
  it('renders CertSection unless hideCert is true', () => {
    assert.match(src, /CertSection/);
    assert.match(src, /hideCert/);
  });
});

describe('SiiSection — save button', () => {
  it('delegates save button rendering to SectionSaveButton', () => {
    assert.match(src, /SectionSaveButton/);
    assert.match(src, /saving=\{saving\}/);
  });

  it('surfaces error message on failure via SectionSaveButton', () => {
    assert.match(src, /setError/);
    assert.match(src, /error=\{error\}/);
  });

  it('hides the save button when hideSave prop is true', () => {
    assert.match(src, /hideSave/);
  });
});

describe('SiiSection — PUT request', () => {
  it('calls the sii-config endpoint with the correct entity', () => {
    assert.match(src, /sii-config\//);
    assert.match(src, /SII_ENTITY/);
  });

  it('uses useApiFetch for authenticated requests', () => {
    assert.match(src, /useApiFetch/);
    assert.match(src, /apiFetch/);
  });

  it('serializes boolean fields before sending', () => {
    assert.match(src, /serializeBooleanFields/);
  });
});
