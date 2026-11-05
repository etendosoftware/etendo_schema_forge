// @covers tools/app-shell/src/lib/flags/diagnostics.js
import { beforeEach, describe, expect, it, vi } from 'vitest';

const defaultTrack = vi.hoisted(() => vi.fn());
vi.mock('../../observability.js', () => ({ track: defaultTrack }));

import { reportFlagDiagnostic } from '../diagnostics.js';

beforeEach(() => vi.clearAllMocks());

describe('feature flag diagnostic payload boundary', () => {
  it('emits only bounded operational labels and tenant identifiers', () => {
    const tracker = vi.fn();
    reportFlagDiagnostic({ operation: 'configuration_fetch', outcome: 'success', provider: 'datadog',
      durationMs: 25, account_id: 'company-a', reason: 'network_error', source: 'remote',
      username: 'private@example.test', accountId: 'private-id', url: 'https://private', token: 'secret' }, tracker);
    expect(tracker).toHaveBeenCalledWith('feature_flags_diagnostic', {
      operation: 'configuration_fetch', outcome: 'success', provider: 'datadog', durationMs: 25,
      account_id: 'company-a', reason: 'network_error', source: 'remote',
    });
  });

  it('ignores arbitrary diagnostic labels and never throws for a failed reporter', async () => {
    const tracker = vi.fn();
    reportFlagDiagnostic({ operation: 'private@example.test', outcome: 'error' }, tracker);
    expect(tracker).not.toHaveBeenCalled();
    expect(() => reportFlagDiagnostic({ operation: 'context_update', outcome: 'error' }, () => { throw new Error('offline'); })).not.toThrow();
    reportFlagDiagnostic({ operation: 'context_update', outcome: 'error', reason: 'private@example.test' }, () => Promise.reject(new Error('offline')));
    await Promise.resolve();
  });
});


describe('feature flag diagnostic delivery and bounds', () => {
  it('uses the application telemetry facade when no reporter is injected', () => {
    reportFlagDiagnostic({ operation: 'context_update', outcome: 'deduplicated', reason: 'inflight' });
    expect(defaultTrack).toHaveBeenCalledWith('feature_flags_diagnostic', {
      operation: 'context_update', outcome: 'deduplicated', reason: 'inflight',
    });
  });

  it('ignores absent properties and incomplete lifecycle events without reporting', () => {
    for (const properties of [undefined, null, {}, { operation: 'context_update' }, { outcome: 'error' }]) {
      expect(() => reportFlagDiagnostic(properties)).not.toThrow();
    }
    expect(defaultTrack).not.toHaveBeenCalled();
  });

  it('drops invalid optional labels, email identities and paths while retaining the diagnostic', () => {
    reportFlagDiagnostic({
      operation: 'identity_resolution', outcome: 'error', provider: 'https://private.example',
      reason: 'private@example.test', source: 'raw response', account_id: 'private@example.test',
      flagKey: '/private/path', accountEmail: 'private@example.test', token: 'secret',
    });
    expect(defaultTrack).toHaveBeenCalledWith('feature_flags_diagnostic', {
      operation: 'identity_resolution', outcome: 'error',
    });
  });

  it.each([
    [-10, 0],
    [0, 0],
    [86400001, 86400000],
  ])('bounds elapsed duration %s to %s without altering lifecycle fields', (durationMs, expected) => {
    reportFlagDiagnostic({ operation: 'configuration_fetch', outcome: 'cancelled', provider: 'datadog',
      durationMs, reason: 'superseded', account_id: 'company-a', flagKey: 'sample-flag' });
    expect(defaultTrack).toHaveBeenCalledWith('feature_flags_diagnostic', {
      operation: 'configuration_fetch', outcome: 'cancelled', provider: 'datadog',
      durationMs: expected, reason: 'superseded', account_id: 'company-a', flagKey: 'sample-flag',
    });
  });

  it.each([NaN, Infinity, -Infinity, '10'])('omits a nonfinite or nonnumeric elapsed duration %s', durationMs => {
    reportFlagDiagnostic({ operation: 'configuration_fetch', outcome: 'error', durationMs });
    expect(defaultTrack).toHaveBeenCalledWith('feature_flags_diagnostic', {
      operation: 'configuration_fetch', outcome: 'error',
    });
  });

  it('does not retain overlong company or flag identifiers in telemetry', () => {
    reportFlagDiagnostic({ operation: 'flag_evaluation', outcome: 'error',
      account_id: 'a'.repeat(101), flagKey: 'b'.repeat(101) });
    expect(defaultTrack).toHaveBeenCalledWith('feature_flags_diagnostic', {
      operation: 'flag_evaluation', outcome: 'error',
    });
  });
});
