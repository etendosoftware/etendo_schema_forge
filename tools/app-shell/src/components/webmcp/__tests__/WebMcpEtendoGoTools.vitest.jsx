import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useFeatureFlag: vi.fn(() => true),
  copilotOpen: vi.fn(),
}));

vi.mock('@etendosoftware/app-shell-core/webmcp', () => ({
  WebMcpMcpTools: (props) => <div data-testid="mcp-tools" data-enabled={String(props.enabled)} data-endpoint={props.endpoint} data-token={props.accessToken} />,
  WebMcpAgentTools: (props) => <div data-testid="agent-tools" data-enabled={String(props.enabled)} />,
}));
vi.mock('@/lib/flags', () => ({
  WEBMCP_AGENT_CHAT: 'webmcp-agent-chat',
  useFeatureFlag: mocks.useFeatureFlag,
}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'browser-session-token' }) }));
vi.mock('@/components/CopilotContext', () => ({ useCopilot: () => ({ open: mocks.copilotOpen }) }));
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
  });

  it('disables both WebMCP surfaces when the feature flag is off', () => {
    mocks.useFeatureFlag.mockReturnValue(false);
    render(<WebMcpEtendoGoTools />);

    expect(screen.getByTestId('mcp-tools')).toHaveAttribute('data-enabled', 'false');
    expect(screen.getByTestId('agent-tools')).toHaveAttribute('data-enabled', 'false');
  });
});
