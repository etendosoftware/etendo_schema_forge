# ETP-5019 Admin Role Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner or any current Admin promote an invited (non-owner) user directly to the client's Admin role, and demote them back — restoring their prior personal role composition if one existed, or a fresh empty one otherwise.

**Architecture:** Two new backend methods on the existing `UserRoleCompositionService` (`promoteToAdmin`/`demoteFromAdmin`), a new webhook (`SFPromoteUserRole`) modeled exactly on `SFAssignUserRoles`, a new frontend API client modeled on `resendInvitationApi.js`, and a new `extraActions` entry in the Users window (`index.jsx`) modeled exactly on the existing "Resend invitation" action — NOT a button inside `AssignTemplateRolesControl.jsx` (that component's `selectedRoleIds` state is deferred-to-Save; promote/demote must be immediate, one-shot actions like Resend Invitation already is).

**Tech Stack:** Java 17 / Openbravo DAL / JUnit 5 + Mockito (backend, `com.etendoerp.go`); React / Vitest (frontend, `etendo_schema_forge`).

**Spec:** `docs/superpowers/specs/2026-08-27-etp-5019-admin-role-promotion-design.md`

## Global Constraints

- Commit messages: `Feature ETP-5019: <description>` (≤80 chars first line), no `Co-Authored-By`.
- Owner can never be demoted, by anyone, through any mechanism (spec decision 2).
- Authorization: owner OR any current Admin may promote/demote a non-owner target (spec decision 1). No cap on admin count (spec decision 1).
- Demote must restore the target's prior personal role (by deterministic name lookup) if one existed, else create a fresh empty one (spec decision 4) — never leave the user with zero roles.
- Promote must never delete the target's personal role row, only unassign it (`syncSingleActiveUserRole` already handles the `AD_UserRoles` deletion) — its `AD_Role_Inheritance` composition must survive untouched for demote to restore it later.
- `enforceOwnerProtection`/`assignTemplateRoles` are NOT modified — the existing guard already blocks composing template roles onto anyone holding the client-admin role, so promoted admins get that protection for free.
- Every new user-visible string needs BOTH `en_US.json` and `es_ES.json` keys — no hardcoded strings (mandatory i18n policy).
- Test-writing is delegated to the `test-generator` subagent per this repo's mandatory rule — each task below still specifies the exact test scenarios; whichever executor runs the task should still write and run them (this constraint applies to the coordinator dispatching pipeline phases, not to this plan's own TDD steps, which include tests inline per the writing-plans process).

---

### Task 1: Backend — `findClientAdminRole` helper + `promoteToAdmin`

**Files:**
- Modify: `modules/com.etendoerp.go/src/com/etendoerp/go/roles/UserRoleCompositionService.java` (append new methods before the final closing brace, after `findActiveTemplateIdsByPersonalRoleId`)
- Test: `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java`

