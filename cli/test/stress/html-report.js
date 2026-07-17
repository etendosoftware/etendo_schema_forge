import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeLimitHtmlReport({ path, scenario, summaries, resetSafety, metadata = {} }) {
  if (!path) return null;

  mkdirSync(dirname(path), { recursive: true });
  const html = generateLimitHtmlReport({ scenario, summaries, resetSafety, metadata });
  writeFileSync(path, html, 'utf8');
  return path;
}

export function generateLimitHtmlReport({ scenario, summaries, resetSafety, metadata = {} }) {
  const generatedAt = metadata.generatedAt || new Date().toISOString();
  const title = metadata.title || `Email Stress Limit Report - ${scenario}`;
  const stats = getLimitStats({ scenario, summaries });
  const documentLabel = metadata.documentId ? maskId(metadata.documentId) : '-';
  const command = redactSensitiveCommand(metadata.command || '', metadata);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f7f8fb;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #657084;
      --line: #d9dee8;
      --pass: #16803c;
      --pass-bg: #e8f6ee;
      --fail: #bd2b2b;
      --fail-bg: #fdeceb;
      --warn: #9a6100;
      --warn-bg: #fff5db;
      --code: #111827;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    .wrap {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 24px 0;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 26px; font-weight: 700; letter-spacing: 0; }
    h2 { margin: 28px 0 12px; font-size: 18px; font-weight: 700; }
    h3 {
      margin-bottom: 8px;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
    }
    .subtitle { margin-top: 6px; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .card, .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .card { padding: 14px; }
    .metric { font-size: 28px; font-weight: 700; }
    .small-metric { font-size: 18px; font-weight: 700; }
    .label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    .pass { background: var(--pass-bg); color: var(--pass); }
    .fail { background: var(--fail-bg); color: var(--fail); }
    .warn { background: var(--warn-bg); color: var(--warn); }
    .panel { overflow: hidden; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 12px;
      text-align: right;
      white-space: nowrap;
    }
    th:first-child, td:first-child, th:last-child, td:last-child { text-align: left; }
    th {
      background: #f1f4f9;
      color: #38445a;
      font-size: 12px;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: 0; }
    .details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .details .panel { padding: 16px; }
    ul { margin: 8px 0 0; padding-left: 20px; }
    li + li { margin-top: 6px; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre {
      overflow: auto;
      margin: 0;
      border-radius: 8px;
      background: var(--code);
      color: #eef2ff;
      padding: 14px;
      font-size: 12px;
      line-height: 1.45;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .note { color: var(--muted); }
    @media (max-width: 720px) {
      .wrap { width: calc(100% - 20px); padding: 18px 0; }
      .panel { overflow-x: auto; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>${escapeHtml(title)}</h1>
      <p class="subtitle">Generated ${escapeHtml(generatedAt)}. Reset safety: ${resetSafety ? 'yes' : 'no'}.</p>
      <div class="grid">
        <div class="card">
          <div class="label">Suite Status</div>
          <div class="metric"><span class="badge ${getSuiteBadgeClass({ stats, metadata })}">${getSuiteLabel({ stats, metadata, summaries })}</span></div>
        </div>
        <div class="card">
          <div class="label">Last Clean Pass</div>
          <div class="metric">${formatValue(stats.lastPass?.workers)}</div>
        </div>
        <div class="card">
          <div class="label">First Failure</div>
          <div class="metric">${formatValue(stats.firstFail?.workers)}</div>
        </div>
        <div class="card">
          <div class="label">Scenario</div>
          <div class="small-metric">${escapeHtml(scenario)}</div>
        </div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section class="grid">
      <div class="card">
        <div class="label">Backend</div>
        <p class="mono">${escapeHtml(metadata.baseUrl || '-')}</p>
      </div>
      <div class="card">
        <div class="label">Window</div>
        <p class="mono">${escapeHtml(metadata.windowName || '-')}</p>
      </div>
      <div class="card">
        <div class="label">Document</div>
        <p class="mono">${escapeHtml(documentLabel)}</p>
      </div>
      <div class="card">
        <div class="label">Worker Steps</div>
        <p class="mono">${escapeHtml(summaries.map(s => s.workers).join(', '))}</p>
      </div>
    </section>

    <h2>Limit Probe Results</h2>
    <div class="panel">
      ${scenario === 'double-send' ? renderDoubleSendTable(summaries) : renderConcurrentLoadTable(summaries)}
    </div>

    <div class="details">
      <section class="panel">
        <h3>Finding</h3>
        <p>${escapeHtml(buildFinding({ scenario, summaries, stats }))}</p>
        <ul>
          ${buildFindingBullets({ scenario, summaries, stats }).map(item => `<li>${escapeHtml(item)}</li>`).join('\n          ')}
        </ul>
      </section>
      <section class="panel">
        <h3>Interpretation</h3>
        <p>${escapeHtml(buildInterpretation({ scenario, stats }))}</p>
        <ul>
          <li>Use the last clean pass as the local working ceiling for this environment.</li>
          <li>Use the first failure as the first observed degradation point, not as a universal production capacity value.</li>
          <li>Rerun against production-like Tomcat and Postgres settings before using these numbers for sizing.</li>
        </ul>
      </section>
    </div>

    ${metadata.fatalError ? `<h2>Abort</h2>\n    <div class="panel" style="padding: 16px;"><p>${escapeHtml(metadata.fatalError)}</p></div>` : ''}
    ${command ? `<h2>Command</h2>\n    <pre>${escapeHtml(command)}</pre>` : ''}
  </main>
</body>
</html>
`;
}

export function getLimitStats({ scenario, summaries }) {
  const isPass = (summary) => getVerdict({ scenario, summary }).status === 'pass';
  let lastPass = null;
  let firstFail = null;

  for (const summary of summaries) {
    if (isPass(summary)) {
      lastPass = summary;
    } else if (!firstFail) {
      firstFail = summary;
    }
  }

  return { lastPass, firstFail };
}

export function getVerdict({ scenario, summary }) {
  if (scenario === 'double-send') {
    const pass = summary.accepted === 1
      && summary.deduplicated === summary.workers - 1
      && summary.throttled === 0
      && summary.errors === 0
      && summary.pdfCacheFails === 0;
    if (pass) return { status: 'pass', label: 'dedup-ok' };
    if (summary.errors > 0 || summary.pdfCacheFails > 0) return { status: 'fail', label: 'error' };
    return { status: 'fail', label: 'dedup-broken' };
  }

  if (summary.errors > 0) return { status: 'fail', label: 'error' };
  if (summary.throttled > 0) return { status: 'pass', label: 'throttled' };
  return { status: 'pass', label: 'accepted' };
}

function renderDoubleSendTable(summaries) {
  return `<table aria-label="Email stress limit probe results">
        <thead>
          <tr>
            <th>Workers</th>
            <th>Accepted</th>
            <th>Dedup</th>
            <th>Throttled</th>
            <th>Errors</th>
            <th>PDF Fail</th>
            <th>P50 ms</th>
            <th>P95 ms</th>
            <th>Max ms</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          ${summaries.map(summary => {
            const verdict = getVerdict({ scenario: 'double-send', summary });
            return `<tr>
            <td>${summary.workers}</td>
            <td>${summary.accepted}</td>
            <td>${summary.deduplicated}</td>
            <td>${summary.throttled}</td>
            <td>${summary.errors}</td>
            <td>${summary.pdfCacheFails}</td>
            <td>${summary.p50}</td>
            <td>${summary.p95}</td>
            <td>${summary.maxLatency}</td>
            <td><span class="badge ${verdict.status === 'pass' ? 'pass' : 'fail'}">${verdict.label}</span></td>
          </tr>`;
          }).join('\n          ')}
        </tbody>
      </table>`;
}

function renderConcurrentLoadTable(summaries) {
  return `<table aria-label="Email stress concurrent load results">
        <thead>
          <tr>
            <th>Workers</th>
            <th>Accepted</th>
            <th>Throttled</th>
            <th>Throttle %</th>
            <th>First 429</th>
            <th>Errors</th>
            <th>P50 ms</th>
            <th>P95 ms</th>
            <th>Max ms</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          ${summaries.map(summary => {
            const verdict = getVerdict({ scenario: 'concurrent-load', summary });
            return `<tr>
            <td>${summary.workers}</td>
            <td>${summary.accepted}</td>
            <td>${summary.throttled}</td>
            <td>${summary.throttlePct}</td>
            <td>${formatValue(summary.firstThrottleAt)}</td>
            <td>${summary.errors}</td>
            <td>${summary.p50}</td>
            <td>${summary.p95}</td>
            <td>${summary.maxLatency}</td>
            <td><span class="badge ${verdict.status === 'pass' ? 'pass' : 'fail'}">${verdict.label}</span></td>
          </tr>`;
          }).join('\n          ')}
        </tbody>
      </table>`;
}

function buildFinding({ scenario, summaries, stats }) {
  if (summaries.length === 0) {
    return `No ${scenario} worker step completed before the run aborted.`;
  }
  if (!stats.firstFail) {
    return `All ${scenario} worker steps passed in this run.`;
  }
  if (!stats.lastPass) {
    return `The first ${scenario} worker step failed; no clean limit was established.`;
  }
  return `The local ${scenario} stress limit is between ${stats.lastPass.workers} and ${stats.firstFail.workers} workers.`;
}

function buildFindingBullets({ scenario, summaries, stats }) {
  const bullets = [
    `${summaries.length} worker step(s) executed.`,
  ];
  if (stats.lastPass) {
    bullets.push(`Last clean pass: ${stats.lastPass.workers} workers.`);
  }
  if (stats.firstFail) {
    const failure = getFailureText({ scenario, summary: stats.firstFail });
    bullets.push(`First failure: ${stats.firstFail.workers} workers (${failure}).`);
  }
  if (scenario === 'double-send') {
    bullets.push('For passing double-send steps, exactly one request was accepted and the remaining requests were deduplicated.');
  }
  return bullets;
}

function getSuiteBadgeClass({ stats, metadata }) {
  if (metadata.fatalError) return 'fail';
  return stats.firstFail ? 'warn' : 'pass';
}

function getSuiteLabel({ stats, metadata, summaries }) {
  if (metadata.fatalError) return 'Aborted';
  if (summaries.length === 0) return 'No data';
  return stats.firstFail ? 'Limit found' : 'Passed';
}

function buildInterpretation({ scenario, stats }) {
  if (scenario === 'double-send') {
    return stats.firstFail
      ? 'This measures the complete document-email flow. A failure can occur before the email safety layer, for example during PDF generation or transport.'
      : 'This run did not find a failure point for the selected double-send ramp.';
  }
  return stats.firstFail
    ? 'This measures concurrent email contract load and identifies where unexpected server errors begin.'
    : 'This run did not find unexpected concurrent-load errors for the selected ramp.';
}

function getFailureText({ scenario, summary }) {
  if (scenario === 'double-send') {
    return `${summary.errors} errors, ${summary.pdfCacheFails} PDF failures, ${summary.accepted} accepted, ${summary.deduplicated} deduplicated`;
  }
  return `${summary.errors} errors, ${summary.throttled} throttled`;
}

function redactSensitiveCommand(command, metadata) {
  return redactDocumentIds(redactToken(command), metadata);
}

function redactToken(command) {
  return command
    .replace(/TOKEN=('[^']*'|"[^"]*"|[^ ]+)/g, 'TOKEN=<redacted>')
    .replace(/ETENDO_TOKEN=('[^']*'|"[^"]*"|[^ ]+)/g, 'ETENDO_TOKEN=<redacted>')
    .replace(/--token=('[^']*'|"[^"]*"|[^ ]+)/g, '--token=<redacted>')
    .replace(/--token\s+('[^']*'|"[^"]*"|[^ ]+)/g, '--token <redacted>');
}

function redactDocumentIds(command, metadata) {
  const ids = [
    metadata.documentId,
    ...(String(metadata.documentIds || '').split(',')),
  ].map(value => String(value || '').trim()).filter(value => value.length > 10);

  return ids.reduce((redacted, id) => redacted.split(id).join(maskId(id)), command);
}

function maskId(value) {
  if (value.length <= 10) return value;
  return `...${value.slice(-10)}`;
}

function formatValue(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
