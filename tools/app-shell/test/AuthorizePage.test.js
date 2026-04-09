import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');
const SOURCE = resolve(APP_SHELL, 'src/pages/AuthorizePage.jsx');

describe('AuthorizePage source', () => {
  it('file exists', () => {
    assert.ok(existsSync(SOURCE), 'AuthorizePage.jsx should exist');
  });

  it('exports AuthorizePage as default', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export default function AuthorizePage'), 'should export default AuthorizePage');
  });

  it('reads OAuth2 params from URL search params', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("useSearchParams"), 'should use useSearchParams from react-router-dom');
    assert.ok(src.includes("searchParams.get('client_id')"), 'should read client_id');
    assert.ok(src.includes("searchParams.get('redirect_uri')"), 'should read redirect_uri');
    assert.ok(src.includes("searchParams.get('code_challenge')"), 'should read code_challenge');
    assert.ok(src.includes("searchParams.get('state')"), 'should read state');
    assert.ok(src.includes("searchParams.get('scope')"), 'should read scope');
    assert.ok(src.includes("searchParams.get('response_type')"), 'should read response_type');
  });

  it('falls back to neo:read neo:write when no scope param', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("searchParams.get('scope') || 'neo:read neo:write'"),
      'should default scope to neo:read neo:write'
    );
  });

  it('isOAuthFlow requires all 4 PKCE params', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes('clientId && redirectUri && codeChallenge && responseType'),
      'isOAuthFlow should require all mandatory OAuth2/PKCE params'
    );
    assert.ok(src.includes("responseType === 'code'"), 'isOAuthFlow should require response_type=code');
  });

  it('shows ConnectionsLanding when not an OAuth flow', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('<ConnectionsLanding'), 'should render ConnectionsLanding for non-OAuth visits');
    assert.ok(src.includes('if (!isOAuthFlow)'), 'should check isOAuthFlow before showing authorization UI');
  });

  it('handleAuthorize POSTs to /oauth2/authorize with Bearer token', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("fetch('/oauth2/authorize'"), 'should POST to /oauth2/authorize');
    assert.ok(src.includes("method: 'POST'"), 'handleAuthorize should use POST');
    assert.ok(src.includes('`Bearer ${token}`'), 'should send Authorization: Bearer header');
    assert.ok(src.includes('code_challenge'), 'request body should include code_challenge');
  });

  it('redirects to redirect_url on successful authorization', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('data.redirect_url'), 'should read redirect_url from response');
    assert.ok(src.includes("window.location.href = data.redirect_url"), 'should redirect to redirect_url');
    assert.ok(src.includes("setStatus('success')"), 'should set status to success before redirect');
  });

  it('handleDeny redirects with access_denied error', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('error=access_denied'), 'deny should append error=access_denied to redirect_uri');
    assert.ok(src.includes('User+denied+the+request'), 'deny should include human-readable error_description');
  });

  it('propagates state param on denial', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('state=${state}'), 'deny should include state param when present');
  });

  it('manages status state with correct values', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("useState('idle')"), 'initial status should be idle');
    assert.ok(src.includes("setStatus('authorizing')"), 'should set authorizing during request');
    assert.ok(src.includes("setStatus('error')"), 'should set error on failure');
  });

  it('SCOPE_LABELS maps all 5 supported scopes', () => {
    const src = readFileSync(SOURCE, 'utf8');
    const expectedScopes = ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'];
    for (const scope of expectedScopes) {
      assert.ok(src.includes(`'${scope}'`), `SCOPE_LABELS should include ${scope}`);
    }
  });

  it('detectBaseUrl reads /web/ segment from pathname', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("path.indexOf('/web/')"), 'detectBaseUrl should find /web/ in pathname');
    assert.ok(src.includes('VITE_API_BASE'), 'detectBaseUrl should fall back to VITE_API_BASE env');
  });

  it('Authorize button is disabled while authorizing', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("disabled={status === 'authorizing'}"),
      'Authorize and Deny buttons should be disabled while authorizing'
    );
  });

  it('ConnectionsLanding displays MCP Server URL', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('detectMcpUrl()'), 'ConnectionsLanding should display the MCP server URL');
    assert.ok(src.includes("window.location.origin + '/mcp'"), 'detectMcpUrl should derive URL from origin');
  });
});
