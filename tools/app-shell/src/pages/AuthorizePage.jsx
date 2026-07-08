import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { createApiFetch } from '@/auth/api.js';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CopyBlock } from '@/components/ui/copy-button';
import { Shield, CheckCircle2, XCircle, Loader2, Plug, Download, Sparkles } from 'lucide-react';
import { useUI } from '@/i18n';
import { buildMcpClients } from '@/lib/mcpClients.js';
import { trackMcpConnectTabSelected } from '@/lib/mcpConnectTelemetry.js';

function detectBaseUrl() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  if (webIdx !== -1) return path.substring(0, webIdx);
  return import.meta.env.VITE_API_BASE || '';
}

function detectMcpUrl() {
  return window.location.origin + '/mcp';
}

const SCOPE_LABELS = {
  'neo:read': { labelKey: 'oauthReadData', descriptionKey: 'oauthReadDataDesc' },
  'neo:write': { labelKey: 'oauthWriteData', descriptionKey: 'oauthWriteDataDesc' },
  'neo:process': { labelKey: 'oauthRunProcesses', descriptionKey: 'oauthRunProcessesDesc' },
  'neo:report': { labelKey: 'oauthGenerateReports', descriptionKey: 'oauthGenerateReportsDesc' },
  'neo:*': { labelKey: 'oauthFullAccess', descriptionKey: 'oauthFullAccessDesc' },
};

