// @covers tools/app-shell/src/main.jsx
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ETP-6155 guardrail — Phosphor is the only icon library of the app.
 *
 * The UI used to mix lucide, Phosphor and hand-drawn SVG icons, so the same action could look
 * different from one window to the next. Every icon now comes from `@phosphor-icons/react`.
 * This fails on a source file (tests included, since a mock of a removed library hides a real
 * import) that brings an icon in from lucide or from the hand-drawn sets that were replaced.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SHELL = join(__dirname, '..');
const REPO = join(APP_SHELL, '..', '..');
const ROOTS = [join(APP_SHELL, 'src'), join(REPO, 'artifacts')];

const BANNED_MODULES = [
  'lucide-react',
  '@/components/ui/custom-icons',
  '@/components/ui/box-icon',
  '@/components/attachments/AttachmentIcon',
];

const QUOTED = (m) => `['"]${m.replace(/[.*+?^${}()|[\]\\/@]/g, '\\$&')}(\\.jsx?)?['"]`;
const BANNED_RE = new RegExp(`(from\\s+|import\\(\\s*|vi\\.mock\\(\\s*)(${BANNED_MODULES.map(QUOTED).join('|')})`);

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (/\.jsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('icon library policy (ETP-6155)', () => {
  it('no source file imports or mocks an icon library other than Phosphor', () => {
    const offenders = [];
    for (const root of ROOTS) {
      for (const file of collectSourceFiles(root)) {
        const match = readFileSync(file, 'utf8').match(BANNED_RE);
        if (match) offenders.push(`${relative(REPO, file).split(sep).join('/')}: ${match[2]}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'These files use an icon outside Phosphor:\n'
      + offenders.map((o) => `  - ${o}`).join('\n')
      + '\n\nImport the equivalent `*Icon` from @phosphor-icons/react (regular weight).\n',
    );
  });

  it('the same action uses the same Phosphor icon (no near-duplicate variants)', () => {
    const variants = ['PlusCircleIcon', 'NotePencilIcon', 'FileArrowDownIcon', 'FileArrowUpIcon'];
    const re = new RegExp(`\\b(${variants.join('|')})\\b`);
    // Different concept by design: the bank-statement import banner, not a download action.
    const allowed = ['tools/app-shell/src/components/financial-accounts/BankSyncIcon.jsx'];
    const offenders = [];
    for (const root of ROOTS) {
      for (const file of collectSourceFiles(root)) {
        if (allowed.includes(relative(REPO, file).split(sep).join('/'))) continue;
        if (/__tests__|\.test\.|\.vitest\./.test(file)) continue;
        const match = readFileSync(file, 'utf8').match(re);
        if (match) offenders.push(`${relative(REPO, file).split(sep).join('/')}: ${match[1]}`);
      }
    }
    assert.deepEqual(offenders, [], 'Use the canonical icon: PlusIcon, PencilSimpleIcon, DownloadSimpleIcon, UploadSimpleIcon.');
  });

  it('the replaced hand-drawn shims are gone and Phosphor is deduped to one instance', () => {
    for (const shim of ['custom-icons.jsx', 'box-icon.jsx']) {
      assert.equal(existsSync(join(APP_SHELL, 'src/components/ui', shim)), false, `${shim} must not exist`);
    }
    for (const cfg of ['vite.config.js', 'vitest.config.js']) {
      assert.match(readFileSync(join(APP_SHELL, cfg), 'utf8'), /'@phosphor-icons\/react'/, `${cfg} dedupe`);
    }
  });
});
