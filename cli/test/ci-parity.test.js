import { after, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  // constants
  PHASES,
  DEFAULT_PROFILE,
  DEFAULT_BBDD_SID,
  FRESHNESS,
  SECRET_KEY_RE,
  REDACTED,
  CI_GRADLE_COMMANDS,
  CI_ADDED_PROPERTIES,
  PROTECTED_BRANCHES,
  UNPINNED_POLICIES,
  DEFAULT_UNPINNED_POLICY,
  // redaction
  redactValue,
  redactProperties,
  redactObject,
  // module lists
  parseCommaModuleList,
  parseNewlineModuleList,
  parseModuleList,
  moduleNameFromUrl,
  // layout
  resolveCoreDir,
  resolveListPath,
  // profile
  branchPolicySourceFor,
  buildProfile,
  // branches
  isHotfixBranch,
  isFeatureBranch,
  isProtectedBranch,
  expectedCheckoutChain,
  buildAlignCheckoutCommands,
  unpinnedCheckoutChain,
  resolveExpectedBranch,
  aheadRiskFor,
  // dirt
  parsePorcelainPaths,
  isBuildOutputPath,
  classifyDirtyPaths,
  summarizePaths,
  // classification
  classifyModules,
  // git freshness
  upstreamFreshness,
  fetchRepo,
  probeRepo,
  // properties
  parseGradleProperties,
  buildParityGradleProperties,
  renderPropertiesDiff,
  normalizeSid,
  SID_RE,
  assertSidGuard,
  // plans
  buildAlignPlan,
  buildDbPlan,
  buildInstallPlan,
  parseArgs,
  // exec seam
  runChild,
  secretEnvValues,
} from '../src/ci-parity.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------
// Fixtures. NOTHING here is read from the real etendo_core checkout, and no
// test shells out to git/psql/gradle: every function under test is pure and is
// fed fixture strings, fixture probe objects or an injected `exists` predicate.
// The gradle.properties fixture is hand-written on purpose — the real file on a
// dev machine holds live GitHub/nexus/DB credentials.
// ---------------------------------------------------------------------------

const GRADLE_FIXTURE = [
  '# hand-written fixture, NOT the real gradle.properties',
  'bbdd.sid=etendo',
  'bbdd.port=5432',
  'bbdd.systemUser=postgres',
  'bbdd.systemPassword=fixture-system-pass',
  'bbdd.password=fixture-user-pass',
  'githubToken=ghp_fixture000000000000000000000000',
  'nexusPassword=fixture-nexus-pass',
  'org.gradle.java.home=/opt/java/17',
  'docker_com.etendoerp.docker_db=true',
  'etendo.db.image=pgvector/pgvector:pg16',
  '',
].join('\n');

/** The 8 modules pinned to the epic branch with no $GIT_BRANCH override. */
const HARDCODED_MODULES = [
  'com.etendoerp.sif.general',
  'com.smf.ticketbai',
  'com.etendoerp.verifactu',
  'org.openbravo.module.aeat347apr.es',
  'org.openbravo.module.aeat390.es',
  'org.openbravo.module.intrastat',
  'org.openbravo.module.sii',
  'org.openbravo.module.taxreportlauncher',
];

const BRANCH_POLICY = {
  developBranch: 'develop',
  mainBranch: 'main',
  epicBranch: 'epic/ETP-3504',
  coreHardcodedBranch: 'epic/ETP-3504',
  hardcodedBranchModules: [...HARDCODED_MODULES],
};

/** newline list, `#` comments + blank lines, as pipelines/extra-modules.txt. */
const SF_LIST = [
  '# Extra modules cloned into ${CORE_DIR}/modules/',
  '# One SSH URL per line.',
  '',
  'git@bitbucket.org:koodu_software/com.etendoerp.sif.general.git',
  'git@bitbucket.org:koodu_software/com.smf.ticketbai.git   # trailing comment',
  '',
  'git@bitbucket.org:koodu_software/org.openbravo.module.sii.git',
  '',
].join('\n');

/** comma list, one line, as modules/com.etendoerp.go/jenkinsExtraModules.txt. */
const GO_LIST = 'git@bitbucket.org:koodu_software/com.smf.ticketbai.git,'
  + 'git@github.com:etendosoftware/com.etendoerp.db.extended.git,'
  + 'git@github.com:etendosoftware/com.etendoerp.psd2.bank.integration.git,';

const CONFIG_FIXTURE = {
  moduleListFiles: {
    schemaForgeCi: {
      path: 'pipelines/extra-modules.txt',
      relativeTo: 'repo',
      format: 'newline',
      reason: 'Cloned from source by this repo CI.',
    },
    go: {
      path: 'modules/com.etendoerp.go/jenkinsExtraModules.txt',
      relativeTo: 'core',
      format: 'comma',
      reason: 'Cloned from source by the Go repo CI.',
    },
  },
  branchPolicy: BRANCH_POLICY,
  profiles: {
    union: {
      description: 'union of both lists',
      reason: 'satisfies both CI jobs',
      unpinnedPolicy: 'report-only',
      sourceLists: ['schemaForgeCi', 'go'],
      warnPublishedJarAgainst: 'schemaForgeCi',
      alwaysSource: [
        { name: 'com.etendoerp.go', url: 'git@github.com:etendosoftware/com.etendoerp.go.git', reason: 'runtime module' },
      ],
      excluded: [{ name: 'com.etendoerp.docker', reason: 'local dev infrastructure' }],
    },
    'no-policy': {
      sourceLists: ['schemaForgeCi'],
      alwaysSource: [],
      excluded: [],
    },
    'bad-policy': {
      unpinnedPolicy: 'align-everything',
      sourceLists: ['schemaForgeCi'],
      alwaysSource: [],
      excluded: [],
    },
    'bad-list': {
      sourceLists: ['does-not-exist'],
      alwaysSource: [],
      excluded: [],
    },
  },
};

const LIST_CONTENTS = { schemaForgeCi: SF_LIST, go: GO_LIST };

function buildUnionProfile() {
  return buildProfile({ profileName: 'union', config: CONFIG_FIXTURE, listContents: LIST_CONTENTS });
}

/** A minimal profile shaped exactly like buildProfile()'s return value. */
function makeProfile(required, excluded = [], unpinnedPolicy = 'report-only') {
  return {
    name: 'test-profile',
    description: '',
    reason: '',
    unpinnedPolicy,
    required,
    excluded,
    publishedJarWarn: [],
  };
}

function req(name, overrides = {}) {
  return {
    name,
    url: `git@example.com:org/${name}.git`,
    reason: `required: ${name}`,
    source: 'schemaForgeCi',
    branchPolicySource: 'jenkinsfile-chain',
    ...overrides,
  };
}

function byName(rows) {
  return new Map(rows.map((r) => [r.name, r]));
}

// ===========================================================================
// Constants
// ===========================================================================

describe('constants', () => {
  it('declares the four phases in execution order', () => {
    assert.deepEqual(PHASES, ['verify', 'align', 'db', 'install']);
  });

  it('defaults to the union profile and an isolated sid', () => {
    assert.equal(DEFAULT_PROFILE, 'union');
    assert.equal(DEFAULT_BBDD_SID, 'etendo_ci');
    assert.notEqual(DEFAULT_BBDD_SID, 'etendo', 'the default sid must never be the usual local dev sid');
  });

  it('mirrors the four gradle commands CI runs, install last and consistency ignored', () => {
    assert.equal(CI_GRADLE_COMMANDS.length, 4);
    assert.deepEqual(CI_GRADLE_COMMANDS, [
      './gradlew prepareConfig --info --stacktrace',
      './gradlew setup --info --stacktrace',
      './gradlew expandModules --info --stacktrace',
      './gradlew install -PignoreConsistency=true --info --stacktrace',
    ]);
  });

  it('protects develop, main and master', () => {
    assert.deepEqual(PROTECTED_BRANCHES, ['develop', 'main', 'master']);
  });

  it('accepts exactly two unpinned policies and defaults to the reporting one', () => {
    assert.deepEqual(UNPINNED_POLICIES, ['report-only', 'develop-then-branch']);
    assert.equal(DEFAULT_UNPINNED_POLICY, 'report-only');
  });

  it('adds only the three keys CI generates that a local file may lack', () => {
    assert.deepEqual(CI_ADDED_PROPERTIES, {
      'allow.root': 'true',
      'org.gradle.jvmargs': '-Dfile.encoding=UTF-8',
      'org.gradle.daemon': 'false',
    });
  });

  it('matches every secret-looking key shape, case-insensitively', () => {
    for (const key of ['bbdd.password', 'bbdd.systemPassword', 'githubToken', 'nexusPassword',
      'PGPASSWORD', 'API_SECRET', 'privateKey']) {
      assert.ok(SECRET_KEY_RE.test(key), `${key} must be treated as secret`);
    }
    for (const key of ['bbdd.sid', 'bbdd.port', 'bbdd.systemUser', 'org.gradle.java.home',
      'etendo.db.image', 'allow.root']) {
      assert.ok(!SECRET_KEY_RE.test(key), `${key} must NOT be treated as secret`);
    }
    assert.equal(REDACTED, '***');
  });
});

// ===========================================================================
// Redaction (regression 5)
// ===========================================================================

describe('redactValue', () => {
  it('blanks secret-looking keys and returns other values as strings', () => {
    assert.equal(redactValue('githubToken', 'ghp_live'), REDACTED);
    assert.equal(redactValue('bbdd.password', 'hunter2'), REDACTED);
    assert.equal(redactValue('bbdd.sid', 'etendo_ci'), 'etendo_ci');
    assert.equal(redactValue('bbdd.port', 5432), '5432');
  });

  it('decides by key, not by the shape of the value', () => {
    // A value that LOOKS like a credential under a harmless key stays visible…
    assert.equal(redactValue('bbdd.sid', 'ghp_looks_like_a_token'), 'ghp_looks_like_a_token');
    // …and a harmless value under a secret key is still blanked.
    assert.equal(redactValue('nexusPassword', 'public'), REDACTED);
  });
});

describe('redactProperties', () => {
  const redacted = redactProperties(GRADLE_FIXTURE);
  const lines = redacted.split('\n');

  it('blanks every secret-looking key in a properties blob', () => {
    for (const key of ['bbdd.systemPassword', 'bbdd.password', 'githubToken', 'nexusPassword']) {
      assert.ok(lines.includes(`${key}=${REDACTED}`), `${key} must be redacted`);
    }
  });

  it('leaks no fixture secret value anywhere in the output', () => {
    for (const secret of ['fixture-system-pass', 'fixture-user-pass', 'fixture-nexus-pass',
      'ghp_fixture000000000000000000000000']) {
      assert.ok(!redacted.includes(secret), `redacted output still contains ${secret}`);
    }
  });

  it('preserves non-secret keys, comments and line count verbatim', () => {
    for (const line of ['bbdd.sid=etendo', 'bbdd.port=5432', 'bbdd.systemUser=postgres',
      'org.gradle.java.home=/opt/java/17', 'docker_com.etendoerp.docker_db=true',
      'etendo.db.image=pgvector/pgvector:pg16',
      '# hand-written fixture, NOT the real gradle.properties']) {
      assert.ok(lines.includes(line), `${line} must survive untouched`);
    }
    assert.equal(lines.length, GRADLE_FIXTURE.split('\n').length);
  });

  it('blanks a PROPERTIES-SHAPED PGPASSWORD line and keeps indentation', () => {
    // Scope note: `key=value` at the start of a line. A shell command that
    // merely CONTAINS an assignment is a different shape — see below.
    assert.equal(redactProperties('PGPASSWORD=live-secret'), `PGPASSWORD=${REDACTED}`);
    assert.equal(redactProperties('  githubToken = ghp_x'), `  githubToken = ${REDACTED}`);
  });

  it('covers properties-shaped lines ONLY — by design, not by omission', () => {
    // INVARIANT, not a defect. The redactor is anchored on `^\s*<key>\s*=`, so
    // a log line like `  $ PGPASSWORD='…' psql …` passes through verbatim: the
    // `$ ` prefix breaks the anchor. That is sufficient — and deliberate —
    // because no command STRING ever carries a secret. Steps that need one hand
    // the executor argv plus the NAME of an env var (see buildDbPlan's `exec`),
    // so the value is injected into the child environment and never enters a
    // string that is printed or logged.
    //
    // DO NOT "fix" this by teaching the redactor to scan command lines. A
    // second redactor was considered and deliberately not added: it would make
    // a command-string form look safe and invite exactly the leak the argv form
    // removes. A change that reintroduces a command string containing a secret
    // must be REJECTED, not patched here.
    const logLine = "  $ PGPASSWORD='hunter2' psql -h localhost -d postgres -c \"DROP DATABASE IF EXISTS etendo_ci;\"";
    assert.equal(redactProperties(logLine), logLine, 'command lines pass through untouched');
  });

  it('leaves lines that are not key=value alone', () => {
    assert.equal(redactProperties('just some prose'), 'just some prose');
    assert.equal(redactProperties(''), '');
  });
});

