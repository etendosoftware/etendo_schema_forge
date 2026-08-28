import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useLocation, useNavigate } from 'react-router-dom';

export function assertInternalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Only internal application paths are allowed');
  }
  return path;
}

const WINDOW_ROUTE_ALIASES = {
  'goods receipt': '/goods-receipt',
  'goods-receipt': '/goods-receipt',
  'albaran de compra': '/goods-receipt',
  'albaranes de compra': '/goods-receipt',
  'goods shipment': '/goods-shipment',
  'goods-shipment': '/goods-shipment',
  'albaran de venta': '/goods-shipment',
  'albaranes de venta': '/goods-shipment',
};

export function resolveWindowPath(path) {
  if (typeof path === 'string') {
    const alias = WINDOW_ROUTE_ALIASES[path.trim().toLowerCase()];
    if (alias) return alias;
  }
  return assertInternalPath(path);
}

export function inferWindowPath(messages) {
  const latestUserMessage = [...messages].reverse().find(message => message.role === 'user');
  const userText = latestUserMessage ? messageText(latestUserMessage) : '';
  if (/\b(venta|ventas|shipment|env[ií]o|env[ií]os)\b/i.test(userText)) return '/goods-shipment';
  if (/\b(compra|compras|receipt|recepci[oó]n|recepciones)\b/i.test(userText)) return '/goods-receipt';

  const latestAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant');
  const assistantText = latestAssistantMessage ? messageText(latestAssistantMessage) : '';
  if (/\b(albar[aá]n(?:es)?\s+de\s+venta|goods shipment|shipment)\b/i.test(assistantText)) {
    return '/goods-shipment';
  }
  if (/\b(albar[aá]n(?:es)?\s+de\s+compra|goods receipt|receipt)\b/i.test(assistantText)) {
    return '/goods-receipt';
  }
  return null;
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

function messageText(message) {
  if (typeof message.content === 'string') return message.content;
  return (message.parts || [])
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');
}

export function useAiCopilotChat({ token, onOpenCopilot }) {
  const navigate = useNavigate();
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

    try {
      switch (toolCall.toolName) {
        case 'navigate_to': {
          const path = resolveWindowPath(args.path);
          navigate(path);
          result = { ok: true, path };
          break;
        }
        case 'open_form': {
          const path = resolveWindowPath(args.path || inferWindowPath(messagesRef.current));
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
          return;
      }
    } catch (error) {
      errorText = error instanceof Error ? error.message : String(error);
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
  }, [location.hash, location.pathname, location.search, navigate, onOpenCopilot]);

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
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
  const chat = useChat({
    transport,
    onToolCall: executeTool,
    sendAutomaticallyWhen,
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
