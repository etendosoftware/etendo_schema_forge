import EtgoMatchRuleHeaderPage, { api } from './EtgoMatchRuleHeaderPage';

const windowMeta = { category: 'finance', name: 'Match Rule', id: '24963D64E83B4543A7F6BD248CF944EE' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <EtgoMatchRuleHeaderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
