// ETP-5263 — Contacts' optimistic-locking entity aliases (the POLICY side).
//
// `app-shell-core/lib/recordVersions.js` owns the MECHANISM (an alias table collapsing several
// entity names onto one bucket) and is tested in the core repo with neutral names. This file
// tests the only thing that lives here: that Contacts actually declares its two groups, so a
// token read through one tab arms a save through another instead of returning 409 stale_record.
//
// ## Why core is doubled rather than imported for real
//
// This repo resolves `@etendosoftware/app-shell-core` from the PUBLISHED package unless the
// LOCAL_CORE dev profile is active (docs/repo-topology.md), and `registerEntityAliases` is newer
// than the published version CI installs — which is exactly why the module under test guards its
// call with a `typeof` check. Importing the real module would make this suite pass or fail on
// which core happens to be installed, so the collaborator is doubled with a minimal, faithful
// implementation of the alias mechanism (canonicalise on write, canonicalise on read, then the
// documented resolution cascade). The double's fidelity is pinned by the core suite
// (`packages/app-shell-core/src/lib/__tests__/recordVersions.test.js`); what is pinned HERE is the
// window's policy, asserted through observable token sharing rather than through the shape of the
// declaration.

const CORE_MODULE = '@etendosoftware/app-shell-core/lib/recordVersions.js';
const POLICY_MODULE = '../recordVersionAliases.js';

/**
 * A minimal stand-in for the core version cache.
 *
 * Implements only what the policy's effect is observable through: the alias table, its
 * application on remember/get, and the resolution cascade (exact match → null bucket → sole
 * entry → undefined). The sole-entry step matters for the tests below: every one of them seeds a
 * second, unrelated bucket so that a lookup which the alias table did NOT resolve cannot be
 * answered by that fallback and quietly look like a success.
 *
 * @param {{withRegister?: boolean}} [opts] `withRegister: false` models a published core that
 *   predates `registerEntityAliases`, which is what the module under test guards against.
 */
function createCoreDouble({ withRegister = true } = {}) {
  const aliases = new Map();
  const versions = new Map();
  const canonical = (entity) => (entity == null ? entity : aliases.get(entity) || entity);

  const api = {
    rememberRecordVersion(record, entity = null) {
      const byEntity = versions.get(record.id) || new Map();
      byEntity.set(canonical(entity), record.updated);
      versions.set(record.id, byEntity);
      return record;
    },
    getRecordVersion(id, entity = null) {
      const byEntity = versions.get(id);
      if (!byEntity || byEntity.size === 0) return undefined;
      const key = canonical(entity);
      if (byEntity.has(key)) return byEntity.get(key);
      if (entity !== null && byEntity.has(null)) return byEntity.get(null);
      if (byEntity.size === 1) return byEntity.values().next().value;
      return undefined;
    },
    forgetRecordVersion(id, entity = null) {
      if (entity === null) {
        versions.delete(id);
        return;
      }
      versions.get(id)?.delete(canonical(entity));
    },
  };

  if (withRegister) {
    // Additive, idempotent, first-wins — the core contract this window relies on.
    api.registerEntityAliases = vi.fn((canon, list) => {
      const target = aliases.get(canon) || canon;
      for (const alias of list) {
        if (alias !== target && !aliases.has(alias)) aliases.set(alias, target);
      }
    });
  } else {
    // Explicitly `undefined` rather than absent: a real ES module namespace object answers
    // `undefined` for a name it does not export, which is what the guard under test reads, but
    // Vitest's mocked namespace is a strict proxy that THROWS on an unknown property. Omitting
    // the key would therefore test Vitest, not the published-core case.
    api.registerEntityAliases = undefined;
  }

  return api;
}

/** Re-imports the policy module against a fresh double, re-running its load-time registration. */
async function loadPolicy(opts) {
  const core = createCoreDouble(opts);
  vi.resetModules();
  vi.doMock(CORE_MODULE, () => core);
  await import(POLICY_MODULE);
  return core;
}

