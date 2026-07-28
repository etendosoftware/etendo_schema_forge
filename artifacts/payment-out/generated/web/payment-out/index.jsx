import HeaderPage, { api } from './HeaderPage';

const windowMeta = { category: 'finance', name: 'Payment Out', id: '6F8F913FA60F4CBD93DC1D3AA696E76E' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <HeaderPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
