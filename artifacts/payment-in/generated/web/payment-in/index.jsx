import FinPaymentPage, { api } from './FinPaymentPage';

const windowMeta = { category: 'finance', name: 'Payment In', id: 'E547CE89D4C04429B6340FFA44E70716' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <FinPaymentPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
