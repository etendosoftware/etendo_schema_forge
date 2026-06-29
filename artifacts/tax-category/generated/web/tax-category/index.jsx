import TaxCategoryPage, { api } from './TaxCategoryPage';

const windowMeta = { category: 'configuration', name: 'Tax Category' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <TaxCategoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
