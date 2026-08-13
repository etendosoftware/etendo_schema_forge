import GLJournalPage, { api } from './GLJournalPage';

const windowMeta = { category: 'finance', name: 'Simple G/L Journal', id: 'B917E8A7B0864ACEA9D941E3B7494E53' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <GLJournalPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