export default function AuthorizePage() {
  const { token, username, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('idle'); // idle | authorizing | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const ui = useUI();
  const isEmbedded = searchParams.get('embedded') === '1';

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const codeChallenge = searchParams.get('code_challenge');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope') || 'neo:read neo:write';
  const responseType = searchParams.get('response_type');

  const scopes = scope.split(/\s+/).filter(Boolean);
  const isOAuthFlow = !!(clientId && redirectUri && codeChallenge && responseType === 'code');

  const apiFetch = useMemo(
    () => createApiFetch(detectBaseUrl(), () => token, logout),
    [token, logout]
  );

  async function handleAuthorize() {
    setStatus('authorizing');
    setErrorMessage('');
    try {
      const res = await fetch('/oauth2/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          token,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          state,
          scope,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error_description || err.error || `Authorization failed (${res.status})`);
      }

      const data = await res.json();
      if (data.redirect_url) {
        setStatus('success');
        setTimeout(() => {
          window.location.href = data.redirect_url;
        }, 1000);
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err.message);
    }
  }

  function handleDeny() {
    if (redirectUri) {
      const sep = redirectUri.includes('?') ? '&' : '?';
      window.location.href = `${redirectUri}${sep}error=access_denied&error_description=User+denied+the+request${state ? `&state=${state}` : ''}`;
    }
  }

  // No OAuth params — show the connections landing page
  if (!isOAuthFlow) {
    return (
      <ConnectionsLanding
        isEmbedded={isEmbedded}
        ui={ui}
        data-testid="ConnectionsLanding__96270f" />
    );
  }

  return (
    <div
      data-testid="oauth-consent-view"
      className={isEmbedded ? 'flex min-h-screen items-center justify-center p-4' : 'flex min-h-[80vh] items-center justify-center p-4'}
    >
      <Card className="w-full max-w-md" data-testid="Card__96270f">
        <CardContent className="pt-6" data-testid="CardContent__96270f">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Shield className="h-7 w-7 text-primary" data-testid="Shield__96270f" />
            </div>

            <div className="text-center">
              <h1 className="text-xl font-semibold">{ui('oauthAuthorizeConnection')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {ui('oauthAuthorizeConnectionDesc')}
              </p>
            </div>

            <div className="w-full rounded-lg border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">{ui('oauthApplication')}</div>
              <div className="mt-0.5 font-mono text-sm">{clientId}</div>
            </div>

            <div className="w-full rounded-lg border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground">{ui('oauthSignedInAs')}</div>
              <div className="mt-0.5 text-sm font-medium">{username}</div>
            </div>

            <div className="w-full">
              <div
                data-testid="oauth-requested-permissions"
                className="mb-2 text-xs font-medium text-muted-foreground"
              >
                {ui('oauthRequestedPermissions')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {scopes.map((s) => {
                  const info = SCOPE_LABELS[s];
                  const label = info ? ui(info.labelKey) : s;
                  const description = info ? ui(info.descriptionKey) : '';
                  return (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="text-xs"
                      title={description}
                      data-testid="Badge__96270f">
                      {label}
                    </Badge>
                  );
                })}
              </div>
            </div>

            {status === 'error' && (
              <div className="flex w-full items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" data-testid="XCircle__96270f" />
                {errorMessage}
              </div>
            )}

            {status === 'success' ? (
              <div className="flex w-full items-center gap-2 rounded-lg border border-green-500/30 bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" data-testid="CheckCircle2__96270f" />
                {ui('oauthAuthorizedRedirecting')}
              </div>
            ) : (
              <div className="flex w-full gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleDeny}
                  disabled={status === 'authorizing'}
                  data-testid="oauth-deny"
                >
                  {ui('oauthDeny')}
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleAuthorize}
                  disabled={status === 'authorizing'}
                  data-testid="oauth-authorize-submit"
                >
                  {status === 'authorizing' ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" data-testid="Loader2__96270f" /> {ui('oauthAuthorizing')}</>
                  ) : (
                    ui('oauthAuthorize')
                  )}
                </Button>
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              {ui('oauthRedirect')}: <span className="font-mono">{redirectUri}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepRow({ num, text }) {
  return (
    <li className="flex gap-2 text-sm text-muted-foreground">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
        {num}
      </span>
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}

function InstallButton({ href, label, testId }) {
  return (
    <Button
      type="button"
      className="w-full"
      onClick={() => { window.location.href = href; }}
      data-testid={testId}
    >
      <Download className="mr-2 h-4 w-4" data-testid="InstallButton__icon" />
      {label}
    </Button>
  );
}

function AgentPromptBlock({ ui, mcpUrl, clientId }) {
  return (
    <div className="w-full space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" data-testid="AgentPromptBlock__icon" />
        {ui('oauthConnectAgentPromptHeading')}
      </div>
      <CopyBlock
        value={ui('oauthConnectAgentPrompt', { mcpUrl })}
        data-testid={`mcp-agent-prompt-${clientId}`}
      />
    </div>
  );
}

/**
 * Renders the ordered instruction content for a single client (or sub-tab).
 * `idForKeys` is the client/sub-tab id used to derive step i18n keys.
 */
function McpInstructions({ content, idForKeys, ui, mcpUrl }) {
  const items = [];
  let list = [];

  const flushList = (key) => {
    if (list.length) {
      items.push(<ol key={`ol-${key}`} className="space-y-2">{list}</ol>);
      list = [];
    }
  };

  content.forEach((item, i) => {
    if (item.step != null) {
      const key = item.key || `oauthConnect${idForKeys}Step${item.step}`;
      list.push(<StepRow key={`s-${i}`} num={item.step} text={ui(key)} />);
      return;
    }
    flushList(i);
    if (item.note) {
      items.push(
        <p key={`n-${i}`} className="rounded-md border border-amber-500/30 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {ui(item.note)}
        </p>,
      );
    } else if (item.subheading) {
      items.push(<h3 key={`h-${i}`} className="pt-1 text-sm font-medium">{ui(item.subheading)}</h3>);
    } else if (item.code != null) {
      items.push(<CopyBlock key={`c-${i}`} value={item.code} data-testid={`mcp-code-${idForKeys}-${i}`} />);
    } else if (item.install) {
      items.push(
        <InstallButton
          key={`i-${i}`}
          href={item.install.href}
          label={ui(item.install.labelKey)}
          testId={`mcp-install-${idForKeys}`}
        />,
      );
    } else if (item.agentPrompt) {
      items.push(<AgentPromptBlock key={`a-${i}`} ui={ui} mcpUrl={mcpUrl} clientId={idForKeys} />);
    }
  });
  flushList('end');

  return <div className="w-full space-y-3">{items}</div>;
}

function ClaudeDesktopContent({ client, ui, mcpUrl, onSubTabSelect }) {
  const [sub, setSub] = useState(client.subTabs[0].id);

  const handleSub = (value) => {
    setSub(value);
    onSubTabSelect(value);
  };

  return (
    <Tabs value={sub} onValueChange={handleSub} className="w-full gap-4">
      <TabsList className="border-b">
        {client.subTabs.map((st) => (
          <TabsTrigger
            key={st.id}
            value={st.id}
            data-testid={`mcp-subtab-${st.id}`}
          >
            {ui(`oauthConnectTab${st.id}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {client.subTabs.map((st) => (
        <TabsContent key={st.id} value={st.id}>
          <McpInstructions content={st.content} idForKeys={st.id} ui={ui} mcpUrl={mcpUrl} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ConnectionsLanding({ isEmbedded, ui }) {
  const mcpUrl = useMemo(() => detectMcpUrl(), []);
  const clients = useMemo(() => buildMcpClients(mcpUrl), [mcpUrl]);
  const [activeClient, setActiveClient] = useState(null);

  const handleTabSelect = (id) => {
    setActiveClient(id);
    const client = clients.find((c) => c.id === id);
    // Claude Desktop reports its active sub-tab (default: first) as the client id.
    const telemetryClient = client?.subTabs ? client.subTabs[0].id : id;
    trackMcpConnectTabSelected({ client: telemetryClient });
  };

  return (
    <div className={isEmbedded ? 'flex min-h-screen items-center justify-center p-4' : 'flex flex-1 min-h-0 justify-center overflow-y-auto p-4'}>
      <Card className="w-full max-w-5xl my-auto" data-testid="Card__96270f">
        <CardContent className="pt-6" data-testid="CardContent__96270f">
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Plug className="h-7 w-7 text-primary" data-testid="Plug__96270f" />
            </div>

            <div className="text-center">
              <h1 className="text-xl font-semibold">{ui('oauthConnectHeading')}</h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {ui('oauthConnectSubheading')}
              </p>
            </div>

            <div className="w-full rounded-lg border bg-muted/30 p-4" data-testid="mcp-server-url">
              <div className="mb-2 text-xs font-medium text-muted-foreground">{ui('oauthMcpServerUrl')}</div>
              <CopyBlock value={mcpUrl} data-testid="mcp-server-url-copy" />
            </div>

            <Tabs
              value={activeClient ?? ''}
              onValueChange={handleTabSelect}
              className="w-full gap-4"
              data-testid="mcp-client-tabs"
            >
              <TabsList className="flex-wrap border-b">
                {clients.map((client) => (
                  <TabsTrigger
                    key={client.id}
                    value={client.id}
                    data-testid={`mcp-tab-${client.id}`}
                  >
                    {ui(`oauthConnectTab${client.id}`)}
                  </TabsTrigger>
                ))}
              </TabsList>

              {activeClient == null ? (
                <p className="py-6 text-center text-sm text-muted-foreground" data-testid="mcp-client-placeholder">
                  {ui('oauthConnectPickClient')}
                </p>
              ) : null}

              {clients.map((client) => (
                <TabsContent key={client.id} value={client.id}>
                  {client.subTabs ? (
                    <ClaudeDesktopContent
                      client={client}
                      ui={ui}
                      mcpUrl={mcpUrl}
                      onSubTabSelect={(subId) => trackMcpConnectTabSelected({ client: subId })}
                    />
                  ) : (
                    <McpInstructions content={client.content} idForKeys={client.id} ui={ui} mcpUrl={mcpUrl} />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
