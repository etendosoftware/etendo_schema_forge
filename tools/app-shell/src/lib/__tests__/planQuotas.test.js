// @covers tools/app-shell/src/lib/planQuotas.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTA_EXCEEDED_CODE,
  extractQuotaExceeded,
  formatQuotaQuantity,
  isQuotaOverLimit,
  quotaAlertItems,
  quotaBannerDismissKey,
  quotaPeriodKey,
  quotaResourceLabel,
  quotaStateKey,
  quotaUsageText,
  quotaUsageWithPeriod,
} from '../planQuotas.js';

/**
 * The plan quota item (`QuotaItem`) the backend sends on /account, in the environment list and in
 * a 403 QUOTA_EXCEEDED write refusal, and what the SPA derives from it. Pure functions: every case
 * calls the real module with a key-echoing `ui` that appends its params, so the key chosen and the
 * values it interpolates are both observable without pinning any copy.
 */

/** `key` alone, or `key|{json params}` — the shape assertions read. */
const ui = (key, params) => (params ? `${key}|${JSON.stringify(params)}` : key);

/** A QuotaItem as the backend sends it (contract: one shape everywhere). */
function quota(overrides = {}) {
  return {
    resourceKey: 'POSTED_SALES_INVOICES',
    resourceName: 'Posted sales invoices',
    unitLabel: 'Inv',
    includedQty: 100,
    enforcementMode: 'block',
    warningThreshold: 80,
    period: 'month',
    consumptionSource: 'aggregate',
    consumed: 87,
    verdict: 'WARN',
    periodStart: '2026-10-07T00:00:00Z',
    periodEnd: '2026-11-07T00:00:00Z',
    ...overrides,
  };
}

describe('quotaStateKey', () => {
  it('reads DENY as the limit reached', () => {
    assert.equal(quotaStateKey(quota({ verdict: 'DENY', consumed: 100 })), 'quotaStateDeny');
  });

  it('reads WARN under the limit as near the limit', () => {
    assert.equal(quotaStateKey(quota({ verdict: 'WARN', consumed: 87 })), 'quotaStateWarn');
  });

  it('reads WARN at or over the limit as over (a warn-mode quota running past it)', () => {
    assert.equal(quotaStateKey(quota({ verdict: 'WARN', consumed: 100 })), 'quotaStateOver');
    assert.equal(quotaStateKey(quota({ verdict: 'WARN', consumed: 140 })), 'quotaStateOver');
  });

  it('flags nothing for ALLOW, a not-evaluated (null) verdict, an unknown verdict or no item', () => {
    assert.equal(quotaStateKey(quota({ verdict: 'ALLOW' })), null);
    assert.equal(quotaStateKey(quota({ verdict: null })), null);
    assert.equal(quotaStateKey(quota({ verdict: 'SOMETHING_NEW' })), null);
    assert.equal(quotaStateKey(null), null);
    assert.equal(quotaStateKey(undefined), null);
  });

  it('keeps WARN as near the limit when the consumption is not measured', () => {
    assert.equal(quotaStateKey(quota({ verdict: 'WARN', consumed: null })), 'quotaStateWarn');
  });
});

describe('isQuotaOverLimit', () => {
  it('is true only when a measured consumption reaches the included quantity', () => {
    assert.equal(isQuotaOverLimit(quota({ consumed: 99 })), false);
    assert.equal(isQuotaOverLimit(quota({ consumed: 100 })), true);
    assert.equal(isQuotaOverLimit(quota({ consumed: '100' })), true);
    assert.equal(isQuotaOverLimit(quota({ consumed: null })), false);
    assert.equal(isQuotaOverLimit(quota({ includedQty: null })), false);
    assert.equal(isQuotaOverLimit(null), false);
  });
});

