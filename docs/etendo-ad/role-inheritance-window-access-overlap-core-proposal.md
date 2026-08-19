# Proposal: Fix Cross-Template `AD_Window_Access` Overlap at the Core Level

**Status:** discussion document, not implemented. Written 2026-08-16 during ETP-4906
(Multi-Role User Assignment) as a byproduct of building an external workaround for this
bug — see `docs/plans/2026-08-14-etp-4906-multi-role-user-assignment.md`, Tasks
B2/B6, for that workaround's full detail. **Schema Forge is NOT waiting on this
proposal** — the external, module-level fix in `com.etendoerp.go` is the accepted path
for ETP-4906 (human decision, "no core patch"). This document exists so the idea can be
discussed with the wider team as a possible future improvement to Etendo core itself,
separate from and not blocking ETP-4906's own delivery.

Every claim below marked **[confirmed]** was verified by directly reading the cited
core source file/line in this checkout (`etendo`, not `com.etendoerp.go`). Claims marked
**[proposed]** are a suggested direction, not implemented or tested code — validate
before committing to it.

## The bug, in one sentence

When a role inherits `AD_Window_Access` from 2+ template roles that both grant the same
window, updating the ALREADY-EXISTING inherited row (instead of creating a fresh one)
blindly copies the template's own `client`/`organization` onto the row, corrupting its
tenant ownership — the next flush then fails a security check.

## Confirmed root cause, with exact source locations

1. **[confirmed]** `AccessTypeInjector.getSkippedProperties()`
   (`src/org/openbravo/role/inheritance/access/AccessTypeInjector.java:279-283`) — the
   base class default — returns only `["creationDate", "createdBy"]`. This list controls
   which fields `RoleInheritanceManager.updateRoleAccess` (see below) will NOT
   overwrite when updating an already-existing inherited access row.
2. **[confirmed]** `WindowAccessInjector`
   (`src/org/openbravo/role/inheritance/access/WindowAccessInjector.java`) — the
   injector for `AD_Window_Access` — does **not** override `getSkippedProperties()`, so
   it inherits the base default. `client` and `organization` are NOT in the skip list.
3. **[confirmed]** `RoleInheritanceManager.updateRoleAccess`
   (`src/org/openbravo/role/inheritance/RoleInheritanceManager.java:190-201`) calls
   `DalUtil.copyToTarget(inherited, access, false, injector.getSkippedProperties())` —
   this copies EVERY property from the template's own access row onto the target
   (already-existing) row, **except** whatever `getSkippedProperties()` excludes. Since
   `client`/`organization` aren't excluded for `WindowAccess`, they get overwritten with
   the TEMPLATE's own values (often system client `"0"`) instead of staying as the
   target role's own tenant client/organization.
4. **[confirmed]** This method is called from BOTH propagation directions:
   - `propagateUpdatedAccess` (`RoleInheritanceManager.java:417-436`) — when a template's
     `AD_Window_Access` is added/changed and an inheriting role already has a row for
     that window from ANOTHER template.
   - `propagateDeletedAccess` (`RoleInheritanceManager.java:448-493`) — when an
     inheritance is removed and the role still inherits from another template that also
     grants the same window (see "removal already re-derives" below) — same
     `updateRoleAccess` call, same corruption risk.
5. **[confirmed]** Why the CREATE path (`copyRoleAccess`,
   `RoleInheritanceManager.java:118-131`) does NOT hit this, while the UPDATE path does:
   both methods wrap their work in `OBContext.setAdminMode(false)` (the boolean here is
   Openbravo's `doOrgClientAccessCheck` flag — `false` means the org/client security
   check in `SecurityChecker.checkWriteAccess` is skipped entirely while active, per
   `SecurityChecker.java:159`). The difference is WHEN Hibernate actually validates the
   write: `Session.save()` (used by `copyRoleAccess`, a genuinely new row) triggers an
   immediate interceptor callback (`OBInterceptor.onSave`) synchronously, before the
   admin-mode bypass is popped. An already-persistent, merely-DIRTIED entity (what
   `updateRoleAccess` produces) is instead checked later, whenever the session
   eventually flushes (`OBInterceptor.onFlushDirty`) — which is very often outside the
   original admin-mode window, under whatever `OBContext` the CALLER (e.g. a normal
   logged-in user editing a role in Classic, or any composition service) happens to be
   running under at that later point. `SecurityChecker.checkWriteAccess`
   (`src/org/openbravo/dal/security/SecurityChecker.java:116-166`) reads the client id
   via a **live getter call on the entity object itself**
   (`((ClientEnabled) obj).getClient().getId()`, line 142-143) — never from Hibernate's
   dirty-check array — so by the time the check runs, it sees the corrupted value.
6. **[confirmed] Live-reproduced independent of any Schema Forge/ETP-4906 code**: 2
   throwaway template roles created directly in Etendo Classic, both granting the same
   window with different access levels, composed onto a personal role — reproduces the
   exact `OBSecurityException` with zero `com.etendoerp.go` code in the call stack.
   Confirms this is a genuine, general core behavior, not specific to this module or
   this ticket's own webhook.

## Removal already re-derives from a remaining template — but not always the RIGHT one

