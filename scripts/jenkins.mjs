#!/usr/bin/env node
// Read-only client for the two Etendo Jenkins instances (REST API, GET only).
//
//   node scripts/jenkins.mjs <instance> <command> [args]     (or: make jenkins ARGS="…")
//
// Credentials live in the tool's own config file, outside the repo:
//   ~/.config/etendo-jenkins/config.json   (override the path with JENKINS_CONFIG)
// `node scripts/jenkins.mjs init` writes a template (mode 0600). One entry per instance:
//   { "instances": { "go": { "url": …, "username": …, "apiKey": … }, "ci": { … } } }
// The API key is a Jenkins user API token (profile → Configure → API Token). It is sent only as
// HTTP basic auth to the instance's own origin and never printed.

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INSTANCES = {
  go: { url: 'https://jenkins-go.etendo.cloud' },
  ci: { url: 'https://jenkins2.etendo.cloud' },
};

export const configPath = (env = process.env) =>
  env.JENKINS_CONFIG || join(homedir(), '.config', 'etendo-jenkins', 'config.json');

const HELP = `Read-only Jenkins client (GET only).

Usage: make jenkins ARGS="<instance> <command> [args]"     (instances: go, ci, or any in the config)
       make jenkins ARGS="init"                            (create the config file)
       node scripts/jenkins.mjs …

Commands:
  whoami                      Check the credentials (user the token belongs to)
  jobs [--filter <regex>]     List every job, folders included, with its last result
  job <job>                   Summary: type, pipeline source (repo, branch, Jenkinsfile path),
                              webhook filter, parameters and last builds
  config <job>                Raw config.xml
  builds <job> [-n N]         Last N builds (default 10): result, start, duration, cause, parameters
  log <job> [<build>] [--tail N]
                              Console output of a build (default lastBuild; --tail keeps the last N lines)

<job> is the path shown by "jobs" (folder/sub/job), a "job/a/job/b" path or a full job URL.

Config: ~/.config/etendo-jenkins/config.json (or JENKINS_CONFIG), outside the repo, mode 0600:
  { "instances": {
      "go": { "url": "https://jenkins-go.etendo.cloud", "username": "…", "apiKey": "…" },
      "ci": { "url": "https://jenkins2.etendo.cloud",   "username": "…", "apiKey": "…" } } }
"url" may be omitted for go and ci. More instances can be added with their own name.
"password" (the Jenkins login password) works instead of "apiKey"; the token is preferred because it
can be revoked on its own and is not your login.`;

/** "a/b/c", "job/a/job/b", "/job/a/" or a full URL on the instance → "/job/a/job/b". */
export function jobPath(job, baseUrl) {
  let path = String(job || '').trim();
  if (!path) throw new Error('Missing <job>.');
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (baseUrl && url.origin !== new URL(baseUrl).origin) {
      throw new Error(`Job URL is not on ${new URL(baseUrl).origin}.`);
    }
    path = url.pathname;
  }
  const parts = path.split('/').filter(Boolean);
  let clean;
  if (parts[0] === 'job') {
    // /job/a/job/b/<whatever follows the job: build number, configure, console…>
    clean = [];
    for (let i = 0; parts[i] === 'job' && parts[i + 1]; i += 2) clean.push(parts[i + 1]);
  } else {
    const cut = parts.findIndex((n) => ['configure', 'lastBuild', 'api'].includes(n) || /^\d+$/.test(n));
    clean = cut === -1 ? parts : parts.slice(0, cut);
  }
  if (!clean.length) throw new Error(`Cannot read a job path from "${job}".`);
  return clean.map((n) => `/job/${encodeURIComponent(decodeURIComponent(n))}`).join('');
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decodeXml(m[1].trim()) : null;
};
const tags = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => decodeXml(m[1].trim()));
const decodeXml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const REDACTED = '[redacted]';
const SECRET_NAME = /token|password|passwd|secret|privatekey|api[_-]?key|passphrase|credential/i;