describe('redactObject', () => {
  it('redacts secret keys nested in objects and in arrays', () => {
    const out = redactObject({
      sid: 'etendo_ci',
      db: { host: 'localhost', password: 'live-secret' },
      creds: [{ githubToken: 'ghp_live' }, { nexusPassword: 'live' }],
      steps: [{ commands: ['psql -U postgres'] }],
    });
    assert.equal(out.sid, 'etendo_ci');
    assert.equal(out.db.host, 'localhost');
    assert.equal(out.db.password, REDACTED);
    assert.equal(out.creds[0].githubToken, REDACTED);
    assert.equal(out.creds[1].nexusPassword, REDACTED);
    assert.deepEqual(out.steps, [{ commands: ['psql -U postgres'] }]);
  });

  it('decides by key and leaves credential-looking values under harmless keys', () => {
    const out = redactObject({ reason: 'set githubToken=ghp_x in gradle.properties' });
    assert.equal(out.reason, 'set githubToken=ghp_x in gradle.properties');
  });

  it('passes primitives and null through unchanged', () => {
    assert.equal(redactObject('plain'), 'plain');
    assert.equal(redactObject(7), 7);
    assert.equal(redactObject(null), null);
    assert.deepEqual(redactObject(['a', 1]), ['a', 1]);
  });
});

// ===========================================================================
// Module lists (regression 8)
// ===========================================================================

describe('parseCommaModuleList', () => {
  it('parses the single-line comma format and drops the trailing empty entry', () => {
    assert.deepEqual(parseCommaModuleList(GO_LIST), [
      'git@bitbucket.org:koodu_software/com.smf.ticketbai.git',
      'git@github.com:etendosoftware/com.etendoerp.db.extended.git',
      'git@github.com:etendosoftware/com.etendoerp.psd2.bank.integration.git',
    ]);
  });

  it('survives CRLF and surrounding whitespace', () => {
    assert.deepEqual(parseCommaModuleList('  a.git , b.git \r\n'), ['a.git', 'b.git']);
  });

  it('de-duplicates while keeping file order', () => {
    assert.deepEqual(parseCommaModuleList('a.git,b.git,a.git'), ['a.git', 'b.git']);
  });

  it('returns an empty list for empty input', () => {
    assert.deepEqual(parseCommaModuleList(''), []);
    assert.deepEqual(parseCommaModuleList('   '), []);
  });
});

describe('parseNewlineModuleList', () => {
  it('strips # comments and blank lines, keeping file order', () => {
    assert.deepEqual(parseNewlineModuleList(SF_LIST), [
      'git@bitbucket.org:koodu_software/com.etendoerp.sif.general.git',
      'git@bitbucket.org:koodu_software/com.smf.ticketbai.git',
      'git@bitbucket.org:koodu_software/org.openbravo.module.sii.git',
    ]);
  });

  it('strips a trailing comment on the same line as a URL', () => {
    assert.deepEqual(parseNewlineModuleList('a.git # why\nb.git'), ['a.git', 'b.git']);
  });

  it('survives CRLF line endings on plain URL lines', () => {
    assert.deepEqual(parseNewlineModuleList('a.git\r\nb.git\r\n'), ['a.git', 'b.git']);
  });

  it('strips # comments when the file uses CRLF line endings', () => {
    // FIXED: the parser now splits on /\r?\n/, so no trailing \r survives to
    // block `#.*$`. Previously `.` could not match the trailing \r (a line
    // terminator), `$` was unreachable after `#.*`, and the comment regex
    // silently no-opped — turning every comment line in a CRLF checkout of
    // pipelines/extra-modules.txt into a bogus module URL, with phantom
    // MISSING rows and `git clone <comment text>` steps in the align plan.
    assert.deepEqual(parseNewlineModuleList('a.git # why\r\n'), ['a.git']);
    assert.deepEqual(
      parseNewlineModuleList('# a comment line\r\ngit@host:org/mod.git\r\n'),
      ['git@host:org/mod.git'],
    );
  });

  it('parses a CRLF copy of the real extra-modules.txt identically to LF', () => {
    // The regression that matters: same file, both line endings, same result.
    const lf = readFileSync(
      path.join(REPO_ROOT, 'pipelines', 'extra-modules.txt'),
      'utf8',
    );
    const crlf = lf.replace(/\n/g, '\r\n');
    const fromLf = parseNewlineModuleList(lf);
    assert.deepEqual(parseNewlineModuleList(crlf), fromLf);
    assert.equal(fromLf.length, 8, 'the real list has 8 module URLs');
    assert.ok(
      fromLf.every((u) => u.startsWith('git@')),
      'no comment line may survive as a module URL',
    );
  });

  it('de-duplicates', () => {
    assert.deepEqual(parseNewlineModuleList('a.git\nb.git\na.git'), ['a.git', 'b.git']);
  });
});

describe('parseModuleList', () => {
  it('dispatches on the declared format', () => {
    assert.deepEqual(parseModuleList('a.git,b.git', 'comma'), ['a.git', 'b.git']);
    assert.deepEqual(parseModuleList('a.git\nb.git', 'newline'), ['a.git', 'b.git']);
  });

  it('refuses an unknown format instead of guessing', () => {
    assert.throws(() => parseModuleList('a.git', 'yaml'), /Unknown module list format: yaml/);
  });
});

describe('moduleNameFromUrl', () => {
  it('derives the directory name from both real list formats', () => {
    assert.equal(
      moduleNameFromUrl('git@bitbucket.org:koodu_software/com.etendoerp.sif.general.git'),
      'com.etendoerp.sif.general',
    );
    assert.equal(
      moduleNameFromUrl('git@github.com:etendosoftware/com.etendoerp.go.git'),
      'com.etendoerp.go',
    );
  });

  it('handles https URLs, a missing .git suffix and surrounding whitespace', () => {
    assert.equal(moduleNameFromUrl('https://github.com/etendosoftware/com.etendoerp.go.git'), 'com.etendoerp.go');
    assert.equal(moduleNameFromUrl('https://github.com/etendosoftware/com.etendoerp.go'), 'com.etendoerp.go');
    assert.equal(moduleNameFromUrl('  git@host:org/mod.git  '), 'mod');
  });

  it('keeps dots inside the module name (only a trailing .git is stripped)', () => {
    assert.equal(moduleNameFromUrl('git@host:org/org.openbravo.module.sii.git'), 'org.openbravo.module.sii');
  });

  it('strips the scp-style host prefix on a slash-less URL', () => {
    // The docstring claimed this worked while the implementation could not:
    // `split('/').pop()` had already removed every slash the old
    // `.replace(/:.*\//, '')` needed, so the pattern was unreachable and the
    // prefix survived. Defensive rather than load-bearing (every URL in both
    // real lists has a `/`), but the claim is now true.
    assert.equal(moduleNameFromUrl('git@github.com:com.etendoerp.go.git'), 'com.etendoerp.go');
    assert.equal(moduleNameFromUrl('host:mod.git'), 'mod');
  });

  it('does not mistake a colon inside ordinary text for an ssh host prefix', () => {
    // The prefix strip requires a whitespace-free segment before the colon, so
    // prose (a stray comment line reaching here) is not silently truncated.
    assert.equal(moduleNameFromUrl('some text: with a colon'), 'some text: with a colon');
  });
});

// ===========================================================================
// Porcelain parsing (regressions 1, 2, 3)
// ===========================================================================

describe('parsePorcelainPaths', () => {
  it('keeps the exact path when the two-column status starts with a SPACE', () => {
    // REGRESSION: `git status --porcelain` emits a 2-char status field, so an
    // unstaged deletion is ' D <path>'. An earlier trim()+slice(3) ate the
    // first character ('build/…' -> 'uild/…'), which then classified as source
    // dirt and wrongly blocked the module forever.
    assert.deepEqual(
      parsePorcelainPaths(' D build/classes/com/Foo.class'),
      ['build/classes/com/Foo.class'],
    );
    assert.deepEqual(parsePorcelainPaths(' M src/com/Foo.java'), ['src/com/Foo.java']);
  });

  it('parses untracked, staged and conflicted status fields', () => {
    assert.deepEqual(parsePorcelainPaths('?? build/tmp/x'), ['build/tmp/x']);
    assert.deepEqual(parsePorcelainPaths('M  src/a.java'), ['src/a.java']);
    assert.deepEqual(parsePorcelainPaths('MM src/a.java'), ['src/a.java']);
    assert.deepEqual(parsePorcelainPaths('UU src/a.java'), ['src/a.java']);
    assert.deepEqual(parsePorcelainPaths('A  src/new.java'), ['src/new.java']);
  });

  it('takes the DESTINATION of a rename/copy entry', () => {
    assert.deepEqual(parsePorcelainPaths('R  src/old.java -> src/new.java'), ['src/new.java']);
    assert.deepEqual(parsePorcelainPaths('C  a.java -> b.java'), ['b.java']);
  });

  it('unquotes a path that git quoted because it contains a space', () => {
    assert.deepEqual(parsePorcelainPaths('?? "a file.txt"'), ['a file.txt']);
  });

  it('still recovers the path when the leading space was already trimmed away', () => {
    assert.deepEqual(parsePorcelainPaths('D build/classes/A.class'), ['build/classes/A.class']);
  });

  it('parses a multi-line blob and drops blank lines', () => {
    const porcelain = ' D build/classes/A.class\n?? build/tmp/b\n M src/com/Foo.java\n\n';
    assert.deepEqual(parsePorcelainPaths(porcelain), [
      'build/classes/A.class', 'build/tmp/b', 'src/com/Foo.java',
    ]);
  });

  it('returns an empty list for a clean worktree', () => {
    assert.deepEqual(parsePorcelainPaths(''), []);
    assert.deepEqual(parsePorcelainPaths(null), []);
    assert.deepEqual(parsePorcelainPaths(undefined), []);
  });
});

describe('isBuildOutputPath', () => {
  it('treats a build/ prefix as disposable gradle output', () => {
    assert.equal(isBuildOutputPath('build/classes/A.class'), true);
    assert.equal(isBuildOutputPath('build/'), true);
  });

  it('does NOT treat a NESTED build/ segment as disposable', () => {
    // REGRESSION: being generous here would let align check out over real work.
    assert.equal(isBuildOutputPath('src/main/build/x'), false);
    assert.equal(isBuildOutputPath('web/build/bundle.js'), false);
  });

  it('rejects near-misses of the prefix', () => {
    assert.equal(isBuildOutputPath('buildSrc/x.gradle'), false);
    assert.equal(isBuildOutputPath('build.gradle'), false);
    assert.equal(isBuildOutputPath('/build/x'), false);
    assert.equal(isBuildOutputPath('src/com/Foo.java'), false);
  });
});

describe('classifyDirtyPaths', () => {
  it('is never build-only when ONE path lies outside build/', () => {
    // REGRESSION + the core safety guarantee of the align phase.
    const dirt = classifyDirtyPaths(['build/classes/A.class', 'src/com/Foo.java']);
    assert.equal(dirt.dirty, true);
    assert.equal(dirt.buildOnly, false);
    assert.deepEqual(dirt.buildPaths, ['build/classes/A.class']);
    assert.deepEqual(dirt.sourcePaths, ['src/com/Foo.java']);
  });

  it('is build-only when every path is tracked gradle output', () => {
    const dirt = classifyDirtyPaths(['build/classes/A.class', 'build/classes/B.class']);
    assert.equal(dirt.dirty, true);
    assert.equal(dirt.buildOnly, true);
    assert.deepEqual(dirt.sourcePaths, []);
  });

  it('is dirty but not build-only for source-only dirt', () => {
    const dirt = classifyDirtyPaths(['src/com/Foo.java']);
    assert.equal(dirt.dirty, true);
    assert.equal(dirt.buildOnly, false);
    assert.deepEqual(dirt.buildPaths, []);
  });

  it('is neither dirty nor build-only for a clean worktree', () => {
    for (const input of [[], undefined, null]) {
      const dirt = classifyDirtyPaths(input);
      assert.equal(dirt.dirty, false);
      assert.equal(dirt.buildOnly, false, 'an empty worktree must not be reported as build-only');
      assert.deepEqual(dirt.buildPaths, []);
      assert.deepEqual(dirt.sourcePaths, []);
    }
  });

  it('classifies a nested build/ path as source dirt', () => {
    const dirt = classifyDirtyPaths(['src/main/build/x']);
    assert.equal(dirt.buildOnly, false);
    assert.deepEqual(dirt.sourcePaths, ['src/main/build/x']);
  });
});

