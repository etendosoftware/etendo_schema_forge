import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

/**
 * Regression guard for ETP-4333: DetailView must hand custom detail panels (and the
 * form footer) a LOCAL setter as `onLocalChange` that writes form state WITHOUT firing
 * a callout. AssetsDetailPanel relies on this to apply the locally-computed SL_Assets
 * amount triple deterministically (no async /assets/callout round-trip to race).
 *
 * - `onChange`      must be `handleChangeWithCallout` (fires the real callout).
 * - `onLocalChange` must be `hook.handleChange`        (pure local state setter, no callout).
 *
 * If `onLocalChange` were wired to the callout-firing handler, the very race this fix
 * removes would return.
 */
describe('DetailView — onLocalChange wiring (ETP-4333)', () => {
  it('passes onLocalChange={hook.handleChange} to the active tab custom Panel', () => {
    assert.match(
      src,
      /<activeTab\.Panel[\s\S]*?onChange=\{handleChangeWithCallout\}[\s\S]*?onLocalChange=\{hook\.handleChange\}/,
    );
  });

  it('passes both onChange (callout) and onLocalChange (local setter) to the form footer', () => {
    assert.match(
      src,
      /formFooter,\s*\{[\s\S]*?onChange:\s*handleChangeWithCallout[\s\S]*?onLocalChange:\s*hook\.handleChange/,
    );
  });

  it('uses distinct handlers — local setter is NOT the callout-firing handler', () => {
    // onLocalChange must never be wired to handleChangeWithCallout (that reintroduces the race).
    assert.doesNotMatch(src, /onLocalChange=\{handleChangeWithCallout\}/);
    assert.doesNotMatch(src, /onLocalChange:\s*handleChangeWithCallout/);
  });
});
