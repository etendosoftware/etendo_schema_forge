import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');
const SOURCE = resolve(APP_SHELL, 'src/pages/OAuth2ClientsPage.jsx');

describe('OAuth2ClientsPage source', () => {
  it('file exists', () => {
    assert.ok(existsSync(SOURCE), 'OAuth2ClientsPage.jsx should exist');
  });

  it('exports OAuth2ClientsPage as default', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export default function OAuth2ClientsPage'), 'should export default OAuth2ClientsPage');
  });

  it('imports all oauth2Api functions it uses', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("import { listClients, deleteClient, regenerateSecret, revokeTokens } from '@/lib/oauth2Api.js'"),
      'should import listClients, deleteClient, regenerateSecret, revokeTokens'
    );
  });

  it('imports dialog components from OAuth2ClientDialog', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("import OAuth2ClientDialog, { SecretRevealDialog, ConfirmDialog } from '@/components/OAuth2ClientDialog.jsx'"),
      'should import OAuth2ClientDialog, SecretRevealDialog, ConfirmDialog'
    );
  });

  it('fetches clients on mount via useEffect', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('useEffect'), 'should call fetchClients on mount with useEffect');
    assert.ok(src.includes('fetchClients()'), 'useEffect body should call fetchClients');
    assert.ok(src.includes('[fetchClients]'), 'useEffect should depend on fetchClients');
  });

  it('uses useCallback for fetchClients to prevent infinite loops', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('useCallback'), 'fetchClients should be wrapped in useCallback');
    assert.ok(src.includes('[apiFetch]'), 'useCallback should depend on apiFetch');
  });

  it('initialises client list as empty array to prevent map errors', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('useState([])'), 'clients state should initialise to empty array');
    assert.ok(src.includes('Array.isArray(data) ? data : []'), 'should guard against non-array responses');
  });

  it('handles CRUD operations via confirmation dialog', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('handleDelete'), 'should implement handleDelete');
    assert.ok(src.includes('handleRegenerateSecret'), 'should implement handleRegenerateSecret');
    assert.ok(src.includes('handleRevokeTokens'), 'should implement handleRevokeTokens');
    assert.ok(src.includes('setConfirmState'), 'should use confirmState for destructive actions');
  });

  it('delete confirm dialog uses destructive variant', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // Look for destructive variant in delete handler context
    assert.ok(
      src.includes("variant: 'destructive'"),
      'delete confirmation should use destructive variant'
    );
  });

  it('shows SecretRevealDialog after regenerating secret', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('setRevealSecret'), 'should track revealSecret state after regeneration');
    assert.ok(src.includes('<SecretRevealDialog'), 'should render SecretRevealDialog when revealSecret is set');
  });

  it('empty state shows prompt to create first client', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("ui(\"oauthClientNoClients\")"), 'empty state should display no-clients message via i18n');
    assert.ok(src.includes("ui(\"oauthClientCreateFirst\")"), 'empty state should show create CTA via i18n');
  });

  it('table shows correct columns', () => {
    const src = readFileSync(SOURCE, 'utf8');
    const expectedKeys = ['name', 'oauthClientId', 'user', 'role', 'oauthScopes', 'oauthActive'];
    for (const key of expectedKeys) {
      assert.ok(src.includes(`ui("${key}")`), `table should have "${key}" column via i18n`);
    }
  });

  it('client ID is truncated and copyable', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('client.clientId?.slice(0, 12)'), 'clientId should be truncated to 12 chars');
    assert.ok(src.includes('copyClientId'), 'should implement copyClientId for click-to-copy');
  });

  it('active status rendered as Badge variant', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("variant={client.isActive ? 'default' : 'outline'}"),
      'active badge should switch variant based on isActive'
    );
  });

  it('row actions dropdown includes Edit, Regenerate Secret, Revoke Tokens, Delete', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('handleEdit(client)'), 'dropdown should have Edit action');
    assert.ok(src.includes('handleRegenerateSecret(client)'), 'dropdown should have Regenerate Secret action');
    assert.ok(src.includes('handleRevokeTokens(client)'), 'dropdown should have Revoke Tokens action');
    assert.ok(src.includes('handleDelete(client)'), 'dropdown should have Delete action');
  });

  it('detectBaseUrl falls back to VITE_API_BASE env', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('VITE_API_BASE'), 'detectBaseUrl should reference VITE_API_BASE');
  });

  it('toast.error called on fetch failure', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("toast.error('Failed to load clients'"),
      'should show error toast when fetchClients fails'
    );
  });
});
