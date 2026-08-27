import { useCallback, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { useLocation, useNavigate } from 'react-router-dom';

export function assertInternalPath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Only internal application paths are allowed');
  }
  return path;
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
  const addToolResultRef = useRef(null);

  const executeTool = useCallback(async ({ toolCall }) => {
    const args = toolCall.args || {};
    let result;

    switch (toolCall.toolName) {
      case 'navigate_to': {
        const path = assertInternalPath(args.path);
        navigate(path);
        result = { ok: true, path };
        break;
      }
      case 'open_form': {
        const path = assertInternalPath(args.path);
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
      default:
        return;
    }

    addToolResultRef.current?.({ toolCallId: toolCall.toolCallId, result });
  }, [location.hash, location.pathname, location.search, navigate, onOpenCopilot]);

  const chat = useChat({
    api: '/api/ai/chat',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    maxSteps: 8,
    onToolCall: executeTool,
  });
  addToolResultRef.current = chat.addToolResult;

  const messages = useMemo(() => chat.messages.map(message => ({
    id: message.id,
    role: message.role === 'user' ? 'user' : 'copilot',
    text: messageText(message),
  })).filter(message => message.text || message.role === 'user'), [chat.messages]);

  const sendMessage = useCallback(async (text) => {
    const value = text?.trim();
    if (!value || !token) return;
    chat.setInput('');
    await chat.append({ role: 'user', content: value });
  }, [chat, token]);

  const actions = useMemo(() => ({
    sendMessage,
    setInput: chat.setInput,
    resetConversation: () => chat.setMessages([]),
    startNewConversation: () => chat.setMessages([]),
    stop: chat.stop,
    addToolResult: chat.addToolResult,
  }), [chat.addToolResult, chat.setInput, chat.setMessages, chat.stop, sendMessage]);

  return {
    messages,
    input: chat.input,
    isSending: chat.isLoading,
    error: chat.error?.message || '',
    actions,
  };
}
