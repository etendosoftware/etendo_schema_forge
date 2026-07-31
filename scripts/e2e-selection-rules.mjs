const E2E_FILE = /^e2e\/.*\.(?:spec|test)\.(?:js|jsx|mjs|cjs)$/;
const INTEGRATION_FILE = /\.integration\.(?:spec|test)\./;
const UI_FILE = /^(?:tools\/app-shell\/src\/(?:components|pages|windows|hooks|lib)|packages\/app-shell-core\/src)\//;
const BACKEND_CONTRACT = /^(?:artifacts\/|cli\/src\/(?:generate|resolve|push|extract)|core-maps\/)/;
const E2E_INFRA = /^(?:e2e\/(?:playwright\.config|tests\/helpers|package)|\.github\/workflows\/|\.githooks\/)/;
const LOW_RISK = /^(?:docs\/|.*\.md$|.*package(?:-lock)?\.json$|tools\/app-shell\/src\/locales\/|.*\.(?:test|vitest)\.(?:js|jsx|mjs|cjs)$)/;

export function classifyE2E(pr) {
  const files = pr.files;
  const title = pr.title ?? '';
  const reasons = [];
  const e2eFiles = files.filter((file) => E2E_FILE.test(file));
  if (pr.base === 'develop' || files.length >= 100 || files.some((file) => E2E_INFRA.test(file) && !E2E_FILE.test(file))) {
    reasons.push(pr.base === 'develop' ? 'Epic/develop integration boundary.' : files.length >= 100 ? `Broad ${files.length}-file change.` : 'E2E/CI infrastructure changed.');
    return { classification: 'e2e-full', reasons, e2eFiles };
  }
  if (e2eFiles.some((file) => INTEGRATION_FILE.test(file))) {
    reasons.push('An integration Playwright spec changed.');
    return { classification: 'e2e-integration', reasons, e2eFiles };
  }
  if (e2eFiles.length) {
    reasons.push('A mocked Playwright spec changed.');
    return { classification: 'e2e-mocked', reasons, e2eFiles };
  }
  const interaction = /navigat|modal|form|visibility|visible|drawer|filter|button|screen|layout|sidebar|grid|toast|dialog|selector|login|logout|ux|ui\b/i.test(title);
  const backend = /persist|backend|endpoint|\bneo\b|default|save|delete|create|import|process|post|unpost|confirm|batch|database|handler/i.test(title);
  const hasUI = files.some((file) => UI_FILE.test(file));
  const hasContract = files.some((file) => BACKEND_CONTRACT.test(file));
  if (hasContract || (backend && hasUI)) {
    reasons.push('Observable behavior depends on persistence, defaults, backend or a NEO contract.');
    return { classification: 'e2e-integration', reasons, e2eFiles };
  }
  if (interaction && hasUI) {
    reasons.push('Observable navigation/form/modal/visibility behavior changed.');
    return { classification: 'e2e-mocked', reasons, e2eFiles };
  }
  if (files.every((file) => LOW_RISK.test(file)) || !hasUI) {
    reasons.push('Only docs, dependencies, locales, unit tests or non-interactive internals changed.');
    return { classification: 'no-e2e', reasons, e2eFiles };
  }
  reasons.push('UI code changed without a clear observable interaction signal; conservative mocked E2E.');
  return { classification: 'e2e-mocked', reasons, e2eFiles };
}
