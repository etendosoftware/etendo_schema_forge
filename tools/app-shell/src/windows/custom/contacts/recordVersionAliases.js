/**
 * Contacts' optimistic-locking entity aliases (ETP-5263).
 *
 * ## The trap this closes
 *
 * The version cache that arms every write with the `updated` value the client read
 * (`app-shell-core/lib/recordVersions.js`) is keyed by (record id, ENTITY). It has to be: an id is
 * only unique within a table, and Etendo's one-to-one satellites (`ad_org` / `ad_orginfo`) put two
 * DIFFERENT rows under one id.
 *
 * Contacts is the opposite situation. Its spec exposes ONE table under several generated entity
 * names, so a single `C_BPartner` row gets several independent buckets — and a write through one
 * of them refreshes only its own. Because the cache prefers an exact entity match, a STALE exact
 * bucket then beats a sibling holding a fresher token, and the second save of a sitting goes out
 * with a token the first already consumed → a 409 `stale_record` the user cannot explain or
 * resolve. The per-record write serialisation in `auth/api.js` does not cover it either: it keys by
 * the same (entity, id) pair, so two aliases of one row are not serialised against each other.
 *
 * Registering the groups here makes all names of one table share one bucket. Core owns the
 * mechanism; this file is the policy, because which entity names share a table is knowledge about
 * THIS window, not about the cache.
 *
 * ## The groups, verified against `artifacts/contacts/contract.json`
 *
 * Grouping `frontendContract.entities` by `tableName` gives exactly two groups with more than one
 * member; every other entity is alone on its table and must stay in its own bucket (the accounting
 * satellites `C_BP_Customer_Acct` / `C_BP_Vendor_Acct` / `C_BP_Employee_Acct` in particular, which
 * are separate rows carrying their own `updated`):
 *
 *   C_BPartner       → businessPartner, customer, vendorCreditor, employee
 *   INTR_C_BPARTNER  → intrastatShipments, intrastatAdquisitions
 *
 * Re-verify against the contract, not against this comment, when a tab is added.
 *
 * ## OPTION B — derive this instead of declaring it (not built)
 *
 * `contract.json` already carries `tableName` per entity, so these groups are just
 * `groupBy(tableName)` over the spec: nothing to hand-maintain, no way for a new tab to be
 * forgotten, and the `ad_org` / `ad_orginfo` constraint is satisfied by construction because those
 * are different tables. It is not done today because the runtime app is configured from NEO
 * (`ETGO_SF_*`), not from `contract.json`, and the frontend does not receive `tableName` per entity
 * at runtime. What would have to change: NEO exposes the entity's table in the spec payload it
 * serves (`ETGO_SF_ENTITY`), the generic spec loader groups entities by it and calls
 * `registerEntityAliases` itself — and then this file, and every future per-window twin of it, is
 * deleted.
 */

// Namespace import on purpose: `registerEntityAliases` is new in app-shell-core, and this repo
// resolves that package from the PUBLISHED version unless the LOCAL_CORE dev profile is active
// (see docs/repo-topology.md). A named import of a not-yet-published export would fail the build;
// a namespace import degrades to the pre-alias behaviour, which is the behaviour shipped today.
import * as recordVersions from '@etendosoftware/app-shell-core/lib/recordVersions.js';

const ALIAS_GROUPS = [
  // [canonical, ...aliases] — canonical is the entity the window actually writes through.
  ['businessPartner', ['customer', 'vendorCreditor', 'employee']],
  ['intrastatShipments', ['intrastatAdquisitions']],
];

if (typeof recordVersions.registerEntityAliases === 'function') {
  // Additive and idempotent core-side, so re-running on hot reload or a repeated test import is a
  // no-op.
  for (const [canonical, aliases] of ALIAS_GROUPS) {
    recordVersions.registerEntityAliases(canonical, aliases);
  }
} else if (import.meta.env?.DEV === true && import.meta.env?.MODE !== 'test') {
  // eslint-disable-next-line no-console
  console.warn(
    '[ETP-5263] app-shell-core has no registerEntityAliases; Contacts entity aliases are not '
    + 'registered. Saving one C_BPartner row through two tabs in a sitting can return 409 '
    + 'stale_record. Bump @etendosoftware/app-shell-core to a version that exports it.',
  );
}
