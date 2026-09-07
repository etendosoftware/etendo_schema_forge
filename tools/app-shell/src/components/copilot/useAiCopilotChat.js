import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useLocation, useNavigate } from 'react-router-dom';
import { authHeaders } from '@/auth/api.js';
import { useMenuLabel } from '@/i18n';
import { AmbiguousWindowError, UnknownWindowError, buildWindowRouteIndex, knownWindowSlugs, normalizeWindowKey } from './windowRoutes.js';

/**
 * Guard the router against anything that is not an in-app path. This is the
 * security boundary of the navigation tools (see the ETP-5064 acceptance
 * criteria) and its message must never be reused for a reference the index
 * simply could not resolve — see UnknownWindowError in ./windowRoutes.js.
 */
export function assertInternalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Only internal application paths are allowed');
  }
  return path;
}

/**
 * Resolve whatever the model sent — an explicit path or a window name in any
 * supported language — into a route the router accepts.
 *
 * @param {string} reference
 * @param {import('./windowRoutes.js').WindowRouteIndex} index — from buildWindowRouteIndex()
 */
export function resolveWindowPath(reference, index) {
  // Anything shaped like a path or a URL is a path claim, and a path claim is
  // judged by the security guard — never demoted to a name lookup. Without the
  // URL half, "https://evil.example" fell through to the index, missed, and
  // came back as a mere "unknown window", losing the security signal.
  if (typeof reference === 'string' && (reference.startsWith('/') || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(reference))) {
    return assertInternalPath(reference);
  }
  const key = normalizeWindowKey(reference);
  const slug = index?.get(key);
  if (slug) return `/${slug}`;
  // A label shared by several windows ("Order", "Factura") must never be
  // guessed — routing to the wrong document is worse than asking.
  const candidates = index?.candidatesFor?.(key) ?? [];
  if (candidates.length) throw new AmbiguousWindowError(reference, candidates);
  throw new UnknownWindowError(reference, index);
}

const DOM_INTERACTIVE_SELECTOR = [
  'a[href]', 'button', 'input:not([type="hidden"]):not([type="password"])',
  'textarea', 'select', '[contenteditable="true"]',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
  '[role="checkbox"]', '[role="combobox"]',
].join(',');

function isVisibleElement(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden'
    && rect.width > 0 && rect.height > 0 && !element.closest('[aria-hidden="true"]');
}

function accessibleElementName(element) {
  const label = element.getAttribute('aria-label')
    || element.getAttribute('placeholder')
    || element.getAttribute('title');
  if (label) return label.trim();
  return (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function inspectInteractiveDom(root = document, registry = new Map()) {
  registry.clear();
  const elements = [...root.querySelectorAll(DOM_INTERACTIVE_SELECTOR)]
    .filter(isVisibleElement)
    .slice(0, 200)
    .map((element, index) => {
      const elementId = `dom-${index + 1}`;
      registry.set(elementId, element);
      return {
        elementId,
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        name: accessibleElementName(element),
        type: element.getAttribute('type') || undefined,
        placeholder: element.getAttribute('placeholder') || undefined,
        disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
      };
    });
  return {
    url: window.location.pathname + window.location.search + window.location.hash,
    title: document.title,
    elements,
  };
}

export function formatDomForAgent(snapshot) {
  return [
    `Current URL: ${snapshot.url}`,
    `Page title: ${snapshot.title || '(untitled)'}`,
    'Visible interactive elements:',
    JSON.stringify(snapshot.elements, null, 2),
  ].join('\n');
}

function setInputValue(element, value, append) {
  if (element.matches('input[type="password"]')) throw new Error('Password fields cannot be controlled by the Copilot');
  if (!['INPUT', 'TEXTAREA'].includes(element.tagName) && element.getAttribute('contenteditable') !== 'true') {
    throw new Error('Only text inputs, textareas, and editable elements support text interaction');
  }
  element.focus();
  if (element.getAttribute('contenteditable') === 'true') {
    element.textContent = append ? `${element.textContent || ''}${value}` : value;
  } else {
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, append ? `${element.value}${value}` : value);
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function interactWithDom(registry, { elementId, action, value }) {
  const element = registry.get(elementId);
  if (!element || !element.isConnected || !isVisibleElement(element)) {
    throw new Error('The elementId is unknown or the element is no longer visible; inspect the page again');
  }
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
    throw new Error('The selected element is disabled');
  }
  if (action === 'click') {
    element.click();
  } else if (action === 'fill') {
    if (typeof value !== 'string') throw new Error('fill requires a value');
    setInputValue(element, value, false);
  } else if (action === 'type') {
    if (typeof value !== 'string') throw new Error('type requires a value');
    setInputValue(element, value, true);
  } else if (action === 'press') {
    if (typeof value !== 'string' || !value) throw new Error('press requires a key value');
    element.focus();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: value, bubbles: true }));
  } else {
    throw new Error(`Unsupported DOM action: ${action}`);
  }
  return { ok: true, elementId, action };
}

