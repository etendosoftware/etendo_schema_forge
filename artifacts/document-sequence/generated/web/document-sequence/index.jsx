import SequencePage, { api } from './SequencePage';

const windowMeta = { category: 'settings', name: 'Document Sequence', id: '112' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <SequencePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
