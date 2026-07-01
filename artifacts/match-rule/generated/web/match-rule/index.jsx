import EtgoMatchRuleHeaderPage, { api } from './EtgoMatchRuleHeaderPage';

const windowMeta = { category: 'finance', name: 'Match Rule' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <EtgoMatchRuleHeaderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
