import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credentials, initConfig, jobPath, loadConfig, main, redactConfig, redactText, summarizeConfig } from '../jenkins.mjs';

const BASE = 'https://jenkins-go.etendo.cloud';

describe('jobPath', () => {
  it('accepts the folder path printed by "jobs", a job/ path and a full URL', () => {
    assert.equal(jobPath('etendo-go/go-tests'), '/job/etendo-go/job/go-tests');
    assert.equal(jobPath('job/etendo-go/job/go-tests/'), '/job/etendo-go/job/go-tests');
    assert.equal(jobPath(`${BASE}/job/etendo-prod/configure`, BASE), '/job/etendo-prod');
    assert.equal(jobPath(`${BASE}/job/etendo-prod/123/console`, BASE), '/job/etendo-prod');
  });

  it('encodes names with spaces once, also when the URL already encoded them', () => {
    assert.equal(jobPath('My Folder/deploy job'), '/job/My%20Folder/job/deploy%20job');
    assert.equal(jobPath(`${BASE}/job/My%20Folder/job/deploy%20job/`, BASE), '/job/My%20Folder/job/deploy%20job');
  });

  it('refuses a URL from another Jenkins, so the token is never sent elsewhere', () => {
    assert.throws(() => jobPath('https://jenkins2.etendo.cloud/job/x', BASE), /not on https:\/\/jenkins-go/);
  });

  it('refuses an empty job', () => {
    assert.throws(() => jobPath('  '), /Missing <job>/);
  });
});

describe('summarizeConfig', () => {
  const pipelineFromScm = `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@1400">
  <description>Deploy &amp; smoke</description>
  <properties>
    <hudson.model.ParametersDefinitionProperty>
      <parameterDefinitions>
        <hudson.model.StringParameterDefinition>
          <name>GO_BRANCH</name><defaultValue>main</defaultValue>
        </hudson.model.StringParameterDefinition>
        <hudson.model.BooleanParameterDefinition>
          <name>DRY_RUN</name><defaultValue>false</defaultValue>
        </hudson.model.BooleanParameterDefinition>
      </parameterDefinitions>
    </hudson.model.ParametersDefinitionProperty>
    <org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
      <triggers><org.jenkinsci.plugins.gwt.GenericTrigger>
        <regexpFilterText>$REF $REPO</regexpFilterText>
        <regexpFilterExpression>^refs/heads/(develop|main) com\\.etendoerp\\.go$</regexpFilterExpression>
      </org.jenkinsci.plugins.gwt.GenericTrigger></triggers>
    </org.jenkinsci.plugins.workflow.job.properties.PipelineTriggersJobProperty>
  </properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps@4000">
    <scm class="hudson.plugins.git.GitSCM" plugin="git@5.0">
      <userRemoteConfigs><hudson.plugins.git.UserRemoteConfig>
        <url>git@bitbucket.org:koodu_software/com.etendoerp.jenkins.pipelines.git</url>
      </hudson.plugins.git.UserRemoteConfig></userRemoteConfigs>
      <branches><hudson.plugins.git.BranchSpec><name>*/feature/ETP-3604</name></hudson.plugins.git.BranchSpec></branches>
    </scm>
    <scriptPath>etendo-go-staging/JenkinsfileProduction</scriptPath>
  </definition>
  <disabled>false</disabled>
</flow-definition>`;

  it('reads the pipeline source: repository, branch and Jenkinsfile path', () => {
    const c = summarizeConfig(pipelineFromScm);
    assert.equal(c.type, 'flow-definition');
    assert.equal(c.definition, 'org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition');
    assert.equal(c.repository, 'git@bitbucket.org:koodu_software/com.etendoerp.jenkins.pipelines.git');
    assert.deepEqual(c.branches, ['*/feature/ETP-3604']);
    assert.equal(c.scriptPath, 'etendo-go-staging/JenkinsfileProduction');
    assert.equal(c.inlineScriptLines, 0);
    assert.equal(c.disabled, false);
  });

  it('reads the parameters, not the branch name, as parameter names', () => {
    const c = summarizeConfig(pipelineFromScm);
    assert.deepEqual(c.parameters, [{ name: 'GO_BRANCH', default: 'main' }, { name: 'DRY_RUN', default: 'false' }]);
  });

  it('reads the webhook filter with its entities decoded', () => {
    const c = summarizeConfig(pipelineFromScm);
    assert.equal(c.webhookFilterText, '$REF $REPO');
    assert.equal(c.webhookFilter, '^refs/heads/(develop|main) com\\.etendoerp\\.go$');
  });

  it('reports an inline pipeline script by size, with no repository', () => {
    const c = summarizeConfig(`<flow-definition><definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition"><script>pipeline {
  agent any
}</script></definition><disabled>true</disabled></flow-definition>`);
    assert.equal(c.repository, null);
    assert.equal(c.scriptPath, null);
    assert.equal(c.inlineScriptLines, 3);
    assert.equal(c.disabled, true);
  });
});

