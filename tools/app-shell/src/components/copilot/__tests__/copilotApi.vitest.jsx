// Behavioral coverage for copilotApi lives in schema_forge_core:
// packages/app-shell-core/src/components/copilot/__tests__/copilotApi.vitest.jsx.
// This is a SHIM SMOKE TEST. The functional module is a re-export of the core
// client, so this file only verifies that the re-export RESOLVES and that a
// helper EXECUTES through the real `@/` → package → core import chain. It does
// not re-test behavior: the core copy was byte-identical to this one, so every
// assertion it holds is already running there against the same code. What the
// core copy cannot cover is this resolution path — that is what this file adds.
import {
  detectBaseUrl,
  executeTool,
  extractAnswerText,
  uploadFile,
} from '../copilotApi';

describe('copilotApi shim', () => {
  it('re-exports the helpers its consumers import', () => {
    // ChangePasswordDialog imports detectBaseUrl; the OCR flow imports the other three.
    expect(typeof detectBaseUrl).toBe('function');
    expect(typeof executeTool).toBe('function');
    expect(typeof extractAnswerText).toBe('function');
    expect(typeof uploadFile).toBe('function');
  });

  it('executes through the real core import graph', () => {
    expect(extractAnswerText({ answer: 'plain string' })).toBe('plain string');
    expect(extractAnswerText({ answer: { response: 'nested' } })).toBe('nested');
    expect(extractAnswerText(null)).toBe('');
  });
});
