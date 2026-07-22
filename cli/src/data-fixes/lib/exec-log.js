/*
 * exec-log.js — Per-run execution log for the data-fixes runner.
 *
 * Every apply / dry-run / targeted run leaves a full transcript on disk at
 *   logs/data-fixes/execution-<YYYYMMDDThhmmssZ>.log   (or $SF_DATA_FIX_LOG_DIR)
 * so halts, FAILED fixes and per-tenant outcomes can be audited after the fact.
 *
 * It works by tee-ing console.log / console.error: output still streams to the
 * terminal AND is appended (ANSI-stripped) to the log file. Call end() to write
 * the summary footer, restore the console, and close the file.
 *
 * Writes go through a synchronous file descriptor (fs.writeSync), NOT a buffered
 * WriteStream: the runner calls process.exit(code) the instant runMain resolves
 * (see run.js entry point), which would discard any bytes still sitting in a
 * stream's async buffer — in practice truncating the summary footer written just
 * before exit. Synchronous appends are on disk before end() returns.
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root: this file is at <root>/cli/src/data-fixes/lib/exec-log.js */
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

/** Directory that holds the per-run execution logs. */
export function logsDir() {
  return process.env.SF_DATA_FIX_LOG_DIR || path.join(REPO_ROOT, 'logs', 'data-fixes');
}

// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g;

/** UTC timestamp shaped like the fix ids: YYYYMMDDThhmmssZ. */
function utcStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Start tee-ing console output to a fresh execution log file.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.argv]      - The runner argv (for the header).
 * @param {string}   [opts.connection]- Human-readable DB target (NO password).
 * @returns {{ file: string, end: (footer?: string) => void }}
 */
export function startExecutionLog({ argv = [], connection = '' } = {}) {
  const dir = logsDir();
  fs.mkdirSync(dir, { recursive: true });
  const started = new Date();
  const file = path.join(dir, `execution-${utcStamp(started)}.log`);
  const fd = fs.openSync(file, 'a');

  const origLog = console.log;
  const origErr = console.error;

  // Synchronous append — see file header: process.exit() would eat buffered
  // stream writes, so everything (esp. the footer) is flushed to disk inline.
  const write = text => fs.writeSync(fd, text);

  const append = args => {
    const text = args
      .map(a => (typeof a === 'string' ? a : util.inspect(a)))
      .join(' ')
      .replace(ANSI, '');
    write(text + '\n');
  };

  console.log = (...args) => { origLog(...args); append(args); };
  console.error = (...args) => { origErr(...args); append(args); };

  const header = [
    '# data-fixes execution log',
    `# started : ${started.toISOString()}`,
    `# command : ${argv.length ? argv.join(' ') : '(full run — apply all)'}`,
    connection ? `# database: ${connection}` : null,
  ].filter(Boolean).join('\n');
  write(header + '\n\n');

  let ended = false;
  return {
    file,
    end(footer) {
      if (ended) return;
      ended = true;
      if (footer) write('\n' + footer.replace(ANSI, '') + '\n');
      write(`\n# finished: ${new Date().toISOString()}\n`);
      console.log = origLog;
      console.error = origErr;
      fs.closeSync(fd);
    },
  };
}