describe('redactConfig', () => {
  it('blanks webhook tokens, passwords and secrets but keeps the rest of the XML', () => {
    const xml = '<a><token>abc==</token><causeString>Push</causeString><webhookPassword x="1">p</webhookPassword>'
      + '<clientSecret>s</clientSecret><credentialsId>bitbucket-koodu-ssh</credentialsId><token></token></a>';
    assert.equal(redactConfig(xml), '<a><token>[redacted]</token><causeString>Push</causeString>'
      + '<webhookPassword x="1">[redacted]</webhookPassword><clientSecret>[redacted]</clientSecret>'
      + '<credentialsId>bitbucket-koodu-ssh</credentialsId><token></token></a>');
  });
});

describe('redactText', () => {
  it('masks credentials in URLs, Authorization headers and secret-looking name=value pairs', () => {
    const log = [
      'git clone https://etendobot:s3cr3tToken@github.com/etendosoftware/com.etendoerp.go.git',
      'Authorization: Bearer abc.def.ghi',
      'export GITHUB_TOKEN=ghx-123 DB_PASSWORD="p4ss" api_key: k-9',
      'nexusPassword=hunter2, repositoryUser=etendobot',
    ].join('\n');
    assert.equal(redactText(log), [
      'git clone https://[redacted]@github.com/etendosoftware/com.etendoerp.go.git',
      'Authorization: Bearer [redacted]',
      'export GITHUB_TOKEN=[redacted] DB_PASSWORD="[redacted]" api_key: [redacted]',
      'nexusPassword=[redacted], repositoryUser=etendobot',
    ].join('\n'));
  });

  it('masks GitHub tokens, AWS access keys, Jenkins-encrypted values and private keys anywhere', () => {
    const text = `push ghp_${'a'.repeat(36)} key AKIAABCDEFGHIJKLMNOP enc {AQAAABAAAAAQabcdefgh=} `
      + '-----BEGIN OPENSSH PRIVATE KEY-----\nxyz\n-----END OPENSSH PRIVATE KEY----- done';
    assert.equal(redactText(text), 'push [redacted] key [redacted] enc [redacted] [redacted] done');
  });

  it('leaves ordinary log lines alone', () => {
    const line = 'Using Etendo Core branch: epic/ETP-3504 — com.etendoerp.go: [main] 01f5e6e Merged in feature/ETP-6217';
    assert.equal(redactText(line), line);
  });
});

describe('summarizeConfig secrets', () => {
  it('hides the default of a password parameter or of a parameter named like a secret', () => {
    const c = summarizeConfig(`<flow-definition><properties><parameterDefinitions>
      <hudson.model.PasswordParameterDefinition><name>DB</name><defaultValue>{AQAAABAAAAAQx}</defaultValue></hudson.model.PasswordParameterDefinition>
      <hudson.model.StringParameterDefinition><name>GITHUB_TOKEN</name><defaultValue>t</defaultValue></hudson.model.StringParameterDefinition>
      <hudson.model.StringParameterDefinition><name>GO_BRANCH</name><defaultValue>main</defaultValue></hudson.model.StringParameterDefinition>
    </parameterDefinitions></properties></flow-definition>`);
    assert.deepEqual(c.parameters, [
      { name: 'DB', default: '[redacted]' },
      { name: 'GITHUB_TOKEN', default: '[redacted]' },
      { name: 'GO_BRANCH', default: 'main' },
    ]);
  });
});

