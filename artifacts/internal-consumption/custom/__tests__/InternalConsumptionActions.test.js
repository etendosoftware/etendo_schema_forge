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

  // ETP-4576 — the credential is apiFetch's, not the component's: it picks the active
  // scheme's headers and the CSRF proof. A hand-built Authorization here would be the bug.
  it('POSTs through apiFetch, never a hand-built credential header', () => {
    assert.match(src, /method:\s*'POST'/);
    assert.match(src, /apiFetch\(/);
    assert.doesNotMatch(src, /Authorization:\s*`Bearer/);
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

  // ── Destructive styling (Void looks like Descontabilizar) ─────────────────────
  // ETP-5445 user decision — "Anular" is irreversible, so it takes DetailMoreActionsMenu's
  // DESTRUCTIVE item variant (the same branch Unpost/Descontabilizar renders with), not the
  // neutral one. Color and hover come from Tailwind semantic classes, never inline styles.
  it('uses the semantic destructive text color, not a neutral or hardcoded one', () => {
    assert.match(src, /className=\{`[^`]*\btext-destructive\b/);
    assert.doesNotMatch(src, /\btext-foreground\b/);
    assert.doesNotMatch(src, /#DC2626|#111827/);
  });

  it('uses the destructive hover background, not an inline hover handler', () => {
    assert.match(src, /className=\{`[^`]*\bhover:bg-destructive\/10(\s|`)/);
    assert.doesNotMatch(src, /\bhover:bg-secondary\b/);
    assert.doesNotMatch(src, /onMouseEnter|onMouseLeave/);
    assert.doesNotMatch(src, /style\.background\s*=/);
    assert.doesNotMatch(src, /hsl\(var\(--/);
  });

  it('exposes data-testid="menu-action-void"', () => {
    assert.match(src, /data-testid="menu-action-void"/);
  });

  it('matches the destructive DetailMoreActionsMenu item classes (shared base + destructive variant)', () => {
    const cls = src.match(/className=\{`([^`]*)`\}/);
    assert.ok(cls, 'button className template not found');
    for (const c of ['w-full', 'text-left', 'px-2', 'py-1', 'text-sm', 'leading-6', 'transition-colors', 'flex', 'items-center', 'gap-2', 'text-destructive', 'hover:bg-destructive/10']) {
      assert.match(cls[1], new RegExp(`(^|\\s)${c.replace(':', '\\:')}(\\s|$)`), `missing class ${c}`);
    }
  });

  it('dims and blocks the cursor while processing, like the standard item', () => {
    assert.match(src, /processing \? 'opacity-50 cursor-not-allowed' : ''/);
  });

  it('uses the standard item typography (Inter, weight 400)', () => {
    assert.match(src, /style=\{\{\s*fontFamily:\s*'Inter, sans-serif',\s*fontWeight:\s*400\s*\}\}/);
  });
});
