import TransactionTypePage, { api } from './TransactionTypePage';

const windowMeta = { category: 'finance', name: 'Transaction Type', id: '82922976BB524D1BAA3CF8462B9219FE' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <TransactionTypePage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
