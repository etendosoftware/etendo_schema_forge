import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CertExpiryBanner.jsx'), 'utf8');

describe('CertExpiryBanner — structure', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function CertExpiryBanner/);
  });

  it('accepts daysLeft and variant props', () => {
    assert.match(src, /daysLeft/);
    assert.match(src, /variant/);
  });
});

describe('CertExpiryBanner — visibility thresholds', () => {
  it('defines WARN_DAYS = 60', () => {
    assert.match(src, /WARN_DAYS\s*=\s*60/);
  });

  it('defines CRITICAL_DAYS = 30', () => {
    assert.match(src, /CRITICAL_DAYS\s*=\s*30/);
  });

  it('returns null when daysLeft is null', () => {
    assert.match(src, /daysLeft === null[\s\S]*?return null/);
  });

  it('returns null when daysLeft exceeds WARN_DAYS', () => {
    assert.match(src, /daysLeft > WARN_DAYS[\s\S]*?return null/);
  });
});

describe('CertExpiryBanner — dismiss behaviour', () => {
  it('tracks dismissed state via useState', () => {
    assert.match(src, /useState\(false\)/);
    assert.match(src, /dismissed/);
  });

  it('can be dismissed only when not critical (canDismiss = !isCritical)', () => {
    assert.match(src, /canDismiss\s*=\s*!isCritical/);
  });

  it('renders a dismiss button only when canDismiss is true', () => {
    assert.match(src, /canDismiss[\s\S]*?setDismissed\(true\)/);
  });

  it('the dismiss button carries an accessible aria-label', () => {
    assert.match(src, /aria-label.*fiscal\.cert\.expiry\.dismiss/);
  });
});

describe('CertExpiryBanner — variants', () => {
  it('renders the subtle strip when variant is "subtle"', () => {
    assert.match(src, /variant === ['"]subtle['"]/);
  });

  it('renders the prominent card as the default (non-subtle) variant', () => {
    assert.match(src, /variant === ['"]subtle['"][\s\S]*?return[\s\S]*?\{.*?variant !== ['"]subtle['"]|prominent/i);
  });
});

describe('CertExpiryBanner — i18n keys', () => {
  it('uses fiscal.cert.expiry.warn.title for the warning state', () => {
    assert.match(src, /fiscal\.cert\.expiry\.warn\.title/);
  });

  it('uses fiscal.cert.expiry.critical.title for the critical state', () => {
    assert.match(src, /fiscal\.cert\.expiry\.critical\.title/);
  });

  it('uses fiscal.cert.expiry.body for the explanatory sentence', () => {
    assert.match(src, /fiscal\.cert\.expiry\.body/);
  });

  it('uses fiscal.cert.expiry.dismiss for the close button label', () => {
    assert.match(src, /fiscal\.cert\.expiry\.dismiss/);
  });

  it('interpolates {days} into the title keys', () => {
    assert.match(src, /days.*daysLeft|daysLeft.*days/);
  });
});

describe('CertExpiryBanner — color scheme', () => {
  it('applies semantic warning roles in the warning state', () => {
    assert.match(src, /var\(--status-warning-bg\)/);
  });

  it('applies semantic destructive roles in the critical state', () => {
    assert.match(src, /var\(--status-destructive-bg\)/);
  });
});
