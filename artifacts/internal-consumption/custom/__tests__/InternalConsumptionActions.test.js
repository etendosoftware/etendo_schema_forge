import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InternalConsumptionActions.jsx'), 'utf8');

describe('InternalConsumptionActions', () => {
  it('exports a default function component named InternalConsumptionActions', () => {
    assert.match(src, /export default function InternalConsumptionActions/);
  });

  it('accepts data, recordId, token, apiBaseUrl, onClose, and onRefresh props', () => {
    assert.match(src, /\{\s*data.*recordId.*token.*apiBaseUrl.*onClose.*onRefresh/s);
  });

  // ── Visibility guard ────────────────────────────────────────────────────────
  // Void only makes sense on a Completed document. Returning null for any other
  // status keeps the kebab clean on draft/open records.
  it('renders only for completed documents (data?.status === CO, returns null otherwise)', () => {
    assert.match(src, /data\?\.status\s*!==\s*'CO'/);
    assert.match(src, /if\s*\(data\?\.status\s*!==\s*'CO'\)\s*return null;/);
  });

  // ── Endpoint + payload (ETP regression: was Process { action: 'CO' }) ─────────
  it('POSTs to the processNow action endpoint for internalConsumption', () => {
    assert.match(src, /\/internalConsumption\/\$\{recordId\}\/action\/processNow/);
  });

  it('uses method POST with an Authorization Bearer header', () => {
    assert.match(src, /method:\s*'POST'/);
    assert.match(src, /Authorization:\s*`Bearer \$\{token\}`/);
  });

  it('sends a flat { action: VO } body (NOT the old CO process, NOT wrapped in fieldValues)', () => {
    assert.match(src, /body:\s*JSON\.stringify\(\{\s*action:\s*'VO'\s*\}\)/);
    assert.match(src, /action:\s*'VO'/);
    // Regression guards: the old Process flow used { action: 'CO' }.
    assert.doesNotMatch(src, /action:\s*'CO'/);
    // The Void payload is flat — it must not be nested under fieldValues.
    assert.doesNotMatch(src, /fieldValues/);
  });

  // ── Success + error handling ──────────────────────────────────────────────────
  it('calls onRefresh then onClose after a successful void', () => {
    assert.match(src, /onRefresh\?\.\(\)/);
    assert.match(src, /onClose\(\)/);
    assert.match(src, /onRefresh\?\.\(\);\s*onClose\(\);/);
  });

  it('shows the success toast via the internalConsumptionVoided i18n key', () => {
    assert.match(src, /toast\.success\(ui\('internalConsumptionVoided'\)\)/);
  });

  it('shows the error toast via internalConsumptionVoidError with {error} interpolation', () => {
    assert.match(src, /toast\.error\(ui\('internalConsumptionVoidError'\)\.replace\('\{error\}',\s*err\.message\)\)/);
  });

  // ── i18n labels (no hardcoded strings) ────────────────────────────────────────
  it('renders its label via the internalConsumptionVoid / internalConsumptionVoiding i18n keys', () => {
    assert.match(src, /ui\('internalConsumptionVoiding'\)/);
    assert.match(src, /ui\('internalConsumptionVoid'\)/);
    assert.match(src, /import\s*\{\s*useUI\s*\}\s*from\s*'@\/i18n'/);
  });

  // ── Processing state ──────────────────────────────────────────────────────────
  it('tracks a processing state and disables the button while in flight', () => {
    assert.match(src, /\[processing,\s*setProcessing\]\s*=\s*useState\(false\)/);
    assert.match(src, /if\s*\(processing\)\s*return;/);
    assert.match(src, /setProcessing\(true\)/);
    assert.match(src, /setProcessing\(false\)/);
    assert.match(src, /disabled=\{processing\}/);
  });

  // ── Neutral styling (Void must NOT look destructive/red) ──────────────────────
  it('uses neutral styling — text color #111827, not the destructive red #DC2626', () => {
    assert.match(src, /#111827/);
    assert.doesNotMatch(src, /#DC2626/);
  });

  it('uses the neutral #F3F4F6 hover background', () => {
    assert.match(src, /#F3F4F6/);
  });
});