describe('summarizePaths', () => {
  it('lists up to max paths and counts the rest', () => {
    assert.equal(summarizePaths(['a', 'b']), '2 path(s): a, b');
    assert.equal(summarizePaths(['a', 'b', 'c', 'd', 'e']), '5 path(s): a, b, c, d, +1 more');
    assert.equal(summarizePaths(['a', 'b', 'c'], 2), '3 path(s): a, b, +1 more');
  });

  it('handles an empty list', () => {
    assert.equal(summarizePaths([]), '0 path(s): ');
  });
});

// ===========================================================================
// Layout resolution
// ===========================================================================

describe('resolveCoreDir', () => {
  it('prefers core as a SUBDIR of the repo (local layout)', () => {
    const exists = (p) => p === path.join('/repo', 'etendo_core', 'modules');
    assert.deepEqual(resolveCoreDir('/repo', exists), {
      coreDir: path.join('/repo', 'etendo_core'),
      layout: 'core-as-subdir',
    });
  });

  it('falls back to core as the PARENT of the repo (CI layout)', () => {
    const exists = (p) => p === path.join('/etendo_core', 'modules');
    assert.deepEqual(resolveCoreDir('/etendo_core/etendo_schema_forge', exists), {
      coreDir: '/etendo_core',
      layout: 'core-as-parent',
    });
  });

  it('prefers the subdir when BOTH candidates have modules/', () => {
    const { layout } = resolveCoreDir('/etendo_core/etendo_schema_forge', () => true);
    assert.equal(layout, 'core-as-subdir');
  });

  it('throws a resolution trace naming both probed paths', () => {
    assert.throws(() => resolveCoreDir('/repo', () => false), (err) => {
      assert.match(err.message, /Cannot locate the Etendo core directory/);
      assert.ok(err.message.includes(path.join('/repo', 'etendo_core', 'modules')));
      assert.ok(err.message.includes(path.join('/', 'modules')));
      assert.match(err.message, /core-as-subdir/);
      assert.match(err.message, /core-as-parent/);
      return true;
    });
  });
});

describe('resolveListPath', () => {
  it('resolves a repo-relative list against the repo root', () => {
    assert.equal(
      resolveListPath({ path: 'pipelines/extra-modules.txt', relativeTo: 'repo' }, { repoRoot: '/repo', coreDir: '/core' }),
      path.join('/repo', 'pipelines/extra-modules.txt'),
    );
  });

  it('resolves a core-relative list against the core dir', () => {
    assert.equal(
      resolveListPath({ path: 'modules/com.etendoerp.go/jenkinsExtraModules.txt', relativeTo: 'core' }, { repoRoot: '/repo', coreDir: '/core' }),
      path.join('/core', 'modules/com.etendoerp.go/jenkinsExtraModules.txt'),
    );
  });

  it('treats any relativeTo other than "core" as repo-relative', () => {
    assert.equal(
      resolveListPath({ path: 'a.txt' }, { repoRoot: '/repo', coreDir: '/core' }),
      path.join('/repo', 'a.txt'),
    );
  });
});

// ===========================================================================
// Profile building (regression 4)
// ===========================================================================

describe('branchPolicySourceFor', () => {
  it('marks the 8 Jenkinsfile-hardcoded modules as hardcoded', () => {
    for (const name of HARDCODED_MODULES) {
      assert.equal(
        branchPolicySourceFor({ name, source: 'go' }, CONFIG_FIXTURE),
        'jenkinsfile-hardcoded',
        `${name} is pinned by the Jenkinsfile`,
      );
    }
  });

  it('marks a module cloned by this repo CI as chain-grounded', () => {
    assert.equal(
      branchPolicySourceFor({ name: 'whatever', source: 'schemaForgeCi' }, CONFIG_FIXTURE),
      'jenkinsfile-chain',
    );
  });

  it('marks com.etendoerp.go as chain-grounded even from alwaysSource', () => {
    assert.equal(
      branchPolicySourceFor({ name: 'com.etendoerp.go', source: 'alwaysSource' }, CONFIG_FIXTURE),
      'jenkinsfile-chain',
    );
  });

  it('marks a module reachable only through the Go list as ungrounded', () => {
    assert.equal(
      branchPolicySourceFor({ name: 'com.etendoerp.db.extended', source: 'go' }, CONFIG_FIXTURE),
      'ungrounded',
    );
  });

  it('tolerates a policy with no hardcoded list', () => {
    assert.equal(branchPolicySourceFor({ name: 'x', source: 'go' }, { branchPolicy: {} }), 'ungrounded');
  });
});

describe('buildProfile', () => {
  it('merges alwaysSource first, then both lists, de-duplicated', () => {
    const profile = buildUnionProfile();
    assert.deepEqual(profile.required.map((m) => m.name), [
      'com.etendoerp.go',
      'com.etendoerp.sif.general',
      'com.smf.ticketbai',
      'org.openbravo.module.sii',
      'com.etendoerp.db.extended',
      'com.etendoerp.psd2.bank.integration',
    ]);
    // com.smf.ticketbai is in BOTH lists; the first occurrence wins.
    assert.equal(profile.required.filter((m) => m.name === 'com.smf.ticketbai').length, 1);
    assert.equal(byName(profile.required).get('com.smf.ticketbai').source, 'schemaForgeCi');
  });

  it('records a branchPolicySource on every required module', () => {
    const required = byName(buildUnionProfile().required);
    assert.equal(required.get('com.etendoerp.go').branchPolicySource, 'jenkinsfile-chain');
    assert.equal(required.get('com.smf.ticketbai').branchPolicySource, 'jenkinsfile-hardcoded');
    assert.equal(required.get('com.etendoerp.db.extended').branchPolicySource, 'ungrounded');
  });

  it('carries the URL and reason through so align can clone a MISSING module', () => {
    const go = byName(buildUnionProfile().required).get('com.etendoerp.go');
    assert.equal(go.url, 'git@github.com:etendosoftware/com.etendoerp.go.git');
    assert.equal(go.reason, 'runtime module');
    assert.equal(go.source, 'alwaysSource');
  });

  it('warns about modules the compared CI job resolves as a published JAR', () => {
    const { publishedJarWarn } = buildUnionProfile();
    assert.deepEqual(publishedJarWarn.map((w) => w.name), [
      'com.etendoerp.db.extended', 'com.etendoerp.psd2.bank.integration',
    ]);
    assert.match(publishedJarWarn[0].reason, /PUBLISHED JAR/);
    assert.match(publishedJarWarn[0].reason, /pipelines\/extra-modules\.txt/);
  });

  it('emits no published-JAR warning when the profile declares no comparison', () => {
    const profile = buildProfile({ profileName: 'no-policy', config: CONFIG_FIXTURE, listContents: LIST_CONTENTS });
    assert.deepEqual(profile.publishedJarWarn, []);
  });

  it('copies the excluded list', () => {
    assert.deepEqual(buildUnionProfile().excluded, [
      { name: 'com.etendoerp.docker', reason: 'local dev infrastructure' },
    ]);
  });

  it('defaults unpinnedPolicy to report-only when the profile omits it', () => {
    const profile = buildProfile({ profileName: 'no-policy', config: CONFIG_FIXTURE, listContents: LIST_CONTENTS });
    assert.equal(profile.unpinnedPolicy, 'report-only');
  });

  it('REFUSES an unrecognized unpinnedPolicy, naming both accepted values', () => {
    // REGRESSION: a silent fallback here decides whether 8 modules get aligned.
    assert.throws(
      () => buildProfile({ profileName: 'bad-policy', config: CONFIG_FIXTURE, listContents: LIST_CONTENTS }),
      (err) => {
        assert.match(err.message, /align-everything/);
        assert.match(err.message, /report-only/);
        assert.match(err.message, /develop-then-branch/);
        assert.match(err.message, /ci-parity-profiles\.json/);
        return true;
      },
    );
  });

  it('throws for an unknown profile, listing the available ones', () => {
    assert.throws(
      () => buildProfile({ profileName: 'nope', config: CONFIG_FIXTURE, listContents: LIST_CONTENTS }),
      (err) => {
        assert.match(err.message, /Unknown profile "nope"/);
        assert.match(err.message, /union/);
        return true;
      },
    );
  });

  it('throws when a profile references an undeclared list', () => {
    assert.throws(
      () => buildProfile({ profileName: 'bad-list', config: CONFIG_FIXTURE, listContents: LIST_CONTENTS }),
      /references unknown list "does-not-exist"/,
    );
  });

  it('treats a list with no supplied contents as empty rather than throwing', () => {
    const profile = buildProfile({ profileName: 'no-policy', config: CONFIG_FIXTURE, listContents: {} });
    assert.deepEqual(profile.required, []);
  });
});

describe('the shipped pipelines/ci-parity-profiles.json', () => {
  // In-repo config only: the fixture below stands in for the Go list, which
  // lives inside etendo_core and is deliberately not read here.
  const config = JSON.parse(readFileSync(path.join(REPO_ROOT, 'pipelines', 'ci-parity-profiles.json'), 'utf8'));
  const listContents = {
    schemaForgeCi: readFileSync(path.join(REPO_ROOT, 'pipelines', 'extra-modules.txt'), 'utf8'),
    go: GO_LIST,
  };

  it('builds every declared profile with a recognized unpinnedPolicy', () => {
    const names = Object.keys(config.profiles);
    assert.ok(names.includes(DEFAULT_PROFILE), 'the default profile must exist in the config');
    for (const profileName of names) {
      const profile = buildProfile({ profileName, config, listContents });
      assert.ok(UNPINNED_POLICIES.includes(profile.unpinnedPolicy), `${profileName} policy`);
      assert.ok(profile.required.length > 0, `${profileName} requires at least one module`);
      for (const m of profile.required) {
        assert.ok(m.name && m.url, `${profileName}: ${JSON.stringify(m)} needs a name and a url`);
      }
    }
  });

  it('keeps branchPolicy.hardcodedBranchModules equal to the 8 entries of extra-modules.txt', () => {
    // docs/ci-parity-install.md 1.2: "They are the eight entries of
    // pipelines/extra-modules.txt". If the two drift, modules get pinned to the
    // epic branch that CI never pins (or vice versa).
    const fromList = parseNewlineModuleList(listContents.schemaForgeCi).map(moduleNameFromUrl);
    assert.deepEqual([...fromList].sort(), [...config.branchPolicy.hardcodedBranchModules].sort());
  });
});

// ===========================================================================
// Branch predicates and checkout chains (regression 9)
// ===========================================================================

describe('branch predicates', () => {
  it('recognizes hotfix and feature prefixes only at the start', () => {
    assert.equal(isHotfixBranch('hotfix/#12-ETP-1'), true);
    assert.equal(isHotfixBranch('feature/ETP-1'), false);
    assert.equal(isHotfixBranch('release/hotfix/x'), false);
    assert.equal(isFeatureBranch('feature/ETP-5137'), true);
    assert.equal(isFeatureBranch('mergeblock/ETP-5137'), false);
    assert.equal(isFeatureBranch('epic/ETP-3504'), false);
  });

  it('protects develop, main and master, and nothing else', () => {
    assert.equal(isProtectedBranch('develop'), true);
    assert.equal(isProtectedBranch('main'), true);
    assert.equal(isProtectedBranch('master'), true);
    assert.equal(isProtectedBranch('epic/ETP-3504'), false);
    assert.equal(isProtectedBranch('feature/ETP-5137'), false);
    assert.equal(isProtectedBranch('origin/develop'), false);
    assert.equal(isProtectedBranch(null), false);
  });
});