describe('quotaUsageText', () => {
  it('says "<consumed> of <included> <unit>" with a unit', () => {
    assert.equal(quotaUsageText(quota(), ui),
      `quotaUsage|${JSON.stringify({ consumed: '87', included: '100', unit: 'Inv' })}`);
  });

  it('drops the unit slot when there is no unit (null, blank or missing)', () => {
    const expected = `quotaUsageNoUnit|${JSON.stringify({ consumed: '87', included: '100' })}`;
    assert.equal(quotaUsageText(quota({ unitLabel: null }), ui), expected);
    assert.equal(quotaUsageText(quota({ unitLabel: '   ' }), ui), expected);
    assert.equal(quotaUsageText(quota({ unitLabel: undefined }), ui), expected);
  });

  it('trims the unit label', () => {
    assert.equal(quotaUsageText(quota({ unitLabel: '  Inv ' }), ui),
      `quotaUsage|${JSON.stringify({ consumed: '87', included: '100', unit: 'Inv' })}`);
  });

  it('shows only the included quantity when consumed is null (not measured yet), never zero', () => {
    assert.equal(quotaUsageText(quota({ consumed: null }), ui),
      `quotaIncluded|${JSON.stringify({ included: '100', unit: 'Inv' })}`);
    assert.equal(quotaUsageText(quota({ consumed: null, unitLabel: null }), ui),
      `quotaIncludedNoUnit|${JSON.stringify({ included: '100' })}`);
    assert.doesNotMatch(quotaUsageText(quota({ consumed: null }), ui), /"consumed"/);
  });

  it('shows a measured zero as zero', () => {
    assert.equal(quotaUsageText(quota({ consumed: 0 }), ui),
      `quotaUsage|${JSON.stringify({ consumed: '0', included: '100', unit: 'Inv' })}`);
  });

  it('groups large quantities with the instance-wide separators', () => {
    assert.equal(quotaUsageText(quota({ consumed: 1500, includedQty: 12000 }), ui),
      `quotaUsage|${JSON.stringify({
        consumed: formatQuotaQuantity(1500),
        included: formatQuotaQuantity(12000),
        unit: 'Inv',
      })}`);
  });

  it('returns an empty string without an included quantity, or without an item', () => {
    assert.equal(quotaUsageText(quota({ includedQty: null }), ui), '');
    assert.equal(quotaUsageText(quota({ includedQty: 'abc' }), ui), '');
    assert.equal(quotaUsageText(null, ui), '');
  });
});

describe('formatQuotaQuantity', () => {
  it('groups with the shipped es-ES separators and keeps up to two decimals', () => {
    assert.equal(formatQuotaQuantity(1500), '1.500');
    assert.equal(formatQuotaQuantity(12.5), '12,5');
    assert.equal(formatQuotaQuantity(100), '100');
    assert.equal(formatQuotaQuantity(null), '');
  });
});

describe('quotaPeriodKey / quotaUsageWithPeriod', () => {
  it('maps month and year to their period words, and anything else to null', () => {
    assert.equal(quotaPeriodKey(quota({ period: 'month' })), 'quotaPeriodMonth');
    assert.equal(quotaPeriodKey(quota({ period: 'year' })), 'quotaPeriodYear');
    assert.equal(quotaPeriodKey(quota({ period: null })), null);
    assert.equal(quotaPeriodKey(quota({ period: 'week' })), null);
    assert.equal(quotaPeriodKey(null), null);
  });

  it('appends the month word to the usage', () => {
    const usage = quotaUsageText(quota(), ui);
    assert.equal(quotaUsageWithPeriod(quota(), ui),
      `quotaUsageInPeriod|${JSON.stringify({ usage, period: 'quotaPeriodMonth' })}`);
  });

  it('appends the year word on a yearly plan, so a yearly quota reads yearly', () => {
    const item = quota({ period: 'year', includedQty: 1200, consumed: 900 });
    const usage = quotaUsageText(item, ui);
    assert.equal(quotaUsageWithPeriod(item, ui),
      `quotaUsageInPeriod|${JSON.stringify({ usage, period: 'quotaPeriodYear' })}`);
  });

  it('is the bare usage when the plan has no billing interval', () => {
    const item = quota({ period: null });
    assert.equal(quotaUsageWithPeriod(item, ui), quotaUsageText(item, ui));
  });

  it('is empty when there is no usage to show', () => {
    assert.equal(quotaUsageWithPeriod(quota({ includedQty: null }), ui), '');
  });
});

describe('quotaResourceLabel', () => {
  it('is the catalog name, trimmed', () => {
    assert.equal(quotaResourceLabel(quota({ resourceName: '  Facturas  ' })), 'Facturas');
  });

  it('falls back to the resource key when the name is blank or missing', () => {
    assert.equal(quotaResourceLabel(quota({ resourceName: '' })), 'POSTED_SALES_INVOICES');
    assert.equal(quotaResourceLabel(quota({ resourceName: null })), 'POSTED_SALES_INVOICES');
  });

  it('is null when there is neither a name nor a key', () => {
    assert.equal(quotaResourceLabel(quota({ resourceName: ' ', resourceKey: '' })), null);
    assert.equal(quotaResourceLabel(null), null);
  });
});

