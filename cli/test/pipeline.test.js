import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPipelineSteps, validatePipelineInput } from '../src/pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(__dirname, '..');

describe('validatePipelineInput', () => {
  it('accepts valid input with windowId and windowName', () => {
    const result = validatePipelineInput({ windowId: '143', windowName: 'sales-order' });
    assert.equal(result.valid, true);
  });

  it('rejects missing windowId', () => {
    const result = validatePipelineInput({ windowName: 'sales-order' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('windowId'));
  });

  it('rejects missing windowName', () => {
    const result = validatePipelineInput({ windowId: '143' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('windowName'));
  });

  it('rejects empty string windowId as invalid', () => {
    const result = validatePipelineInput({ windowId: '', windowName: 'sales-order' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('windowId'));
  });

  it('rejects empty string windowName as invalid', () => {
    const result = validatePipelineInput({ windowId: '143', windowName: '' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('windowName'));
  });
});

describe('buildPipelineSteps', () => {
  it('returns all pipeline steps in correct order', () => {
    const steps = buildPipelineSteps();
    assert.ok(steps.length >= 6);
    assert.equal(steps[0].name, 'extract-fields');
    assert.equal(steps[1].name, 'extract-rules');
    assert.equal(steps[2].name, 'validate');
    assert.equal(steps[3].name, 'pre-classify');
    // Step 4 is resolve-curated (applies raw + decisions → curated in memory)
    assert.equal(steps[4].name, 'resolve-curated');
    assert.equal(steps[5].name, 'generate-contract');
  });

  it('each step has name, description, and phase', () => {
    const steps = buildPipelineSteps();
    for (const step of steps) {
      assert.ok(step.name, `step missing name`);
      assert.ok(step.description, `${step.name} missing description`);
      assert.ok(step.phase, `${step.name} missing phase`);
    }
  });

  it('marks translate-todos as interactive', () => {
    const steps = buildPipelineSteps();
    const translateStep = steps.find(s => s.name === 'translate-todos');
    assert.ok(translateStep, 'translate-todos step must exist');
    assert.equal(translateStep.interactive, true);
  });

  it('returns exactly 12 steps', () => {
    const steps = buildPipelineSteps();
    assert.equal(steps.length, 12);
  });

  it('includes generate-frontend step with phase F8', () => {
    const steps = buildPipelineSteps();
    const f8 = steps.find(s => s.name === 'generate-frontend');
    assert.ok(f8, 'generate-frontend step must exist');
    assert.equal(f8.phase, 'F8');
    assert.ok(f8.description, 'generate-frontend must have a description');
  });

  it('F8 comes after F7 and before F9', () => {
    const steps = buildPipelineSteps();
    const f7Index = steps.findIndex(s => s.phase === 'F7');
    const f8Index = steps.findIndex(s => s.phase === 'F8');
    const f9Index = steps.findIndex(s => s.phase === 'F9');
    assert.ok(f7Index < f8Index, 'F7 must come before F8');
    assert.ok(f8Index < f9Index, 'F8 must come before F9');
  });

  it('all step names are unique', () => {
    const steps = buildPipelineSteps();
    const names = steps.map(s => s.name);
    const uniqueNames = new Set(names);
    assert.equal(uniqueNames.size, names.length, `Duplicate step names found: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  });

  it('all phase values are unique', () => {
    const steps = buildPipelineSteps();
    const phases = steps.map(s => s.phase);
    const uniquePhases = new Set(phases);
    assert.equal(uniquePhases.size, phases.length, `Duplicate phases found: ${phases.filter((p, i) => phases.indexOf(p) !== i)}`);
  });

  it('interactive step is not the first step', () => {
    const steps = buildPipelineSteps();
    assert.notEqual(steps[0].interactive, true, 'First step should not be interactive');
  });

  it('interactive step is not the last step', () => {
    const steps = buildPipelineSteps();
    const lastStep = steps[steps.length - 1];
    assert.notEqual(lastStep.interactive, true, 'Last step should not be interactive');
  });

  it('translate-todos is the only interactive step', () => {
    const steps = buildPipelineSteps();
    const interactiveSteps = steps.filter(s => s.interactive === true);
    assert.equal(interactiveSteps.length, 1, `Expected exactly 1 interactive step, found ${interactiveSteps.length}`);
    assert.equal(interactiveSteps[0].name, 'translate-todos', 'translate-todos should be the only interactive step');
  });
});

describe('package.json bin entries', () => {
  it('sf-pipeline bin entry points to an existing file', () => {
    const pkg = JSON.parse(readFileSync(resolve(cliRoot, 'package.json'), 'utf8'));
    const binPath = resolve(cliRoot, pkg.bin['sf-pipeline']);
    assert.ok(existsSync(binPath), `sf-pipeline target does not exist: ${pkg.bin['sf-pipeline']}`);
  });

  it('all bin entries that reference existing source files are valid', () => {
    const pkg = JSON.parse(readFileSync(resolve(cliRoot, 'package.json'), 'utf8'));
    const existingBins = [];
    const missingBins = [];

    for (const [name, path] of Object.entries(pkg.bin)) {
      const fullPath = resolve(cliRoot, path);
      if (existsSync(fullPath)) {
        existingBins.push(name);
      } else {
        missingBins.push({ name, path });
      }
    }

    // At minimum, pipeline and the core extractors must exist
    assert.ok(existingBins.includes('sf-pipeline'), 'sf-pipeline bin entry must point to existing file');
    assert.ok(existingBins.includes('sf-extract'), 'sf-extract bin entry must point to existing file');
    assert.ok(existingBins.includes('sf-extract-rules'), 'sf-extract-rules bin entry must point to existing file');
    assert.ok(existingBins.includes('sf-validate'), 'sf-validate bin entry must point to existing file');
  });
});
