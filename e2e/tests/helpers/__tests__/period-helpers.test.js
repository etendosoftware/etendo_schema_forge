import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ensureOpenPeriod, DEFAULT_DOC_BASE_TYPES, DEFAULT_ORG_NAME } from '../period-helpers.js';

function fakePool(rows) {
  const calls = [];
  return {
    calls,
    query: mock.fn(async (sql, params) => {
      calls.push({ sql, params });
      return { rows };
    }),
  };
}

describe('ensureOpenPeriod', () => {
  it('resolves without issuing any UPDATE when every requested doc base type is already open', async () => {
    const pool = fakePool([
      { docbasetype: 'SOO', periodstatus: 'O', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
      { docbasetype: 'POO', periodstatus: 'O', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
    ]);

    await assert.doesNotReject(
      ensureOpenPeriod({ orgName: 'GOOrg', docBaseTypes: ['SOO', 'POO'], pool }),
    );
    assert.equal(pool.query.mock.callCount(), 1);
    assert.ok(/SELECT/.test(pool.calls[0].sql));
  });

  it('uses the documented defaults (org GOOrg, full doc base type set) when called with no arguments', async () => {
    const pool = fakePool(
      DEFAULT_DOC_BASE_TYPES.map((docbasetype) => ({
        docbasetype,
        periodstatus: 'O',
        c_period_id: 'PERIOD1',
        ad_org_id: 'ORG1',
        period_name: 'Agosto 2026',
        startdate: new Date('2026-08-01'),
        enddate: new Date('2026-08-31'),
      })),
    );

    await assert.doesNotReject(ensureOpenPeriod({ pool }));

    const [, params] = pool.query.mock.calls[0].arguments;
    assert.equal(params[0], DEFAULT_ORG_NAME);
    assert.deepEqual(params[1], DEFAULT_DOC_BASE_TYPES);
  });

  it('opens exactly the closed doc base types and leaves already-open ones untouched', async () => {
    const pool = fakePool([
      { docbasetype: 'SOO', periodstatus: 'N', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
      { docbasetype: 'POO', periodstatus: 'O', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
      { docbasetype: 'MMS', periodstatus: 'C', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
    ]);

    await assert.doesNotReject(
      ensureOpenPeriod({ orgName: 'GOOrg', docBaseTypes: ['SOO', 'POO', 'MMS'], pool }),
    );

    // SELECT + UPDATE c_periodcontrol + UPDATE c_period
    assert.equal(pool.query.mock.callCount(), 3);

    const controlUpdate = pool.calls[1];
    assert.match(controlUpdate.sql, /UPDATE c_periodcontrol/);
    assert.match(controlUpdate.sql, /SET periodstatus = \$1/);
    assert.equal(controlUpdate.params[0], 'O');
    assert.equal(controlUpdate.params[1], 'N');
    assert.equal(controlUpdate.params[2], 'C');
    assert.equal(controlUpdate.params[3], 'PERIOD1');
    assert.equal(controlUpdate.params[4], 'ORG1');
    assert.deepEqual([...controlUpdate.params[5]].sort(), ['MMS', 'SOO']);
    assert.ok(!controlUpdate.params[5].includes('POO'));

    const periodUpdate = pool.calls[2];
    assert.match(periodUpdate.sql, /UPDATE c_period /);
    assert.match(periodUpdate.sql, /SET openclose = \$1/);
    assert.equal(periodUpdate.params[0], 'C');
    assert.equal(periodUpdate.params[1], 'PERIOD1');
  });

  it('throws a clear error naming the org, period, and doc base types with no c_periodcontrol row at all', async () => {
    // ARI simply has no row back — e.g. the period-control backfill never ran for it.
    const pool = fakePool([
      { docbasetype: 'SOO', periodstatus: 'O', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
    ]);

    await assert.rejects(
      ensureOpenPeriod({ orgName: 'GOOrg', docBaseTypes: ['SOO', 'ARI'], pool }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /org "GOOrg"/);
        assert.match(err.message, /"Agosto 2026" \(2026-08-01 to 2026-08-31\)/);
        assert.match(err.message, /document types: ARI/);
        assert.match(err.message, /docs\/etendo-ad\/onboarding-gaps\.md §C2/);
        // No UPDATE should have been issued — only the initial SELECT.
        assert.equal(pool.query.mock.callCount(), 1);
        return true;
      },
    );
  });

  it('falls back to a generic period label when the query returns no rows at all', async () => {
    const pool = fakePool([]);

    await assert.rejects(
      ensureOpenPeriod({ orgName: 'GOOrg', docBaseTypes: ['SOO'], pool }),
      /period the current period \(no c_periodcontrol row found at all for it\)/,
    );
  });

  it('skips the check with a console warning when the DB query fails (unreachable DB)', async () => {
    const pool = { query: mock.fn(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5432'); }) };
    const warnCalls = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnCalls.push(args.join(' '));

    try {
      await assert.doesNotReject(
        ensureOpenPeriod({ orgName: 'GOOrg', docBaseTypes: ['SOO'], pool }),
      );
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(warnCalls.length, 1);
    assert.match(warnCalls[0], /Skipping accounting-period check for org "GOOrg"/);
    assert.match(warnCalls[0], /connect ECONNREFUSED 127\.0\.0\.1:5432/);
    assert.match(warnCalls[0], /local-dev convenience/);
  });

  it('never calls closePool on an injected pool (test seam does not manage its lifecycle)', async () => {
    const pool = fakePool([{ docbasetype: 'SOO', periodstatus: 'O', c_period_id: 'PERIOD1', ad_org_id: 'ORG1', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') }]);
    // A pool without .end()/close semantics must not blow up — proves the
    // helper does not attempt to close an injected pool.
    await assert.doesNotReject(ensureOpenPeriod({ docBaseTypes: ['SOO'], pool }));
  });
});