describe('quotaAlertItems', () => {
  it('keeps only WARN and DENY items, DENY first, each group in its original order', () => {
    const items = [
      quota({ resourceKey: 'A', resourceName: 'A', verdict: 'WARN' }),
      quota({ resourceKey: 'B', resourceName: 'B', verdict: 'ALLOW' }),
      quota({ resourceKey: 'C', resourceName: 'C', verdict: 'DENY' }),
      quota({ resourceKey: 'D', resourceName: 'D', verdict: null }),
      quota({ resourceKey: 'E', resourceName: 'E', verdict: 'WARN' }),
      quota({ resourceKey: 'F', resourceName: 'F', verdict: 'DENY' }),
    ];
    assert.deepEqual(quotaAlertItems(items).map((item) => item.resourceKey), ['C', 'F', 'A', 'E']);
  });

  it('drops null entries and items with neither a resource name nor a key to show', () => {
    const items = [
      null,
      quota({ resourceName: '', resourceKey: '' }),
      quota({ resourceName: '  ', resourceKey: null }),
      quota({ resourceKey: 'OK' }),
    ];
    assert.deepEqual(quotaAlertItems(items).map((item) => item.resourceKey), ['OK']);
  });

  it('keeps an item whose name is blank when it has a resource key to show instead', () => {
    const items = [quota({ resourceName: '  ', resourceKey: 'KEY_ONLY' })];
    assert.deepEqual(quotaAlertItems(items).map((item) => item.resourceKey), ['KEY_ONLY']);
  });

  it('is an empty list for [] or anything that is not an array', () => {
    assert.deepEqual(quotaAlertItems([]), []);
    assert.deepEqual(quotaAlertItems(undefined), []);
    assert.deepEqual(quotaAlertItems(null), []);
    assert.deepEqual(quotaAlertItems({}), []);
  });
});

describe('extractQuotaExceeded', () => {
  const item = quota({ verdict: 'DENY', consumed: 100 });

  it('reads the quota of the NEO envelope { error: { code, quota } }', () => {
    const body = {
      error: {
        message: 'Quota exceeded: Posted sales invoices (100/100 Inv)',
        status: 403,
        code: QUOTA_EXCEEDED_CODE,
        quota: item,
      },
    };
    assert.equal(extractQuotaExceeded(body), item);
  });

  it('reads an already unwrapped body { code, quota }', () => {
    assert.equal(extractQuotaExceeded({ code: 'QUOTA_EXCEEDED', quota: item }), item);
  });

  it('reads the batch failure envelope at error.detail.error', () => {
    const batch = {
      committed: false,
      failedAt: { id: 'inv' },
      error: {
        message: 'Quota exceeded: Posted sales invoices (100/100 Inv)',
        detail: { error: { code: 'QUOTA_EXCEEDED', status: 403, quota: item } },
      },
    };
    assert.equal(extractQuotaExceeded(batch), item);
  });

  it('gives an empty object for a quota refusal that carries no quota, so it is still recognised', () => {
    assert.deepEqual(extractQuotaExceeded({ error: { code: 'QUOTA_EXCEEDED' } }), {});
    assert.deepEqual(extractQuotaExceeded({ error: { code: 'QUOTA_EXCEEDED', quota: 'x' } }), {});
  });

  it('is null for any other body', () => {
    for (const body of [
      null,
      undefined,
      'Quota exceeded: X (1/1)',
      {},
      { error: { code: 'ACCESS_DENIED', message: 'Access denied to spec for current role' } },
      { error: 'stale_record' },
      { error: { code: 'quota_exceeded', quota: item } },
      { committed: false, error: { message: 'boom', detail: { error: { code: 'OTHER' } } } },
      { committed: true, operations: [] },
    ]) {
      assert.equal(extractQuotaExceeded(body), null, JSON.stringify(body));
    }
  });
});

describe('quotaBannerDismissKey', () => {
  const warnA = quota({ resourceKey: 'A', verdict: 'WARN' });
  const denyA = quota({ resourceKey: 'A', verdict: 'DENY' });
  const warnB = quota({ resourceKey: 'B', verdict: 'WARN' });

  it('is stable for the same client and the same verdicts', () => {
    assert.equal(quotaBannerDismissKey('C1', [warnA]), quotaBannerDismissKey('C1', [{ ...warnA }]));
  });

  it('changes per client, when a verdict changes, and when another resource is reported', () => {
    const key = quotaBannerDismissKey('C1', [warnA]);
    assert.notEqual(key, quotaBannerDismissKey('C2', [warnA]));
    assert.notEqual(key, quotaBannerDismissKey('C1', [denyA]));
    assert.notEqual(key, quotaBannerDismissKey('C1', [warnA, warnB]));
  });

  it('falls back to the resource name and never renders "undefined" or "null"', () => {
    const named = { resourceName: 'Invoices', verdict: 'WARN' };
    assert.match(quotaBannerDismissKey('C1', [named]), /Invoices=WARN/);
    assert.doesNotMatch(quotaBannerDismissKey(undefined, null), /undefined|null/);
  });
});