describe('expectedCheckoutChain', () => {
  it('sends a hotfix build to main with NO develop fallback', () => {
    // pipelines/Jenkinsfile:171-184 — hotfix must never touch develop.
    const chain = expectedCheckoutChain({
      repoKind: 'module', moduleName: 'com.etendoerp.go', gitBranch: 'hotfix/#42-ETP-1', branchPolicy: BRANCH_POLICY,
    });
    assert.deepEqual(chain.candidates, ['main', 'hotfix/#42-ETP-1']);
    assert.equal(chain.pinned, false);
    assert.ok(!chain.commands.some((c) => c.includes('develop')), 'a hotfix chain must not mention develop');
    assert.equal(chain.commands[0], 'git checkout main');
  });

  it('sends a feature build to epic || develop, then the exact branch', () => {
    const chain = expectedCheckoutChain({
      repoKind: 'module', moduleName: 'com.etendoerp.go', gitBranch: 'feature/ETP-5137', branchPolicy: BRANCH_POLICY,
    });
    // Chain order: later candidate wins, so epic beats develop, and the exact
    // branch beats both — mirroring `checkout epic || checkout develop`.
    assert.deepEqual(chain.candidates, ['develop', 'epic/ETP-3504', 'feature/ETP-5137']);
    assert.equal(chain.commands[0], 'git checkout epic/ETP-3504 || git checkout develop');
    assert.match(chain.commands[1], /^git checkout feature\/ETP-5137 \|\| echo /);
    assert.equal(chain.pinned, false);
  });

  it('falls back to develop for a feature build when no epic is declared', () => {
    const chain = expectedCheckoutChain({
      repoKind: 'module',
      moduleName: 'com.etendoerp.go',
      gitBranch: 'feature/ETP-1',
      branchPolicy: { developBranch: 'develop', mainBranch: 'main' },
    });
    assert.deepEqual(chain.candidates, ['develop', 'feature/ETP-1']);
  });

  it('sends any other driving branch (mergeblock/*) to develop then the exact branch', () => {
    const chain = expectedCheckoutChain({
      repoKind: 'module', moduleName: 'com.etendoerp.go', gitBranch: 'mergeblock/ETP-5137', branchPolicy: BRANCH_POLICY,
    });
    assert.deepEqual(chain.candidates, ['develop', 'mergeblock/ETP-5137']);
    assert.ok(!chain.commands.some((c) => c.includes('epic/')), 'a mergeblock build has no epic step');
  });

  it('pins etendo_core to the epic branch on a non-hotfix build', () => {
    // pipelines/Jenkinsfile:188-196 — core's develop is behind the epic branch.
    const chain = expectedCheckoutChain({
      repoKind: 'core', gitBranch: 'mergeblock/ETP-5137', branchPolicy: BRANCH_POLICY,
    });
    assert.deepEqual(chain.candidates, ['epic/ETP-3504', 'mergeblock/ETP-5137']);
    assert.equal(chain.pinned, true);
    assert.equal(chain.commands[0], 'git checkout epic/ETP-3504');
    assert.match(chain.commands[1], /keeping epic\/ETP-3504/);
  });

  it('does NOT pin etendo_core on a hotfix build', () => {
    const chain = expectedCheckoutChain({
      repoKind: 'core', gitBranch: 'hotfix/#42-ETP-1', branchPolicy: BRANCH_POLICY,
    });
    assert.deepEqual(chain.candidates, ['main', 'hotfix/#42-ETP-1']);
    assert.equal(chain.pinned, false);
  });

  it('pins each of the 8 hardcoded modules to the epic branch, with no $GIT_BRANCH override', () => {
    // pipelines/Jenkinsfile:230-252 — these 8 differ from every other repo.
    for (const moduleName of HARDCODED_MODULES) {
      const chain = expectedCheckoutChain({
        repoKind: 'module', moduleName, gitBranch: 'mergeblock/ETP-5137', branchPolicy: BRANCH_POLICY,
      });
      assert.deepEqual(chain.candidates, ['epic/ETP-3504'], moduleName);
      assert.deepEqual(chain.commands, ['git checkout epic/ETP-3504'], moduleName);
      assert.equal(chain.pinned, true, moduleName);
    }
  });

  it('pins a hardcoded module even on a hotfix build', () => {
    const chain = expectedCheckoutChain({
      repoKind: 'module', moduleName: 'org.openbravo.module.sii', gitBranch: 'hotfix/#1-ETP-1', branchPolicy: BRANCH_POLICY,
    });
    assert.deepEqual(chain.candidates, ['epic/ETP-3504']);
    assert.equal(chain.pinned, true);
  });

  it('de-duplicates when the driving branch IS the first candidate', () => {
    const chain = expectedCheckoutChain({
      repoKind: 'schema-forge', gitBranch: 'develop', branchPolicy: BRANCH_POLICY,
    });
    assert.deepEqual(chain.candidates, ['develop']);
  });

  it('defaults develop/main when branchPolicy is absent', () => {
    const chain = expectedCheckoutChain({ repoKind: 'module', moduleName: 'x', gitBranch: 'topic' });
    assert.deepEqual(chain.candidates, ['develop', 'topic']);
    const hotfix = expectedCheckoutChain({ repoKind: 'module', moduleName: 'x', gitBranch: 'hotfix/1' });
    assert.deepEqual(hotfix.candidates, ['main', 'hotfix/1']);
  });
});

describe('unpinnedCheckoutChain', () => {
  it('uses the else-branch of checkoutChain: develop, then the driving branch', () => {
    // Deliberately never consults the epic branch — nothing grounds one here.
    const chain = unpinnedCheckoutChain({ gitBranch: 'mergeblock/ETP-5137', branchPolicy: BRANCH_POLICY });
    assert.deepEqual(chain.candidates, ['develop', 'mergeblock/ETP-5137']);
    assert.equal(chain.commands[0], 'git checkout develop');
    assert.match(chain.commands[1], /^git checkout mergeblock\/ETP-5137 \|\| echo /);
    assert.equal(chain.pinned, false);
    assert.ok(!chain.commands.some((c) => c.includes('epic/')));
  });

  it('de-duplicates and defaults the develop branch name', () => {
    assert.deepEqual(unpinnedCheckoutChain({ gitBranch: 'develop', branchPolicy: BRANCH_POLICY }).candidates, ['develop']);
    assert.deepEqual(unpinnedCheckoutChain({ gitBranch: 'topic' }).candidates, ['develop', 'topic']);
  });
});

describe('buildAlignCheckoutCommands', () => {
  it('fetches, then performs ONE checkout of the already-resolved branch', () => {
    // Deliberately not the CI chain: that chain carries an intermediate
    // `git checkout develop` and a trailing `|| echo` that swallows every
    // failure, which would leave a module parked on develop after any error.
    assert.deepEqual(buildAlignCheckoutCommands('epic/ETP-3504'), [
      'git fetch --all --prune', 'git checkout epic/ETP-3504',
    ]);
  });

  it('lets a failed checkout propagate instead of swallowing it', () => {
    const [, checkout] = buildAlignCheckoutCommands('feature/ETP-5137');
    assert.ok(!checkout.includes('||'), 'no fallback may hide a failed checkout');
    assert.ok(!checkout.includes('echo'));
  });

  it('THROWS rather than build a checkout of a protected branch', () => {
    for (const branch of PROTECTED_BRANCHES) {
      assert.throws(
        () => buildAlignCheckoutCommands(branch),
        new RegExp(`Refusing to build a checkout of the protected branch "${branch}"`),
      );
    }
  });
});

describe('resolveExpectedBranch', () => {
  it('picks the LAST candidate that exists, mirroring `checkout X || checkout Y`', () => {
    assert.equal(resolveExpectedBranch(['develop', 'epic/ETP-3504', 'feature/ETP-1'], ['develop', 'epic/ETP-3504']), 'epic/ETP-3504');
    assert.equal(resolveExpectedBranch(['develop', 'epic/ETP-3504', 'feature/ETP-1'], ['develop', 'epic/ETP-3504', 'feature/ETP-1']), 'feature/ETP-1');
    assert.equal(resolveExpectedBranch(['develop', 'epic/ETP-3504'], ['develop']), 'develop');
  });

  it('returns null when no candidate exists', () => {
    assert.equal(resolveExpectedBranch(['epic/ETP-3504'], ['develop']), null);
    assert.equal(resolveExpectedBranch([], ['develop']), null);
    assert.equal(resolveExpectedBranch(['develop'], []), null);
  });
});

describe('aheadRiskFor', () => {
  it('warns when a checkout would drop commits from the INSTALLED module', () => {
    // The real case: +11 on feature/ETP-5077 IS the pgvector work the union
    // profile exists to exercise from source. Moving to develop would install
    // a tree that looks aligned and silently lacks it.
    const risk = aheadRiskFor({
      name: 'com.etendoerp.db.extended', branch: 'feature/ETP-5077', ahead: 11, target: 'develop',
    });
    assert.deepEqual(
      { name: risk.name, branch: risk.branch, ahead: risk.ahead, target: risk.target },
      {
        name: 'com.etendoerp.db.extended', branch: 'feature/ETP-5077', ahead: 11, target: 'develop',
      },
    );
    assert.match(risk.message, /11 commit\(s\) AHEAD/);
    assert.match(risk.message, /DROPS them from the INSTALLED module/);
  });

  it('carries the real count, however large', () => {
    const risk = aheadRiskFor({
      name: 'com.etendoerp.psd2.bank.integration', branch: 'feature/ETP-5061', ahead: 162, target: 'develop',
    });
    assert.equal(risk.ahead, 162);
    assert.match(risk.message, /162 commit\(s\) AHEAD/);
  });

  it('treats a SINGLE commit ahead as a risk — the boundary is not swallowed', () => {
    const risk = aheadRiskFor({ name: 'm', branch: 'feature/x', ahead: 1, target: 'develop' });
    assert.notEqual(risk, null);
    assert.equal(risk.ahead, 1);
    assert.match(risk.message, /1 commit\(s\) AHEAD/);
  });

  it('stays silent when there is nothing to lose', () => {
    assert.equal(aheadRiskFor({ name: 'm', branch: 'develop', ahead: 0, target: 'epic/ETP-3504' }), null);
    assert.equal(aheadRiskFor({ name: 'm', branch: 'develop', ahead: -3, target: 'epic/ETP-3504' }), null,
      'a negative count (behind, not ahead) is not a work-loss risk');
    assert.equal(aheadRiskFor({ name: 'm', branch: 'develop', ahead: null, target: 'epic/ETP-3504' }), null);
    assert.equal(aheadRiskFor({ name: 'm', branch: 'develop', ahead: undefined, target: 'epic/ETP-3504' }), null);
  });

  it('stays silent when the checkout would not move the module', () => {
    assert.equal(aheadRiskFor({ name: 'm', branch: 'feature/x', ahead: 5, target: 'feature/x' }), null,
      'no move, no loss');
    assert.equal(aheadRiskFor({ name: 'm', branch: 'feature/x', ahead: 5, target: null }), null);
    assert.equal(aheadRiskFor({ name: 'm', branch: 'feature/x', ahead: 5, target: '' }), null);
  });
});

// ===========================================================================
// own-upstream freshness (regression 11)
// ===========================================================================

describe('upstreamFreshness', () => {
  it('keeps CI/develop divergence separate from whether a branch is current', () => {
    // A feature branch can have work develop lacks and still exactly match its
    // own remote. This is the distinction that the former AHEAD/BEHIND-only
    // table could not express.
    assert.equal(upstreamFreshness({ upstream: 'origin/feature/ETP-5077', upstreamAhead: 11, upstreamBehind: 0 }), 'AHEAD');
    assert.equal(upstreamFreshness({ upstream: 'origin/feature/ETP-5077', upstreamAhead: 0, upstreamBehind: 0 }), 'CURRENT');
  });

  it('identifies stale, diverged, unavailable, and untracked checkouts', () => {
    assert.equal(upstreamFreshness({ upstream: 'origin/develop', upstreamAhead: 0, upstreamBehind: 1 }), 'STALE');
    assert.equal(upstreamFreshness({ upstream: 'origin/develop', upstreamAhead: 2, upstreamBehind: 3 }), 'DIVERGED');
    assert.equal(upstreamFreshness({ upstream: 'origin/develop', upstreamAhead: null, upstreamBehind: 0 }), 'UNKNOWN');
    assert.equal(upstreamFreshness({ upstream: null, upstreamAhead: null, upstreamBehind: null }), 'NO-UPSTREAM');
    assert.deepEqual(FRESHNESS, ['CURRENT', 'AHEAD', 'STALE', 'DIVERGED', 'NO-UPSTREAM', 'UNKNOWN']);
  });
});

describe('fetchRepo and probeRepo', () => {
  it('fetches before probing when the checkout has git metadata', () => {
    const calls = [];
    const result = fetchRepo('/checkout', {
      exists: (p) => p.endsWith('/.git'),
      gitRun: (dir, args) => { calls.push({ dir, args }); return ''; },
    });
    assert.deepEqual(result, { attempted: true, ok: true });
    assert.deepEqual(calls, [{ dir: '/checkout', args: ['fetch', '--all', '--prune'] }]);
  });

  it('does not pretend a non-git directory was refreshed', () => {
    assert.deepEqual(fetchRepo('/stray', { exists: () => false }), { attempted: false, ok: null });
  });

  it('probes the configured upstream independently from origin/develop', () => {
    const calls = [];
    const responses = new Map([
      ['branch --show-current', 'feature/ETP-5077'],
      ['status --porcelain', ''],
      ['for-each-ref --format=%(refname:short) refs/heads refs/remotes/origin', 'feature/ETP-5077\norigin/feature/ETP-5077\ndevelop'],
      ['rev-list --count HEAD..origin/develop', '3'],
      ['rev-list --count origin/develop..HEAD', '11'],
      ['rev-parse --abbrev-ref --symbolic-full-name @{upstream}', 'origin/feature/ETP-5077'],
      ['rev-list --count HEAD..origin/feature/ETP-5077', '1'],
      ['rev-list --count origin/feature/ETP-5077..HEAD', '2'],
    ]);
    const probe = probeRepo('/checkout', {
      exists: (p) => p.endsWith('/.git') || p.endsWith('/AD_MODULE.xml'),
      gitRun: (dir, args) => {
        calls.push({ dir, args });
        return responses.get(args.join(' ')) ?? null;
      },
    });
    assert.equal(probe.ahead, 11, 'CI delta remains a comparison with origin/develop');
    assert.equal(probe.behind, 3);
    assert.equal(probe.upstream, 'origin/feature/ETP-5077');
    assert.equal(probe.upstreamAhead, 2);
    assert.equal(probe.upstreamBehind, 1);
    assert.equal(probe.freshness, 'DIVERGED');
    assert.ok(calls.some(({ args }) => args.join(' ') === 'rev-list --count HEAD..origin/feature/ETP-5077'));
  });
});

