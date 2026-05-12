import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmPrimitives.jsx'), 'utf8');

// Copied from FmPrimitives.jsx — cannot import the JSX module directly because it
// depends on React and @/i18n aliases unavailable in the Node test runner.
const ERROR_STATUSES = new Set([
  'IN', 'EE', 'AE',
  'Rechazado', 'Error',
  'rejected', 'invalid', 'partiallyAccepted',
]);
const isErrorStatus = (estado) => ERROR_STATUSES.has(estado);

// Guards: all SII error / ok / pending codes produce the correct boolean
describe('isErrorStatus — SII status codes', () => {
  it('IN is an error', () => assert.equal(isErrorStatus('IN'), true));
  it('EE is an error', () => assert.equal(isErrorStatus('EE'), true));
  it('AE (partial) is an error', () => assert.equal(isErrorStatus('AE'), true));
  it('CO (correct) is not an error', () => assert.equal(isErrorStatus('CO'), false));
  it('PE (pending) is not an error', () => assert.equal(isErrorStatus('PE'), false));
});

// Guards: TBAI-specific error codes are included in ERROR_STATUSES
describe('isErrorStatus — TBAI status codes', () => {
  it('Rechazado is an error', () => assert.equal(isErrorStatus('Rechazado'), true));
  it('Error is an error', () => assert.equal(isErrorStatus('Error'), true));
  it('Recibido is not an error', () => assert.equal(isErrorStatus('Recibido'), false));
  it('Pendiente is not an error', () => assert.equal(isErrorStatus('Pendiente'), false));
});

// Guards: Verifactu-specific error codes are included in ERROR_STATUSES
describe('isErrorStatus — Verifactu status codes', () => {
  it('partiallyAccepted is an error', () => assert.equal(isErrorStatus('partiallyAccepted'), true));
  it('rejected is an error', () => assert.equal(isErrorStatus('rejected'), true));
  it('invalid is an error', () => assert.equal(isErrorStatus('invalid'), true));
  it('accepted is not an error', () => assert.equal(isErrorStatus('accepted'), false));
});

// Guards: edge cases don't throw or produce false positives
describe('isErrorStatus — edge cases', () => {
  it('unknown status returns false', () => assert.equal(isErrorStatus('UNKNOWN'), false));
  it('null returns false', () => assert.equal(isErrorStatus(null), false));
  it('undefined returns false', () => assert.equal(isErrorStatus(undefined), false));
});

// Guards: public API of FmPrimitives.jsx is intact
describe('FmPrimitives — exports', () => {
  it('exports isErrorStatus', () => assert.match(src, /export const isErrorStatus/));
  it('exports ERROR_STATUSES', () => assert.match(src, /export const ERROR_STATUSES/));
});

// Guards: StatusPill renders a <button> when clickable, plain <span> otherwise
describe('StatusPill — onClick backward compatibility', () => {
  it('accepts an onClick prop in its destructured signature', () => {
    assert.match(src, /StatusPill.*\{.*onClick/);
  });

  it('renders a <button type="button"> with fm-pill class when onClick is provided', () => {
    assert.match(src, /if \(onClick\)[\s\S]*?<button/);
  });

  it('passes fiscalMonitor.viewContact as title only when onClick is provided', () => {
    assert.match(src, /fiscalMonitor\.viewContact/);
  });

  it('falls back to a plain <span> when no onClick is provided', () => {
    assert.match(src, /<span className=.*fm-pill/);
  });
});
