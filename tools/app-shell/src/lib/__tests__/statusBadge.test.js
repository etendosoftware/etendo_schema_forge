import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatusTone,
  getStatusBadgeProps,
  getStatusDotColor,
  getStatusPillClass,
  getStatusGridPillClass,
} from '../statusBadge.js';

describe('statusBadge — ETGO_CI (Closed - Invoice Created) classification', () => {
  describe('getStatusTone', () => {
    it('classifies ETGO_CI as success', () => {
      assert.equal(getStatusTone('ETGO_CI'), 'success');
    });

    it('is case-insensitive for ETGO_CI', () => {
      assert.equal(getStatusTone('etgo_ci'), 'success');
    });
  });

  describe('getStatusBadgeProps', () => {
    it('renders ETGO_CI with the semantic success style', () => {
      const props = getStatusBadgeProps('ETGO_CI');
      assert.equal(props.variant, 'default');
      assert.equal(props.className, 'border-status-success-border bg-status-success text-status-success-foreground');
    });
  });

  describe('getStatusDotColor', () => {
    it('paints the ETGO_CI dot with the semantic success foreground', () => {
      assert.equal(getStatusDotColor('ETGO_CI'), 'bg-status-success-foreground');
    });
  });

  describe('getStatusPillClass', () => {
    it('paints ETGO_CI pill with semantic success tokens', () => {
      assert.equal(getStatusPillClass('ETGO_CI'), 'bg-status-success text-status-success-foreground');
    });
  });

  describe('getStatusGridPillClass', () => {
    it('paints ETGO_CI grid pill with semantic success tokens', () => {
      assert.equal(getStatusGridPillClass('ETGO_CI'), 'bg-status-success text-status-success-foreground');
    });
  });
});

describe('statusBadge — CA (Closed - Order Created) recoloured to success', () => {
  it('getStatusTone returns success for CA (regression: was destructive)', () => {
    assert.equal(getStatusTone('CA'), 'success');
  });

  it('getStatusTone returns success for lowercase ca', () => {
    assert.equal(getStatusTone('ca'), 'success');
  });

  it('getStatusBadgeProps renders CA with the semantic success style', () => {
    const props = getStatusBadgeProps('CA');
    assert.equal(props.variant, 'default');
    assert.equal(props.className, 'border-status-success-border bg-status-success text-status-success-foreground');
    assert.notEqual(props.variant, 'destructive');
  });

  it('getStatusDotColor paints CA with the semantic success foreground', () => {
    assert.equal(getStatusDotColor('CA'), 'bg-status-success-foreground');
  });

  it('getStatusPillClass paints CA with semantic success tokens', () => {
    assert.equal(getStatusPillClass('CA'), 'bg-status-success text-status-success-foreground');
  });

  it('getStatusGridPillClass paints CA with semantic success tokens', () => {
    assert.equal(getStatusGridPillClass('CA'), 'bg-status-success text-status-success-foreground');
  });
});

describe('statusBadge — destructive tones still apply only to truly cancelled states', () => {
  it('VO is destructive', () => {
    assert.equal(getStatusTone('VO'), 'destructive');
    assert.equal(getStatusBadgeProps('VO').variant, 'destructive');
    assert.equal(getStatusDotColor('VO'), 'bg-destructive');
  });

  it('RPVOID is destructive', () => {
    assert.equal(getStatusTone('RPVOID'), 'destructive');
  });

  it('cancelled / void synonyms are destructive', () => {
    assert.equal(getStatusTone('voided'), 'destructive');
    assert.equal(getStatusTone('cancelled'), 'destructive');
    assert.equal(getStatusTone('void'), 'destructive');
  });
});

describe('statusBadge — CJ (Closed - Rejected) is destructive', () => {
  it('getStatusTone returns destructive for CJ', () => {
    assert.equal(getStatusTone('CJ'), 'destructive');
    assert.equal(getStatusTone('cj'), 'destructive');
  });

  it('getStatusBadgeProps renders CJ with the destructive variant', () => {
    assert.equal(getStatusBadgeProps('CJ').variant, 'destructive');
  });

  it('getStatusDotColor paints CJ dot with the destructive token', () => {
    assert.equal(getStatusDotColor('CJ'), 'bg-destructive');
  });

  it('getStatusPillClass paints CJ pill with destructive tokens', () => {
    assert.equal(getStatusPillClass('CJ'), 'bg-destructive/10 text-destructive');
  });

  it('getStatusGridPillClass paints CJ grid pill with destructive tokens', () => {
    assert.equal(getStatusGridPillClass('CJ'), 'bg-destructive text-destructive-foreground');
  });
});

describe('statusBadge — non-regression on previously success/closed/draft states', () => {
  it('CO stays success', () => {
    assert.equal(getStatusTone('CO'), 'success');
  });

  it('PA stays success in tone and uses the information status role', () => {
    assert.equal(getStatusTone('PA'), 'success');
    assert.equal(getStatusBadgeProps('PA').className, 'border-status-info-border bg-status-info text-status-info-foreground');
  });

  it('CL stays in the closed/information status role', () => {
    const props = getStatusBadgeProps('CL');
    assert.equal(props.className, 'border-status-info-border bg-status-info text-status-info-foreground');
    assert.equal(getStatusDotColor('CL'), 'bg-status-info-foreground');
  });

  it('DR stays in the draft/secondary role', () => {
    assert.equal(getStatusBadgeProps('DR').variant, 'secondary');
    assert.equal(getStatusDotColor('DR'), 'bg-status-neutral-foreground');
  });
});
