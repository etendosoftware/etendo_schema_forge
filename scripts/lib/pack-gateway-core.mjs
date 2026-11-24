#!/usr/bin/env node
// Install the published gateway/package.json pin; never rewrite it to a local tarball.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function installGatewayCore({ gatewayDir, build = false, run = execFileSync }) {
  run('npm', ['install', '--include=dev', '--no-audit', '--no-fund'], { cwd: gatewayDir, stdio: 'inherit' });
  if (build) run('npm', ['run', 'build'], { cwd: gatewayDir, stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const gatewayDir = process.argv[2];
  if (!gatewayDir) {
    console.error('usage: node scripts/lib/pack-gateway-core.mjs <gatewayDir> [--build]');
    process.exit(2);
  }
  installGatewayCore({ gatewayDir: resolve(gatewayDir), build: process.argv.includes('--build') });
}
