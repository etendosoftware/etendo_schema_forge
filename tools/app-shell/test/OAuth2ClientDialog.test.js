import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_SHELL = resolve(import.meta.dirname, '..');
const SOURCE = resolve(APP_SHELL, 'src/components/OAuth2ClientDialog.jsx');

describe('OAuth2ClientDialog source', () => {
  it('file exists', () => {
    assert.ok(existsSync(SOURCE), 'OAuth2ClientDialog.jsx should exist');
  });

  it('exports OAuth2ClientDialog as default', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export default function OAuth2ClientDialog'), 'should export default OAuth2ClientDialog');
  });

  it('exports SecretRevealDialog named export', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export function SecretRevealDialog'), 'should export SecretRevealDialog');
  });

  it('exports ConfirmDialog named export', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('export function ConfirmDialog'), 'should export ConfirmDialog');
  });

  it('imports createClient and updateClient from oauth2Api', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes("import { createClient, updateClient } from '@/lib/oauth2Api.js'"),
      'should import createClient and updateClient from oauth2Api'
    );
  });

  it('defines ALL_SCOPES with neo:* wildcard', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("'neo:*'"), 'ALL_SCOPES should include neo:* wildcard');
    assert.ok(src.includes("'neo:read'"), 'ALL_SCOPES should include neo:read');
    assert.ok(src.includes("'neo:write'"), 'ALL_SCOPES should include neo:write');
    assert.ok(src.includes("'neo:process'"), 'ALL_SCOPES should include neo:process');
    assert.ok(src.includes("'neo:report'"), 'ALL_SCOPES should include neo:report');
  });

  it('determines edit mode from truthy client prop', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('const isEdit = !!client'), 'should derive isEdit from client prop');
  });

  it('resets form state when dialog opens', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('useEffect'), 'should use useEffect to reset form');
    assert.ok(src.includes('[open, client]'), 'useEffect should depend on open and client');
  });

  it('prevents submit when name is empty', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("!name.trim()"), 'should validate that name is not empty before submit');
    assert.ok(src.includes("toast.error('Name is required')"), 'should show error toast for empty name');
  });

  it('wildcard scope toggles all granular scopes together', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("scope === 'neo:*'"), 'toggleScope should special-case neo:*');
    assert.ok(src.includes('setScopes([...ALL_SCOPES])'), 'should set all scopes when wildcard toggled on');
    assert.ok(src.includes('setScopes([])'), 'should clear all scopes when wildcard toggled off');
  });

  it('shows SecretRevealDialog after successful client creation with secret', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('revealData'), 'should track revealData state');
    assert.ok(src.includes('<SecretRevealDialog'), 'should render SecretRevealDialog when revealData is set');
  });

  it('SecretRevealDialog warns that secret is shown only once', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes('The secret will not be shown again') || src.includes('not be shown again'),
      'SecretRevealDialog should warn about one-time visibility'
    );
  });

  it('ConfirmDialog accepts variant prop for destructive actions', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes("variant = 'default'"), 'ConfirmDialog should default variant to default');
    assert.ok(src.includes("variant === 'destructive'"), 'ConfirmDialog should handle destructive variant');
  });

  it('loading spinner shown during submission', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(src.includes('submitting'), 'should track submitting state');
    assert.ok(src.includes('Loader2'), 'should render Loader2 spinner while submitting');
  });
});

describe('OAuth2ClientDialog scope logic', () => {
  it('GRANULAR_SCOPES excludes neo:*', () => {
    const src = readFileSync(SOURCE, 'utf8');
    // GRANULAR_SCOPES is derived by filtering out neo:*
    assert.ok(
      src.includes("ALL_SCOPES.filter((s) => s !== 'neo:*')"),
      'GRANULAR_SCOPES should exclude neo:*'
    );
  });

  it('granular scope checkboxes are disabled when wildcard is active', () => {
    const src = readFileSync(SOURCE, 'utf8');
    assert.ok(
      src.includes('isGranular && hasWildcard'),
      'granular scopes should be disabled when wildcard is on'
    );
    assert.ok(
      src.includes('if (hasWildcard) return'),
      'toggleScope should bail early if wildcard is active'
    );
  });
});
