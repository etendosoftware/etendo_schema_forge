import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AppShellRuntime.js'), 'utf8');

test('AppShellRuntime accepts children and layout props', () => {
  // Verify the function signature includes children and layout parameters
  assert.match(src, /function AppShellRuntime\s*\(\s*\{[\s\S]*?children[\s\S]*?\}\s*\)/,
    'AppShellRuntime should accept children prop');
  assert.match(src, /function AppShellRuntime\s*\(\s*\{[\s\S]*?layout[\s\S]*?\}\s*\)/,
    'AppShellRuntime should accept layout prop');
});

test('AppShellRuntime defaults layout to ShellLayout', () => {
  // Verify the layout parameter has a default value of ShellLayout
  assert.match(src, /layout:\s*Layout\s*=\s*ShellLayout/,
    'layout parameter should default to ShellLayout');
});

test('AppShellRuntime renders children inside AppShellProviders and Routes', () => {
  // Verify children are rendered after AppShellProviders starts
  assert.match(src, /AppShellProviders[\s\S]*?\{children\}/,
    'children should be rendered inside AppShellProviders');
  // Verify they come before Routes
  assert.match(src, /\{children\}[\s\S]*?<Routes/,
    'children should be rendered before Routes in the tree');
});

test('AppShellRuntime uses the Layout component instead of hardcoded ShellLayout', () => {
  // Verify ShellLayout is not used directly as an element tag
  assert.match(src, /<Layout/,
    'Layout component should be used (not hardcoded ShellLayout)');
  // Verify ShellLayout is no longer used as a JSX element in the render
  const hasDirectShellLayoutUsage = /<ShellLayout[\s\S]*?menuGroups=\{runtime\.menuGroups\}/.test(src);
  assert.equal(hasDirectShellLayoutUsage, false,
    'ShellLayout should not be used directly; Layout should be used instead');
});
