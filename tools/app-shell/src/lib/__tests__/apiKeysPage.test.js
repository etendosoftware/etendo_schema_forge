import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../pages/ApiKeysPage.jsx'), 'utf8');

test('Public API key page is capability-gated and uses the dedicated API client', () => {
  assert.match(page, /useFeatureFlag, PUBLIC_API_KEYS/);
  assert.match(page, /!publicApiKeysEnabled/);
  assert.match(page, /isAdminOrClientAdmin !== true/);
  assert.match(page, /capabilities\?\.publicApiKeyManagement !== true/);
  assert.match(page, /createApiKey\(apiFetch/);
  assert.match(page, /rotateApiKey\(apiFetch/);
  assert.match(page, /revokeApiKeyTokens\(apiFetch/);
  assert.match(page, /deleteApiKey\(apiFetch/);
});

test('Public API key page only sends safe editable fields', () => {
  assert.match(page, /\{ name: name\.trim\(\), capabilities: selected \}/);
  assert.doesNotMatch(page, /adUserId|adRoleId|adClientId|organizationId/);
  assert.match(page, /clientSecret/);
  assert.match(page, /SecretRevealDialog/);
});

test('Public API key creation explains the Scalar credential format and links to docs', () => {
  assert.match(page, /ApiKeysScalarHelp/);
  assert.match(page, /Connect it from Scalar/);
  assert.match(page, /clientId:clientSecret/);
  assert.match(page, /VITE_PUBLIC_API_DOCS_URL/);
  assert.match(page, /https:\/\/app\.etendo\.software\/api/);
  assert.match(page, /authorizationValue=\{`\$\{reveal\.clientId\}:\$\{reveal\.clientSecret\}`\}/);
});
