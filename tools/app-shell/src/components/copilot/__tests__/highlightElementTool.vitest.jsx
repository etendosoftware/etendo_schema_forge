import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * ETP-5184 — the `highlight_element` case of the Copilot tool dispatcher.
 *
 * The dispatcher is not exported, so it is exercised the way the AI SDK
 * exercises it: through the `onToolCall` callback the hook hands to useChat.
 * The two things worth pinning are that a successful call reaches the
 * highlight state and reports its result back to the model, and that a failure
 * comes back as `state: 'output-error'` — the same shape the sibling cases
 * use, and the only way the model learns it must inspect the page again.
 */

const chatInstances = [];

vi.mock('@ai-sdk/react', () => ({
  useChat: options => {
    const instance = {
      options,
      messages: [],
      status: 'ready',
      error: null,
      addToolOutput: vi.fn(async () => {}),
      setMessages: vi.fn(),
      regenerate: vi.fn(),
      clearError: vi.fn(),
      stop: vi.fn(),
      sendMessage: vi.fn(async () => {}),
    };
    chatInstances.push(instance);
    return instance;
  },
}));

vi.mock('ai', () => ({
  DefaultChatTransport: class { constructor(config) { this.config = config; } },
  lastAssistantMessageIsCompleteWithToolCalls: () => false,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/sales-order', search: '', hash: '' }),
}));

vi.mock('@/auth/api.js', () => ({ authHeaders: () => ({}) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => key => key }));

const highlight = vi.fn();
vi.mock('../highlight/HighlightContext.jsx', () => ({
  useHighlight: () => ({ element: null, note: '', highlight, clearHighlight: vi.fn() }),
}));

import { useAiCopilotChat } from '../useAiCopilotChat.js';

const MENU_GROUPS = [
  { group: 'Sales', items: [{ name: 'sales-order', label: 'Order', favname: 'Sales Order' }] },
];

/** The main conversation's useChat instance (the page-help one is second). */
function mainChat() {
  return chatInstances[0];
}

async function callTool(input, toolCallId = 'call-1') {
  await mainChat().options.onToolCall({
    toolCall: { toolName: 'highlight_element', toolCallId, input },
  });
  return mainChat().addToolOutput.mock.calls.at(-1)?.[0];
}

function mount() {
  return renderHook(() => useAiCopilotChat({ token: 'test-token', menuGroups: MENU_GROUPS }));
}

describe('highlight_element tool call', () => {
  beforeEach(() => {
    chatInstances.length = 0;
    highlight.mockClear();
    // The dispatcher traces every call to the console under DEV.
    window.__ETENDO_COPILOT_TRACE__ = false;
    document.body.innerHTML = `
      <label for="bp">Business Partner</label>
      <input id="bp" data-testid="field-businessPartner" />
      <button id="complete" aria-label="Complete">Complete</button>
    `;
    for (const element of document.querySelectorAll('*')) {
      element.getBoundingClientRect = () => ({ width: 120, height: 24, top: 40, left: 10 });
    }
  });

  afterEach(() => {
    delete window.__ETENDO_COPILOT_TRACE__;
  });

  it('highlights the field the model named and reports it back', async () => {
    mount();
    const output = await callTool({ fieldKey: 'businessPartner', note: 'Pick the customer here' });
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(highlight.mock.calls[0][0]).toMatchObject({
      element: document.getElementById('bp'),
      note: 'Pick the customer here',
    });
    expect(output).toMatchObject({
      tool: 'highlight_element',
      toolCallId: 'call-1',
      output: { ok: true, fieldKey: 'businessPartner', label: 'Business Partner' },
    });
    expect(output).not.toHaveProperty('errorText');
  });

  it('forwards durationMs so the highlight can expire on its own', async () => {
    mount();
    await callTool({ fieldKey: 'businessPartner', durationMs: 5000 });
    expect(highlight.mock.calls[0][0].durationMs).toBe(5000);
  });

  it('defaults a missing or non-string note to an empty string', async () => {
    mount();
    await callTool({ fieldKey: 'businessPartner' });
    expect(highlight.mock.calls[0][0].note).toBe('');
    await callTool({ fieldKey: 'businessPartner', note: 42 }, 'call-2');
    expect(highlight.mock.calls[1][0].note).toBe('');
  });

  it('resolves a non-field element through the dom-N registry', async () => {
    mount();
    // Fill the registry the way inspect_page_dom does.
    await mainChat().options.onToolCall({
      toolCall: { toolName: 'inspect_page_dom', toolCallId: 'call-0', input: {} },
    });
    const snapshot = mainChat().addToolOutput.mock.calls.at(-1)[0].output;
    const button = snapshot.elements.find(element => element.name === 'Complete');
    const output = await callTool({ elementId: button.elementId, note: 'This posts the order' }, 'call-2');
    expect(highlight.mock.calls[0][0].element).toBe(document.getElementById('complete'));
    expect(output.output).toMatchObject({ ok: true, label: 'Complete' });
  });

  it('reports the label of the element it actually pointed at', async () => {
    // The model uses it to confirm it did not point at the wrong control.
    mount();
    const output = await callTool({ fieldKey: 'businessPartner' });
    expect(output.output.label).toBe('Business Partner');
  });

  it('reports a resolution failure as output-error and highlights nothing', async () => {
    mount();
    const output = await callTool({ fieldKey: 'notARealField' });
    expect(highlight).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      tool: 'highlight_element',
      toolCallId: 'call-1',
      state: 'output-error',
    });
    expect(output.errorText).toMatch(/No field named "notARealField"/);
    expect(output).not.toHaveProperty('output');
  });

  it('reports a call with no target as output-error', async () => {
    mount();
    const output = await callTool({ note: 'somewhere' });
    expect(highlight).not.toHaveBeenCalled();
    expect(output.state).toBe('output-error');
    expect(output.errorText).toBe('highlight_element requires elementId or fieldKey');
  });

  it('reports a password field as output-error', async () => {
    document.body.insertAdjacentHTML('beforeend', '<input type="password" data-testid="field-password" />');
    document.querySelector('input[type="password"]').getBoundingClientRect =
      () => ({ width: 120, height: 24, top: 40, left: 10 });
    mount();
    const output = await callTool({ fieldKey: 'password' });
    expect(highlight).not.toHaveBeenCalled();
    expect(output.state).toBe('output-error');
    expect(output.errorText).toBe('Password fields cannot be highlighted by the Copilot');
  });

  it('never interacts with the element it points at', async () => {
    // Read-only by contract: pointing is not clicking or focusing.
    mount();
    const field = document.getElementById('bp');
    const click = vi.spyOn(field, 'click');
    const focus = vi.spyOn(field, 'focus');
    await callTool({ fieldKey: 'businessPartner', note: 'Pick the customer here' });
    expect(click).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it('works the same when the page-help conversation issues the call', async () => {
    mount();
    await chatInstances[1].options.onToolCall({
      toolCall: { toolName: 'highlight_element', toolCallId: 'ph-1', input: { fieldKey: 'businessPartner' } },
    });
    expect(highlight).toHaveBeenCalledTimes(1);
    expect(chatInstances[1].addToolOutput).toHaveBeenCalled();
    expect(mainChat().addToolOutput).not.toHaveBeenCalled();
  });
});
