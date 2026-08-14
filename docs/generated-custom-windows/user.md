# User

## Intent
This window should let administrators maintain a person’s application identity, review basic security state, define default working context, and assign the roles that control what the user can do in the system.

## What this window should allow
Users should be able to:
- create, find, open, update, and delete user records;
- maintain identity fields such as Name, First Name, Last Name, Email, Description, Position, and Phone;
- connect the user to a Business Partner and Supervisor through search-based selectors;
- set or update the Password while reviewing read-only security indicators such as Expired Password, Locked, and Last Password Update;
- choose default context values for Language, Client, Organization, and Warehouse;
- assign exactly one of GOClient's predefined roles to the user via the header's Assigned Role control, shown as a status badge in both the header and the user list grid (ETP-4512).

**Role assignment (ETP-4512):** `defaultRole` (`Default_Ad_Role_ID`) is now read-only/badge-only (`columnType: "status"`, `enumValues` mapping the 5 GOClient role ids to display names) — its native selector only ever listed roles the user already had, which made it useless for assigning a *new* role. The actual editing surface is `AssignRoleControl` (`tools/app-shell/src/windows/custom/user/AssignRoleControl.jsx`, wired as `window.headerExtra.customForm`), which sources its options from the unrestricted `userRoles.role` selector and writes through the same `defaultRole` field on save. `UserRoleAssignmentHandler` (`com.etendoerp.go`, `@Named("user")`) intercepts that save and syncs `AD_User_Roles` — deleting any existing row(s) for the user and inserting exactly one for the new role — since real login/window-access checks read `AD_User_Roles`, not `Default_Ad_Role_ID`.

**Company user invitations (ETP-4894):** The User window provides a dedicated company user invitation banner and email-only modal dialog (`InviteUserDialog`). Creating an invitation sends a transactional `company-invitation` email to the invitee containing a secure, expiring link (`/invite?token=...`). The invitee resolves the invitation on a public acceptance page (`InviteAcceptancePage`):
- If the invitee already has an active Etendo Go account, they accept the invitation in 1 click (`POST /sws/go/company-invitations/accept`), provisioning an `AD_User` and default role in the company.
- If the invitee is new, they fill in their display name and set a strong password (`POST /sws/go/company-invitations/register-and-accept`), creating an `Account` locked to the invitation email, provisioning an `AD_User` + role, and signing into the newly joined company.
- All invitation lifecycle events (`PENDING`, `SENT`, `ACCEPTED`, `EXPIRED`, `REVOKED`) are recorded in `ETGO_INVITATION` using SHA-256 hashed bearer tokens. Password resets are not repurposed as pseudo-invitations.

## Interaction model
- Route: `/user` for the list and `/user/:recordId` for the record detail.
- Visibility: visible in System > Settings from `tools/app-shell/src/menu.json`; it is not marked hidden.
- Implementation type: generated window loaded from `tools/app-shell/src/windows/registry.js` into the shared app-shell list/detail flow.
- Window shape: master-child. The parent entity is `user`, and the visible child entity on the detail page is `userRoles`.
- List behavior: the generated page exposes list filtering by `name` and `email` (`username` removed from filters and the grid — ETP-4829).
- Detail behavior: the detail page renders the main user form, the Assigned Role control (headerExtra), plus a now read-only child table/form for User Roles (view-only confirmation of the single row `UserRoleAssignmentHandler` maintains — no Add-line button, since `userRoles.role`/`roleAdmin` are both `readOnly` in `decisions.json`).
- An **Attachments** tab is available in the detail tab strip, allowing files to be attached to the current record.


## Reactive behavior and dependencies
- Identity synchronization is implied for Name, First Name, and Last Name because all three fields carry the same `SL_User_Name` callout in the contract. The evidence supports that these fields are intended to react together, but the exact visible UX of that synchronization is not shown in the current SPA code.
- Business Partner and Supervisor are search selectors, so they depend on lookup results rather than free-text entry.
- Default Role's *value* (set via `AssignRoleControl`, not its own now-disabled selector) remains the parent context for two dependent defaults: Default Client and Default Organization both depend on it, unaffected by ETP-4512.
- Default Warehouse depends on Default Client, so warehouse availability should narrow after the client is chosen.
- The User Roles child table is now view-only (ETP-4512) — it reflects exactly the one row `UserRoleAssignmentHandler` maintains from the header's Assigned Role selection; there is no Add-line interaction to test here anymore.
- Security state is visible but not user-driven in the current form: Expired Password, Locked, and Last Password Update are read-only fields or summary values.
- No status-driven actions are visible in current evidence. `statusField` is `null`, `extraBadges` is empty, and the page-level `processes` array is empty in `UserPage.jsx`.
- No totals, discount, tax, or document-style recalculation behavior is visible in current evidence for this window.

## Gap assessment
- The contract defines a second child entity, `emailConfiguration`, and generated table/form components exist for it, but `UserPage.jsx` only mounts `userRoles`. Email configuration is therefore a current gap between available contract metadata and visible UI behavior.
- The contract also defines the `smtpconnectiontest` action for `emailConfiguration`, but because the email configuration child is not mounted on the page, there is no visible evidence that a user can trigger that test from this window.
- The contract includes `processNow` and `grantPortalAccess` actions on the parent user entity, but the generated detail page exposes no visible process buttons. This is an open gap between contract capability and current page behavior.
- The shared shell supports defaults loading for new records, but there is no user-window-specific evidence here showing what user defaults are prefilled by the backend for a new record.
- The callout-backed synchronization between Name, First Name, and Last Name is suggested by the contract, but the current evidence does not prove the exact browser interaction, so it should not be treated as confirmed UI behavior without manual verification.

