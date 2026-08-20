import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ETP-4906 DEV wave 6 fix #4 regression coverage.
//
// The native `userRoles` entity (AD_User_Roles child tab) used to render as its own
// secondary tab on the User window, and its AD_Tab label happened to translate to the
// same "Roles del usuario" string this ticket's custom `roles` tab
// (`labelKey: userRolesTabLabel`) already uses — producing two identically-labeled
// tabs, one of them a native leak exposing the internal "Personal – <user>" composition
// role, which should never be user-visible.
//
// Fix: `artifacts/user/decisions.json`'s `userRoles` entity was collapsed to the bare
// `{ "exclude": true }` pattern (matching the `rxServicesAccess`/`token` entities in the
// same file) instead of merely locking its fields read-only, so the pipeline drops the
// native tab entirely rather than just neutering it. This test locks that decision in
// at both ends of the pipeline: the source-of-truth decision, and the resolved
// contract.json the runtime actually reads — so a future `make regen ONLY=user` (or a
// manual decisions.json edit) that re-adds the entity without `exclude: true` fails
// loudly here instead of silently reintroducing the duplicate tab.

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsRoot = join(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(readFileSync(join(artifactsRoot, relPath), 'utf8'));
}

describe('ETP-4906: native userRoles (AD_User_Roles) tab must stay excluded from the User window', () => {
  it('decisions.json: entities.userRoles is exactly { exclude: true }', () => {
    const decisions = readJson('user/decisions.json');
    assert.deepEqual(
      decisions.entities.userRoles,
      { exclude: true },
      'artifacts/user/decisions.json → entities.userRoles must stay the bare `{ exclude: true }` ' +
        "pattern (same convention as rxServicesAccess/token in this file) — reintroducing " +
        "per-field visibility overrides instead of excluding the entity brings back the " +
        'duplicate "Roles del usuario" tab and leaks the internal Personal composition role',
    );
  });

  it('contract.json: frontendContract.entities has no userRoles key (the runtime never sees it)', () => {
    const contract = readJson('user/contract.json');
    const entityKeys = Object.keys(contract.frontendContract?.entities ?? {});
    assert.ok(
      !entityKeys.includes('userRoles'),
      'artifacts/user/contract.json → frontendContract.entities must not contain "userRoles" — ' +
        `found entities: [${entityKeys.join(', ')}]`,
    );
  });

  it('UserPage.jsx: the generated page does not mount a userRoles table or tab', () => {
    const src = readFileSync(
      join(artifactsRoot, 'user/generated/web/user/UserPage.jsx'),
      'utf8',
    );
    assert.doesNotMatch(
      src,
      /UserRolesTable|UserRolesForm|entity="userRoles"/,
      'artifacts/user/generated/web/user/UserPage.jsx must not reference a generated ' +
        'userRoles table/form component or mount an entity="userRoles" tab',
    );
  });
});
