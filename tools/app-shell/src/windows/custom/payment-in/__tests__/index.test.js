import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const paymentIn = readFileSync(join(__dirname, '..', 'index.jsx'), 'utf8');
const paymentOut = readFileSync(
  join(__dirname, '..', '..', 'payment-out', 'index.jsx'), 'utf8');
const registry = readFileSync(join(__dirname, '..', '..', '..', 'registry.js'), 'utf8');

describe('payment window wrappers — toolbar button order', () => {
  it('payment-in asks for saveActionsFirst', () => {
    assert.match(paymentIn, /saveActionsFirst/);
  });

  it('payment-out asks for saveActionsFirst', () => {
    assert.match(paymentOut, /saveActionsFirst/);
  });

  // Order only. Opting into saveBeforeProcesses would also make Confirm flush pending header
  // edits first, which is a behavior change neither window asked for.
  it('neither window opts into saveBeforeProcesses', () => {
    assert.doesNotMatch(paymentIn, /saveBeforeProcesses\s*(=|\}|\s|$)/m);
    assert.doesNotMatch(paymentOut, /saveBeforeProcesses\s*(=|\}|\s|$)/m);
  });

  it('payment-in wraps the generated artifact and forwards its props', () => {
    assert.match(paymentIn, /@generated\/payment-in\/generated\/web\/payment-in\/index\.jsx/);
    assert.match(paymentIn, /\{\s*\.\.\.props\s*\}/);
  });

  // A custom wrapper that is not registered is dead code: the registry is what makes the
  // window resolve to it instead of straight to the generated artifact.
  it('both wrappers are registered as custom loaders', () => {
    assert.match(registry, /'payment-in':\s*\(\)\s*=>\s*import\('\.\/custom\/payment-in\/index\.jsx'\)/);
    assert.match(registry, /'payment-out':\s*\(\)\s*=>\s*import\('\.\/custom\/payment-out\/index\.jsx'\)/);
  });
});
