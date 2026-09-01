# ETP-5019 — Promote/demote invited users to Admin role (design)

Jira: https://etendoproject.atlassian.net/browse/ETP-5019 (epic ETP-3504). Folded into the
same ticket as the owner/admin role-composition guard and the two follow-up bugs (owner
email, contact-only-user filter) — see `docs/plans/2026-08-27-etp-5019-progress.md` for the
status of that already-shipped work.

## Motivation

Today only the tenant **owner** (`EM_ETGO_Is_Owner='Y'`) holds the client's single Admin
role (`AD_Role.is_client_admin='Y'`, "Role Administrator" checkbox `Y`). Every other invited
user only ever gets a **personal composed role** (built from the four template roles —
Finance/Sales/Purchasing/Inventory — via `UserRoleCompositionService`).

The user wants a way to give an invited (non-owner) user that *same* Admin role directly —
full access, `EM_ETGO_Is_Owner` stays `'N'` — instead of composing template roles for them.
Admin and the four template roles are meant to be **mutually exclusive**: an admin has full
access already, so composing Finance/Sales/etc. onto them is meaningless (and today's
`enforceOwnerProtection` guard already rejects it — see below).

## Data model recap (verified against current code, 2026-08-27)

- Four template roles (`SystemRoleTemplates`) are system-owned (`AD_Client_ID='0'`), shared
  across all tenants.
- The client Admin role is per-tenant, auto-created by core's `InitialClientSetup`,
  `is_client_admin='Y'`. `UserRoleCompositionService` never creates or mutates it.
- A **personal role** is a per-user, per-client composed role
  (`UserRoleCompositionService#createPersonalRole`), named deterministically via
  `PersonalRoleAccessProvisioningService#buildPersonalRoleName(user)`, whose
  `AD_Role_Inheritance` rows are reconciled to match whichever templates are currently
  composed for that user.
- `resolveOrCreatePersonalRole(User)` → `findExistingPersonalRole(User)` **only consults
  `user.getDefaultRole()`** as the reuse candidate — it does not search more broadly for a
  role that belongs to the user.
- `UserRoleSyncSupport#syncSingleActiveUserRole(User, Role)` **deletes every existing
  `AD_UserRoles` row for the user** and inserts exactly one new row for the target role — the
  codebase's firm "exactly one active role per user at a time" invariant.
- `enforceOwnerProtection` (ETP-5019, already shipped) rejects `assignTemplateRoles`
  unconditionally when the target is flagged owner OR currently holds the client-admin role
  (`currentRole.isClientAdmin()`). **This guard is reused as-is by this feature** — once a
  user is promoted to Admin, composing template roles onto them is already blocked, with zero
  new code.

## Decisions (confirmed with the user)

1. **Authorization**: the owner OR any current Admin may promote/demote another (non-owner)
   user. No cap on how many non-owner admins a client can have.
2. **Owner protection**: the owner can never be demoted through this flow, by anyone — matches
   the ticket's existing guarantee that the owner's Admin role is untouchable.
3. **UI approach**: a separate, explicit "Hacer administrador" / "Quitar rol de administrador"
   action — **not** folded into the existing template checkbox list, and **not** a
   toggle/segmented control. Reuses the admin-locked rendering `AssignTemplateRolesControl.jsx`
   already has for the owner case.
4. **Demote landing state**: restores the user's **prior personal role if one existed**
   (composition intact — e.g. Finance+Sales), or a fresh empty personal role if they never had
   one (invited then promoted directly). **Not** a bare zero-roles state.

## Backend design (`com.etendoerp.go`, `UserRoleCompositionService`)

### `promoteToAdmin(String callerUserId, String targetUserId)`

1. Resolve caller and target `User`s.
2. Authorization: caller must be owner (`OwnerSupport.isOwner`) or hold the client-admin role
   (`caller.getDefaultRole().isClientAdmin()`) — same signal `enforceOwnerProtection` already
   uses, just the opposite polarity (require it, not reject it).
3. Reject if target is already the owner (promoting the owner is meaningless — they already
   have it) or already holds the client-admin role (no-op-as-error, avoids silent double-work).
4. Look up the client's single Admin `AD_Role` row (`is_client_admin='Y'`, scoped to
   `target.getClient()`).
5. **Do not delete** the target's current personal role row (if `target.getDefaultRole()` is
   currently a reusable personal role) — only *unassign* it: `syncSingleActiveUserRole(target,
   adminRole)` already deletes the `AD_UserRoles` row and installs the Admin one; that's the
   only removal needed. The personal role's own row, name, and `AD_Role_Inheritance`
   (Finance+Sales grants) are left completely untouched, just no longer referenced by
   `Default_Ad_Role_ID`.
6. `target.setDefaultRole(adminRole)`, save.

### `demoteFromAdmin(String callerUserId, String targetUserId)`

