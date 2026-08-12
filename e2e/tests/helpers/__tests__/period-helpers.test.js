import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { assertPeriodOpen, DEFAULT_DOC_BASE_TYPES, DEFAULT_ORG_NAME } from '../period-helpers.js';

function fakePool(rows) {
  return { query: mock.fn(async () => ({ rows })) };
}

describe('assertPeriodOpen', () => {
  it('resolves without throwing when every requested doc base type is open', async () => {
    const pool = fakePool([
      { docbasetype: 'SOO', periodstatus: 'O', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
      { docbasetype: 'POO', periodstatus: 'O', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
    ]);

    await assert.doesNotReject(
      assertPeriodOpen({ orgName: 'GOOrg', docBaseTypes: ['SOO', 'POO'], pool }),
    );
    assert.equal(pool.query.mock.callCount(), 1);
  });

  it('uses the documented defaults (org GOOrg, full doc base type set) when called with no arguments', async () => {
    const pool = fakePool(
      DEFAULT_DOC_BASE_TYPES.map((docbasetype) => ({
        docbasetype,
        periodstatus: 'O',
        period_name: 'Agosto 2026',
        startdate: new Date('2026-08-01'),
        enddate: new Date('2026-08-31'),
      })),
    );

    await assert.doesNotReject(assertPeriodOpen({ pool }));

    const [, params] = pool.query.mock.calls[0].arguments;
    assert.equal(params[0], DEFAULT_ORG_NAME);
    assert.deepEqual(params[1], DEFAULT_DOC_BASE_TYPES);
  });

  it('throws a clear error naming the org, period, and closed doc base types when some are not open', async () => {
    const pool = fakePool([
      { docbasetype: 'SOO', periodstatus: 'N', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
      { docbasetype: 'POO', periodstatus: 'O', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
      { docbasetype: 'MMS', periodstatus: 'N', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
    ]);

    await assert.rejects(
      assertPeriodOpen({ orgName: 'GOOrg', docBaseTypes: ['SOO', 'POO', 'MMS'], pool }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Accounting period not open for org "GOOrg"/);
        assert.match(err.message, /"Agosto 2026" \(2026-08-01 to 2026-08-31\)/);
        assert.match(err.message, /Document types not open: SOO, MMS/);
        assert.match(err.message, /Open it via Etendo UI: General Ledger → Setup → Open\/Close Period Control/);
        assert.match(err.message, /Open Period for the listed document types/);
        // POO was open — must not be listed as closed.
        assert.doesNotMatch(err.message, /\bPOO\b/);
        return true;
      },
    );
  });

  it('treats a doc base type with no c_periodcontrol row for the current period as not open', async () => {
    // ARI simply has no row back — e.g. the period-control backfill never ran for it.
    const pool = fakePool([
      { docbasetype: 'SOO', periodstatus: 'O', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') },
    ]);

    await assert.rejects(
      assertPeriodOpen({ orgName: 'GOOrg', docBaseTypes: ['SOO', 'ARI'], pool }),
      /Document types not open: ARI/,
    );
  });

  it('falls back to a generic period label when the query returns no rows at all', async () => {
    const pool = fakePool([]);

    await assert.rejects(
      assertPeriodOpen({ orgName: 'GOOrg', docBaseTypes: ['SOO'], pool }),
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
        assertPeriodOpen({ orgName: 'GOOrg', docBaseTypes: ['SOO'], pool }),
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
    const pool = fakePool([{ docbasetype: 'SOO', periodstatus: 'O', period_name: 'Agosto 2026', startdate: new Date('2026-08-01'), enddate: new Date('2026-08-31') }]);
    // A pool without .end()/close semantics must not blow up — proves the
    // helper does not attempt to close an injected pool.
    await assert.doesNotReject(assertPeriodOpen({ docBaseTypes: ['SOO'], pool }));
  });
});
