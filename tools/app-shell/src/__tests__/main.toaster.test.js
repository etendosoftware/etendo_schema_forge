/**
 * Source-level guard for main.jsx Toaster accessibility and style config.
 *
 * These tests verify that the Toaster component is configured with the
 * containerAriaLabel and toastOptions.classNames properties so that
 * notifications are accessible and correctly styled.
 *
 * Pattern mirrors financialSummaryCard-typography.test.js — reads the source
 * file directly and asserts structural invariants without needing a browser
 * environment or module resolution.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'main.jsx'), 'utf8');

describe('main.jsx — Toaster accessibility config', () => {
  it('sets containerAriaLabel="Notifications" on the Toaster', () => {
    assert.match(src, /containerAriaLabel=["']Notifications["']/);
  });

  it('uses the sonner Toaster component', () => {
    assert.match(src, /import.*Toaster.*from ['"]sonner['"]/);
  });

  it('renders Toaster at bottom-right position', () => {
    assert.match(src, /position=["']bottom-right["']/);
  });

  it('enables richColors on the Toaster', () => {
    assert.match(src, /richColors/);
  });
});

describe('main.jsx — Toaster toast classNames config', () => {
  it('declares toastOptions.classNames block', () => {
    assert.match(src, /toastOptions/);
    assert.match(src, /classNames/);
  });

  it('maps error toasts to "toast-error" class', () => {
    assert.match(src, /error:\s*['"]toast-error['"]/);
  });

  it('maps success toasts to "toast-success" class', () => {
    assert.match(src, /success:\s*['"]toast-success['"]/);
  });

  it('maps warning toasts to "toast-warning" class', () => {
    assert.match(src, /warning:\s*['"]toast-warning['"]/);
  });

  it('maps info toasts to "toast-info" class', () => {
    assert.match(src, /info:\s*['"]toast-info['"]/);
  });
});

describe('main.jsx — app shell setup', () => {
  it('wraps everything in ThemeProvider', () => {
    assert.match(src, /ThemeProvider/);
  });

  it('forces light theme', () => {
    assert.match(src, /forcedTheme=["']light["']/);
  });

  it('mounts the App component', () => {
    assert.match(src, /<App/);
  });

  it('initializes browser observability before rendering', () => {
    assert.match(src, /initBrowserObservability/);
  });
});
