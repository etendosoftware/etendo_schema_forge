import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WebMcpAgentTools, WebMcpMcpTools } from '@etendosoftware/app-shell-core/webmcp';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useCopilot } from '@/components/CopilotContext';
import { useCurrentWindowContext } from '@/components/CurrentWindowContext';
import { useFeatureFlag, WEBMCP_AGENT_CHAT } from '@/lib/flags';

/**
 * Etendo Go consumer wiring for the reusable Core WebMCP bridge.
 * The access token is the current browser session token; no MCP login or
 * second credential is created for the in-page agent.
 */
export function WebMcpEtendoGoTools() {
  const enabled = useFeatureFlag(WEBMCP_AGENT_CHAT);
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { current } = useCurrentWindowContext();
  const copilot = useCopilot();
  const endpoint = import.meta.env.VITE_MCP_ENDPOINT || '/mcp';

  const context = useMemo(() => ({
    pathname: location.pathname,
    search: location.search,
    window: current,
  }), [current, location.pathname, location.search]);
  const getContext = useCallback(async () => context, [context]);
  const openChat = useCallback(async ({ message } = {}) => {
    copilot.open();
    if (message?.trim() && typeof copilot.actions?.sendMessage === 'function') {
      await copilot.actions.sendMessage(message);
    }
  }, [copilot.actions, copilot.open]);

  return (
    <>
      <WebMcpMcpTools
        enabled={enabled}
        endpoint={endpoint}
        accessToken={token}
        data-testid="WebMcpMcpTools__3c602a" />
      <WebMcpAgentTools
        enabled={enabled}
        getContext={getContext}
        navigate={navigate}
        openChat={openChat}
        data-testid="WebMcpAgentTools__3c602a" />
    </>
  );
}