1. Resolve caller and target `User`s.
2. Same authorization as promote.
3. **Hard reject if target is the owner** — reuse/extend `enforceOwnerProtection`'s owner
   check explicitly here, independent of the generic template-composition guard (this is a
   different write path).
4. Reject if target does not currently hold the client-admin role (nothing to demote from).
5. **New lookup** (the actual novel piece of this feature): query `AD_Role` for
   `client = target.getClient() AND name = buildPersonalRoleName(target) AND isActive = true`.
   - If found: reuse it as-is (`isReusablePersonalRole`'s other checks — not template, not
     client-admin, exclusively-assigned-or-unassigned — should still be run defensively before
     trusting it, in case of a name collision or an edge case the plain name lookup misses).
   - If not found: `createPersonalRole(target)` (existing method, fresh + empty).
6. `syncSingleActiveUserRole(target, resolvedRole)`, `target.setDefaultRole(resolvedRole)`,
   save.

### Not needed / explicitly reused, not reinvented

- No change to `enforceOwnerProtection` or `assignTemplateRoles` — promoting a user already
  structurally blocks future template composition for them via the existing guard.
- No new schema/column. The name-based lookup avoids needing to persist a separate "personal
  role ID" reference anywhere.

### Open implementation detail (not a design blocker)

- Webhook shape: one endpoint with a `mode=promote|demote` param, or two separate endpoints
  following the `SFAssignUserRoles` pattern — decide during DEV based on what reads cleanest
  against the existing webhook conventions in `com.etendoerp.go/src/com/etendoerp/go/schemaforge/webhooks/`.

## Frontend design (`etendo_schema_forge`, `AssignTemplateRolesControl.jsx`)

Three render states for a given target user (extends the existing two-state logic already
shipped for the owner case):

1. **Owner** (unchanged): locked message, no actions.
2. **Non-owner Admin** (new): same locked message as today, **plus** a new "Quitar rol de
   administrador" button. Clicking it calls `demoteFromAdmin`.
3. **Not admin** (extends today's normal composition editor): the existing template
   checkbox/chip editor, **plus** a new "Hacer administrador" button rendered alongside it (not
   mixed into the checkbox list). Clicking it calls `promoteToAdmin`.

Both new buttons are gated client-side by the *viewer's own* role (owner or admin) — using
whatever existing session/auth context already exposes the current user's role, same as any
other permission-gated action in this app. The backend authorization check above is the real
enforcement; this is UX-only, matching the existing owner-lock pattern's own documented
convention.

i18n: both new button labels and any confirmation copy need `en_US.json`/`es_ES.json` keys per
this repo's mandatory i18n policy — no hardcoded strings.

## Data flow / state machine

```
        promote                    promote
NONE ─────────────▶ ADMIN ◀────────────── PERSONAL
  ▲                    │                       ▲
  │                    │ demote                │
  │                    ▼                       │
  └────────── (name lookup: found?) ────────────┘
                 no  →  fresh empty PERSONAL
                 yes →  restore prior PERSONAL (composition intact)
```

- `NONE` (no role yet) → `ADMIN`: promote works even with zero prior roles (name lookup on a
  later demote will simply find nothing and create fresh).
- `PERSONAL` → `ADMIN`: promote, personal role dormant-but-intact.
- `ADMIN` → `PERSONAL`: demote, restores the dormant role or creates fresh.
- `PERSONAL` → `PERSONAL` (recomposing templates): existing `assignTemplateRoles` flow,
  untouched by this feature.

## Error handling

- Promote on an already-admin target: reject with a clear message (avoid silent no-op that
  could mask a UI state bug).
- Demote on a non-admin target: reject, same reasoning.
- Demote on the owner: reject (hard guard, see above).
- Caller lacking authorization (not owner, not admin): reject at the backend regardless of
  what the frontend shows.

## Testing (scenarios to hand to Tester during implementation — not written here)

Backend:
- Promote: authorized caller (owner, and separately an existing admin) succeeds; unauthorized
  caller rejected; target already owner rejected; target already admin rejected; personal
  role's `AD_Role_Inheritance` is provably untouched after promote (still has Finance+Sales).
- Demote: authorized caller succeeds; unauthorized caller rejected; target is owner → hard
  reject; target not currently admin → reject; prior personal role found by name → reused,
  same role ID, same template composition; no prior personal role → fresh empty one created;
  `AD_UserRoles` ends up with exactly one row post-demote (via `syncSingleActiveUserRole`).

Frontend:
- Three render states (owner / non-owner-admin / not-admin) render the right UI.
- Promote/demote buttons only appear for a viewer who is themselves owner/admin.
- Button click → correct backend call → UI reflects new state.

## Next step

This spec is written and approved in chat by the user (2026-08-27). Per the brainstorming
process, the next step is the `writing-plans` skill to produce an implementation plan — not
done in this session due to context budget; a fresh session picks this up from
`docs/plans/2026-08-27-etp-5019-progress.md` (updated to reference this spec) plus this file.
