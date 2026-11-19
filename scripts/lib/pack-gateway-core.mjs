#!/usr/bin/env node
// The one place that turns @etendosoftware/api-gateway-core SOURCE into an installed dependency of
// gateway/. The package is not published, so every consumer packs it from a schema_forge_core
// checkout: .github/workflows/deploy-public-api.yml (gateway tests before an image is built) and
// scripts/public-api-e2e-ci.mjs (the e2e suite in CI). gateway/Dockerfile still runs the same
// steps inside its own build stage, where this repo's scripts are not copied.
//
//   node scripts/lib/pack-gateway-core.mjs <coreSourceDir> <gatewayDir> <workDir> [--build]
//
// Steps: install the package's deps (dev included, plus @types/node), build it, `npm pack` it into
// workDir, install the tarball into gatewayDir with --no-save (gateway/package.json must never end
// up pointing at a local file), and with --build also build the gateway.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TARBALL = /^etendosoftware-api-gateway-core-\d[^/]*\.tgz$/;
const NPM_QUIET = ['--no-audit', '--no-fund'];

const defaultRun = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });

/** The api-gateway-core tarball `npm pack` left in workDir; exactly one is expected. */
export function findTarball(files) {
  const matches = files.filter((file) => TARBALL.test(file));
  if (matches.length !== 1) {
    throw new Error(`expected one api-gateway-core tarball after npm pack, found ${matches.length}${matches.length ? `: ${matches.join(', ')}` : ''}`);
  }
  return matches[0];
}

/**
 * @param {object} options
 * @param {string} options.coreSourceDir packages/api-gateway-core of a schema_forge_core checkout
 * @param {string} options.gatewayDir    the gateway/ directory to install it into
 * @param {string} options.workDir       an existing directory for the tarball
 * @param {boolean} [options.build]      also run the gateway's build
 * @param {Function} [options.run]       command runner (tests inject one)
 * @param {Function} [options.list]      directory lister (tests inject one)
 * @returns {string} path of the tarball that was installed
 */
export function packGatewayCore({ coreSourceDir, gatewayDir, workDir, build = false, run = defaultRun, list = readdirSync }) {
  run('npm', ['install', '--include=dev', ...NPM_QUIET, '--prefix', coreSourceDir]);
  run('npm', ['install', '--include=dev', '--no-save', ...NPM_QUIET, '--prefix', coreSourceDir, '@types/node']);
  run('npm', ['run', 'build', '--prefix', coreSourceDir]);
  run('npm', ['pack', '--pack-destination', workDir], { cwd: coreSourceDir });
  const tarball = join(workDir, findTarball(list(workDir)));
  run('npm', ['install', '--include=dev', '--no-save', ...NPM_QUIET, tarball], { cwd: gatewayDir });
  if (build) run('npm', ['run', 'build'], { cwd: gatewayDir });
  return tarball;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const build = args.includes('--build');
  const [coreSourceDir, gatewayDir, workDir] = args.filter((arg) => arg !== '--build').map((arg) => resolve(arg));
  if (!coreSourceDir || !gatewayDir || !workDir) {
    console.error('usage: node scripts/lib/pack-gateway-core.mjs <coreSourceDir> <gatewayDir> <workDir> [--build]');
    process.exit(2);
  }
  try {
    console.log(`packed and installed ${packGatewayCore({ coreSourceDir, gatewayDir, workDir, build })}`);
  } catch (error) {
    console.error(`[pack-gateway-core] ${error.message}`);
    process.exit(1);
  }
}