describe('config file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jenkins-config-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, data, mode = 0o600) => {
    const path = join(dir, name);
    writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data));
    chmodSync(path, mode);
    return path;
  };

  it('init writes an owner-only template with the two instances and never overwrites', () => {
    const path = join(dir, 'nested', 'config.json');
    assert.match(initConfig(path), /Created/);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    const data = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(Object.keys(data.instances), ['go', 'ci']);
    assert.equal(data.instances.go.url, 'https://jenkins-go.etendo.cloud');
    writeFileSync(path, '{"instances":{"go":{"username":"kept"}}}');
    assert.match(initConfig(path), /already exists/);
    assert.match(readFileSync(path, 'utf8'), /kept/);
  });

  it('a missing file points at init; a file without the key names the field and the file', () => {
    const missing = loadConfig(join(dir, 'none.json'));
    assert.throws(() => credentials('go', missing), /Missing username and apiKey \(or password\) for "go".*ARGS="init"/);
    const partial = loadConfig(write('partial.json', { instances: { go: { username: 'u' } } }));
    assert.throws(() => credentials('go', partial), /Missing apiKey \(or password\) for "go".*partial\.json/);
  });

  it('uses the default URL of go/ci and accepts extra named instances with their own URL', () => {
    const config = loadConfig(write('ok.json', { instances: {
      go: { username: 'u', apiKey: 'k' },
      other: { url: 'https://jenkins.example.com/', username: 'v', apiKey: 'w' },
    } }));
    assert.equal(credentials('go', config).base, 'https://jenkins-go.etendo.cloud');
    assert.equal(credentials('other', config).base, 'https://jenkins.example.com');
    assert.equal(credentials('go', config).auth, `Basic ${Buffer.from('u:k').toString('base64')}`);
    assert.throws(() => credentials('prod', config), /Unknown instance "prod". Use one of: go, ci, other/);
  });

  it('accepts the login password instead of the token, and prefers the token when both are set', () => {
    const config = loadConfig(write('pw.json', { instances: {
      go: { username: 'u', password: 'p' },
      ci: { username: 'u', password: 'p', apiKey: 't' },
    } }));
    assert.equal(credentials('go', config).auth, `Basic ${Buffer.from('u:p').toString('base64')}`);
    assert.equal(credentials('ci', config).auth, `Basic ${Buffer.from('u:t').toString('base64')}`);
  });

  it('refuses a URL with embedded credentials or a path', () => {
    const config = loadConfig(write('bad-url.json', { instances: { x: { url: 'https://a:b@host', username: 'u', apiKey: 'k' } } }));
    assert.throws(() => credentials('x', config), /plain "url"/);
  });

  it('flags a config readable by others and rejects invalid JSON', () => {
    assert.equal(loadConfig(write('open.json', { instances: {} }, 0o644)).insecure, true);
    assert.equal(loadConfig(write('closed.json', { instances: {} }, 0o600)).insecure, false);
    assert.throws(() => loadConfig(write('broken.json', '{nope')), /not valid JSON/);
  });
});

describe('main', () => {
  it('reads credentials only from the config file, not from the environment', async () => {
    const env = { JENKINS_CONFIG: join(tmpdir(), 'jenkins-no-such-config.json'), JENKINS_GO_USERNAME: 'u', JENKINS_GO_API_KEY: 'k' };
    await assert.rejects(main(['go', 'whoami'], env), /Missing username and apiKey \(or password\) for "go"/);
  });

  it('refuses a command without its job before reading credentials', async () => {
    await assert.rejects(main(['go', 'builds'], { JENKINS_CONFIG: '/nonexistent' }), /needs a <job>/);
  });
});
