import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FiscalStatusBadge.jsx'), 'utf8');

// ── CONFIG completeness ──────────────────────────────────────────────────────

describe('FiscalStatusBadge — SII status codes', () => {
  const siiCodes = ['CO', 'AE', 'IN', 'PE', 'EE', 'AN', 'BA', 'NR'];

  for (const code of siiCodes) {
    it(`CONFIG includes SII code "${code}"`, () => {
      assert.match(src, new RegExp(`\\b${code}:\\s*\\{`),
        `Expected CONFIG entry for SII code "${code}"`);
    });
  }

  it('BA uses a neutral semantic tone (not destructive — it is not an error state)', () => {
    const baBlock = src.match(/BA:\s*\{([^}]+)\}/)?.[1] ?? '';
    assert.ok(baBlock.includes("tone: 'neutral'"), 'BA should use the neutral semantic tone');
    assert.ok(!baBlock.includes("tone: 'destructive'"), 'BA must not use a destructive tone');
  });

  it('NR uses a neutral semantic tone', () => {
    const nrBlock = src.match(/NR:\s*\{([^}]+)\}/)?.[1] ?? '';
    assert.ok(nrBlock.includes("tone: 'neutral'"), 'NR should use the neutral semantic tone');
    assert.ok(!nrBlock.includes("tone: 'destructive'"), 'NR must not use a destructive tone');
  });
});

describe('FiscalStatusBadge — TBAI status strings', () => {
  const tbaiStatuses = ['Recibido', 'Rechazado', 'Error', 'Pendiente'];

  for (const status of tbaiStatuses) {
    it(`CONFIG includes TBAI status "${status}"`, () => {
      assert.match(src, new RegExp(`${status}:\\s*\\{`),
        `Expected CONFIG entry for TBAI status "${status}"`);
    });
  }
});

describe('FiscalStatusBadge — Verifactu status strings', () => {
  const vfStatuses = ['accepted', 'partiallyAccepted', 'rejected', 'invalid', 'vf_pending'];

  for (const status of vfStatuses) {
    it(`CONFIG includes Verifactu status "${status}"`, () => {
      assert.match(src, new RegExp(`${status}[\\s:,]`),
        `Expected CONFIG entry for Verifactu status "${status}"`);
    });
  }

  it('vf_pending maps to fiscalMonitor.status.vf.pending', () => {
    assert.match(src, /vf_pending:.*key:\s*'fiscalMonitor\.status\.vf\.pending'/s);
  });
});

describe('FiscalStatusBadge — normalizeVerifactuStatus', () => {
  it('exports normalizeVerifactuStatus', () => {
    assert.match(src, /export function normalizeVerifactuStatus/);
  });

  it('defines VF_CODE_MAP with all five known short codes', () => {
    for (const code of ['AC', 'AE', 'ER', 'IN', 'PE']) {
      assert.match(src, new RegExp(`${code}:\\s*'`),
        `VF_CODE_MAP must include code "${code}"`);
    }
  });

  it('AC maps to accepted', () => {
    assert.match(src, /AC:\s*'accepted'/);
  });

  it('AE maps to partiallyAccepted', () => {
    assert.match(src, /AE:\s*'partiallyAccepted'/);
  });

  it('ER maps to rejected', () => {
    assert.match(src, /ER:\s*'rejected'/);
  });

  it('IN maps to invalid', () => {
    assert.match(src, /IN:\s*'invalid'/);
  });

  it('PE maps to vf_pending', () => {
    assert.match(src, /PE:\s*'vf_pending'/);
  });
});

// ── i18n key wiring ──────────────────────────────────────────────────────────

describe('FiscalStatusBadge — i18n key wiring', () => {
  it('CO maps to fiscalMonitor.status.sii.CO', () => {
    assert.match(src, /CO:.*key:\s*'fiscalMonitor\.status\.sii\.CO'/s);
  });

  it('BA maps to fiscalMonitor.status.sii.BA (added in ETP-4125)', () => {
    assert.match(src, /BA:.*key:\s*'fiscalMonitor\.status\.sii\.BA'/s);
  });

  it('NR maps to fiscalMonitor.status.sii.NR (added in ETP-4125)', () => {
    assert.match(src, /NR:.*key:\s*'fiscalMonitor\.status\.sii\.NR'/s);
  });

  it('Recibido maps to fiscalMonitor.tbai.status.Recibido', () => {
    assert.match(src, /Recibido:.*key:\s*'fiscalMonitor\.tbai\.status\.Recibido'/s);
  });

  it('accepted maps to fiscalMonitor.status.vf.accepted', () => {
    assert.match(src, /accepted:.*key:\s*'fiscalMonitor\.status\.vf\.accepted'/s);
  });
});