// ===========================================================================
// classifyModules (regression 10)
// ===========================================================================

describe('classifyModules', () => {
  const profile = makeProfile(
    [
      req('m-ok'),
      req('m-drift'),
      req('m-dirty'),
      req('m-dirty-build'),
      req('m-no-git'),
      req('m-missing'),
      req('m-ungrounded', { source: 'go', branchPolicySource: 'ungrounded' }),
    ],
    [{ name: 'com.etendoerp.docker', reason: 'local dev infrastructure; no CI equivalent' }],
  );

  const probes = {
    'm-ok': {
      hasGit: true, hasAdModule: true, branch: 'epic/ETP-3504', expectedBranch: 'epic/ETP-3504', dirtyPaths: [], ahead: 0, behind: 0,
    },
    'm-drift': {
      hasGit: true, hasAdModule: true, branch: 'develop', expectedBranch: 'epic/ETP-3504', dirtyPaths: [], ahead: 0, behind: 4,
    },
    'm-dirty': {
      hasGit: true, hasAdModule: true, branch: 'epic/ETP-3504', expectedBranch: 'epic/ETP-3504',
      dirtyPaths: ['build/classes/A.class', 'src/com/Foo.java'],
    },
    'm-dirty-build': {
      hasGit: true, hasAdModule: true, branch: 'epic/ETP-3504', expectedBranch: 'epic/ETP-3504',
      dirtyPaths: ['build/classes/A.class', 'build/classes/B.class'],
    },
    'm-no-git': { hasGit: false, hasAdModule: true },
    'm-ungrounded': {
      hasGit: true, hasAdModule: true, branch: 'feature/ETP-5077', expectedBranch: null, dirtyPaths: [], ahead: 11, behind: 0,
    },
    'stray-dir': { hasGit: false, hasAdModule: false },
    'm-extra': {
      hasGit: true, hasAdModule: true, branch: 'develop', dirtyPaths: [], ahead: 0, behind: 0,
    },
    'com.etendoerp.docker': { hasGit: true, hasAdModule: true, branch: 'main', dirtyPaths: [] },
  };

  const result = classifyModules({ profile, dirEntries: Object.keys(probes), probes });
  const rows = byName(result.rows);

  it('classifies every module directory', () => {
    assert.equal(rows.get('m-ok').status, 'OK');
    assert.equal(rows.get('m-drift').status, 'DRIFT');
    assert.equal(rows.get('m-dirty').status, 'DIRTY');
    assert.equal(rows.get('m-dirty-build').status, 'DIRTY-BUILD');
    assert.equal(rows.get('m-ungrounded').status, 'UNPINNED');
    assert.equal(rows.get('m-extra').status, 'EXTRA');
    assert.equal(rows.get('com.etendoerp.docker').status, 'EXCLUDED');
    assert.equal(rows.get('m-missing').status, 'MISSING');
  });

  it('marks a directory with neither .git nor AD_MODULE.xml as STRAY', () => {
    const row = rows.get('stray-dir');
    assert.equal(row.status, 'STRAY');
    assert.match(row.reason, /Neither \.git nor src-db\/database\/sourcedata\/AD_MODULE\.xml/);
    assert.equal(row.branch, null);
  });

  it('marks a required module with no .git as STRAY, because it cannot be aligned', () => {
    const row = rows.get('m-no-git');
    assert.equal(row.status, 'STRAY');
    assert.match(row.reason, /has no \.git/);
  });

  it('blocks ONLY the statuses align cannot resolve: STRAY and source-DIRTY', () => {
    assert.deepEqual(result.blockers.map((b) => b.name).sort(), ['m-dirty', 'm-no-git', 'stray-dir']);
    const blocked = new Set(result.blockers.map((b) => b.name));
    for (const name of ['m-dirty-build', 'm-ungrounded', 'com.etendoerp.docker', 'm-drift', 'm-missing', 'm-extra', 'm-ok']) {
      assert.ok(!blocked.has(name), `${name} must NOT be a blocker`);
    }
  });

  it('treats build-only dirt as a warning that a checkout restores', () => {
    const row = rows.get('m-dirty-build');
    assert.equal(row.dirtyBuildOnly, true);
    assert.match(row.reason, /Dirt confined to tracked gradle output/);
    assert.match(row.reason, /2 path\(s\)/);
  });

  it('reports source dirt with the offending paths and never the build ones', () => {
    const row = rows.get('m-dirty');
    assert.match(row.reason, /Uncommitted source changes/);
    assert.match(row.reason, /src\/com\/Foo\.java/);
    assert.ok(!row.reason.includes('build/classes/A.class'));
  });

  it('reports an ungrounded module without asserting a branch under report-only', () => {
    const row = rows.get('m-ungrounded');
    assert.equal(row.expectedBranch, null);
    assert.equal(row.branch, 'feature/ETP-5077');
    assert.match(row.reason, /Branch NOT asserted and NOT aligned/);
    assert.match(row.reason, /develop-then-branch/);
  });

  it('aligns an ungrounded module once the profile opts into develop-then-branch', () => {
    const opted = classifyModules({
      profile, dirEntries: ['m-ungrounded'], probes, unpinnedPolicy: 'develop-then-branch',
    });
    // expectedBranch is null in the probe, so nothing drifts — but the module
    // is no longer parked in UNPINNED.
    assert.equal(opted.rows[0].status, 'OK');
  });

  it('drifts an opted-in ungrounded module whose branch differs from the expectation', () => {
    const opted = classifyModules({
      profile,
      dirEntries: ['m-ungrounded'],
      probes: { 'm-ungrounded': { ...probes['m-ungrounded'], expectedBranch: 'develop' } },
      unpinnedPolicy: 'develop-then-branch',
    });
    assert.equal(opted.rows[0].status, 'DRIFT');
  });

  it('reports DRIFT (not DIRTY-BUILD) when a build-dirty module is also on the wrong branch, keeping both reasons', () => {
    const both = classifyModules({
      profile,
      dirEntries: ['m-drift'],
      probes: { 'm-drift': { ...probes['m-drift'], dirtyPaths: ['build/classes/A.class'] } },
    });
    const row = both.rows[0];
    assert.equal(row.status, 'DRIFT');
    assert.match(row.reason, /On develop, CI would resolve epic\/ETP-3504\./);
    assert.match(row.reason, /tracked gradle output/);
  });

  it('adds a MISSING row for a required module absent from modules/, carrying its clone URL', () => {
    const row = rows.get('m-missing');
    assert.equal(row.url, 'git@example.com:org/m-missing.git');
    assert.match(row.reason, /not present under modules\//);
    assert.equal(row.branch, null);
  });

  it('never inspects an excluded module beyond reporting it', () => {
    const row = rows.get('com.etendoerp.docker');
    assert.equal(row.expectedBranch, null);
    assert.equal(row.reason, 'local dev infrastructure; no CI equivalent');
  });

  it('sorts directory rows by name and appends MISSING rows last', () => {
    const names = result.rows.map((r) => r.name);
    const dirRows = names.slice(0, Object.keys(probes).length);
    assert.deepEqual(dirRows, [...dirRows].sort());
    assert.equal(names[names.length - 1], 'm-missing');
  });

  it('counts each status', () => {
    assert.deepEqual(result.counts, {
      EXCLUDED: 1, 'DIRTY-BUILD': 1, DIRTY: 1, DRIFT: 1, EXTRA: 1, STRAY: 2, OK: 1, UNPINNED: 1, MISSING: 1,
    });
  });

  it('returns nothing to do for an empty modules dir with an empty profile', () => {
    const empty = classifyModules({ profile: makeProfile([]), dirEntries: [], probes: {} });
    assert.deepEqual(empty.rows, []);
    assert.deepEqual(empty.blockers, []);
    assert.deepEqual(empty.counts, {});
  });
});

// ===========================================================================
// gradle.properties (regressions 6, 7)
// ===========================================================================

describe('parseGradleProperties', () => {
  it('parses key=value pairs and ignores comments', () => {
    const props = parseGradleProperties(GRADLE_FIXTURE);
    assert.equal(props.get('bbdd.sid'), 'etendo');
    assert.equal(props.get('org.gradle.java.home'), '/opt/java/17');
    assert.equal(props.size, 10);
    assert.equal(props.has('# hand-written fixture, NOT the real gradle.properties'), false);
  });

  it('ignores a commented-out assignment', () => {
    const props = parseGradleProperties('#bbdd.sid=commented\nbbdd.port=5432');
    assert.equal(props.has('bbdd.sid'), false);
    assert.equal(props.get('bbdd.port'), '5432');
  });

  it('tolerates whitespace around the separator and an empty value', () => {
    const props = parseGradleProperties('  a.b = c \nd.e=');
    assert.equal(props.get('a.b'), 'c ');
    assert.equal(props.get('d.e'), '');
  });

  it('lets a later assignment win', () => {
    assert.equal(parseGradleProperties('bbdd.sid=a\nbbdd.sid=b').get('bbdd.sid'), 'b');
  });
});

describe('buildParityGradleProperties', () => {
  const { text, changes } = buildParityGradleProperties(GRADLE_FIXTURE, { sid: 'etendo_ci' });
  const lines = text.split('\n');

  it('overrides bbdd.sid in place', () => {
    assert.ok(lines.includes('bbdd.sid=etendo_ci'));
    assert.ok(!lines.includes('bbdd.sid=etendo'));
    assert.deepEqual(changes.find((c) => c.key === 'bbdd.sid'), {
      key: 'bbdd.sid', from: 'etendo', to: 'etendo_ci', kind: 'override',
    });
  });

  it('adds allow.root=true, which CI generates and a local file lacks', () => {
    assert.ok(lines.includes('allow.root=true'));
    assert.ok(changes.some((c) => c.key === 'allow.root' && c.kind === 'add' && c.from === null));
  });

  it('adds the remaining CI-generated keys and marks the added block', () => {
    assert.ok(lines.includes('org.gradle.jvmargs=-Dfile.encoding=UTF-8'));
    assert.ok(lines.includes('org.gradle.daemon=false'));
    assert.ok(text.includes('# --- added by cli/src/ci-parity.js (CI parity) ---'));
  });

  it('PRESERVES every local key the build needs, verbatim', () => {
    // Deliberately a minimal diff, not CI's from-scratch rewrite: dropping any
    // of these breaks the local build (credentials, JDK, pgvector container).
    for (const line of ['githubToken=ghp_fixture000000000000000000000000',
      'nexusPassword=fixture-nexus-pass', 'org.gradle.java.home=/opt/java/17',
      'docker_com.etendoerp.docker_db=true', 'etendo.db.image=pgvector/pgvector:pg16',
      'bbdd.systemPassword=fixture-system-pass', 'bbdd.password=fixture-user-pass',
      'bbdd.port=5432', 'bbdd.systemUser=postgres',
      '# hand-written fixture, NOT the real gradle.properties']) {
      assert.ok(lines.includes(line), `${line} must be preserved verbatim`);
    }
  });

  it('reports exactly the four changes it made and nothing else', () => {
    assert.deepEqual(changes.map((c) => c.key), [
      'bbdd.sid', 'allow.root', 'org.gradle.jvmargs', 'org.gradle.daemon',
    ]);
  });

  it('records no change for a key that already holds the target value', () => {
    const already = buildParityGradleProperties('bbdd.sid=etendo_ci\nallow.root=true\norg.gradle.jvmargs=x\norg.gradle.daemon=false\n', { sid: 'etendo_ci' });
    assert.deepEqual(already.changes, []);
    assert.equal(already.text, 'bbdd.sid=etendo_ci\nallow.root=true\norg.gradle.jvmargs=x\norg.gradle.daemon=false\n');
  });

  it('appends bbdd.sid when the local file does not declare it', () => {
    const { text: out, changes: ch } = buildParityGradleProperties('bbdd.port=5432\n', { sid: 'etendo_ci' });
    assert.ok(out.split('\n').includes('bbdd.sid=etendo_ci'));
    assert.deepEqual(ch.find((c) => c.key === 'bbdd.sid'), {
      key: 'bbdd.sid', from: null, to: 'etendo_ci', kind: 'add',
    });
  });

  it('does not touch a commented-out bbdd.sid line', () => {
    const { text: out } = buildParityGradleProperties('#bbdd.sid=etendo\n', { sid: 'etendo_ci' });
    assert.ok(out.split('\n').includes('#bbdd.sid=etendo'));
  });
});

describe('renderPropertiesDiff', () => {
  it('never prints a secret value, in either direction', () => {
    const rendered = renderPropertiesDiff([
      { key: 'githubToken', from: 'ghp_old', to: 'ghp_new', kind: 'override' },
      { key: 'nexusPassword', from: null, to: 'live', kind: 'add' },
    ]);
    assert.ok(!rendered.includes('ghp_old'));
    assert.ok(!rendered.includes('ghp_new'));
    assert.ok(!rendered.includes('live'));
    assert.match(rendered, /~ githubToken: \*\*\* -> \*\*\*/);
    assert.match(rendered, /\+ nexusPassword=\*\*\*/);
  });

  it('shows non-secret values', () => {
    const rendered = renderPropertiesDiff([
      { key: 'bbdd.sid', from: 'etendo', to: 'etendo_ci', kind: 'override' },
      { key: 'allow.root', from: null, to: 'true', kind: 'add' },
    ]);
    assert.match(rendered, /~ bbdd\.sid: etendo -> etendo_ci/);
    assert.match(rendered, /\+ allow\.root=true/);
  });

  it('says so when there is nothing to change', () => {
    assert.match(renderPropertiesDiff([]), /no changes/);
  });
});

describe('normalizeSid', () => {
  it('folds the sid to lower case, exactly as PostgreSQL folds an unquoted identifier', () => {
    // Without this, BBDD_SID=Etendo2 slips past a guard watching for etendo2
    // and `DROP DATABASE Etendo2` destroys the developer's etendo2.
    assert.deepEqual(normalizeSid('Etendo2'), { ok: true, sid: 'etendo2', normalized: true });
    assert.deepEqual(normalizeSid('ETENDO_CI'), { ok: true, sid: 'etendo_ci', normalized: true });
  });

  it('reports an already-normal sid as unchanged and trims surrounding whitespace', () => {
    assert.deepEqual(normalizeSid('etendo_ci'), { ok: true, sid: 'etendo_ci', normalized: false });
    assert.deepEqual(normalizeSid('  etendo_ci  '), { ok: true, sid: 'etendo_ci', normalized: false });
  });

  it('accepts the shipped default and other plain identifiers', () => {
    for (const sid of [DEFAULT_BBDD_SID, '_etendo', 'etendo_ci_2', 'e']) {
      assert.equal(normalizeSid(sid).ok, true, `${sid} is a plain identifier`);
    }
  });

  it('REFUSES anything that is not a plain identifier, rather than escaping it', () => {
    // The sid is interpolated into SQL, so refusal is the whole defence.
    for (const sid of ['etendo; DROP DATABASE etendo2', "etendo'", 'etendo ci', 'etendo-ci',
      '"etendo"', '1etendo', 'etendo$', 'etendo\nci']) {
      const result = normalizeSid(sid);
      assert.equal(result.ok, false, `${JSON.stringify(sid)} must be refused`);
      assert.match(result.message, /not a plain PostgreSQL identifier/);
      assert.equal(result.sid, undefined, 'a refused sid must not hand back a usable value');
    }
  });

  it('refuses an empty or absent sid', () => {
    for (const sid of ['', '   ', null, undefined]) {
      const result = normalizeSid(sid);
      assert.equal(result.ok, false);
      assert.match(result.message, /Empty database sid/);
    }
  });

  it('validates the folded form, so a valid-looking upper-case sid is still checked', () => {
    assert.equal(normalizeSid('ETENDO-CI').ok, false, 'folding must not launder an invalid character');
    assert.ok(SID_RE.test('etendo_ci'));
    assert.ok(!SID_RE.test('Etendo_ci'), 'SID_RE describes the FOLDED form only');
  });
});

describe('assertSidGuard', () => {
  it('REFUSES a target sid equal to the local dev sid', () => {
    const guard = assertSidGuard({ targetSid: 'etendo', localSid: 'etendo', allowLocalSid: false });
    assert.equal(guard.ok, false);
    assert.equal(guard.warn, null);
    assert.match(guard.message, /Refusing to run/);
    assert.match(guard.message, /your local dev database/);
    assert.match(guard.message, new RegExp(`BBDD_SID=${DEFAULT_BBDD_SID}`));
    assert.match(guard.message, /ALLOW_LOCAL_SID=1/);
  });

  it('REFUSES a case variant of the local dev sid, and says why it matched', () => {
    // PostgreSQL folds unquoted identifiers, so Etendo2 and etendo2 are ONE
    // database. A case-sensitive comparison here drops the developer's data.
    const guard = assertSidGuard({ targetSid: 'Etendo2', localSid: 'etendo2', allowLocalSid: false });
    assert.equal(guard.ok, false);
    assert.match(guard.message, /Refusing to run/);
    assert.match(guard.message, /Matched after case-folding/);
    assert.equal(assertSidGuard({ targetSid: 'ETENDO', localSid: 'etendo', allowLocalSid: false }).ok, false);
    assert.equal(assertSidGuard({ targetSid: 'etendo', localSid: 'ETENDO', allowLocalSid: false }).ok, false);
  });

  it('compares against a local sid that carries stray whitespace', () => {
    assert.equal(assertSidGuard({ targetSid: 'etendo', localSid: '  etendo  ', allowLocalSid: false }).ok, false);
  });

  it('permits the same sid with an explicit override, but warns about the data loss', () => {
    const guard = assertSidGuard({ targetSid: 'etendo', localSid: 'etendo', allowLocalSid: true });
    assert.equal(guard.ok, true);
    assert.equal(guard.message, null);
    assert.match(guard.warn, /ALLOW_LOCAL_SID=1/);
    assert.match(guard.warn, /All local data is lost/);
  });

  it('permits a case variant with the override too', () => {
    const guard = assertSidGuard({ targetSid: 'Etendo2', localSid: 'etendo2', allowLocalSid: true });
    assert.equal(guard.ok, true);
    assert.match(guard.warn, /All local data is lost/);
  });

  it('passes silently for an isolated sid', () => {
    assert.deepEqual(
      assertSidGuard({ targetSid: 'etendo_ci', localSid: 'etendo', allowLocalSid: false }),
      { ok: true, warn: null, message: null },
    );
  });

  it('FAILS CLOSED when the local sid cannot be read', () => {
    // Nothing to compare against means no way to know the target is not the
    // developer's own database — and the db phase DROPs it.
    for (const localSid of [undefined, '', null]) {
      const guard = assertSidGuard({ targetSid: 'etendo_ci', localSid, allowLocalSid: false });
      assert.equal(guard.ok, false, `local sid ${JSON.stringify(localSid)} must fail closed`);
      assert.match(guard.message, /could not read bbdd\.sid/);
      assert.match(guard.message, /fails CLOSED/);
    }
  });

  it('fails closed even when the override is set, since there is nothing to override', () => {
    assert.equal(assertSidGuard({ targetSid: 'etendo_ci', localSid: undefined, allowLocalSid: true }).ok, false);
  });
});

// ===========================================================================
// Plans
// ===========================================================================

describe('buildAlignPlan', () => {
  const profile = makeProfile([
    req('m-drift'),
    req('m-missing'),
    req('m-missing-ungrounded', { source: 'go', branchPolicySource: 'ungrounded' }),
    req('m-dirty'),
    req('m-pinned', { name: 'org.openbravo.module.sii', branchPolicySource: 'jenkinsfile-hardcoded' }),
  ], [{ name: 'com.etendoerp.docker', reason: 'local dev infrastructure' }]);

  const baseArgs = {
    profile,
    coreDir: '/core',
    gitBranch: 'mergeblock/ETP-5137',
    branchPolicy: BRANCH_POLICY,
    timestamp: '2026-09-04T00-00-00-000Z',
  };

  function plan(rows, overrides = {}) {
    return buildAlignPlan({ ...baseArgs, rows, ...overrides });
  }

  function row(name, status, extra = {}) {
    return {
      name, status, branch: null, expectedBranch: null, dirty: false, ahead: null, behind: null, reason: `reason: ${name}`, ...extra,
    };
  }

  it('emits no step for OK, UNPINNED or DIRTY-BUILD rows', () => {
    const steps = plan([row('a', 'OK'), row('b', 'UNPINNED'), row('c', 'DIRTY-BUILD')]);
    assert.deepEqual(steps, []);
  });

  it('records an excluded module as a no-op skip', () => {
    const [step] = plan([row('com.etendoerp.docker', 'EXCLUDED')]);
    assert.equal(step.kind, 'skip');
    assert.deepEqual(step.commands, []);
    assert.match(step.description, /SKIPPED com\.etendoerp\.docker/);
  });

  it('blocks a dirty module instead of checking out over it', () => {
    const [step] = plan([row('m-dirty', 'DIRTY', { branch: 'epic/ETP-3504', expectedBranch: 'epic/ETP-3504' })]);
    assert.equal(step.kind, 'blocked');
    assert.equal(step.blocked, true);
    assert.deepEqual(step.commands, []);
    assert.equal(step.cwd, path.join('/core/modules', 'm-dirty'));
    assert.match(step.reason, /Commit or stash inside m-dirty/);
  });

  it('never PARKS a module the profile REQUIRES, even when it classifies STRAY', () => {
    // A required dir carrying AD_MODULE.xml but no .git classifies as STRAY.
    // Parking it would move a module the profile requires into
    // .modules-disabled/. Unreachable today only because STRAY is also a
    // blocker and main() refuses to execute with blockers present — a trap
    // primed for whoever adds --force, so it is refused at the decision point.
    for (const status of ['STRAY', 'EXTRA']) {
      const [step] = plan([row('m-drift', status)]);
      assert.equal(step.kind, 'blocked', `required ${status} must not be parked`);
      assert.equal(step.blocked, true);
      assert.deepEqual(step.commands, [], 'a blocked required module runs nothing');
      assert.match(step.reason, /Refusing to park a REQUIRED module/);
    }
  });

  it('PARKS a stray or extra directory by MOVING it, never deleting it', () => {
    const steps = plan([row('stray-dir', 'STRAY'), row('m-extra', 'EXTRA')]);
    for (const step of steps) {
      assert.equal(step.kind, 'park');
      assert.equal(step.cwd, '/core');
      assert.equal(step.commands.length, 2);
      assert.equal(step.commands[0], `mkdir -p ${path.join('/core', '.modules-disabled')}`);
      assert.match(step.commands[1], /^mv /);
      assert.ok(step.commands[1].endsWith('.2026-09-04T00-00-00-000Z'), 'parked dir is timestamped');
      for (const command of step.commands) {
        assert.ok(!/\brm\b|\bgit clean\b/.test(command), `destructive command in plan: ${command}`);
      }
    }
  });

  it('clones a MISSING module and checks out the resolved branch inside it', () => {
    const [step] = plan([row('m-missing', 'MISSING')]);
    assert.equal(step.kind, 'clone');
    assert.equal(step.cwd, '/core/modules');
    assert.deepEqual(step.commands, [
      'git clone git@example.com:org/m-missing.git m-missing',
      'git -C m-missing checkout mergeblock/ETP-5137',
    ]);
    assert.match(step.description, /CLONE m-missing -> mergeblock\/ETP-5137/);
  });

  it('clones an ungrounded MISSING module WITHOUT asserting a branch', () => {
    const [step] = plan([row('m-missing-ungrounded', 'MISSING')]);
    assert.equal(step.kind, 'clone');
    assert.deepEqual(step.commands, ['git clone git@example.com:org/m-missing-ungrounded.git m-missing-ungrounded']);
    assert.match(step.description, /no branch asserted/);
    assert.match(step.reason, /does not clone it/);
  });

  it('checks out a drifted module in ONE step, from its own directory', () => {
    const [step] = plan([row('m-drift', 'DRIFT', { branch: 'epic/ETP-3504', expectedBranch: 'mergeblock/ETP-5137' })]);
    assert.equal(step.kind, 'checkout');
    assert.equal(step.cwd, path.join('/core/modules', 'm-drift'));
    assert.deepEqual(step.commands, ['git fetch --all --prune', 'git checkout mergeblock/ETP-5137']);
    assert.match(step.description, /CHECKOUT m-drift: epic\/ETP-3504 -> mergeblock\/ETP-5137/);
  });

  it('checks out a Jenkinsfile-pinned module straight to the epic branch', () => {
    const [step] = plan([row('org.openbravo.module.sii', 'DRIFT', { branch: 'develop', expectedBranch: 'epic/ETP-3504' })]);
    assert.deepEqual(step.commands, ['git fetch --all --prune', 'git checkout epic/ETP-3504']);
  });

  it('checks out an opted-in ungrounded module in the same single step', () => {
    const [step] = plan([row('m-missing-ungrounded', 'DRIFT', { branch: 'develop', expectedBranch: 'mergeblock/ETP-5137' })]);
    assert.deepEqual(step.commands, ['git fetch --all --prune', 'git checkout mergeblock/ETP-5137']);
  });

  it('refuses to resolve a PROTECTED target branch, reporting it as manual instead', () => {
    for (const target of PROTECTED_BRANCHES) {
      const steps = plan([
        row('m-drift', 'DRIFT', { branch: 'feature/ETP-1', expectedBranch: target }),
        row('m-missing', 'MISSING', { expectedBranch: target }),
      ]);
      assert.equal(steps.length, 2);
      for (const step of steps) {
        assert.equal(step.kind, 'blocked', `${target} must not be resolved automatically`);
        assert.equal(step.blocked, true);
        assert.deepEqual(step.commands, [], `no command may run for target ${target}`);
        assert.match(step.description, new RegExp(`MANUAL .* protected branch "${target}"`));
        assert.match(step.reason, /never checks out develop\/main\/master/);
      }
      assert.ok(!steps.some((s) => s.kind === 'checkout' || s.kind === 'clone'),
        `a protected target must produce neither a checkout nor a clone (${target})`);
    }
  });

  it('attaches the ahead-of-develop warning to a blocked protected checkout', () => {
    const [step] = plan([row('com.etendoerp.db.extended', 'DRIFT', {
      branch: 'feature/ETP-5077', expectedBranch: 'develop', ahead: 11,
    })]);
    assert.equal(step.aheadRisk.ahead, 11);
    assert.match(step.description, /\[\+11 ahead of develop\]/);
    assert.match(step.reason, /DROPS them from the INSTALLED module/);
  });

  it('attaches the ahead-of-develop warning to a normal checkout too', () => {
    const [step] = plan([row('m-drift', 'DRIFT', {
      branch: 'feature/ETP-5077', expectedBranch: 'mergeblock/ETP-5137', ahead: 7,
    })]);
    assert.equal(step.kind, 'checkout');
    assert.equal(step.aheadRisk.ahead, 7);
    assert.match(step.reason, /7 commit\(s\) AHEAD/);
  });

  it('NEVER emits a command that checks out a protected branch, for any row', () => {
    // The literal form of the guarantee, over the whole plan rather than just
    // the resolved target: no emitted command may put a module on
    // develop/main/master, not even transiently. The CI chain's intermediate
    // `git checkout develop` is deliberately not reproduced here — align
    // performs a single checkout of the already-resolved branch.
    const everyRow = [
      row('m-drift', 'DRIFT', { branch: 'feature/ETP-1', expectedBranch: 'mergeblock/ETP-5137' }),
      row('m-missing', 'MISSING', { expectedBranch: 'mergeblock/ETP-5137' }),
      row('m-missing-ungrounded', 'DRIFT', { branch: 'develop', expectedBranch: 'mergeblock/ETP-5137' }),
      row('org.openbravo.module.sii', 'DRIFT', { branch: 'develop', expectedBranch: 'epic/ETP-3504' }),
      row('m-extra', 'EXTRA'),
      row('stray-dir', 'STRAY'),
      row('m-dirty', 'DIRTY'),
    ];
    for (const gitBranch of ['mergeblock/ETP-5137', 'feature/ETP-1', 'hotfix/#1-ETP-1', 'develop']) {
      for (const step of plan(everyRow, { gitBranch })) {
        for (const command of step.commands) {
          for (const protectedBranch of PROTECTED_BRANCHES) {
            assert.ok(
              !new RegExp(`checkout\\s+${protectedBranch}(\\s|$)`).test(command),
              `plan for ${gitBranch} checks out ${protectedBranch}: ${command}`,
            );
          }
        }
      }
    }
  });

  it('falls back to the last chain candidate when no expected branch was resolved', () => {
    const [step] = plan([row('m-drift', 'DRIFT', { branch: 'epic/ETP-3504', expectedBranch: null })]);
    assert.match(step.description, /-> mergeblock\/ETP-5137/);
  });

  it('keeps rows in order and plans nothing for an empty classification', () => {
    assert.deepEqual(plan([]), []);
    const steps = plan([row('m-dirty', 'DIRTY'), row('stray-dir', 'STRAY'), row('m-missing', 'MISSING')]);
    assert.deepEqual(steps.map((s) => s.kind), ['blocked', 'park', 'clone']);
  });
});

describe('buildAlignPlan — ahead-of-develop warning by unpinnedPolicy', () => {
  // End-to-end over the two functions that decide whether the +162 and +11
  // modules get moved: classifyModules picks the status, buildAlignPlan turns
  // it into a step. Both modules are ungrounded (reachable only through the Go
  // list), which is exactly the population unpinnedPolicy governs.
  const AHEAD = {
    'com.etendoerp.psd2.bank.integration': { branch: 'feature/ETP-5061', ahead: 162 },
    'com.etendoerp.db.extended': { branch: 'feature/ETP-5077', ahead: 11 },
  };
  const names = Object.keys(AHEAD);
  const profile = makeProfile(names.map((name) => req(name, { source: 'go', branchPolicySource: 'ungrounded' })));

  function probesWith(expectedBranch) {
    return Object.fromEntries(names.map((name) => [name, {
      hasGit: true,
      hasAdModule: true,
      branch: AHEAD[name].branch,
      expectedBranch,
      dirtyPaths: [],
      ahead: AHEAD[name].ahead,
      behind: 0,
    }]));
  }

  function planFor({ unpinnedPolicy, expectedBranch, gitBranch = 'mergeblock/ETP-5137' }) {
    const { rows } = classifyModules({
      profile, dirEntries: names, probes: probesWith(expectedBranch), unpinnedPolicy,
    });
    return {
      rows,
      steps: buildAlignPlan({
        rows, profile, coreDir: '/core', gitBranch, branchPolicy: BRANCH_POLICY, timestamp: 'TS',
      }),
    };
  }

  it('under the default report-only, plans nothing for them — so no step can carry an ahead risk', () => {
    const { rows, steps } = planFor({ unpinnedPolicy: 'report-only', expectedBranch: null });
    assert.deepEqual(rows.map((r) => r.status), ['UNPINNED', 'UNPINNED']);
    assert.deepEqual(steps, [], 'report-only must not move a module it cannot ground a branch for');
    assert.ok(!steps.some((s) => s.aheadRisk), 'no populated aheadRisk anywhere');
  });

  it('under develop-then-branch, every step for those modules carries a populated ahead risk', () => {
    const { rows, steps } = planFor({
      unpinnedPolicy: 'develop-then-branch', expectedBranch: 'mergeblock/ETP-5137',
    });
    assert.deepEqual(rows.map((r) => r.status), ['DRIFT', 'DRIFT']);
    assert.equal(steps.length, 2);
    for (const step of steps) {
      assert.equal(step.kind, 'checkout');
      assert.ok(step.aheadRisk, `${step.description} must carry the ahead risk`);
      assert.equal(step.aheadRisk.ahead, AHEAD[step.aheadRisk.name].ahead);
      assert.equal(step.aheadRisk.branch, AHEAD[step.aheadRisk.name].branch);
      assert.match(step.description, new RegExp(`\\[\\+${step.aheadRisk.ahead} ahead of develop\\]`));
      assert.match(step.reason, /DROPS them from the INSTALLED module/);
    }
    assert.deepEqual(steps.map((s) => s.aheadRisk.ahead).sort((a, b) => a - b), [11, 162]);
  });

  it('keeps the warning when develop-then-branch resolves the protected branch and blocks', () => {
    const { steps } = planFor({ unpinnedPolicy: 'develop-then-branch', expectedBranch: 'develop' });
    for (const step of steps) {
      assert.equal(step.kind, 'blocked');
      assert.deepEqual(step.commands, []);
      assert.ok(step.aheadRisk, 'a blocked step must still explain what would have been lost');
      assert.match(step.description, /not moved|MANUAL/);
    }
  });

  it('does not warn about a module that is level with develop', () => {
    const level = Object.fromEntries(names.map((name) => [name, {
      hasGit: true, hasAdModule: true, branch: 'develop', expectedBranch: 'mergeblock/ETP-5137', dirtyPaths: [], ahead: 0, behind: 2,
    }]));
    const { rows } = classifyModules({
      profile, dirEntries: names, probes: level, unpinnedPolicy: 'develop-then-branch',
    });
    const steps = buildAlignPlan({
      rows, profile, coreDir: '/core', gitBranch: 'mergeblock/ETP-5137', branchPolicy: BRANCH_POLICY, timestamp: 'TS',
    });
    assert.equal(steps.length, 2);
    for (const step of steps) {
      assert.equal(step.aheadRisk, null);
      assert.ok(!/ahead of develop/.test(step.description));
    }
  });
});

describe('buildDbPlan', () => {
  // The fixture carries a password field on purpose: the planner must never
  // copy a secret into anything printable, and the strongest way to show that
  // is to hand it one and prove it comes back out nowhere.
  const SYSTEM_PASSWORD = 'fixture-system-pass';
  const steps = buildDbPlan({
    dbConfig: {
      host: 'localhost', port: '5432', systemUser: 'postgres', systemPassword: SYSTEM_PASSWORD,
    },
    sid: 'etendo_ci',
  });

  it('terminates open backends BEFORE dropping, since a live connection blocks DROP', () => {
    assert.deepEqual(steps.map((s) => s.kind), ['db-terminate', 'db-drop']);
    assert.match(steps[0].commands[0], /pg_terminate_backend/);
    assert.match(steps[0].commands[0], /datname = 'etendo_ci'/);
    assert.match(steps[0].commands[0], /pid <> pg_backend_pid\(\)/);
  });

  it('drops the target database and nothing else, leaving creation to install', () => {
    assert.equal(steps.length, 2);
    assert.match(steps[1].commands[0], /DROP DATABASE IF EXISTS etendo_ci;/);
    assert.match(steps[1].reason, /install owns database creation/);
    assert.ok(!steps.some((s) => s.commands.some((c) => /createdb|CREATE DATABASE/i.test(c))));
  });

  it('keeps the PLAN free of the password, in every printable field', () => {
    // Scope note: this covers the PLAN only. The plan is what `--dry-run`
    // prints; it is not what executes. The executable form is asserted below.
    for (const step of steps) {
      const printable = JSON.stringify({
        description: step.description, commands: step.commands, reason: step.reason,
      });
      assert.ok(!printable.includes(SYSTEM_PASSWORD), `secret leaked into a printable field: ${printable}`);
      for (const command of step.commands) {
        assert.match(command, /PGPASSWORD=\*\*\*/);
        assert.match(command, /-h localhost -p 5432 -U postgres -d postgres/);
        assert.match(command, /ON_ERROR_STOP=1/);
      }
    }
  });

  it('carries an executable form that delivers the password through the ENV, not the argv', () => {
    // This is what makes the leak impossible by construction: the executor is
    // handed a program name, an argv array and the NAME of an env var. The
    // value is resolved by the executor, so it never exists inside a string
    // that gets printed, logged or word-split.
    for (const step of steps) {
      assert.ok(Array.isArray(step.exec) && step.exec.length === 1, `${step.kind} needs an exec form`);
      const [exec] = step.exec;
      assert.equal(exec.file, 'psql');
      assert.deepEqual(exec.secretEnv, ['PGPASSWORD']);
      assert.ok(Array.isArray(exec.args));
      for (const arg of exec.args) {
        assert.ok(!String(arg).includes(SYSTEM_PASSWORD), `secret leaked into argv: ${arg}`);
        assert.ok(!/PGPASSWORD/.test(String(arg)), `the password must not travel in argv: ${arg}`);
      }
      assert.ok(!('shell' in exec), 'db steps must not go through a shell');
    }
  });

  it('keeps commands[] and exec[] index-aligned, which the executor relies on', () => {
    // The live loop logs `step.commands[i]` as the display line for
    // `step.exec[i]`. If the two arrays ever diverge in length or order, a
    // command gets logged under the wrong description.
    for (const step of steps) {
      assert.equal(step.commands.length, step.exec.length, `${step.kind} display/exec mismatch`);
      step.exec.forEach((e, i) => {
        const sql = e.args[e.args.indexOf('-c') + 1];
        assert.ok(step.commands[i].includes(sql), `display[${i}] must describe exec[${i}]`);
      });
    }
  });

  it('passes the connection settings and the SQL as separate argv entries', () => {
    const [terminate, drop] = steps.map((s) => s.exec[0]);
    assert.deepEqual(terminate.args.slice(0, 10), [
      '-h', 'localhost', '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ]);
    assert.equal(terminate.args[10], '-c');
    assert.match(terminate.args[11], /^SELECT pg_terminate_backend/);
    assert.equal(drop.args[11], 'DROP DATABASE IF EXISTS etendo_ci;');
  });

  it('interpolates only a normalized identifier into the SQL', () => {
    // buildDbPlan trusts normalizeSid() upstream; this pins that the sid it was
    // handed reaches the SQL verbatim, so the guard compared the same database
    // the DROP will fold onto.
    const sql = steps.map((s) => s.exec[0].args[11]).join('\n');
    assert.ok(normalizeSid('etendo_ci').ok);
    assert.ok(sql.includes("datname = 'etendo_ci'"));
    assert.ok(sql.includes('DROP DATABASE IF EXISTS etendo_ci;'));
    assert.ok(!/[;'"]\s*(DROP|DELETE|--)/i.test(sql.replace(/DROP DATABASE IF EXISTS etendo_ci;/, '')));
  });
});

describe('buildInstallPlan', () => {
  const LOG_DIR = '/repo/tmp/ci-parity/TS';
  const steps = buildInstallPlan({ coreDir: '/core', logDir: LOG_DIR });
  const props = path.join('/core', 'gradle.properties');
  const backup = path.join(LOG_DIR, 'gradle.properties.backup');

  it('backs up, writes, runs the four CI gradle commands, then always restores', () => {
    assert.deepEqual(steps.map((s) => s.kind), [
      'props-backup', 'props-write', 'gradle', 'gradle', 'gradle', 'gradle', 'props-restore',
    ]);
    assert.deepEqual(steps.filter((s) => s.kind === 'gradle').map((s) => s.commands[0]), CI_GRADLE_COMMANDS);
  });

  it('keeps the backup OUT of etendo_core, since it holds every secret', () => {
    // A suffixed sibling (gradle.properties.backup.<ts>) would not be covered
    // by etendo_core/.gitignore, so a copy of every credential would show up
    // as an untracked file in the developer's checkout.
    assert.deepEqual(steps[0].commands, [`cp ${props} ${backup}`]);
    assert.ok(!backup.startsWith('/core'), 'the backup must not live inside the core checkout');
    assert.match(steps[0].description, /NOT beside the original/);
  });

  it('restores the original and then DELETES the backup copy of the secrets', () => {
    assert.deepEqual(steps[steps.length - 1].commands, [`cp ${backup} ${props}`, `rm ${backup}`]);
  });

  it('runs every step from the core dir', () => {
    for (const step of steps) assert.equal(step.cwd, '/core');
  });
});

// ===========================================================================
// parseArgs
// ===========================================================================

describe('parseArgs', () => {
  const ENV_KEYS = ['PROFILE', 'BBDD_SID', 'DRY_RUN', 'ALLOW_LOCAL_SID', 'NO_FETCH', 'JSON'];
  const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  after(() => {
    for (const k of ENV_KEYS) {
      if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
      else process.env[k] = ORIGINAL_ENV[k];
    }
  });

  it('defaults to a DRY RUN of all phases on the union profile', () => {
    assert.deepEqual(parseArgs([]), {
      phases: [...PHASES],
      profile: DEFAULT_PROFILE,
      sid: DEFAULT_BBDD_SID,
      sidRaw: DEFAULT_BBDD_SID,
      sidNormalized: false,
      dryRun: true,
      allowLocalSid: false,
      noFetch: false,
      json: false,
      help: false,
    });
  });

  it('normalizes the sid ONCE, here, before it can reach the guard or any SQL', () => {
    const args = parseArgs(['--bbdd-sid', 'Etendo2']);
    assert.equal(args.sid, 'etendo2', 'downstream only ever sees the folded form');
    assert.equal(args.sidRaw, 'Etendo2', 'the raw input is kept so the report can explain the fold');
    assert.equal(args.sidNormalized, true);
  });

  it('normalizes a sid that came from the environment too', () => {
    process.env.BBDD_SID = 'ETENDO_CI';
    const args = parseArgs([]);
    assert.equal(args.sid, 'etendo_ci');
    assert.equal(args.sidNormalized, true);
  });

  it('REFUSES an invalid sid outright, from a flag or from the environment', () => {
    assert.throws(() => parseArgs(['--bbdd-sid', 'etendo; DROP DATABASE etendo2']), /not a plain PostgreSQL identifier/);
    assert.throws(() => parseArgs(['--bbdd-sid', 'etendo ci']), /not a plain PostgreSQL identifier/);
    assert.throws(() => parseArgs(['--bbdd-sid', '']), /Empty database sid/);
    process.env.BBDD_SID = 'etendo-ci';
    assert.throws(() => parseArgs([]), /not a plain PostgreSQL identifier/);
  });

  it('turns off the dry run ONLY for the exact string 0', () => {
    assert.equal(parseArgs(['--dry-run', '0']).dryRun, false);
    assert.equal(parseArgs(['--dry-run', '1']).dryRun, true);
    assert.equal(parseArgs(['--dry-run', 'false']).dryRun, true);
    assert.equal(parseArgs(['--dry-run', 'no']).dryRun, true);
  });

  it('reads the same switches from the environment, honoring the exact-string rule', () => {
    process.env.DRY_RUN = '0';
    process.env.PROFILE = 'go';
    process.env.BBDD_SID = 'etendo_probe';
    process.env.ALLOW_LOCAL_SID = '1';
    process.env.NO_FETCH = '1';
    process.env.JSON = '1';
    const args = parseArgs([]);
    assert.equal(args.dryRun, false);
    assert.equal(args.profile, 'go');
    assert.equal(args.sid, 'etendo_probe');
    assert.equal(args.allowLocalSid, true);
    assert.equal(args.noFetch, true);
    assert.equal(args.json, true);

    process.env.DRY_RUN = 'false';
    process.env.ALLOW_LOCAL_SID = 'yes';
    process.env.NO_FETCH = 'yes';
    process.env.JSON = 'true';
    const strict = parseArgs([]);
    assert.equal(strict.dryRun, true, 'anything other than "0" keeps the dry run');
    assert.equal(strict.allowLocalSid, false);
    assert.equal(strict.noFetch, false);
    assert.equal(strict.json, false);
  });

  it('lets a flag override the environment', () => {
    process.env.PROFILE = 'go';
    process.env.BBDD_SID = 'from_env';
    const args = parseArgs(['--profile', 'schema-forge-ci', '--bbdd-sid', 'from_flag']);
    assert.equal(args.profile, 'schema-forge-ci');
    assert.equal(args.sid, 'from_flag');
  });

  it('parses a phase subset', () => {
    assert.deepEqual(parseArgs(['--phases', 'verify']).phases, ['verify']);
    assert.deepEqual(parseArgs(['--phases', 'verify, align ,']).phases, ['verify', 'align']);
  });

  it('rejects an unknown phase, listing the valid ones', () => {
    assert.throws(() => parseArgs(['--phases', 'deploy']), (err) => {
      assert.match(err.message, /Unknown phase "deploy"/);
      assert.match(err.message, /verify, align, db, install/);
      return true;
    });
  });

  it('rejects an unknown argument instead of ignoring it', () => {
    assert.throws(() => parseArgs(['--force']), /Unknown argument: --force/);
    assert.throws(() => parseArgs(['align']), /Unknown argument: align/);
  });

  it('accepts the remaining flags', () => {
    assert.equal(parseArgs(['--allow-local-sid']).allowLocalSid, true);
    assert.equal(parseArgs(['--no-fetch']).noFetch, true);
    assert.equal(parseArgs(['--json']).json, true);
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
  });
});

// ===========================================================================
// Exec seam — the link where the B1 leak lived
// ===========================================================================

describe('secretEnvValues', () => {
  const props = new Map([
    ['bbdd.systemPassword', 'sys-hunter2'],
    ['bbdd.password', 'user-pw'],
  ]);

  it('resolves PGPASSWORD from bbdd.systemPassword', () => {
    assert.deepEqual(secretEnvValues(['PGPASSWORD'], props), { PGPASSWORD: 'sys-hunter2' });
  });

  it('returns nothing when a step declares no secretEnv', () => {
    assert.deepEqual(secretEnvValues(undefined, props), {});
    assert.deepEqual(secretEnvValues([], props), {});
  });

  it('ignores env names it does not know how to resolve', () => {
    // The resolver is an allow-list: an unknown name yields nothing rather
    // than reaching into props with an attacker-chosen key.
    assert.deepEqual(secretEnvValues(['NEXUS_PASSWORD', 'GITHUB_TOKEN'], props), {});
  });

  it('yields an empty string, never undefined, when the property is absent', () => {
    assert.deepEqual(secretEnvValues(['PGPASSWORD'], new Map()), { PGPASSWORD: '' });
    assert.deepEqual(secretEnvValues(['PGPASSWORD'], undefined), { PGPASSWORD: '' });
  });
});

describe('runChild — secret travels by env, never by string', () => {
  const props = new Map([['bbdd.systemPassword', 'sys-hunter2']]);
  const DISPLAY = 'PGPASSWORD=*** psql -h localhost -d postgres -c "DROP DATABASE IF EXISTS etendo_ci;"';

  function capture(step, extra = {}) {
    const out = [];
    const calls = [];
    const logPath = path.join(
      mkdtempSync(path.join(tmpdir(), 'ci-parity-exec-')),
      'run.log',
    );
    runChild(step, {
      display: DISPLAY,
      props,
      logPath,
      write: (s) => out.push(s),
      execFile: (file, args, opts) => { calls.push({ file, args, opts }); },
      ...extra,
    });
    return { out: out.join(''), calls, log: readFileSync(logPath, 'utf8') };
  }

  it('injects the password into the CHILD ENV and nowhere else', () => {
    const { calls } = capture({
      file: 'psql', args: ['-h', 'localhost', '-c', 'DROP DATABASE IF EXISTS etendo_ci;'], secretEnv: ['PGPASSWORD'],
    });
    assert.equal(calls.length, 1);
    const [{ file, args, opts }] = calls;
    assert.equal(file, 'psql', 'argv form: no shell');
    assert.equal(opts.env.PGPASSWORD, 'sys-hunter2', 'the secret reaches the child env');
    assert.ok(
      !args.some((a) => a.includes('sys-hunter2')),
      'the secret must not appear in any argv entry',
    );
  });

  it('echoes and logs `display`, never a resolved command containing the secret', () => {
    const { out, log } = capture({
      file: 'psql', args: ['-c', 'DROP DATABASE IF EXISTS etendo_ci;'], secretEnv: ['PGPASSWORD'],
    });
    for (const [where, text] of [['stdout', out], ['run log', log]]) {
      assert.ok(!text.includes('sys-hunter2'), `secret leaked to ${where}`);
      assert.ok(text.includes('PGPASSWORD=***'), `${where} shows the redacted form`);
    }
    assert.match(log, /-> ok/);
  });

  it('records a failure in the log and rethrows, still without the secret', () => {
    const logPath = path.join(mkdtempSync(path.join(tmpdir(), 'ci-parity-exec-')), 'run.log');
    const boom = Object.assign(new Error('psql exploded'), { status: 2 });
    assert.throws(() => runChild(
      { file: 'psql', args: [], secretEnv: ['PGPASSWORD'] },
      {
        display: DISPLAY,
        props,
        logPath,
        write: () => {},
        execFile: () => { throw boom; },
      },
    ), /psql exploded/);
    const log = readFileSync(logPath, 'utf8');
    assert.match(log, /-> FAILED \(status 2\)/);
    assert.ok(!log.includes('sys-hunter2'), 'a failed run must not leak the secret either');
  });

  it('streams: never buffers the child, so a huge gradle log cannot ENOBUFS', () => {
    // The B2 fix, asserted at the option level: inherit + unlimited buffer.
    const { calls } = capture({ shell: 'echo hi' });
    const [{ file, args, opts }] = calls;
    assert.equal(file, '/bin/sh');
    assert.deepEqual(args, ['-c', 'echo hi']);
    assert.deepEqual(opts.stdio, ['ignore', 'inherit', 'inherit']);
    assert.equal(opts.maxBuffer, Infinity);
  });

  it('passes no secret env when the step declares none', () => {
    const { calls } = capture({ shell: 'git fetch --all --prune' });
    assert.equal(calls[0].opts.env.PGPASSWORD, undefined);
  });
});