afterEach(() => {
  vi.doUnmock(CORE_MODULE);
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('Contacts record version aliases (ETP-5263)', () => {
  // The groups are `groupBy(tableName)` over `artifacts/contacts/contract.json` →
  // `frontendContract.entities`, taking the tables with more than one entity:
  //   C_BPartner      → businessPartner, customer, vendorCreditor, employee
  //   INTR_C_BPARTNER → intrastatShipments, intrastatAdquisitions
  // Re-derive it from the contract, not from this comment, when a tab is added.
  const BP_ALIASES = ['customer', 'vendorCreditor', 'employee'];

  describe('the C_BPartner group', () => {
    it.each(BP_ALIASES)('arms a save through %s with the token read as businessPartner', async (alias) => {
      const core = await loadPolicy();
      core.rememberRecordVersion({ id: 'BP1', updated: 'BP-TOKEN' }, 'businessPartner');
      // A second bucket for the same id, so the sole-entry fallback cannot answer the lookup.
      core.rememberRecordVersion({ id: 'BP1', updated: 'ACCT-TOKEN' }, 'customerAccounting');

      expect(core.getRecordVersion('BP1', alias)).toBe('BP-TOKEN');
    });

    it('lets a save through one tab refresh the token the next tab will send', async () => {
      // THE bug: two saves of one C_BPartner row in a sitting. Without the group, `customer`
      // refreshes only its own bucket and the second save goes out with the token the first
      // already consumed → 409 stale_record.
      const core = await loadPolicy();
      core.rememberRecordVersion({ id: 'BP1', updated: 'v1' }, 'businessPartner');
      core.rememberRecordVersion({ id: 'BP1', updated: 'v2' }, 'customer');

      expect(core.getRecordVersion('BP1', 'businessPartner')).toBe('v2');
      expect(core.getRecordVersion('BP1', 'employee')).toBe('v2');
    });
  });

  describe('the INTR_C_BPARTNER group', () => {
    it('shares one token between the two intrastat tabs', async () => {
      const core = await loadPolicy();
      core.rememberRecordVersion({ id: 'INTR1', updated: 'ship' }, 'intrastatShipments');
      core.rememberRecordVersion({ id: 'INTR1', updated: 'other' }, 'businessPartner');

      expect(core.getRecordVersion('INTR1', 'intrastatAdquisitions')).toBe('ship');

      core.rememberRecordVersion({ id: 'INTR1', updated: 'adq' }, 'intrastatAdquisitions');
      expect(core.getRecordVersion('INTR1', 'intrastatShipments')).toBe('adq');
    });
  });

  describe('what must NOT be grouped', () => {
    // Over-registering is the dangerous direction: the accounting satellites are separate rows
    // carrying their own `updated`, and collapsing them onto the C_BPartner bucket would hand out
    // a token for a row nobody read. Each is alone on its table in the contract.
    it.each(['customerAccounting', 'vendorAccounting', 'employeeAccounting', 'bankAccount',
      'locationAddress', 'contact'])('keeps %s in its own bucket', async (entity) => {
      const core = await loadPolicy();
      core.rememberRecordVersion({ id: 'BP1', updated: 'BP-TOKEN' }, 'businessPartner');
      core.rememberRecordVersion({ id: 'BP1', updated: 'OWN-TOKEN' }, entity);

      expect(core.getRecordVersion('BP1', entity)).toBe('OWN-TOKEN');
      expect(core.getRecordVersion('BP1', 'businessPartner')).toBe('BP-TOKEN');
    });

    it('groups the intrastat tabs with each other but not with the business partner row', async () => {
      const core = await loadPolicy();
      core.rememberRecordVersion({ id: 'X1', updated: 'BP-TOKEN' }, 'businessPartner');
      core.rememberRecordVersion({ id: 'X1', updated: 'INTR-TOKEN' }, 'intrastatShipments');

      expect(core.getRecordVersion('X1', 'businessPartner')).toBe('BP-TOKEN');
      expect(core.getRecordVersion('X1', 'intrastatAdquisitions')).toBe('INTR-TOKEN');
    });
  });

  describe('registering twice', () => {
    it('is a no-op, so a hot reload or a repeated import cannot break the groups', async () => {
      const core = await loadPolicy();
      // Re-run the registration exactly as a second module evaluation would.
      const [firstCall] = core.registerEntityAliases.mock.calls;
      core.registerEntityAliases(...firstCall);

      core.rememberRecordVersion({ id: 'BP1', updated: 'v' }, 'businessPartner');
      core.rememberRecordVersion({ id: 'BP1', updated: 'own' }, 'customerAccounting');
      expect(core.getRecordVersion('BP1', 'customer')).toBe('v');
    });
  });

  describe('fail-safe against a core that predates the feature', () => {
    it('imports without throwing when the resolved core has no registerEntityAliases', async () => {
      // The only thing standing between a not-yet-published core and a broken build: this repo
      // resolves the package from the published version unless LOCAL_CORE is set.
      await expect(loadPolicy({ withRegister: false })).resolves.toBeTruthy();
    });

    it('degrades to the pre-alias behaviour, leaving every bucket independent', async () => {
      const core = await loadPolicy({ withRegister: false });
      core.rememberRecordVersion({ id: 'BP1', updated: 'v1' }, 'businessPartner');
      core.rememberRecordVersion({ id: 'BP1', updated: 'v2' }, 'customer');

      expect(core.getRecordVersion('BP1', 'businessPartner')).toBe('v1');
      expect(core.getRecordVersion('BP1', 'customer')).toBe('v2');
    });

    it('stays quiet under the test MODE gate, so no suite has to tolerate the warning', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await loadPolicy({ withRegister: false });
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
