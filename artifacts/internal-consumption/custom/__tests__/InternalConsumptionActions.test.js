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
  // status keeps the kebab clean on draft/open records. ETP-5445 — the CO gate now
  // lives in the shared helper's isVoidableRow (also used by the grid row kebab).
  it('renders only for completed documents (isVoidableRow(data) gate, returns null otherwise)', () => {
    assert.match(src, /import\s*\{[^}]*\bisVoidableRow\b[^}]*\}\s*from\s*'@\/windows\/custom\/internal-consumption\/voidInternalConsumption\.js'/);
    assert.match(src, /if\s*\(!isVoidableRow\(data\)\)\s*return null;/);
  });

  // ── Delegation (ETP-5445) ─────────────────────────────────────────────────────
  // Endpoint, body and toasts moved to voidInternalConsumption.js (asserted in its own
  // tests); the component must delegate, passing its spec-scoped apiBaseUrl as basePath
  // because its apiFetch is created with an EMPTY base.
  it('delegates the void to the shared voidInternalConsumption helper with basePath: apiBaseUrl', () => {
    assert.match(src, /import\s*\{[^}]*\bvoidInternalConsumption\b[^}]*\}\s*from\s*'@\/windows\/custom\/internal-consumption\/voidInternalConsumption\.js'/);
    assert.match(src, /await voidInternalConsumption\(\{\s*apiFetch,\s*basePath:\s*apiBaseUrl,\s*recordId,\s*ui\s*\}\)/);
  });

  // ETP-4576 — the credential is apiFetch's, not the component's.
  it('hands the helper an apiFetch, never a hand-built credential header', () => {
    assert.match(src, /const apiFetch = useApiFetch\(''\)/);
    assert.doesNotMatch(src, /Authorization:\s*`Bearer/);
  });

  it('no longer builds the request or the toasts itself (single implementation in the helper)', () => {
    assert.doesNotMatch(src, /\/action\/processNow/);
    assert.doesNotMatch(src, /method:\s*'POST'/);
    assert.doesNotMatch(src, /JSON\.stringify/);
    assert.doesNotMatch(src, /\btoast\./);
    assert.doesNotMatch(src, /from 'sonner'/);
  });

  // ── Success handling ──────────────────────────────────────────────────────────
  it('calls onRefresh then onClose only after a successful void', () => {
    assert.match(src, /if\s*\(result\.success\)\s*\{\s*onRefresh\?\.\(\);\s*onClose\(\);\s*\}/);
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
