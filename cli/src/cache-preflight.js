#!/usr/bin/env node

import path from 'node:path';
import { inspectAdCache, formatCacheHealth } from './lib/ad-cache-health.js';

const root = path.resolve(process.env.SF_ROOT || path.join(import.meta.dirname, '..', '..'));
const cliArgs = process.argv.slice(2);
const cachePath = cliArgs.find((arg) => !arg.startsWith('--'))
  || process.env.SF_CACHE_PATH
  || path.join(root, 'cli', 'cache', 'ad-snapshot');
const json = cliArgs.includes('--json');
const strict = cliArgs.includes('--strict');
const health = inspectAdCache(cachePath);

if (json) process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
else process.stdout.write(`${formatCacheHealth(health)}\n`);

process.exit(strict && !health.trustworthy ? 1 : 0);