/**
 * Free text (console logs, parameter values, any output) with recognizable secrets masked:
 * credentials embedded in URLs, Authorization headers, `name=value` pairs whose name looks like a
 * secret, Jenkins-encrypted values, GitHub tokens, AWS access keys and private key blocks.
 */
export function redactText(text) {
  return String(text)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED)
    .replace(/(\b[a-z][\w+.-]*:\/\/)[^\s/:@'"]+:[^\s/@'"]+@/gi, `$1${REDACTED}@`)
    .replace(/(authorization\s*[:=]\s*(?:basic|bearer|token)\s+)[^\s'"]+/gi, `$1${REDACTED}`)
    .replace(/(\b[\w.-]*(?:token|password|passwd|secret|api[_-]?key|passphrase)[\w.-]*\s*[=:]\s*)(["']?)[^\s"',;]+\2/gi, `$1$2${REDACTED}$2`)
    .replace(/\{AQAA[A-Za-z0-9+/=]{8,}\}/g, REDACTED)
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, REDACTED)
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, REDACTED);
}

/** config.xml with secret-bearing elements blanked, then the free-text masking on top. */
export function redactConfig(xml) {
  const blanked = xml.replace(
    /<((?:[\w.-]*?)(?:token|password|secret|privateKey|apiKey|passphrase))(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (whole, name, attrs = '', value) => (value.trim() ? `<${name}${attrs}>${REDACTED}</${name}>` : whole),
  );
  return redactText(blanked);
}

/** What a job's config.xml says about where its pipeline comes from and what triggers it. */
export function summarizeConfig(xml) {
  const root = (xml.match(/<([\w.-]+)(?:\s+plugin="[^"]*")?\s*>/g) || [])
    .map((t) => t.replace(/^<|\s.*$|>$/g, ''))
    .find((t) => t !== '?xml');
  const definition = xml.match(/<definition class="([^"]+)"[\s\S]*?<\/definition>/);
  const defXml = definition ? definition[0] : xml;
  const scmXml = (defXml.match(/<scm class="[^"]*"[\s\S]*?<\/scm>/) || [''])[0];
  const parameters = (xml.match(/<parameterDefinitions>[\s\S]*?<\/parameterDefinitions>/) || [''])[0];
  const params = [...parameters.matchAll(/<([\w.]+ParameterDefinition)[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => {
    const name = tag(m[2], 'name');
    const value = tag(m[2], 'defaultValue');
    const secret = /Password|Credentials/.test(m[1]) || SECRET_NAME.test(name || '');
    return { name, default: value && secret ? REDACTED : value };
  });
  return {
    type: root || null,
    definition: definition ? definition[1] : null,
    repository: scmXml ? tags(scmXml, 'url')[0] || null : null,
    branches: scmXml ? tags(scmXml, 'name').filter((n) => n && !/^origin$/.test(n)) : [],
    scriptPath: tag(defXml, 'scriptPath'),
    inlineScriptLines: definition && /<script>/.test(defXml) ? (tag(defXml, 'script') || '').split('\n').length : 0,
    webhookFilter: tag(xml, 'regexpFilterExpression'),
    webhookFilterText: tag(xml, 'regexpFilterText'),
    disabled: tag(xml, 'disabled') === 'true',
    parameters: params,
  };
}

/** Reads the tool's config file. Missing file → empty config (the caller says what to do). */
export function loadConfig(path) {
  if (!existsSync(path)) return { path, exists: false, instances: {} };
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
  const instances = data && typeof data.instances === 'object' && !Array.isArray(data.instances) ? data.instances : {};
  const mode = statSync(path).mode & 0o777;
  return { path, exists: true, instances, insecure: (mode & 0o077) !== 0, mode };
}

export function credentials(name, config) {
  const entry = config.instances[name] || {};
  const known = INSTANCES[name];
  if (!known && !config.instances[name]) {
    const names = [...new Set([...Object.keys(INSTANCES), ...Object.keys(config.instances)])];
    throw new Error(`Unknown instance "${name}". Use one of: ${names.join(', ')}.`);
  }
  const base = String(entry.url || known?.url || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/@]+$/i.test(base)) throw new Error(`Instance "${name}" needs a plain "url" (scheme and host, no credentials or path) in ${config.path}.`);
  const secret = entry.apiKey || entry.password;
  const missing = [!entry.username && 'username', !secret && 'apiKey (or password)'].filter(Boolean);
  if (missing.length) {
    const how = config.exists ? `Add them under instances.${name} in ${config.path}.` : `Create it with: make jenkins ARGS="init", then fill instances.${name}.`;
    throw new Error(`Missing ${missing.join(' and ')} for "${name}" (${base}). ${how}`);
  }
  return { base, auth: `Basic ${Buffer.from(`${entry.username}:${secret}`).toString('base64')}` };
}

/** Writes a template config (never overwrites) with permissions only for the owner. */
export function initConfig(path) {
  if (existsSync(path)) return `${path} already exists; not touched.`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const template = {
    instances: Object.fromEntries(Object.entries(INSTANCES).map(([n, i]) => [n, { url: i.url, username: '', apiKey: '' }])),
  };
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
  return `Created ${path} (mode 600). Fill "username" and "apiKey" for each instance.`;
}

async function get(ctx, path, { text = false } = {}) {
  const url = new URL(path, `${ctx.base}/`);
  if (url.origin !== new URL(ctx.base).origin) throw new Error('Refusing a request outside the instance origin.');
  const res = await fetch(url, { method: 'GET', headers: { Authorization: ctx.auth, Accept: text ? 'text/plain, application/xml' : 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error(`${res.status} on ${url.pathname}: check the user and API token, and that the user can read this job.`);
  if (res.status === 404) throw new Error(`404 on ${url.pathname}: no such job or build.`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${url.pathname}.`);
  return text ? res.text() : res.json();
}

const fmtDate = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '-');
const fmtDur = (ms) => {
  if (!ms) return '-';
  const s = Math.round(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};
const result = (b) => (b ? (b.building ? 'RUNNING' : b.result || '-') : 'never');
const causes = (b) =>
  (b.actions || []).flatMap((a) => a?.causes || []).map((c) => c.shortDescription).filter(Boolean).join('; ');
const params = (b) =>
  (b.actions || []).flatMap((a) => a?.parameters || []).filter((p) => p.value !== undefined && p.value !== '')
    .map((p) => `${p.name}=${SECRET_NAME.test(p.name) || /Password/.test(p._class || '') ? REDACTED : redactText(p.value)}`).join(' ');

const JOB_TREE = 'name,url,_class,color,lastBuild[number,result,building,timestamp]';
const treeQuery = (depth) => (depth === 0 ? `jobs[${JOB_TREE}]` : `jobs[${JOB_TREE},${treeQuery(depth - 1)}]`);

function flattenJobs(jobs, prefix = '') {
  return (jobs || []).flatMap((j) => {
    const path = prefix ? `${prefix}/${j.name}` : j.name;
    const folder = Array.isArray(j.jobs);
    return folder ? [{ path, folder: true, kind: j._class }, ...flattenJobs(j.jobs, path)] : [{ path, folder: false, kind: j._class, last: j.lastBuild }];
  });
}

const commands = {
  async whoami(ctx) {
    const me = await get(ctx, '/me/api/json?tree=id,fullName');
    console.log(`${ctx.base}: ${me.fullName || me.id} (${me.id})`);
  },

  async jobs(ctx, args) {
    const i = args.indexOf('--filter');
    const filter = i >= 0 ? new RegExp(args[i + 1], 'i') : null;
    const data = await get(ctx, `/api/json?tree=${encodeURIComponent(treeQuery(4))}`);
    const rows = flattenJobs(data.jobs).filter((j) => !filter || filter.test(j.path));
    for (const j of rows) {
      if (j.folder) console.log(`${j.path}/`);
      else console.log(`${j.path}  ${result(j.last)}${j.last ? ` #${j.last.number} ${fmtDate(j.last.timestamp)}` : ''}`);
    }
    console.log(`\n${rows.filter((r) => !r.folder).length} jobs on ${ctx.base}`);
  },

  async job(ctx, [job]) {
    const path = jobPath(job, ctx.base);
    const [info, xml] = await Promise.all([
      get(ctx, `${path}/api/json?tree=${encodeURIComponent('fullName,url,description,buildable,builds[number,result,building,timestamp,duration]{0,5}')}`),
      get(ctx, `${path}/config.xml`, { text: true }),
    ]);
    const c = summarizeConfig(xml);
    console.log(`${info.fullName}  ${info.url}`);
    if (info.description) console.log(`description: ${info.description.replace(/\s+/g, ' ').slice(0, 300)}`);
    console.log(`type:        ${c.type}${c.disabled || info.buildable === false ? '  (disabled)' : ''}`);
    if (c.definition) console.log(`definition:  ${c.definition.replace(/^.*\./, '')}`);
    if (c.repository) console.log(`repository:  ${c.repository}`);
    if (c.branches.length) console.log(`branch:      ${c.branches.join(', ')}`);
    if (c.scriptPath) console.log(`Jenkinsfile: ${c.scriptPath}`);
    if (c.inlineScriptLines) console.log(`script:      inline, ${c.inlineScriptLines} lines`);
    if (c.webhookFilter) console.log(`webhook:     ${c.webhookFilterText || ''}  ~  ${c.webhookFilter}`);
    for (const p of c.parameters) console.log(`param:       ${p.name}${p.default ? ` = ${redactText(p.default)}` : ''}`);
    for (const b of info.builds || []) console.log(`build:       #${b.number}  ${result(b)}  ${fmtDate(b.timestamp)}  ${fmtDur(b.duration)}`);
  },

  async config(ctx, [job]) {
    process.stdout.write(redactConfig(await get(ctx, `${jobPath(job, ctx.base)}/config.xml`, { text: true })));
  },

  async builds(ctx, args) {
    const [job] = args;
    const i = args.indexOf('-n');
    const n = Math.min(Math.max(Number(i >= 0 ? args[i + 1] : 10) || 10, 1), 100);
    const tree = `builds[number,result,building,timestamp,duration,actions[causes[shortDescription],parameters[_class,name,value]]]{0,${n}}`;
    const data = await get(ctx, `${jobPath(job, ctx.base)}/api/json?tree=${encodeURIComponent(tree)}`);
    for (const b of data.builds || []) {
      console.log(`#${b.number}  ${result(b).padEnd(8)} ${fmtDate(b.timestamp)}  ${fmtDur(b.duration).padStart(7)}  ${causes(b)}${params(b) ? `  [${params(b)}]` : ''}`);
    }
  },

  async log(ctx, args) {
    const [job, maybeBuild] = args;
    const build = maybeBuild && !maybeBuild.startsWith('--') ? maybeBuild : 'lastBuild';
    const i = args.indexOf('--tail');
    const text = await get(ctx, `${jobPath(job, ctx.base)}/${encodeURIComponent(build)}/consoleText`, { text: true });
    const lines = text.split('\n');
    const tail = i >= 0 ? Number(args[i + 1]) || 200 : 0;
    process.stdout.write(redactText((tail ? lines.slice(-tail) : lines).join('\n')));
  },
};

export async function main(argv = process.argv.slice(2), env = process.env) {
  const [instance, command, ...args] = argv;
  if (instance === 'init') {
    console.log(initConfig(configPath(env)));
    return 0;
  }
  if (!instance || ['-h', '--help', 'help'].includes(instance) || !command) {
    console.log(HELP);
    return instance && !['-h', '--help', 'help'].includes(instance) ? 1 : 0;
  }
  const run = commands[command];
  if (!run) throw new Error(`Unknown command "${command}". Run with --help.`);
  if (command !== 'whoami' && command !== 'jobs' && !args[0]) throw new Error(`"${command}" needs a <job>.`);
  const config = loadConfig(configPath(env));
  if (config.insecure) {
    console.error(`jenkins: warning: ${config.path} is readable by others (mode ${config.mode.toString(8)}); run chmod 600 on it.`);
  }
  await run(credentials(instance, config), args);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => process.exit(code), (err) => {
    console.error(`jenkins: ${err.message}`);
    process.exit(1);
  });
}
