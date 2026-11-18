// @covers scripts/lib/pack-gateway-core.mjs
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTarball, packGatewayCore } from '../lib/pack-gateway-core.mjs';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'pack-gateway-core.mjs');

describe('pack-gateway-core', () => {
  describe('findTarball', () => {
    it('returns the single api-gateway-core tarball', () => {
      assert.equal(findTarball(['notes.txt', 'etendosoftware-api-gateway-core-0.2.0.tgz']), 'etendosoftware-api-gateway-core-0.2.0.tgz');
    });
    it('refuses none or several: installing the wrong one would test another build', () => {
      assert.throws(() => findTarball(['other-1.0.0.tgz']), /found 0/);
      assert.throws(() => findTarball(['etendosoftware-api-gateway-core-0.1.0.tgz', 'etendosoftware-api-gateway-core-0.2.0.tgz']), /found 2/);
    });
    it('refuses an empty directory', () => {
      assert.throws(() => findTarball([]), /found 0/);
    });
    it('ignores lookalikes: no version, or a checksum next to the tarball', () => {
      assert.throws(() => findTarball(['etendosoftware-api-gateway-core.tgz', 'etendosoftware-api-gateway-core-.tgz']), /found 0/);
      assert.equal(
        findTarball(['etendosoftware-api-gateway-core-0.2.0.tgz.sha', 'etendosoftware-api-gateway-core-0.2.0.tgz']),
        'etendosoftware-api-gateway-core-0.2.0.tgz',
      );
      assert.throws(() => findTarball(['etendosoftware-api-gateway-core-0.2.0.tgz.sha']), /found 0/);
    });
  });

  describe('packGatewayCore', () => {
    const recorder = () => {
      const calls = [];
      return { calls, run: (command, args, options = {}) => calls.push([command, ...args, options.cwd ?? '-'].join(' ')) };
    };
    const list = () => ['etendosoftware-api-gateway-core-0.2.0.tgz'];

    it('builds and packs the core, then installs the tarball into the gateway with --no-save', () => {
      const { calls, run } = recorder();
      const tarball = packGatewayCore({ coreSourceDir: '/core', gatewayDir: '/gw', workDir: '/w', run, list });
      assert.equal(tarball, '/w/etendosoftware-api-gateway-core-0.2.0.tgz');
      assert.deepEqual(calls, [
        'npm install --include=dev --no-audit --no-fund --prefix /core -',
        'npm install --include=dev --no-save --no-audit --no-fund --prefix /core @types/node -',
        'npm run build --prefix /core -',
        'npm pack --pack-destination /w /core',
        'npm install --include=dev --no-save --no-audit --no-fund /w/etendosoftware-api-gateway-core-0.2.0.tgz /gw',
      ]);
    });
    it('builds the gateway only when asked', () => {
      const { calls, run } = recorder();
      packGatewayCore({ coreSourceDir: '/core', gatewayDir: '/gw', workDir: '/w', build: true, run, list });
      assert.equal(calls.at(-1), 'npm run build /gw');
    });
  });

  describe('command line', () => {
    let root;
    let bin;
    let calls;
    // A stand-in npm on PATH: records "cwd | argv" per call, and `npm pack` leaves a tarball in
    // --pack-destination as the real one does.
    before(() => {
      root = mkdtempSync(join(tmpdir(), 'pack-gateway-core-'));
      bin = join(root, 'bin');
      calls = join(root, 'calls.log');
      mkdirSync(bin);
      for (const dir of ['core', 'gw', 'work']) mkdirSync(join(root, dir));
      writeFileSync(join(bin, 'npm'), [
        '#!/bin/sh',
        'echo "$(pwd) | $*" >> "$NPM_CALLS"',
        'if [ "$1" = pack ]; then touch "$3/etendosoftware-api-gateway-core-0.2.0.tgz"; fi',
      ].join('\n'));
      chmodSync(join(bin, 'npm'), 0o755);
    });
    after(() => rmSync(root, { recursive: true, force: true }));

    const cli = (args) => {
      rmSync(calls, { force: true });
      rmSync(join(root, 'work', 'etendosoftware-api-gateway-core-0.2.0.tgz'), { force: true });
      return spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
        cwd: root,
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, NPM_CALLS: calls },
      });
    };
    const recorded = () => readFileSync(calls, 'utf8').trim().split('\n');

    it('exits 2 with the usage when the directories are missing', () => {
      const res = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
      assert.equal(res.status, 2);
      assert.match(res.stderr, /usage: node scripts\/lib\/pack-gateway-core\.mjs <coreSourceDir> <gatewayDir> <workDir> \[--build\]/);
    });

    it('runs the sequence in order, with paths resolved against the working directory', () => {
      const res = cli(['core', 'gw', 'work']);
      assert.equal(res.status, 0, res.stderr);
      const [core, gw, work] = ['core', 'gw', 'work'].map((dir) => join(root, dir));
      assert.deepEqual(recorded(), [
        `${root} | install --include=dev --no-audit --no-fund --prefix ${core}`,
        `${root} | install --include=dev --no-save --no-audit --no-fund --prefix ${core} @types/node`,
        `${root} | run build --prefix ${core}`,
        `${core} | pack --pack-destination ${work}`,
        `${gw} | install --include=dev --no-save --no-audit --no-fund ${work}/etendosoftware-api-gateway-core-0.2.0.tgz`,
      ]);
      assert.match(res.stdout, /packed and installed .*etendosoftware-api-gateway-core-0\.2\.0\.tgz/);
    });

    it('--build (in any position) also builds the gateway', () => {
      const res = cli(['--build', 'core', 'gw', 'work']);
      assert.equal(res.status, 0, res.stderr);
      const lines = recorded();
      assert.equal(lines.length, 6);
      assert.equal(lines.at(-1), `${join(root, 'gw')} | run build`);
    });
  });
});
