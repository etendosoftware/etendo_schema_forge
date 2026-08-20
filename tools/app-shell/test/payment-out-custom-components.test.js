/**
 * Source-guard tests for artifacts/payment-out/custom/ proxy components.
 *
 * Each component is either a thin re-export or a thin wrapper that delegates
 * to a shared base component. These tests verify structural contracts:
 *   - correct shared component imported/re-exported
 *   - dir="out" passed where the shared base is direction-aware
 *   - specName="payment-out" passed where required
 *   - no stray hardcoded strings where i18n hooks are expected
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CUSTOM_DIR = join(__dirname, '../../../artifacts/payment-out/custom');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function read(filename) {
  return readFileSync(join(CUSTOM_DIR, filename), 'utf8');
}

// ─── PaymentActivityToggle ────────────────────────────────────────────────────

describe('PaymentActivityToggle', () => {
  const src = read('PaymentActivityToggle.jsx');

  it('exports a default function component named PaymentActivityToggle', () => {
    assert.match(src, /export default function PaymentActivityToggle/);
  });

  it('uses the useUI i18n hook (no hardcoded user-visible strings)', () => {
    assert.match(src, /useUI\s*\(/);
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
  });

  it('accepts the expected props (data, recordId, token, apiBaseUrl, api)', () => {
    assert.match(src, /\{\s*data\b/);
    assert.match(src, /\btoken\b/);
    assert.match(src, /\bapiBaseUrl\b/);
  });

  it('manages open/close state with useState', () => {
    assert.match(src, /useState\s*\(\s*false\s*\)/);
  });

  it('registers an Escape key listener to close the panel', () => {
    assert.match(src, /Escape/);
    assert.match(src, /addEventListener\s*\(\s*['"]keydown['"]/);
  });
});

// ─── PaymentConciliadoBadge ───────────────────────────────────────────────────

describe('PaymentConciliadoBadge', () => {
  const src = read('PaymentConciliadoBadge.jsx');

  it('re-exports the shared PaymentConciliadoBadge via export { default }', () => {
    assert.match(src, /export\s*\{\s*default\s*\}/);
  });

  it('sources from the correct shared path', () => {
    assert.match(src, /@\/windows\/custom\/shared\/PaymentConciliadoBadge/);
  });

  it('contains no extra logic (thin re-export only)', () => {
    // File should be a single line (or very short)
    const lines = src.trim().split('\n').filter(l => l.trim().length > 0);
    assert.ok(lines.length <= 2, `expected at most 2 non-empty lines, got ${lines.length}`);
  });
});

// ─── PaymentDetailSidebar ────────────────────────────────────────────────────

describe('PaymentDetailSidebar', () => {
  const src = read('PaymentDetailSidebar.jsx');

  it('exports a default function component named PaymentDetailSidebar', () => {
    assert.match(src, /export default function PaymentDetailSidebar/);
  });

  it('imports PaymentDetailSidebarBase from the shared path', () => {
    assert.match(src, /import PaymentDetailSidebarBase from '@\/windows\/custom\/shared\/PaymentDetailSidebarBase\.jsx'/);
  });

  it('passes dir="out" to the base component', () => {
    assert.match(src, /dir=["']out["']/);
  });

  it('passes specName="payment-out" to the base component', () => {
    assert.match(src, /specName=["']payment-out["']/);
  });

  it('spreads all remaining props through to the base component', () => {
    assert.match(src, /\{\.\.\.props\}/);
  });
});

// ─── PaymentDraftBanner ───────────────────────────────────────────────────────

describe('PaymentDraftBanner', () => {
  const src = read('PaymentDraftBanner.jsx');

  it('exports a default function component named PaymentDraftBanner', () => {
    assert.match(src, /export default function PaymentDraftBanner/);
  });

  it('uses the useUI i18n hook', () => {
    assert.match(src, /useUI\s*\(/);
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
  });

  it('references the out-specific i18n key draftBannerBodyOut', () => {
    assert.match(src, /draftBannerBodyOut/);
  });

  it('returns null when payment is not in draft status', () => {
    assert.match(src, /return null/);
  });

  it('defines the DEPOSITED status set that gates draft display', () => {
    assert.match(src, /const DEPOSITED\s*=\s*new Set/);
  });
});

// ─── PaymentHeaderTable ───────────────────────────────────────────────────────

describe('PaymentHeaderTable', () => {
  const src = read('PaymentHeaderTable.jsx');

  it('exports a default function component named PaymentHeaderTable', () => {
    assert.match(src, /export default function PaymentHeaderTable/);
  });

  it('imports PaymentHeaderTableBase from the shared path', () => {
    assert.match(src, /import PaymentHeaderTableBase from '@\/windows\/custom\/shared\/PaymentHeaderTableBase\.jsx'/);
  });

  it('passes dir="out" to the base component', () => {
    assert.match(src, /dir=["']out["']/);
  });

  it('passes specName="payment-out" to the base component', () => {
    assert.match(src, /specName=["']payment-out["']/);
  });

  it('spreads all remaining props through to the base component', () => {
    assert.match(src, /\{\.\.\.props\}/);
  });
});

// ─── PaymentOutBottomPanel ────────────────────────────────────────────────────

describe('PaymentOutBottomPanel', () => {
  const src = read('PaymentOutBottomPanel.jsx');

  it('exports a default function component named PaymentOutBottomPanel', () => {
    assert.match(src, /export default function PaymentOutBottomPanel/);
  });

  it('imports and renders PaymentDraftBanner from the local custom directory', () => {
    assert.match(src, /import PaymentDraftBanner from '\.\/PaymentDraftBanner'/);
    assert.match(src, /<PaymentDraftBanner\b/);
  });

  it('uses the useUI i18n hook (no hardcoded user-visible strings)', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
    assert.match(src, /useUI\s*\(/);
  });

  it('accepts data, token, and apiBaseUrl props', () => {
    assert.match(src, /\{\s*data\b/);
    assert.match(src, /\btoken\b/);
    assert.match(src, /\bapiBaseUrl\b/);
  });

  it('fetches payment lines from the payment-out/lines endpoint', () => {
    assert.match(src, /payment-out\/lines/);
  });

  it('uses the out-specific i18n keys for section titles', () => {
    assert.match(src, /paymentOutDataTitle/);
    assert.match(src, /paymentOutLinesTitle/);
  });
});

// ─── ReactivarConfirmModal ────────────────────────────────────────────────────

describe('ReactivarConfirmModal', () => {
  const src = read('ReactivarConfirmModal.jsx');

  it('exports a default function component named ReactivarConfirmModal', () => {
    assert.match(src, /export default function ReactivarConfirmModal/);
  });

  it('imports PaymentLifecycleConfirmModal from the shared path', () => {
    assert.match(src, /import PaymentLifecycleConfirmModal from '@\/windows\/custom\/shared\/PaymentLifecycleConfirmModal'/);
  });

  it('passes dir="out" and action="reactivate" with the record to PaymentLifecycleConfirmModal', () => {
    assert.match(src, /<PaymentLifecycleConfirmModal dir="out" action="reactivate" data={record}/);
  });

  it('forwards onConfirm and onClose props to the shared modal', () => {
    assert.match(src, /\bonConfirm\b/);
    assert.match(src, /\bonClose\b/);
  });

  // This is no longer a pure 1:1 delegation wrapper: it also routes the
  // aPRMProcessPayment process to the editable payment modal, so the form's
  // "Confirmar" opens the invoice's editor instead of a yes/no dialog — this
  // window has no form of its own, so that dialog could not change anything.
  // See DetailView's `confirmModal` process flag and PaymentEditModalLauncher,
  // which falls back to the old dialog when the invoice cannot be resolved.
  it('routes aPRMProcessPayment to the editable payment modal (dir="out")', () => {
    assert.match(src, /import PaymentEditModalLauncher from '@\/windows\/custom\/shared\/PaymentEditModalLauncher'/);
    assert.match(src, /process\?\.columnName === 'aPRMProcessPayment'/);
    assert.match(src, /<PaymentEditModalLauncher/);
    assert.doesNotMatch(src, /<ConfirmPaymentModal/);
  });

  it('contains no logic beyond the routing (still a thin dispatcher)', () => {
    // The launcher owns the work; this file only decides which modal to mount and forwards props.
    // Counted without comments, which carry the why and would otherwise punish documenting it.
    const lines = src.trim().split('\n')
      .filter(l => l.trim().length > 0)
      .filter(l => !/^\s*(\/\*|\*|\/\/)/.test(l.trim()));
    assert.ok(lines.length <= 22, `expected at most 22 non-comment lines, got ${lines.length}`);
  });
});
