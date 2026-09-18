// ETP-5034 — the financial-account window bypasses DetailView, so it carries its own copy of
// the "record unavailable" guard. Source-reading rather than a render test: index.jsx is a very
// large custom window whose render pulls in a dozen data hooks, PSD2 flows and a tab shell —
// mounting all of that would test everything except the four lines under scrutiny.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');

describe('financial-account window — record-unavailable guard (ETP-5034)', () => {
  it('imports the shared RecordUnavailable component (not a local copy)', () => {
    assert.match(
      src,
      /import RecordUnavailable from '@\/components\/contract-ui\/RecordUnavailable\.jsx'/,
    );
  });

  it('renders the guard when the account is absent and no longer loading', () => {
    assert.match(src, /if \(!account && !accountLoading\) \{/);
    assert.match(src, /if \(!account && !accountLoading\) \{[\s\S]{0,400}?<RecordUnavailable/);
  });

  it('picks the error variant only for a transport failure, defaulting to notFound', () => {
    assert.match(src, /variant=\{accountError \? 'error' : 'notFound'\}/);
  });

  it('routes the back action to the account list', () => {
    assert.match(src, /onBack=\{\(\) => navigate\('\/financial-account'\)\}/);
  });

  it('does not gate the guard while the account is still loading', () => {
    // A guard that fired during loading would flash "not found" on every navigation.
    assert.doesNotMatch(src, /if \(!account\) \{[\s\S]{0,200}?<RecordUnavailable/);
  });

  it('passes an explicit data-testid the component actually honours', () => {
    // ETP-5034 (review cycle): the attribute used to be dropped silently — RecordUnavailable
    // neither declared nor spread it, so this window's selector only worked by accident,
    // because the value happens to match the component's own default.
    assert.match(src, /<RecordUnavailable[\s\S]{0,200}?data-testid="record-unavailable"/);
  });

  it('keeps the guard after the access-tier guard so hook order stays stable', () => {
    const tierIdx = src.indexOf("windowAccessTier === 'none'");
    const guardIdx = src.indexOf('if (!account && !accountLoading)');
    assert.ok(tierIdx > 0, 'expected the access-tier guard to still be present');
    assert.ok(guardIdx > tierIdx, 'the record-unavailable guard must come after the tier guard');
  });
});
