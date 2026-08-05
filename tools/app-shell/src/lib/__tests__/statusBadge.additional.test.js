import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatusTone,
  getStatusBadgeProps,
  getStatusDotColor,
  getStatusPillClass,
  getStatusGridPillClass,
  statusLabel,
} from '../statusBadge.js';

describe('getStatusTone — single-letter codes in compound OR conditions', () => {
  // The success/warning/destructive OR-chains each end in a bare single-letter
  // code ('o', 'm', 'p') that no other test exercises — every other operand
  // in the chain is covered, but these three are never reached, leaving the
  // compound condition only partially covered.
  it('classifies the single-letter "o" code as success', () => {
    assert.equal(getStatusTone('o'), 'success');
    assert.equal(getStatusTone('O'), 'success');
  });

  it('classifies the single-letter "m" code as warning', () => {
    assert.equal(getStatusTone('m'), 'warning');
    assert.equal(getStatusTone('M'), 'warning');
  });

  it('classifies the single-letter "p" code as destructive', () => {
    assert.equal(getStatusTone('p'), 'destructive');
    assert.equal(getStatusTone('P'), 'destructive');
  });

  it('classifies the "complete" word (distinct from "completed") as success', () => {
    assert.equal(getStatusTone('complete'), 'success');
  });
});

describe('getStatusTone — default fallback', () => {
  it('returns neutral for an unrecognized status', () => {
    assert.equal(getStatusTone('zzz-unknown'), 'neutral');
  });

  it('returns neutral for null', () => {
    assert.equal(getStatusTone(null), 'neutral');
  });

  it('returns neutral for undefined', () => {
    assert.equal(getStatusTone(undefined), 'neutral');
  });

  it('classifies IP / in process as warning', () => {
    assert.equal(getStatusTone('IP'), 'warning');
    assert.equal(getStatusTone('in process'), 'warning');
  });

  it('classifies RPAP as neutral', () => {
    assert.equal(getStatusTone('RPAP'), 'neutral');
  });
});

describe('getStatusBadgeProps — remaining word-form operands in compound OR conditions', () => {
  it('"complete"/"booked" (word forms) resolve to the success style, same as "completed"/"co"', () => {
    assert.equal(getStatusBadgeProps('complete').variant, 'default');
    assert.equal(getStatusBadgeProps('booked').variant, 'default');
    assert.equal(
      getStatusBadgeProps('booked').className,
      'border-status-success-border bg-status-success text-status-success-foreground',
    );
  });

  it('"paid" (word form) resolves to the info style, same as "closed"/"cl"/"pa"', () => {
    assert.equal(
      getStatusBadgeProps('paid').className,
      'border-status-info-border bg-status-info text-status-info-foreground',
    );
  });

  it('"void" (word form) resolves to the destructive variant, same as "voided"/"vo"', () => {
    assert.equal(getStatusBadgeProps('void').variant, 'destructive');
  });
});

describe('getStatusDotColor — remaining word-form operands in compound OR conditions', () => {
  it('"complete"/"booked" (word forms) resolve to the success dot', () => {
    assert.equal(getStatusDotColor('complete'), 'bg-status-success-foreground');
    assert.equal(getStatusDotColor('booked'), 'bg-status-success-foreground');
  });

  it('"paid" (word form) resolves to the info dot', () => {
    assert.equal(getStatusDotColor('paid'), 'bg-status-info-foreground');
  });

  it('"void" (word form) resolves to the destructive dot', () => {
    assert.equal(getStatusDotColor('void'), 'bg-destructive');
  });
});

describe('getStatusBadgeProps — full branch coverage', () => {
  it('true/processed -> success style', () => {
    assert.equal(getStatusBadgeProps('true').variant, 'default');
    assert.equal(getStatusBadgeProps('processed').variant, 'default');
  });

  it('false/not processed -> secondary', () => {
    assert.deepEqual(getStatusBadgeProps('false'), { variant: 'secondary' });
    assert.deepEqual(getStatusBadgeProps('not processed'), { variant: 'secondary' });
  });

  it('draft/dr -> secondary', () => {
    assert.deepEqual(getStatusBadgeProps('draft'), { variant: 'secondary' });
    assert.deepEqual(getStatusBadgeProps('DR'), { variant: 'secondary' });
  });

  it('closed/cl/paid/pa -> info style', () => {
    const props = getStatusBadgeProps('closed');
    assert.equal(props.variant, 'default');
    assert.equal(props.className, 'border-status-info-border bg-status-info text-status-info-foreground');
  });

  it('in process/ip/rpae/rpr -> outline warning style', () => {
    const props = getStatusBadgeProps('in process');
    assert.equal(props.variant, 'outline');
    assert.equal(props.className, 'border-status-warning-border bg-status-warning text-status-warning-foreground');
    assert.equal(getStatusBadgeProps('RPAE').variant, 'outline');
    assert.equal(getStatusBadgeProps('RPR').variant, 'outline');
  });

  it('rpap -> muted outline style', () => {
    const props = getStatusBadgeProps('RPAP');
    assert.equal(props.variant, 'outline');
    assert.equal(props.className, 'border-border-subtle bg-muted text-muted-foreground');
  });

  it('under evaluation/ue -> info outline style', () => {
    const props = getStatusBadgeProps('under evaluation');
    assert.equal(props.variant, 'outline');
    assert.equal(props.className, 'border-status-info-border bg-status-info text-status-info-foreground');
    assert.equal(getStatusBadgeProps('UE').className, props.className);
  });

  it('falls back to a plain outline for an unrecognized status', () => {
    assert.deepEqual(getStatusBadgeProps('mystery'), { variant: 'outline' });
  });

  it('falls back to a plain outline for null/undefined', () => {
    assert.deepEqual(getStatusBadgeProps(null), { variant: 'outline' });
    assert.deepEqual(getStatusBadgeProps(undefined), { variant: 'outline' });
  });
});