/**
 * Trace every Copilot tool call in the browser console.
 *
 * The agent decides which tool to call server-side, so when it reports
 * "navigation is not working" the only evidence of WHAT it actually asked for
 * (and what the browser answered) lives in this hook. Without a trace the
 * failure is indistinguishable from the model never calling the tool at all —
 * which is exactly the ambiguity that cost a debugging round in ETP-5064.
 *
 * Gated on `import.meta.env.DEV` so it never leaks tool payloads in a
 * production bundle, and on `window.__ETENDO_COPILOT_TRACE__ !== false` so a
 * noisy session can be silenced from the console.
 */
function traceToolCall(stage, payload) {
  if (!import.meta.env?.DEV) return;
  if (typeof window !== 'undefined' && window.__ETENDO_COPILOT_TRACE__ === false) return;
  // eslint-disable-next-line no-console -- developer-facing trace, DEV only
  console.log(`%c[copilot:tool] ${stage}`, 'color:var(--primary);font-weight:bold', payload);
}

function messageText(message) {
  if (typeof message.content === 'string') return message.content;
  return (message.parts || [])
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

export function useAiCopilotChat({ token, onOpenCopilot, menuGroups }) {
  const navigate = useNavigate();
  const menuLabel = useMenuLabel();
  // filterMenuGroupsByAccess() returns a fresh array on every AppLayout
  // render, so memoize on what actually changes — which windows are reachable
  // — or the index (and the tool callback holding it) would be rebuilt each
  // render.
  const menuSignature = useMemo(
    () => (menuGroups ?? []).flatMap(group => (group?.items ?? []).map(item => item.name)).join(','),
    [menuGroups]
  );
  const menuGroupsRef = useRef(menuGroups);
  menuGroupsRef.current = menuGroups;
  // Built from the access-filtered sidebar groups, so the agent can only
  // navigate where this role can — see windowRoutes.js.
  const windowRouteIndex = useMemo(
    () => buildWindowRouteIndex(menuGroupsRef.current, menuLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menuSignature is the stable identity of menuGroupsRef.current
    [menuSignature, menuLabel]
  );
  const location = useLocation();
  const addToolOutputRef = useRef(null);
  const pendingToolOutputsRef = useRef([]);
  const pageHelpAddToolOutputRef = useRef(null);
  const pageHelpPendingToolOutputsRef = useRef([]);
  const messagesRef = useRef([]);
  const domRegistryRef = useRef(new Map());
  const pageHelpPendingRef = useRef(false);
  const [pageHelpSuggestion, setPageHelpSuggestion] = useState('');
  const [pageHelpActive, setPageHelpActive] = useState(false);
  const [pageHelpError, setPageHelpError] = useState('');

  const executeToolCall = useCallback(async ({ toolCall, outputRef, pendingRef }) => {
    const args = toolCall.input || toolCall.args || {};
    let result;
    let errorText;
    traceToolCall('call', {
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      args,
      argsJson: JSON.stringify(args),
      reachableWindows: knownWindowSlugs(windowRouteIndex),
    });

    try {
      switch (toolCall.toolName) {
        case 'navigate_to': {
          const path = resolveWindowPath(args.path, windowRouteIndex);
          navigate(path);
          result = { ok: true, path };
          break;
        }
        case 'open_form': {
          const path = resolveWindowPath(args.path, windowRouteIndex);
          const target = new URL(path, window.location.origin);
          if (args.recordId) target.searchParams.set('recordId', String(args.recordId));
          navigate(`${target.pathname}${target.search}`);
          result = { ok: true, path: `${target.pathname}${target.search}` };
          break;
        }
        case 'get_current_context':
          result = {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          };
          break;
        case 'open_copilot':
          onOpenCopilot?.();
          result = { ok: true };
          break;
        case 'inspect_page_dom':
          result = inspectInteractiveDom(document, domRegistryRef.current);
          break;
        case 'interact_with_page':
          result = interactWithDom(domRegistryRef.current, args);
          break;
        default:
          traceToolCall('unsupported', { toolName: toolCall.toolName, args });
          return;
      }
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
      traceToolCall('error', {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        args,
        errorName: error instanceof Error ? error.name : 'Error',
        errorText,
      });
    }
    if (!errorText) {
      traceToolCall('result', {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        args,
        result,
      });
    }

    // AI SDK processes onToolCall while consuming the response stream. Its
    // documentation requires addToolOutput to be called without awaiting it;
    // awaiting here deadlocks the stream behind the SDK job queue. Keep the
    // promise so sendAutomaticallyWhen can await it after the stream ends.
    const addToolOutput = outputRef.current;
    if (!addToolOutput) return;
    const outputPromise = addToolOutput({
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      ...(errorText ? { state: 'output-error', errorText } : { output: result }),
    });
    pendingRef.current.push(outputPromise);
  }, [location.hash, location.pathname, location.search, navigate, onOpenCopilot, windowRouteIndex]);

  const executeTool = useCallback(({ toolCall }) => executeToolCall({
    toolCall,
    outputRef: addToolOutputRef,
    pendingRef: pendingToolOutputsRef,
  }), [executeToolCall]);

  const executePageHelpTool = useCallback(({ toolCall }) => executeToolCall({
    toolCall,
    outputRef: pageHelpAddToolOutputRef,
    pendingRef: pageHelpPendingToolOutputsRef,
  }), [executeToolCall]);

  const sendAutomaticallyWhenFor = useCallback(async ({ messages }, pendingRef) => {
    const pendingToolOutputs = pendingRef.current.splice(0);
    if (pendingToolOutputs.length > 0) {
      await Promise.all(pendingToolOutputs);
      return true;
    }
    return lastAssistantMessageIsCompleteWithToolCalls({ messages });
  }, []);
  const sendAutomaticallyWhen = useCallback(
    options => sendAutomaticallyWhenFor(options, pendingToolOutputsRef),
    [sendAutomaticallyWhenFor]
  );
  const sendAutomaticallyWhenForPageHelp = useCallback(
    options => sendAutomaticallyWhenFor(options, pageHelpPendingToolOutputsRef),
    [sendAutomaticallyWhenFor]
  );

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/ai/chat',
    headers: authHeaders(token),
  }), [token]);
  const [input, setInput] = useState('');
  const handlePageHelpFinish = useCallback(({ message }) => {
    if (!pageHelpPendingRef.current) return;
    const hasPendingTool = (message.parts || []).some(part => (
      part.type?.startsWith('tool-')
      && !['output-available', 'output-error', 'output-denied'].includes(part.state)
    ));
    if (hasPendingTool) return;
    const suggestion = messageText(message).trim();
    if (suggestion) setPageHelpSuggestion(suggestion);
    pageHelpPendingRef.current = false;
    setPageHelpActive(false);
  }, []);
  // What the model actually produced for a turn: text, tool calls, or nothing.
  // The model half of the loop is invisible from the browser otherwise — if it
  // never calls navigate_to there is no 'call' trace to read.
  const handleFinish = useCallback(({ message }) => {
    traceToolCall('turn', {
      role: message.role,
      text: messageText(message).slice(0, 400),
      parts: (message.parts || []).map(part => ({
        type: part.type,
        state: part.state,
        input: part.input,
        output: part.output,
        errorText: part.errorText,
      })),
    });
  }, []);
  const chat = useChat({
    transport,
    onToolCall: executeTool,
    sendAutomaticallyWhen,
    onFinish: handleFinish,
  });
  addToolOutputRef.current = chat.addToolOutput;
  messagesRef.current = chat.messages;

  const pageHelpChat = useChat({
    id: 'etendo-go-page-help',
    transport,
    onToolCall: executePageHelpTool,
    sendAutomaticallyWhen: sendAutomaticallyWhenForPageHelp,
    onFinish: handlePageHelpFinish,
  });
  pageHelpAddToolOutputRef.current = pageHelpChat.addToolOutput;

  useEffect(() => {
    if (!pageHelpChat.error || !pageHelpPendingRef.current) return;
    pageHelpPendingRef.current = false;
    setPageHelpActive(false);
    setPageHelpError(pageHelpChat.error.message || 'No se pudo analizar esta pantalla.');
  }, [pageHelpChat.error]);

  const messages = useMemo(() => chat.messages.map(message => ({
    id: message.id,
    role: message.role === 'user' ? 'user' : 'copilot',
    text: messageText(message),
  })).filter(message => message.text || message.role === 'user'), [chat.messages]);

  const sendMessage = useCallback(async (text) => {
    const value = text?.trim();
    if (!value || !token) return;
    setInput('');
    await chat.sendMessage({ text: value });
  }, [chat, token]);

  const requestPageHelp = useCallback(async () => {
    if (!token) {
      setPageHelpError('No hay una sesión disponible para analizar esta pantalla.');
      return;
    }
    if (pageHelpChat.status !== 'ready') return;
    pageHelpPendingRef.current = true;
    setPageHelpActive(true);
    setPageHelpError('');
    setPageHelpSuggestion('');
    const domSnapshot = inspectInteractiveDom(document, new Map());
    try {
      await pageHelpChat.sendMessage({
        text: [
          'Observe the current Etendo Go screen from the DOM text below.',
          'Respond with one concise, user-facing observation about what is visible.',
          'Point out urgent or useful context, such as an overdue sales invoice, and ask whether the user wants help.',
          'Do not call tools, do not navigate, do not modify data, and do not describe this instruction.',
          '',
          formatDomForAgent(domSnapshot),
        ].join('\n'),
      }, { body: { mode: 'page-help' } });
    } catch (error) {
      pageHelpPendingRef.current = false;
      setPageHelpActive(false);
      setPageHelpError(error instanceof Error ? error.message : 'No se pudo analizar esta pantalla.');
    }
  }, [pageHelpChat, token]);

  const showPageHelp = useCallback(() => {
    const suggestion = pageHelpSuggestion.trim();
    setPageHelpSuggestion('');
    onOpenCopilot?.();
    if (suggestion) chat.sendMessage({ text: suggestion });
  }, [chat, onOpenCopilot, pageHelpSuggestion]);

  const actions = useMemo(() => ({
    sendMessage,
    setInput,
    resetConversation: () => chat.setMessages([]),
    startNewConversation: () => chat.setMessages([]),
    stop: chat.stop,
    addToolResult: chat.addToolOutput,
    requestPageHelp,
    showPageHelp,
  }), [chat.addToolOutput, chat.setMessages, chat.stop, requestPageHelp, sendMessage, showPageHelp]);

  return {
    messages,
    input,
    isSending: chat.status === 'submitted' || chat.status === 'streaming',
    error: chat.error?.message || '',
    pageHelpSuggestion,
    pageHelpError: pageHelpError || pageHelpChat.error?.message || '',
    pageHelpActive,
    pageHelpLoading: pageHelpActive || pageHelpChat.status === 'submitted' || pageHelpChat.status === 'streaming',
    actions,
  };
}
