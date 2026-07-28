import ProductCategoryPage, { api } from './ProductCategoryPage';

const windowMeta = { category: 'inventory', name: 'Product Category', id: '144' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <ProductCategoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
