import ReturnMaterialReceiptPage, { api } from './ReturnMaterialReceiptPage';

const windowMeta = { category: 'sales', name: 'Return Material Receipt', id: '123271B9AD60469BAE8A924841456B63' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ReturnMaterialReceiptPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
