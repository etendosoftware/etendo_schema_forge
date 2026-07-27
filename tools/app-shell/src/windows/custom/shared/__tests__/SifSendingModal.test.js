import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'SifSendingModal.jsx'), 'utf8');

describe('SifSendingModal — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function SifSendingModal/);
  });

  it('imports useState and useEffect from react', () => {
    assert.match(src, /useState/);
    assert.match(src, /useEffect/);
  });

  it('is a proper dialog with role="dialog" and aria-modal', () => {
    assert.match(src, /role="dialog"/);
    assert.match(src, /aria-modal="true"/);
  });
});

describe('SifSendingModal — props contract', () => {
  it('accepts pendingTargets (sendSii / sendTbai)', () => {
    assert.match(src, /pendingTargets/);
    assert.match(src, /sendSii/);
    assert.match(src, /sendTbai/);
  });

  it('accepts base, specName, recordId for the API call (token sourced via useApiFetch)', () => {
    assert.match(src, /base\b/);
    assert.match(src, /specName\b/);
    assert.match(src, /recordId\b/);
    assert.doesNotMatch(src, /\bheaders\b.*prop|prop.*\bheaders\b/);
    assert.match(src, /useApiFetch/);
  });

  it('accepts onClose callback', () => {
    assert.match(src, /onClose/);
  });

  it('accepts onAfterSend async callback for side effects', () => {
    assert.match(src, /onAfterSend/);
  });

  it('accepts zIndex prop with default 50', () => {
    assert.match(src, /zIndex\s*=\s*50/);
  });

  it('accepts bodyKey to choose confirmation copy', () => {
    assert.match(src, /bodyKey/);
  });
});

describe('SifSendingModal — phases', () => {
  it('starts in the confirm phase', () => {
    assert.match(src, /useState\(['"]confirm['"]\)/);
  });

  it('transitions to the sending phase on confirm', () => {
    assert.match(src, /setPhase\(['"]sending['"]\)/);
  });

  it('transitions to the results phase after sending completes', () => {
    assert.match(src, /setPhase\(['"]results['"]\)/);
  });
});

describe('SifSendingModal — progress bar', () => {
  it('starts progress at 0 when entering the sending phase', () => {
    assert.match(src, /setProgress\(0\)/);
  });

  it('uses a diminishing-returns formula capped at 80%', () => {
    assert.match(src, /prev.*80.*0\.04|0\.04.*80.*prev/);
  });

  it('snaps progress to 100% before transitioning to results', () => {
    assert.match(src, /setProgress\(100\)/);
  });

  it('renders the progress bar with the semantic info role', () => {
    assert.match(src, /linear-gradient\(90deg, var\(--status-info-fg\), var\(--status-info-fg\)\)/);
  });

  it('displays the integer percentage label', () => {
    assert.match(src, /Math\.round\(progress\)/);
  });
});

describe('SifSendingModal — callProcess helper', () => {
  it('POSTs to action/<columnName> endpoint', () => {
    assert.match(src, /action\//);
    assert.match(src, /method.*POST/);
  });

  it('calls the SII action column (Em_aeatsii_send)', () => {
    assert.match(src, /Em_aeatsii_send/);
  });

  it('calls the TBAI action column (Em_Tbai_Xmlgenerator)', () => {
    assert.match(src, /Em_Tbai_Xmlgenerator/);
  });
});

describe('SifSendingModal — results phase', () => {
  it('renders a ✓ for successful submissions', () => {
    assert.match(src, /sendToSifSuccessSii/);
    assert.match(src, /sendToSifSuccessTbai/);
  });

  it('renders a ✗ for failed submissions', () => {
    assert.match(src, /sendToSifErrorSii/);
    assert.match(src, /sendToSifErrorTbai/);
  });

  it('calls onAfterSend with the results object before snapping to 100%', () => {
    assert.match(src, /onAfterSend\??\.\(next\)/);
  });
});
