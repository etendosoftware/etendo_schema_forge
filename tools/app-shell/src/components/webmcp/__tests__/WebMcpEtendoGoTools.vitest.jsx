import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  copilotOpen: vi.fn(),
  copilotSendMessage: vi.fn(),
  agentProps: {},
}));

vi.mock('@etendosoftware/app-shell-core/webmcp', () => ({
  WebMcpMcpTools: (props) => <div data-testid="mcp-tools" data-enabled={String(props.enabled)} data-endpoint={props.endpoint} data-token={props.accessToken} />,
  WebMcpAgentTools: (props) => {
    mocks.agentProps.current = props;
    return <div data-testid="agent-tools" data-enabled={String(props.enabled)} />;
  },
}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'browser-session-token' }) }));
vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({
    open: mocks.copilotOpen,
    actions: { sendMessage: mocks.copilotSendMessage },
  }),
}));
vi.mock('@/components/CurrentWindowContext', () => ({ useCurrentWindowContext: () => ({ current: null }) }));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/orders', search: '' }),
  useNavigate: () => vi.fn(),
}));

import { WebMcpEtendoGoTools } from '../WebMcpEtendoGoTools.jsx';

describe('WebMcpEtendoGoTools', () => {
  it('passes the existing browser session to the dynamic MCP bridge', () => {
    render(<WebMcpEtendoGoTools />);

    expect(screen.getByTestId('mcp-tools')).toHaveAttribute('data-enabled', 'true');
    expect(screen.getByTestId('mcp-tools')).toHaveAttribute('data-endpoint', '/mcp');
    expect(screen.getByTestId('mcp-tools')).toHaveAttribute('data-token', 'browser-session-token');
    expect(screen.getByTestId('agent-tools')).toHaveAttribute('data-enabled', 'true');
  });

  it('opens the existing Copilot popup and sends the WebMCP message through it', async () => {
    render(<WebMcpEtendoGoTools />);

    await mocks.agentProps.current.openChat({ message: 'Find open orders' });

    expect(mocks.copilotOpen).toHaveBeenCalledTimes(1);
    expect(mocks.copilotSendMessage).toHaveBeenCalledWith('Find open orders');
  });
});
