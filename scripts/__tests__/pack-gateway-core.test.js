// @covers scripts/lib/pack-gateway-core.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installGatewayCore } from '../lib/pack-gateway-core.mjs';

describe('published gateway dependency installation', () => {
  it('installs the manifest without a source checkout or a dependency override', () => {
    const calls = [];
    installGatewayCore({ gatewayDir: '/gw', run: (...args) => calls.push(args) });
    assert.deepEqual(calls, [['npm', ['install', '--include=dev', '--no-audit', '--no-fund'], { cwd: '/gw', stdio: 'inherit' }]]);
  });
  it('builds the gateway when requested', () => {
    const calls = [];
    installGatewayCore({ gatewayDir: '/gw', build: true, run: (...args) => calls.push(args) });
    assert.deepEqual(calls.at(-1), ['npm', ['run', 'build'], { cwd: '/gw', stdio: 'inherit' }]);
  });
  it('keeps the deployment manifest guardrail and passes registry auth as a BuildKit secret', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/deploy-public-api.yml', import.meta.url), 'utf8');
    assert.match(workflow, /git -C \.\. diff --quiet -- gateway\/package\.json/);
    assert.match(workflow, /--secret id=npmrc/);
    assert.match(workflow, /_authToken=%s/);
    assert.match(workflow, /"\$NODE_AUTH_TOKEN" > "\$RUNNER_TEMP\/gateway\.npmrc"/);
    assert.doesNotMatch(workflow, /repository:.*schema_forge_core/);
  });
});
