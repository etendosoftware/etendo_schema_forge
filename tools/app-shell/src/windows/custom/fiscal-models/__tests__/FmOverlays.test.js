import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmOverlays.jsx'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'fiscal-models.css'), 'utf8');

describe('FmOverlays — exports', () => {
  it('exports PresentModal', () => assert.match(src, /export function PresentModal/));
  it('exports FileGenModal', () => assert.match(src, /export function FileGenModal/));
  it('exports NewDeclModal', () => assert.match(src, /export function NewDeclModal/));
  it('exports IncidentTray', () => assert.match(src, /export function IncidentTray/));
  it('exports DrillDownPanel', () => assert.match(src, /export function DrillDownPanel/));
  it('exports ConfigDrawer', () => assert.match(src, /export function ConfigDrawer/));
});

describe('ConfigDrawer — structure', () => {
  it('has declarant section', () => assert.match(src, /fm\.config\.declarant\.title/));
  it('has m303 section', () => assert.match(src, /fm\.config\.m303\.title/));
  it('has m349 section', () => assert.match(src, /fm\.config\.m349\.title/));
  it('has IBAN field', () => assert.match(src, /fm\.config\.m303\.iban/));
  it('has operation keys E,A,T,S,I', () => assert.match(src, /'E', 'A', 'T', 'S', 'I'/));
});

describe('FmOverlays — no removed components', () => {
  it('does NOT export AuditReasonModal', () => assert.doesNotMatch(src, /export.*AuditReasonModal/));
  it('does NOT export CellHistoryPanel', () => assert.doesNotMatch(src, /export.*CellHistoryPanel/));
  it('does NOT contain manual adjustment logic', () => assert.doesNotMatch(src, /manualAdj/));
  it('does NOT export CompareDrawer', () => assert.doesNotMatch(src, /export function CompareDrawer/));
  it('does NOT reference T1_2026_BOXES (was CompareDrawer-only)', () => assert.doesNotMatch(src, /T1_2026_BOXES/));
});

describe('PresentModal — 2 manual paths + 1 opt-in AEAT path', () => {
  it('has submitted_ack path', () => assert.match(src, /submitted_ack/));
  it('has submitted (no ack) path', () => assert.match(src, /'submitted'/));
  it('does not have a submitted_ext path', () => assert.doesNotMatch(src, /submitted_ext/));
  it('file upload tied to submitted_ack path', () => assert.match(src, /acuseFile/));
  it('has an aeat_telematic sentinel path, gated behind showAeatPath', () => {
    assert.match(src, /aeat_telematic/);
    assert.match(src, /showAeatPath/);
  });
  it('canConfirm allows the aeat_telematic path without requiring acuseFile', () => {
    assert.match(src, /path === 'aeat_telematic'/);
  });
});

// ETP-5229 item #10 — widened modal + scoped footer-divider removal. Regression
// guards for the polish pass: a silent revert of the width values or the
// `fm-present-modal` class would ship the pre-redesign narrow modal again, and
// a silent revert of the CSS rule would bring back the footer divider that was
// deliberately dropped for this modal only (FileGenModal/NewDeclModal keep it).
describe('PresentModal — ETP-5229 item #10 width + footer-divider polish', () => {
  it('sizes the two-column (AEAT) layout at 760 and the single-column layout at 500', () => {
    assert.match(src, /maxWidth:\s*showAeatPath\s*\?\s*760\s*:\s*500/);
  });
  it('does not regress to the pre-redesign width values (640 / 420)', () => {
    assert.doesNotMatch(src, /maxWidth:\s*showAeatPath\s*\?\s*640\s*:\s*420/);
  });
  it('applies the fm-present-modal class alongside fm-config-modal on the outer modal div', () => {
    assert.match(src, /className="fm-config-modal fm-present-modal"/);
  });
  it('scopes the footer-divider removal to fm-present-modal in the stylesheet', () => {
    assert.match(css, /\.fm-present-modal \.fm-config-modal__footer\s*\{\s*border-top:\s*none;\s*\}/);
  });
  it('keeps the base footer divider for sibling modals (FileGenModal/NewDeclModal)', () => {
    assert.match(css, /\.fm-config-modal__footer\s*\{[^}]*border-top:\s*1px solid var\(--fm-border-1\)/);
  });
});
