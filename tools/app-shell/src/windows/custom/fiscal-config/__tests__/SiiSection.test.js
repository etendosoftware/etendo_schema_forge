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
  it('renders the enrolled (acogidaAlSII) toggle', () => {
    assert.match(src, /fiscal\.sii\.field\.enrolled/);
    assert.match(src, /acogidaAlSII/);
  });

  it('renders the production environment toggle', () => {
    assert.match(src, /fiscal\.sii\.field\.production/);
    assert.match(src, /entornoDeProduccin/);
  });

  it('renders the submission deadline (plazoLmiteDeEnvoASII) field', () => {
    assert.match(src, /fiscal\.sii\.field\.deadline/);
    assert.match(src, /plazoLmiteDeEnvoASII/);
  });

  it('validates deadline is present before saving', () => {
    assert.match(src, /plazoLmiteDeEnvoASII/);
    assert.match(src, /fiscal\.sii\.err\.deadline/);
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