**[confirmed]** `propagateDeletedAccess`
(`RoleInheritanceManager.java:448-493`) is more thoughtful than "just delete the row
when an inheritance is removed." For each affected access row, it looks up the
REMAINING actively-inherited templates (`getRoleInheritancesInheritFromList`, excluding
the one being removed), **ordered by sequence number descending**, and for the FIRST
remaining template that also grants the same secured element (e.g. same window), it
calls `updateRoleAccess` to re-derive the row from THAT template instead of deleting it.
Only if NO remaining template grants the element does it actually delete the row.

**So the simple 2-template case already works correctly in principle** (e.g. "had
Finance=full + Inventory=read-only on Business Partner, remove Finance, Inventory alone
determines the result") — modulo the corruption bug above, which affects this path too
(same `updateRoleAccess` call).

**What's still missing for 3+ overlapping templates:** the loop stops at the FIRST
remaining template it finds (by sequence order), not the MOST PERMISSIVE one among all
remaining templates that grant the element. Example: role inherits Finance(full) +
Sales(read-only) + Inventory(read-only) all on the same window; Finance is removed.
Core picks whichever of Sales/Inventory has the higher sequence number and copies THAT
one's value — if that happens to be a read-only one and a different remaining template
would also apply, the specific one chosen doesn't matter here (both are read-only), but
in a case where Sales(read-only, seq 20) and a 4th template Purchasing(full, seq 10)
both remain, core would stop at Sales (higher seq) and leave the window read-only, even
though Purchasing (still active, still granting full) says it should be full. Most-
permissive-wins is not enforced on the removal-driven re-derivation, only "first
remaining source wins."

## Proposed fixes, in increasing scope

### Tier 1 — Fix the ownership corruption (small, surgical, high confidence)

**[proposed]** Override `getSkippedProperties()` in `WindowAccessInjector` to also skip
`client` and `organization`:

```java
@Override
public List<String> getSkippedProperties() {
  List<String> skipped = new ArrayList<>(super.getSkippedProperties());
  skipped.add("client");
  skipped.add("organization");
  return skipped;
}
```

Since `updateRoleAccess`'s `DalUtil.copyToTarget` call already respects this list, the
target row's own `client`/`organization` would simply never be touched during an
UPDATE-path propagation — eliminating the corruption at its actual source. This is a
well-established extension point (`getSkippedProperties()` exists exactly for this kind
of per-field exclusion; other injectors already override it for their own reasons) — low
risk, one method, one class. This alone would fix BOTH the add-overlap case
(`propagateUpdatedAccess`) and the remove-and-re-derive case (`propagateDeletedAccess`),
since both funnel through the same `updateRoleAccess`. It would also make Schema Forge's
own external workaround (ETP-4906 Task B6 — proactively deleting overlapping rows to
force the CREATE path) unnecessary for the ownership-corruption problem specifically.

### Tier 2 — Enforce most-permissive-wins on the ADD path (medium)

**[proposed]** `updateRoleAccess`'s blind `copyToTarget` also overwrites the actual
access LEVEL (`IsReadWrite`) unconditionally — so composing Sales (read-only) after
Finance (full) was already applied can silently narrow a window from full back down to
read-only, unless something else corrects it afterward (this is exactly why ETP-4906's
own `UserRoleCompositionService.reconcileWindowAccessAfterComposition` exists as an
external correction pass). A core-level fix would need either:
- A new `AccessTypeInjector` hook, e.g. `shouldOverrideValue(existing, incoming)`,
  called from `updateRoleAccess` before copying, that `WindowAccessInjector` overrides
  to keep the existing value if it's already full (`isReadWrite = true`/editable) and
  the incoming one isn't; or
- A `WindowAccessInjector`-specific override inside `updateRoleAccess` itself (less
  clean, `RoleInheritanceManager` would need to become access-type-aware, which the
  current design deliberately avoids).

This is a genuine behavior change (core deciding "most permissive wins" is itself a
business rule, not obviously "correct" for every possible future use of role
inheritance) — needs product sign-off, not just an engineering call, before proposing it
upstream or building it into a local core patch.

### Tier 3 — Full most-permissive-wins on the REMOVE path (larger)

**[proposed]** Extend `propagateDeletedAccess`'s re-derivation loop
(`RoleInheritanceManager.java:466-475`) to check ALL remaining templates that grant the
element (not stop at the first one found by sequence order) and pick the most permissive
among them, mirroring whatever resolution rule Tier 2 settles on. This is the same
"most permissive wins" business rule as Tier 2, applied to the removal side instead of
the addition side — likely shares the same new injector hook if Tier 2 is built. Larger
in scope only because it touches a loop that currently has an early-exit (`break`) baked
into its logic, not because the underlying rule is any different from Tier 2.

## Why Schema Forge isn't waiting on this

Patching Etendo/Openbravo core means maintaining a diff against upstream forever — every
core version bump needs the patch manually reapplied and re-verified, with the constant
risk that behavior changes affect every module in the system, not just this one
scenario (ETP-4906 itself hit a live example of how fragile pinning module versions
against a specific core version already is, unrelated to this bug, during the same
session this document was written in). ETP-4852 (the ticket that first found this bug)
already made an explicit, deliberate decision to fix it at the `com.etendoerp.go` module
level instead — see `UserRoleCompositionService.java`'s own class javadoc for the
full self-contained, no-core-patch design. This document is offered as team discussion
material for a possible FUTURE core contribution, not a blocker or dependency for any
current Schema Forge work.
