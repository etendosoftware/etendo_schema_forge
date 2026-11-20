// @covers tools/app-shell/src/lib/flags/flag-keys.js
import { describe, expect, it } from 'vitest';

import { FLAG_DEFAULTS, NO_EXPOSURE_FLAGS } from '../flag-keys.js';
// Resolved relative to this file by the bundler, so it works from any working directory.
import registryRaw from '../../../../../../flags-registry.json?raw';

/**
 * FLAG_DEFAULTS ↔ flags-registry.json, in both directions (ETP-4697).
 *
 * The registry's headers are the source of truth for flag METADATA; FLAG_DEFAULTS is what the
 * browser actually evaluates. Two lists that are edited by hand drift: a flag added to one and
 * not the other is either invisible to the debt scorer or unreachable from the app. A header
 * with `flag.scope: "backend"` is read only by com.etendoerp.go and must NOT be in FLAG_DEFAULTS.
 * The operational telemetry kill switches (NO_EXPOSURE_FLAGS) are not features and have no header.
 */
const registry = JSON.parse(registryRaw);

const headerFlags = registry.features
  .filter((feature) => feature.flag && !feature.contribution && feature.flagKey === undefined)
  .map((feature) => ({ id: feature.id, ...feature.flag }));

const frontendFlags = headerFlags.filter((flag) => flag.scope !== 'backend');
const registeredKeys = new Set(frontendFlags.map((flag) => flag.key));
const defaultKeys = Object.keys(FLAG_DEFAULTS).filter((key) => !NO_EXPOSURE_FLAGS.has(key));

describe('FLAG_DEFAULTS and flags-registry.json agree', () => {
  it('registers every FLAG_DEFAULTS key as a header flag', () => {
    const unregistered = defaultKeys.filter((key) => !registeredKeys.has(key));
    expect(unregistered, 'add a feature entry with this flag to flags-registry.json').toEqual([]);
  });

  it('declares every non-backend header flag in FLAG_DEFAULTS', () => {
    const undeclared = frontendFlags.map((flag) => flag.key).filter((key) => !(key in FLAG_DEFAULTS));
    expect(undeclared, 'add the key to flag-keys.js, or mark the flag "scope": "backend"').toEqual([]);
  });

  it('keeps backend-scoped flags out of FLAG_DEFAULTS', () => {
    const leaked = headerFlags
      .filter((flag) => flag.scope === 'backend' && flag.key in FLAG_DEFAULTS)
      .map((flag) => flag.key);
    expect(leaked, 'the browser must never read a backend-only flag').toEqual([]);
  });

  it('declares the same default on both sides', () => {
    const mismatched = frontendFlags
      .filter((flag) => flag.key in FLAG_DEFAULTS && FLAG_DEFAULTS[flag.key] !== flag.defaultValue)
      .map((flag) => `${flag.key}: registry ${flag.defaultValue} vs FLAG_DEFAULTS ${FLAG_DEFAULTS[flag.key]}`);
    expect(mismatched).toEqual([]);
  });

  it('uses only the scope "backend" (or none) on a flag', () => {
    const odd = headerFlags.filter((flag) => flag.scope !== undefined && flag.scope !== 'backend');
    expect(odd.map((flag) => `${flag.key}: ${flag.scope}`)).toEqual([]);
  });

  it('never registers a flag key twice', () => {
    const keys = headerFlags.map((flag) => flag.key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('keeps contributions out of this registry\'s headers: a flag has one header', () => {
    const contributions = registry.features.filter((f) => f.contribution || f.flagKey !== undefined);
    expect(contributions.map((f) => f.id), 'contributions live in the repo that owns the code').toEqual([]);
  });
});