describe('getStatusDotColor — remaining branches', () => {
  it('in process/ip/rpae/rpr -> warning dot', () => {
    assert.equal(getStatusDotColor('in process'), 'bg-status-warning-foreground');
    assert.equal(getStatusDotColor('IP'), 'bg-status-warning-foreground');
  });

  it('unrecognized status -> neutral dot', () => {
    assert.equal(getStatusDotColor('mystery'), 'bg-status-neutral-foreground');
  });

  it('null/undefined -> neutral dot', () => {
    assert.equal(getStatusDotColor(null), 'bg-status-neutral-foreground');
    assert.equal(getStatusDotColor(undefined), 'bg-status-neutral-foreground');
  });
});

describe('getStatusPillClass — remaining branches', () => {
  it('in process -> warning pill', () => {
    assert.equal(getStatusPillClass('in process'), 'bg-status-warning text-status-warning-foreground');
  });

  it('unrecognized status -> muted default pill', () => {
    assert.equal(getStatusPillClass('mystery'), 'bg-muted text-foreground');
  });
});

describe('getStatusGridPillClass — remaining branches', () => {
  it('in process -> warning grid pill', () => {
    assert.equal(getStatusGridPillClass('in process'), 'bg-status-warning text-status-warning-foreground');
  });

  it('unrecognized status -> muted bordered default pill', () => {
    assert.equal(getStatusGridPillClass('mystery'), 'bg-muted text-muted-foreground border border-border-control');
  });
});

describe('statusLabel', () => {
  it('prefers a column-declared enumLabels value that resolves via genericLabels', () => {
    const dictionary = { genericLabels: { myCustomKey: 'My Custom Label' } };
    const result = statusLabel('X', dictionary, null, { X: 'myCustomKey' });
    assert.equal(result, 'My Custom Label');
  });

  it('resolves a column-declared enumLabels value via the translate function', () => {
    const translate = (key) => (key === 'someKey' ? 'Translated Value' : key);
    const result = statusLabel('X', {}, translate, { X: 'someKey' });
    assert.equal(result, 'Translated Value');
  });

  it('falls through to DB-sourced/MAP logic when the declared enumLabels value does not resolve', () => {
    // 'literal label' does not resolve via genericLabels or translate -> falls through
    // to the MAP ('CO' -> 'statusComplete') and is humanized as the last resort.
    const result = statusLabel('CO', {}, null, { CO: 'literal label' });
    assert.equal(result, 'Complete');
  });

  it('returns null from resolveEnumLabel path when enumLabels has no entry for the status (no crash)', () => {
    const result = statusLabel('CO', {}, null, { OTHER: 'x' });
    assert.ok(typeof result === 'string');
  });

  it('uses DB-sourced translation from dictionary.statuses when present', () => {
    const dictionary = { statuses: { DR: { label: 'Borrador' } } };
    assert.equal(statusLabel('DR', dictionary, null, null), 'Borrador');
  });

  it('uses genericLabels fallback for a known MAP key', () => {
    const dictionary = { genericLabels: { statusComplete: 'Completed!' } };
    assert.equal(statusLabel('CO', dictionary, null, null), 'Completed!');
  });

  it('uses the translate function when genericLabels does not have the key', () => {
    const translate = (key) => (key === 'statusComplete' ? 'Terminado' : key);
    assert.equal(statusLabel('CO', {}, translate, null), 'Terminado');
  });

  it('humanizes the MAP key as a last resort when translate returns the same key', () => {
    const translate = (key) => key;
    assert.equal(statusLabel('CO', {}, translate, null), 'Complete');
  });

  it('humanizes the MAP key as a last resort with no translate function at all', () => {
    assert.equal(statusLabel('IP', {}, null, null), 'In Process');
  });

  it('returns the raw status string unchanged when it is not in the MAP', () => {
    assert.equal(statusLabel('UNKNOWN_STATUS', {}, null, null), 'UNKNOWN_STATUS');
  });

  it('resolves boolean-like true/false statuses via the MAP', () => {
    assert.equal(statusLabel('true', {}, null, null), 'Processed');
    // MAP['false'] is the literal 'Not Processed' (not a "statusXxx" key), so the
    // humanize step's uppercase-letter spacing still runs on it, doubling the
    // existing space before "Processed".
    assert.equal(statusLabel('false', {}, null, null), 'Not  Processed');
  });

  it('resolves Y/N statuses to their humanized labels', () => {
    assert.equal(statusLabel('Y', {}, null, null), 'Processed');
    assert.equal(statusLabel('N', {}, null, null), 'Draft');
  });

  it('resolves payment-related statuses (RPR, RPAE, RPAP, RPPC, RPVOID)', () => {
    assert.equal(statusLabel('RPR', {}, null, null), 'Payment Received');
    assert.equal(statusLabel('RPAE', {}, null, null), 'Awaiting Execution');
    assert.equal(statusLabel('RPAP', {}, null, null), 'Awaiting Payment');
    assert.equal(statusLabel('RPPC', {}, null, null), 'Payment Cleared');
    assert.equal(statusLabel('RPVOID', {}, null, null), 'Void');
  });
});