**Interfaces:**
- Consumes: `OwnerSupport.isOwner(String)` (existing), `enforceCallerClientBoundary(User, Role)` (existing private method, same class), `UserRoleSyncSupport.syncSingleActiveUserRole(User, Role)` (existing).
- Produces: `public AssignmentResult promoteToAdmin(String callerUserId, Role callerRole, String targetUserId)` — reused by Task 2's webhook and Task 3's tests. Returns the existing `AssignmentResult` type (reusing `personalRoleId` field to carry the now-active Admin role's id, `appliedTemplateRoleIds` as an empty list, `addedCount`/`removedCount` as `0`).

- [ ] **Step 1: Write the failing tests**

Add to `UserRoleCompositionServiceTest.java` (inside the existing test class, following its existing Mockito static-mock setup conventions — read the file's `@BeforeEach` first to match field names):

```java
@Test
void promoteToAdminRejectsWhenCallerIsNotOwnerOrAdmin() {
  User caller = mock(User.class);
  when(caller.getId()).thenReturn("caller-1");
  Role callerRole = mock(Role.class);
  when(callerRole.isClientAdmin()).thenReturn(false);

  User target = mock(User.class);
  when(target.getId()).thenReturn("target-1");

  try (MockedStatic<OBDal> obDalMock = mockStatic(OBDal.class);
       MockedStatic<OwnerSupport> ownerSupportMock = mockStatic(OwnerSupport.class)) {
    OBDal dal = mock(OBDal.class);
    obDalMock.when(OBDal::getInstance).thenReturn(dal);
    when(dal.get(User.class, "target-1")).thenReturn(target);
    ownerSupportMock.when(() -> OwnerSupport.isOwner("caller-1")).thenReturn(false);

    UserRoleCompositionService service = new UserRoleCompositionService();
    OBException ex = assertThrows(OBException.class,
        () -> service.promoteToAdmin("caller-1", callerRole, "target-1"));
    assertTrue(ex.getMessage().toLowerCase().contains("not authorized")
        || ex.getMessage().toLowerCase().contains("admin"));
    verify(dal, never()).save(any());
  }
}

@Test
void promoteToAdminRejectsWhenTargetAlreadyClientAdmin() {
  User caller = mock(User.class);
  when(caller.getId()).thenReturn("caller-1");
  Role callerRole = mock(Role.class);
  when(callerRole.isClientAdmin()).thenReturn(true);

  User target = mock(User.class);
  when(target.getId()).thenReturn("target-1");
  Role targetCurrentRole = mock(Role.class);
  when(targetCurrentRole.isClientAdmin()).thenReturn(true);
  when(target.getDefaultRole()).thenReturn(targetCurrentRole);

  try (MockedStatic<OBDal> obDalMock = mockStatic(OBDal.class)) {
    OBDal dal = mock(OBDal.class);
    obDalMock.when(OBDal::getInstance).thenReturn(dal);
    when(dal.get(User.class, "target-1")).thenReturn(target);

    UserRoleCompositionService service = new UserRoleCompositionService();
    assertThrows(OBException.class,
        () -> service.promoteToAdmin("caller-1", callerRole, "target-1"));
    verify(dal, never()).save(any());
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd modules/com.etendoerp.go && ./gradlew test --tests "com.etendoerp.go.roles.UserRoleCompositionServiceTest"` (from `/Users/gremiger/workspaces/etendogoclean/etendo`, the root `test` task — the per-module task is `NO-SOURCE` by design, see `docs/etendo-ad/` notes from earlier ETP-5019 work).
Expected: FAIL — `promoteToAdmin` does not exist yet (compile error).

- [ ] **Step 3: Write the minimal implementation**

Add to `UserRoleCompositionService.java`, immediately before the final `}` of the class:

```java
  /**
   * ETP-5019 — finds the client's single Admin {@code AD_Role} row ({@code is_client_admin =
   * 'Y'}), scoped to {@code clientId}. Same "resolve by is_client_admin, scoped to :client_id"
   * approach {@link com.etendoerp.go.schemaforge.webhooks.SFRolesOverview#resolveTenantRoles}
   * already uses.
   *
   * @param clientId the {@code AD_Client_ID} to scope the search to
   * @return the active client-admin role, or {@code null} if none exists for this client
   */
  @SuppressWarnings("unchecked")
  private Role findClientAdminRole(String clientId) {
    OBCriteria<Role> criteria = OBDal.getInstance().createCriteria(Role.class);
    criteria.setFilterOnReadableClients(false);
    criteria.setFilterOnReadableOrganization(false);
    criteria.add(Restrictions.eq(Role.PROPERTY_CLIENT + ".id", clientId));
    criteria.add(Restrictions.eq(Role.PROPERTY_ACTIVE, true));
    criteria.add(Restrictions.eq(Role.PROPERTY_CLIENTADMIN, true));
    criteria.setMaxResults(1);
    List<Role> roles = (List<Role>) criteria.list();
    return roles.isEmpty() ? null : roles.get(0);
  }

  /**
   * ETP-5019 — is {@code callerUserId} allowed to promote/demote another user? True when the
   * caller is the owner, or currently holds the client-admin role themselves. Same signal
   * {@link #enforceOwnerProtection(User, String)} already uses, just the opposite polarity
   * (require it here, reject it there).
   */
  private boolean callerIsOwnerOrAdmin(String callerUserId) {
    if (callerUserId == null) {
      return false;
    }
    if (OwnerSupport.isOwner(callerUserId)) {
      return true;
    }
    User caller = OBDal.getInstance().get(User.class, callerUserId);
    Role callerCurrentRole = caller != null ? caller.getDefaultRole() : null;
    return callerCurrentRole != null && Boolean.TRUE.equals(callerCurrentRole.isClientAdmin());
  }

  /**
   * ETP-5019 — promotes {@code targetUserId} to the client's Admin role, replacing whatever
   * role they currently hold (typically a personal composed role). The personal role's own
   * {@code AD_Role} row and {@code AD_Role_Inheritance} composition are NEVER deleted here —
   * only unassigned (via {@link UserRoleSyncSupport#syncSingleActiveUserRole(User, Role)}, which
   * replaces the user's single active {@code AD_User_Roles} row) — so {@link
   * #demoteFromAdmin(String, Role, String)} can find and restore it later by name.
   *
   * @param callerUserId the {@code AD_User_ID} making this request
   * @param callerRole the caller's currently resolved role, for {@link
   *     #enforceCallerClientBoundary(User, Role)}'s tenant-boundary check
   * @param targetUserId the {@code AD_User_ID} to promote
   * @return an {@link AssignmentResult} whose {@code personalRoleId} is actually the newly
   *     assigned Admin role's id (field reused, not renamed, to avoid touching {@code
   *     SFAssignUserRoles}'s response shape for the unrelated composition endpoint)
   * @throws OBException if the caller is not owner/admin, the target is already owner or
   *     already client-admin, or no Admin role exists for the target's client
   */
  public AssignmentResult promoteToAdmin(String callerUserId, Role callerRole,
      String targetUserId) {
    if (StringUtils.isBlank(targetUserId)) {
      throw new OBException("Missing user id for admin promotion");
    }
    if (!callerIsOwnerOrAdmin(callerUserId)) {
      throw new OBException("Not authorized to promote users to Admin: " + callerUserId);
    }
    User target = OBDal.getInstance().get(User.class, targetUserId);
    if (target == null) {
      throw new OBException("User not found: " + targetUserId);
    }
    enforceCallerClientBoundary(target, callerRole);
    if (OwnerSupport.isOwner(targetUserId)) {
      throw new OBException("The owner already has the Admin role: " + targetUserId);
    }
    Role currentRole = target.getDefaultRole();
    if (currentRole != null && Boolean.TRUE.equals(currentRole.isClientAdmin())) {
      throw new OBException("User is already an Admin: " + targetUserId);
    }

    OBContext.setAdminMode(true);
    try {
      Role adminRole = findClientAdminRole(target.getClient().getId());
      if (adminRole == null) {
        throw new OBException("No Admin role found for client: " + target.getClient().getId());
      }
      target.setDefaultRole(adminRole);
      OBDal.getInstance().save(target);
      OBDal.getInstance().flush();
      UserRoleSyncSupport.syncSingleActiveUserRole(target, adminRole);
      log.info("Promoted user {} to Admin role {}", targetUserId, adminRole.getId());
      return new AssignmentResult(targetUserId, adminRole.getId(), Collections.emptyList(), 0, 0);
    } finally {
      OBContext.restorePreviousMode();
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2.
Expected: PASS (both new tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go
git add src/com/etendoerp/go/roles/UserRoleCompositionService.java \
  src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java
git commit -m "Feature ETP-5019: Add promoteToAdmin to UserRoleCompositionService"
```

---

### Task 2: Backend — `demoteFromAdmin`

**Files:**
- Modify: `modules/com.etendoerp.go/src/com/etendoerp/go/roles/UserRoleCompositionService.java`
- Test: `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java`

**Interfaces:**
- Consumes: `findClientAdminRole` and `callerIsOwnerOrAdmin` (Task 1), `resolveOrCreatePersonalRole`/`createPersonalRole`/`isReusablePersonalRole` (existing, same class), `personalRoleAccessProvisioningService.buildPersonalRoleName(User)` (existing field/method on the same class — check the exact field name via `grep -n "personalRoleAccessProvisioningService" UserRoleCompositionService.java` before writing this task for real, it is referenced but not shown in the earlier `createPersonalRole` snippet's surrounding context).
- Produces: `public AssignmentResult demoteFromAdmin(String callerUserId, Role callerRole, String targetUserId)`.

- [ ] **Step 1: Write the failing tests**

```java
@Test
void demoteFromAdminRejectsWhenTargetIsOwner() {
  Role callerRole = mock(Role.class);
  when(callerRole.isClientAdmin()).thenReturn(true);

  User target = mock(User.class);
  when(target.getId()).thenReturn("owner-1");

  try (MockedStatic<OBDal> obDalMock = mockStatic(OBDal.class);
       MockedStatic<OwnerSupport> ownerSupportMock = mockStatic(OwnerSupport.class)) {
    OBDal dal = mock(OBDal.class);
    obDalMock.when(OBDal::getInstance).thenReturn(dal);
    when(dal.get(User.class, "owner-1")).thenReturn(target);
    ownerSupportMock.when(() -> OwnerSupport.isOwner("caller-1")).thenReturn(true);
    ownerSupportMock.when(() -> OwnerSupport.isOwner("owner-1")).thenReturn(true);

    UserRoleCompositionService service = new UserRoleCompositionService();
    assertThrows(OBException.class,
        () -> service.demoteFromAdmin("caller-1", callerRole, "owner-1"));
    verify(dal, never()).save(any());
  }
}

@Test
void demoteFromAdminRestoresPriorPersonalRoleByName() {
  Role callerRole = mock(Role.class);
  when(callerRole.isClientAdmin()).thenReturn(true);

  Client client = mock(Client.class);
  when(client.getId()).thenReturn("client-1");

  User target = mock(User.class);
  when(target.getId()).thenReturn("target-1");
  when(target.getClient()).thenReturn(client);
  when(target.getName()).thenReturn("Jane Doe");
  Role adminRole = mock(Role.class);
  when(adminRole.isClientAdmin()).thenReturn(true);
  when(target.getDefaultRole()).thenReturn(adminRole);

  Role priorPersonalRole = mock(Role.class);
  when(priorPersonalRole.isActive()).thenReturn(true);
  when(priorPersonalRole.isTemplate()).thenReturn(false);
  when(priorPersonalRole.isClientAdmin()).thenReturn(false);
  when(priorPersonalRole.getClient()).thenReturn(client);
  when(priorPersonalRole.getId()).thenReturn("role-prior");

  try (MockedStatic<OBDal> obDalMock = mockStatic(OBDal.class);
       MockedStatic<OwnerSupport> ownerSupportMock = mockStatic(OwnerSupport.class)) {
    OBDal dal = mock(OBDal.class);
    obDalMock.when(OBDal::getInstance).thenReturn(dal);
    when(dal.get(User.class, "target-1")).thenReturn(target);
    ownerSupportMock.when(() -> OwnerSupport.isOwner("caller-1")).thenReturn(true);
    ownerSupportMock.when(() -> OwnerSupport.isOwner("target-1")).thenReturn(false);

    OBCriteria<Role> roleCriteria = mock(OBCriteria.class);
    when(dal.createCriteria(Role.class)).thenReturn(roleCriteria);
    when(roleCriteria.list()).thenReturn(Collections.singletonList(priorPersonalRole));

    OBCriteria<UserRoles> userRolesCriteria = mock(OBCriteria.class);
    when(dal.createCriteria(UserRoles.class)).thenReturn(userRolesCriteria);
    when(userRolesCriteria.list()).thenReturn(Collections.emptyList());

    UserRoleCompositionService service = new UserRoleCompositionService();
    UserRoleCompositionService.AssignmentResult result =
        service.demoteFromAdmin("caller-1", callerRole, "target-1");

    assertEquals("role-prior", result.personalRoleId);
    verify(target).setDefaultRole(priorPersonalRole);
  }
}
```

Adjust the second test's mock wiring once actually run against the real `findExistingPersonalRole`/`isReusablePersonalRole` call chain (it depends on `target.getDefaultRole()` being reassigned mid-call in the real flow — since this method must look the prior role up BY NAME rather than via `getDefaultRole()`, the mock for `roleCriteria` should be asserting a `Restrictions.eq(Role.PROPERTY_NAME, ...)` call was added; write the assertion against whatever the real query construction ends up being once Step 3 is implemented, then re-tighten this test — this is expected iteration within Step 1→4, not a plan defect).

- [ ] **Step 2: Run tests to verify they fail**

Run: same command as Task 1 Step 2.
Expected: FAIL — `demoteFromAdmin` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

First check the exact field name for the name-builder service:

Run: `grep -n "PersonalRoleAccessProvisioningService personalRoleAccessProvisioningService\|private.*PersonalRoleAccessProvisioningService" modules/com.etendoerp.go/src/com/etendoerp/go/roles/UserRoleCompositionService.java`

Use whatever field name that returns (expected: `personalRoleAccessProvisioningService`, already used by `createPersonalRole`). Add to `UserRoleCompositionService.java`, after `promoteToAdmin`:

```java
  /**
   * ETP-5019 — finds the given user's dormant personal role by its deterministic name (see
   * {@link PersonalRoleAccessProvisioningService#buildPersonalRoleName(User)}), scoped to the
   * user's client. Unlike {@link #findExistingPersonalRole(User)}, this does NOT consult {@code
   * user.getDefaultRole()} — that field currently points at the Admin role being demoted FROM,
   * not at the dormant personal role being restored TO. {@link
   * #isReusablePersonalRole(User, Role)}'s other checks (active, non-template, non-client-admin,
   * same client, not the target of any inheritance, exclusively assigned to this user or
   * unassigned) are still applied defensively before trusting the name match.
   *
   * @return the user's dormant personal role if one is found and still valid to reuse, otherwise
   *     {@code null}
   */
  @SuppressWarnings("unchecked")
  private Role findDormantPersonalRoleByName(User user) {
    String expectedName = personalRoleAccessProvisioningService.buildPersonalRoleName(user);
    OBCriteria<Role> criteria = OBDal.getInstance().createCriteria(Role.class);
    criteria.setFilterOnReadableClients(false);
    criteria.setFilterOnReadableOrganization(false);
    criteria.add(Restrictions.eq(Role.PROPERTY_CLIENT + ".id", user.getClient().getId()));
    criteria.add(Restrictions.eq(Role.PROPERTY_NAME, expectedName));
    criteria.setMaxResults(1);
    List<Role> roles = (List<Role>) criteria.list();
    if (roles.isEmpty()) {
      return null;
    }
    Role candidate = roles.get(0);
    return isReusablePersonalRole(user, candidate) ? candidate : null;
  }

  /**
   * ETP-5019 — demotes {@code targetUserId} from the client's Admin role back to a personal
   * role: their prior one (found by name, composition intact — see {@link
   * #findDormantPersonalRoleByName(User)}) if one exists, otherwise a fresh empty one (same
   * fallback {@link #resolveOrCreatePersonalRole(User)}'s "create" half already uses).
   *
   * @throws OBException if the caller is not owner/admin, the target is the owner (never
   *     demotable, by anyone), or the target does not currently hold the client-admin role
   */
  public AssignmentResult demoteFromAdmin(String callerUserId, Role callerRole,
      String targetUserId) {
    if (StringUtils.isBlank(targetUserId)) {
      throw new OBException("Missing user id for admin demotion");
    }
    if (!callerIsOwnerOrAdmin(callerUserId)) {
      throw new OBException("Not authorized to demote an Admin: " + callerUserId);
    }
    User target = OBDal.getInstance().get(User.class, targetUserId);
    if (target == null) {
      throw new OBException("User not found: " + targetUserId);
    }
    enforceCallerClientBoundary(target, callerRole);
    if (OwnerSupport.isOwner(targetUserId)) {
      throw new OBException("The owner can never be demoted: " + targetUserId);
    }
    Role currentRole = target.getDefaultRole();
    if (currentRole == null || !Boolean.TRUE.equals(currentRole.isClientAdmin())) {
      throw new OBException("User does not currently hold the Admin role: " + targetUserId);
    }

    OBContext.setAdminMode(true);
    try {
      Role restoredRole = findDormantPersonalRoleByName(target);
      if (restoredRole == null) {
        restoredRole = createPersonalRole(target);
      }
      target.setDefaultRole(restoredRole);
      OBDal.getInstance().save(target);
      OBDal.getInstance().flush();
      UserRoleSyncSupport.syncSingleActiveUserRole(target, restoredRole);
      log.info("Demoted user {} from Admin to personal role {}", targetUserId,
          restoredRole.getId());
      return new AssignmentResult(targetUserId, restoredRole.getId(), Collections.emptyList(), 0,
          0);
    } finally {
      OBContext.restorePreviousMode();
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Task 1 Step 2.
Expected: PASS. If the second test's mock wiring from Step 1 doesn't match the real `Restrictions.eq(Role.PROPERTY_NAME, ...)` criteria call exactly, fix the test's mock setup (not the implementation) to match — the implementation above is the source of truth for the design decision (name-based lookup), the test just needs to observe it correctly.

- [ ] **Step 5: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go
git add src/com/etendoerp/go/roles/UserRoleCompositionService.java \
  src-test/src/com/etendoerp/go/roles/UserRoleCompositionServiceTest.java
git commit -m "Feature ETP-5019: Add demoteFromAdmin to UserRoleCompositionService"
```

---

### Task 3: Backend — `SFPromoteUserRole` webhook

**Files:**
- Create: `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/webhooks/SFPromoteUserRole.java`
- Test: `modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/webhooks/SFPromoteUserRoleTest.java` (new file — check for a precedent test for `SFAssignUserRoles` first: `find modules/com.etendoerp.go/src-test -iname "SFAssignUserRolesTest.java"`, and mirror its mocking setup)

**Interfaces:**
- Consumes: `UserRoleCompositionService#promoteToAdmin`/`demoteFromAdmin` (Tasks 1-2), `NeoAccessHelper.resolveCurrentRole()`/`isAdminOrClientAdmin(Role)` (existing), `WebhookFailureResponses.denied()`/`failure(String)` (existing, same package).
- Produces: `GET /sws/neo/promoteuserrole?UserId=<id>&Mode=promote|demote` — response `{"success": true, "userId": "...", "roleId": "..."}` on success, `{"success": false, "message": "..."}` on rejection (200), `error` key on unexpected exception (500, via the bridge).

- [ ] **Step 1: Write the failing test**

First find the precedent:

Run: `find /Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go/src-test -iname "SFAssignUserRolesTest.java"`

Read that file's `@BeforeEach` mock setup for `NeoAccessHelper`/`OBContext` static mocking, then write, in a new `SFPromoteUserRoleTest.java` (same package `com.etendoerp.go.schemaforge.webhooks`, mirroring that file's imports/structure):

```java
@Test
void rejectsWhenCallerIsNotAdminOrClientAdmin() {
  Role callerRole = mock(Role.class);
  Map<String, String> params = new HashMap<>();
  params.put("UserId", "target-1");
  params.put("Mode", "promote");
  Map<String, String> responseVars = new HashMap<>();

  try (MockedStatic<NeoAccessHelper> accessHelperMock = mockStatic(NeoAccessHelper.class)) {
    accessHelperMock.when(NeoAccessHelper::resolveCurrentRole).thenReturn(callerRole);
    accessHelperMock.when(() -> NeoAccessHelper.isAdminOrClientAdmin(callerRole))
        .thenReturn(false);

    new SFPromoteUserRole().get(params, responseVars);

    assertTrue(responseVars.get("result").contains("\"success\":false"));
  }
}

@Test
void rejectsUnknownMode() {
  Role callerRole = mock(Role.class);
  Map<String, String> params = new HashMap<>();
  params.put("UserId", "target-1");
  params.put("Mode", "not-a-real-mode");
  Map<String, String> responseVars = new HashMap<>();

  try (MockedStatic<NeoAccessHelper> accessHelperMock = mockStatic(NeoAccessHelper.class)) {
    accessHelperMock.when(NeoAccessHelper::resolveCurrentRole).thenReturn(callerRole);
    accessHelperMock.when(() -> NeoAccessHelper.isAdminOrClientAdmin(callerRole))
        .thenReturn(true);

    new SFPromoteUserRole().get(params, responseVars);

    assertTrue(responseVars.get("result").contains("\"success\":false"));
    assertTrue(responseVars.get("result").toLowerCase().contains("mode"));
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/gremiger/workspaces/etendogoclean/etendo && ./gradlew test --tests "com.etendoerp.go.schemaforge.webhooks.SFPromoteUserRoleTest"`
Expected: FAIL — class does not exist.

- [ ] **Step 3: Write the minimal implementation**

```java
/*
 * *************************************************************************
 * The contents of this file are subject to the Etendo License
 * (the "License"), you may not use this file except in compliance with
 * the License.
 * You may obtain a copy of the License at
 * https://github.com/etendosoftware/etendo_core/blob/main/legal/Etendo_license.txt
 * Software distributed under the License is distributed on an
 * "AS IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the License for the specific language governing rights
 * and limitations under the License.
 * All portions are Copyright (C) 2021-2026 FUTIT SERVICES, S.L
 * All Rights Reserved.
 * Contributor(s): Futit Services S.L.
 * *************************************************************************
 */
package com.etendoerp.go.schemaforge.webhooks;

import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import org.openbravo.base.exception.OBException;
import org.openbravo.dal.core.OBContext;
import org.openbravo.model.ad.access.Role;

import com.etendoerp.go.roles.UserRoleCompositionService;
import com.etendoerp.go.schemaforge.util.NeoAccessHelper;
import com.etendoerp.webhookevents.services.BaseWebhookService;

/**
 * ETP-5019 — webhook backing "promote an invited user to Admin" / "demote an Admin back to
 * their personal role". Same parameter-marshalling + access-gating shim pattern {@link
 * SFAssignUserRoles} already establishes for the sibling role-composition webhook; the actual
 * mechanism lives in {@link UserRoleCompositionService#promoteToAdmin(String, Role, String)} /
 * {@link UserRoleCompositionService#demoteFromAdmin(String, Role, String)}.
 *
 * <p><b>Endpoint:</b> {@code GET /sws/neo/promoteuserrole?UserId=<id>&Mode=promote|demote}.</p>
 *
 * <p><b>Access gate:</b> admin/client-admin only ({@link
 * NeoAccessHelper#isAdminOrClientAdmin}) — same convention as {@code SFAssignUserRoles}. The
 * finer-grained "owner or current admin" + "target not the owner" rules are enforced inside
 * {@link UserRoleCompositionService}, not here.</p>
 *
 * <p><b>Response shape</b> — same "never surface a domain validation failure as the bridge's
 * generic 500" convention as {@code SFAssignUserRoles}: an {@link OBException} becomes a
 * {@code success:false} body (HTTP 200); only a genuinely unexpected exception escapes to the
 * bridge's {@code error} path.</p>
 */
public class SFPromoteUserRole extends BaseWebhookService {

  private static final Logger log = LogManager.getLogger(SFPromoteUserRole.class);

  private static final String PARAM_USER_ID = "UserId";
  private static final String PARAM_MODE = "Mode";
  private static final String MODE_PROMOTE = "promote";
  private static final String MODE_DEMOTE = "demote";

  private static final String RESPONSE_VAR_RESULT = "result";
  private static final String FIELD_SUCCESS = "success";
  private static final String FIELD_USER_ID = "userId";
  private static final String FIELD_ROLE_ID = "roleId";

  @Override
  public void get(Map<String, String> parameter, Map<String, String> responseVars) {
    Role currentRole = NeoAccessHelper.resolveCurrentRole();
    if (currentRole == null || !NeoAccessHelper.isAdminOrClientAdmin(currentRole)) {
      responseVars.put(RESPONSE_VAR_RESULT, WebhookFailureResponses.denied().toString());
      return;
    }

    String userId = StringUtils.trimToNull(parameter.get(PARAM_USER_ID));
    String mode = StringUtils.trimToNull(parameter.get(PARAM_MODE));
    if (userId == null) {
      responseVars.put(RESPONSE_VAR_RESULT,
          WebhookFailureResponses.failure("Missing required parameter: " + PARAM_USER_ID)
              .toString());
      return;
    }
    if (!MODE_PROMOTE.equals(mode) && !MODE_DEMOTE.equals(mode)) {
      responseVars.put(RESPONSE_VAR_RESULT,
          WebhookFailureResponses.failure(
              "Missing or invalid " + PARAM_MODE + " (expected 'promote' or 'demote')")
              .toString());
      return;
    }

    String callerUserId = OBContext.getOBContext() != null
        && OBContext.getOBContext().getUser() != null
        ? OBContext.getOBContext().getUser().getId() : null;
    try {
      UserRoleCompositionService service = new UserRoleCompositionService();
      UserRoleCompositionService.AssignmentResult result = MODE_PROMOTE.equals(mode)
          ? service.promoteToAdmin(callerUserId, currentRole, userId)
          : service.demoteFromAdmin(callerUserId, currentRole, userId);
      responseVars.put(RESPONSE_VAR_RESULT, success(result).toString());
    } catch (OBException e) {
      responseVars.put(RESPONSE_VAR_RESULT,
          WebhookFailureResponses.failure(e.getMessage()).toString());
    } catch (Exception e) {
      log.error("Unexpected error in SFPromoteUserRole for user {}", userId, e);
      responseVars.put("error", e.getMessage());
    }
  }

  private JSONObject success(UserRoleCompositionService.AssignmentResult result) {
    try {
      JSONObject body = new JSONObject();
      body.put(FIELD_SUCCESS, true);
      body.put(FIELD_USER_ID, result.userId);
      body.put(FIELD_ROLE_ID, result.personalRoleId);
      return body;
    } catch (JSONException e) {
      throw new IllegalStateException("Unable to build success result", e);
    }
  }
}
```

Also register this new webhook wherever `SFAssignUserRoles` is registered for the NEO pseudo-spec bridge (check `NeoGoWebhookBridge`/`NeoServlet` or a webhook registry — search: `grep -rn "SFAssignUserRoles" modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/ | grep -v webhooks/SFAssignUserRoles.java`). Add the equivalent entry for `SFPromoteUserRole` following the exact same pattern found there.

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/modules/com.etendoerp.go
git add src/com/etendoerp/go/schemaforge/webhooks/SFPromoteUserRole.java \
  src-test/src/com/etendoerp/go/schemaforge/webhooks/SFPromoteUserRoleTest.java \
  src/com/etendoerp/go/schemaforge/  # whichever registry file Step 3's grep found
git commit -m "Feature ETP-5019: Add SFPromoteUserRole webhook"
```

---

### Task 4: Frontend — `promoteUserRoleApi.js` client

**Files:**
- Create: `tools/app-shell/src/lib/promoteUserRoleApi.js`
- Test: `tools/app-shell/src/lib/__tests__/promoteUserRoleApi.vitest.js`

**Interfaces:**
- Consumes: `NEO_BASE`, `fetchNeoWebhookJson` from `./neoWebhookClient.js` (existing, same as `resendInvitationApi.js` uses).
- Produces: `promoteUserToAdmin(userId)`, `demoteUserFromAdmin(userId)` — both `async (userId: string) => Promise<{userId: string, roleId: string}>`, thrown `Error` on rejection. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../neoWebhookClient.js', () => ({
  NEO_BASE: 'https://neo.example',
  fetchNeoWebhookJson: vi.fn(),
}));

import { fetchNeoWebhookJson } from '../neoWebhookClient.js';
import { promoteUserToAdmin, demoteUserFromAdmin } from '../promoteUserRoleApi.js';

describe('promoteUserRoleApi', () => {
  beforeEach(() => {
    fetchNeoWebhookJson.mockReset();
  });

  it('promoteUserToAdmin calls the webhook with Mode=promote and returns the result', async () => {
    fetchNeoWebhookJson.mockResolvedValue({ success: true, userId: 'u1', roleId: 'r1' });
    const result = await promoteUserToAdmin('u1');
    expect(result).toEqual({ success: true, userId: 'u1', roleId: 'r1' });
    const [url] = fetchNeoWebhookJson.mock.calls[0];
    expect(url).toContain('UserId=u1');
    expect(url).toContain('Mode=promote');
  });

  it('demoteUserFromAdmin calls the webhook with Mode=demote', async () => {
    fetchNeoWebhookJson.mockResolvedValue({ success: true, userId: 'u1', roleId: 'r2' });
    await demoteUserFromAdmin('u1');
    const [url] = fetchNeoWebhookJson.mock.calls[0];
    expect(url).toContain('Mode=demote');
  });

  it('throws when the webhook returns success:false', async () => {
    fetchNeoWebhookJson.mockResolvedValue({ success: false, message: 'Not authorized' });
    await expect(promoteUserToAdmin('u1')).rejects.toThrow('Not authorized');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/app-shell && npx vitest run src/lib/__tests__/promoteUserRoleApi.vitest.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the minimal implementation**

```javascript
import { NEO_BASE, fetchNeoWebhookJson } from './neoWebhookClient.js';

// ETP-5019 — thin client for the admin-triggered `SFPromoteUserRole` webhook
// (com.etendoerp.go), same "thin client for a single webhook" convention as
// `resendInvitationApi.js`. Response shape branches on the body's own `success` flag, matching
// `SFPromoteUserRole`'s own `SFAssignUserRoles`-style convention (never a raw HTTP error for an
// expected domain rejection).
const promoteFallback = (data) => ('success' in data ? data : null);

async function callPromoteWebhook(userId, mode) {
  const params = new URLSearchParams({ UserId: userId, Mode: mode });
  const url = `${NEO_BASE}/promoteuserrole?${params.toString()}`;
  const result = await fetchNeoWebhookJson(url, 'SFPromoteUserRole', promoteFallback);
  if (!result.success) {
    throw new Error(result.message || 'SFPromoteUserRole rejected the request');
  }
  return result;
}

/**
 * Promotes `userId` (a non-owner, non-admin invited user) to the client's Admin role.
 * @param {string} userId - AD_User_ID of the target user.
 * @returns {Promise<{success: true, userId: string, roleId: string}>}
 */
export async function promoteUserToAdmin(userId) {
  return callPromoteWebhook(userId, 'promote');
}

/**
 * Demotes `userId` from the client's Admin role back to their prior (or a fresh) personal role.
 * @param {string} userId - AD_User_ID of the target user.
 * @returns {Promise<{success: true, userId: string, roleId: string}>}
 */
export async function demoteUserFromAdmin(userId) {
  return callPromoteWebhook(userId, 'demote');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge
git add tools/app-shell/src/lib/promoteUserRoleApi.js \
  tools/app-shell/src/lib/__tests__/promoteUserRoleApi.vitest.js
git commit -m "Feature ETP-5019: Add promoteUserRoleApi client"
```

---

### Task 5: Frontend — i18n keys

**Files:**
- Modify: `tools/app-shell/src/locales/en_US.json`
- Modify: `tools/app-shell/src/locales/es_ES.json`

**Interfaces:**
- Produces: `promoteToAdminAction`, `demoteFromAdminAction`, `promoteToAdminSuccessToast`, `promoteToAdminErrorFallback`, `demoteFromAdminSuccessToast`, `demoteFromAdminErrorFallback` — consumed by Task 6.

- [ ] **Step 1: Add the keys**

In `en_US.json`, near the existing `resendInvitationAction`/`adminRoleNoCompositionMessage` keys (same alphabetical/logical neighborhood — check the file's own key ordering convention before inserting):

```json
"promoteToAdminAction": "Make administrator",
"demoteFromAdminAction": "Remove administrator role",
"promoteToAdminSuccessToast": "User promoted to Administrator.",
"promoteToAdminErrorFallback": "Could not promote user to Administrator.",
"demoteFromAdminSuccessToast": "Administrator role removed.",
"demoteFromAdminErrorFallback": "Could not remove the Administrator role."
```

In `es_ES.json`, same keys:

```json
"promoteToAdminAction": "Hacer administrador",
"demoteFromAdminAction": "Quitar rol de administrador",
"promoteToAdminSuccessToast": "Usuario promovido a Administrador.",
"promoteToAdminErrorFallback": "No se pudo promover al usuario a Administrador.",
"demoteFromAdminSuccessToast": "Rol de administrador eliminado.",
"demoteFromAdminErrorFallback": "No se pudo quitar el rol de Administrador."
```

- [ ] **Step 2: Verify both files are still valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('tools/app-shell/src/locales/en_US.json'))" && node -e "JSON.parse(require('fs').readFileSync('tools/app-shell/src/locales/es_ES.json'))" && echo OK`
Expected: `OK`, no parse errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge
git add tools/app-shell/src/locales/en_US.json tools/app-shell/src/locales/es_ES.json
git commit -m "Feature ETP-5019: Add i18n keys for admin promote/demote"
```

---

### Task 6: Frontend — `extraActions` wiring in `index.jsx`

**Files:**
- Modify: `tools/app-shell/src/windows/custom/user/index.jsx`
- Test: `tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx` (existing file — add to it)

**Interfaces:**
- Consumes: `promoteUserToAdmin`/`demoteUserFromAdmin` (Task 4), `resolveDefaultRoleId` from `./RoleChipsCell.jsx` (existing, same one `AssignTemplateRolesControl.jsx` already uses for admin detection), the existing `adminRoleId` resolution pattern (`fetchRolesOverview()` → find `isClientAdmin === true` row) — reuse `AssignTemplateRolesControl.jsx`'s exact approach rather than inventing a second one; if that lookup isn't already available at `index.jsx`'s level, add a small local `useEffect` mirroring it.
- Produces: a new `useAdminPromotionExtraActions()` hook, merged into `UserPage`'s `extraActions` prop alongside `resendInvitationExtraActions` (check how `extraActions` combines multiple action-producing hooks today — likely an array-concat or a composed callback; read the current `extraActions={resendInvitationExtraActions}` wiring at the `<UserPage>` render call before writing this task for real, since it currently only passes ONE hook's result).

- [ ] **Step 1: Write the failing test**

Read the existing `index.vitest.jsx` test file's mocking setup for `resendInvitation`/`useResendInvitationExtraActions` first (`grep -n "resendInvitation\|extraActions" tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx`), then add analogous tests:

```javascript
it('shows "Make administrator" for a non-owner, non-admin existing user, and calls the API on click', async () => {
  promoteUserToAdmin.mockResolvedValue({ success: true, userId: 'u1', roleId: 'admin-role' });
  // render UserPage with a persisted, non-owner, non-admin `data` prop (defaultRole !== adminRoleId)
  // ... follow this file's existing render/mock-data conventions for an "existing user" case ...
  const button = await screen.findByTestId('PromoteToAdminButton');
  fireEvent.click(button);
  await waitFor(() => expect(promoteUserToAdmin).toHaveBeenCalledWith('u1'));
});

it('shows "Remove administrator role" for a non-owner user currently holding the Admin role', async () => {
  demoteUserFromAdmin.mockResolvedValue({ success: true, userId: 'u1', roleId: 'personal-role' });
  // render with `data.defaultRole` matching the resolved admin role id, `data.isOwner` falsy
  const button = await screen.findByTestId('DemoteFromAdminButton');
  fireEvent.click(button);
  await waitFor(() => expect(demoteUserFromAdmin).toHaveBeenCalledWith('u1'));
});

it('shows neither button for the owner', async () => {
  // render with `data.isOwner` truthy
  expect(screen.queryByTestId('PromoteToAdminButton')).not.toBeInTheDocument();
  expect(screen.queryByTestId('DemoteFromAdminButton')).not.toBeInTheDocument();
});
```

Fill in the exact render/mock-data setup by copying this file's existing "existing user" test fixture pattern verbatim (don't invent a new one) — the placeholders (`// ...`) above must be replaced with real code before this step counts as done; they exist here only because the exact fixture shape wasn't re-read as part of this plan (budget-constrained) and MUST be read from the actual file at implementation time.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/app-shell && npx vitest run src/windows/custom/user/__tests__/index.vitest.jsx`
Expected: FAIL — new testids don't exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add near `useResendInvitationExtraActions` in `index.jsx`:

```javascript
function useAdminPromotionExtraActions(adminRoleId) {
  const ui = useUI();
  const [working, setWorking] = useState(false);

  return useCallback(({ data, onRefresh }) => {
    const id = data?.id;
    if (!id || id === 'new' || data?.isOwner) return [];

    const currentDefaultRoleId = resolveDefaultRoleId(data);
    const isAdmin = !!(adminRoleId && currentDefaultRoleId && currentDefaultRoleId === adminRoleId);

    const handlePromote = async () => {
      setWorking(true);
      try {
        await promoteUserToAdmin(id);
        toast.success(ui('promoteToAdminSuccessToast'));
        onRefresh?.();
      } catch (err) {
        toast.error(err?.message || ui('promoteToAdminErrorFallback'));
      } finally {
        setWorking(false);
      }
    };

    const handleDemote = async () => {
      setWorking(true);
      try {
        await demoteUserFromAdmin(id);
        toast.success(ui('demoteFromAdminSuccessToast'));
        onRefresh?.();
      } catch (err) {
        toast.error(err?.message || ui('demoteFromAdminErrorFallback'));
      } finally {
        setWorking(false);
      }
    };

    if (isAdmin) {
      return [{
        key: 'demote-from-admin',
        disabled: working,
        onClick: handleDemote,
        label: <span data-testid="DemoteFromAdminButton">{ui('demoteFromAdminAction')}</span>,
      }];
    }
    return [{
      key: 'promote-to-admin',
      disabled: working,
      onClick: handlePromote,
      label: <span data-testid="PromoteToAdminButton">{ui('promoteToAdminAction')}</span>,
    }];
  }, [adminRoleId, working, ui]);
}
```

Import `promoteUserToAdmin`/`demoteUserFromAdmin` from `'@/lib/promoteUserRoleApi.js'` and `resolveDefaultRoleId` from `'./RoleChipsCell.jsx'` at the top of `index.jsx` (check `resolveDefaultRoleId` isn't already imported under a different local name there).

Then wire `adminRoleId` (reuse whatever `AssignTemplateRolesControl.jsx`'s own `fetchRolesOverview()`-based effect resolves — read that component's effect again and either lift it to a shared hook consumed by both, or duplicate the same two-line lookup at `index.jsx`'s level if lifting is out of scope for this task) and merge `useAdminPromotionExtraActions(adminRoleId)`'s result into the existing `extraActions={resendInvitationExtraActions}` prop passed to `<UserPage>` — combine both hooks' action arrays (e.g. `extraActions={(args) => [...resendInvitationExtraActions(args), ...adminPromotionExtraActions(args)]}`, adjusting to match whatever shape `extraActions` actually expects once re-read at implementation time).

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2, plus the full window suite: `npx vitest run src/windows/custom/user/`
Expected: PASS, no regressions elsewhere.

- [ ] **Step 5: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge
git add tools/app-shell/src/windows/custom/user/index.jsx \
  tools/app-shell/src/windows/custom/user/__tests__/index.vitest.jsx
git commit -m "Feature ETP-5019: Wire admin promote/demote extraActions"
```

---

### Task 7: Docs — update `user.md`

**Files:**
- Modify: `docs/generated-custom-windows/user.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Add a new section**

Near the existing "Owner/admin composition lock (ETP-5019)" addendum, add a new paragraph describing: the "Hacer administrador"/"Quitar rol de administrador" actions (owner or current admin only, owner target excluded), that promote unassigns-but-never-deletes the personal role, and that demote restores it by name lookup or creates a fresh empty one.

- [ ] **Step 2: Commit**

```bash
cd /Users/gremiger/workspaces/etendogoclean/etendo/etendo_schema_forge
git add docs/generated-custom-windows/user.md
git commit -m "Feature ETP-5019: Document admin promote/demote in user.md"
```

---

## Self-review notes (from the writing-plans process)

- **Spec coverage:** all 4 spec decisions (authorization, owner protection, UI approach, demote-restores-prior-role) are implemented — Task 1/2 (backend authorization + owner guard), Task 6 (UI approach C, owner excluded), Task 2 (name-based restore).
- **Known incomplete steps, flagged rather than hidden:** Task 2's second test's exact mock wiring, and Task 6's test fixture bodies and the exact `extraActions` merge shape, could not be fully pre-written within this planning session's context budget — each is explicitly marked in its own task with what must be read from the real file before the step is genuinely done. This is a deliberate, disclosed gap, not an oversight — whoever executes Task 2/6 must do that one extra read first.
- **Type consistency:** `AssignmentResult` (existing 5-field class) is reused as-is by both new backend methods rather than introducing a new result type — `personalRoleId` is repurposed to carry whichever role (Admin or personal) is now active, documented inline in both new methods' javadoc.