## Manual verification
1. Open `/user` and confirm the list can locate records by `name` and `email`, and that no `username` column or filter is visible.
1a. Create a new user from `/user` with a valid email and no Password. Confirm the AD_User's `username` was set to the lower-cased email, a matching `etgo_account` row is pending, and the invitee receives one password-setup email. Confirm its one-time link activates the account after a strong password is set. A duplicate create must not replace an existing reset token; a missing public app URL or rejected email delivery must leave no new token. Attempt to create a user with a blank email and confirm the request is rejected (400).
2. Open `/user/:recordId` and confirm the form shows identity fields, Business Partner and Supervisor lookup fields, security indicators, and default selectors.
3. Assign a role via the header's Assigned Role control (`AssignRoleControl`) and confirm Default Client and Default Organization react to that choice; then change Default Client and confirm Default Warehouse reacts to the client.
4. Save and confirm the assigned role shows as a status badge in both the header (grid-styled, read-only) and the row for this user in the `/user` list. Confirm the User Roles child table shows exactly one row matching the assignment, with no visible Add-line control.
5. Re-open the record and assign a *different* role; confirm the previous User Roles row is gone and exactly one row exists for the new role (never two).
6. Confirm Expired Password, Locked, and Last Password Update are displayed as review state rather than normal editable business fields.
7. Confirm the current page does not surface an Email Configuration child pane, SMTP connection test action, Process Now action, or Grant Portal Access action.
8. Open a saved record and confirm the **Attachments** tab is visible in the tab strip. Upload a file and verify it appears in the table. Download it and delete it. When multiple files exist, confirm 'Download all (ZIP)' and 'Delete all' appear in the table header and that 'Delete all' shows a confirmation dialog before removing all files.

## Automated evidence
- Route visibility is grounded in `tools/app-shell/src/menu.json` and `tools/app-shell/src/windows/registry.js`.
- Parent/child wiring, visible summary state, empty process list, and mounted child entity are grounded in `artifacts/user/generated/web/user/UserPage.jsx`.
- Form sections, read-only security fields, search selectors, and dependent default selectors are grounded in `artifacts/user/generated/web/user/UserForm.jsx`.
- User Roles child columns are grounded in `artifacts/user/generated/web/user/UserRolesTable.jsx`; the absence of `addLineFields` on that entity (all fields `readOnly`) is grounded in `artifacts/user/contract.json`.
- The Assigned Role headerExtra and its unrestricted-selector rationale are grounded in `tools/app-shell/src/windows/custom/user/AssignRoleControl.jsx` and covered by `tools/app-shell/src/windows/custom/user/__tests__/AssignRoleControl.vitest.jsx`; end-to-end assignment-to-badge behavior is covered by `e2e/tests/flows/role-assignment.mocked.spec.js` (see `docs/e2e-testing-guide.md`).
- The `AD_User_Roles` sync from `Default_Ad_Role_ID` is implemented and unit-tested in `com.etendoerp.go`'s `UserRoleAssignmentHandler`/`UserRoleAssignmentHandlerTest` (ETP-4512) — see `docs/neo-headless-extensibility.md` §4 "Post-hook: Sync a Related Entity from a Parent Field" (this repo) for the general pattern.
- The `username = email` enforcement and account provisioning on create are implemented and unit-tested in the same `UserRoleAssignmentHandler`/`UserRoleAssignmentHandlerTest`, plus `EtendoGoAccountProvisioning`/`EtendoGoAccountProvisioningTest` and `EtendoGoJwtDalHelper` (all `com.etendoerp.go`). Each password-setup invitation is persisted in `ETGO_Invitation` with its account, ERP user, hashed token, expiry, and lifecycle status (`PENDING`, `SENT`, `DELIVERY_FAILED`, or `ACCEPTED`). The invitation calls the existing server-side `reset-password` contract; it does not expose a browser email-provider payload.
- Contract evidence for callouts, selectors, child entities, and declared actions is grounded in `artifacts/user/contract.json`.
- Generated but currently unmounted email-configuration UI exists in `artifacts/user/generated/web/user/EmailConfigurationTable.jsx` and `artifacts/user/generated/web/user/EmailConfigurationForm.jsx`.
- Shared list/detail shell behavior and defaults loading behavior are described in `docs/generated-custom-windows/app-shell-functional-flows.md`.
- Beyond the role-assignment coverage above (ETP-4512), no dedicated browser automation or SPA test was found for the rest of this window's visible behavior (identity fields, security indicators, default-context cascades, Attachments tab) in the current repository evidence.
- The generated `UserPage.jsx` includes `AttachmentsTab` in its `customTabs` prop, wired to the `AD_User` AD table.

## Pipeline regeneration — ETP-3908

Regenerated on 2026-05-12 as part of the feature/ETP-3908 epic merge. No functional changes to this window.

- `linesLayout: "classic"` is now written explicitly to `contract.json`; previously the classic layout was the implicit default.
- `requiredHeaderFields` is now emitted in the page component; this window has no required header fields so the array is empty and there is no behavioral change.
- LinesTable template updated in ETP-3908 to include the inline-editable add-row alignment fix. This window uses `linesLayout: "classic"` so the new template branch is dead code here — no behavioral change.
