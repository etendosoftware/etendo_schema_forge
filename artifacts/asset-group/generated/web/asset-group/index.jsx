import AssetCategoryPage, { api } from './AssetCategoryPage';

const windowMeta = { category: 'finance', name: 'Asset Group' };

// @sf-generated-start component:App
export default function App({ windowName, recordId, token, apiBaseUrl, window, ...rest }) {
  return <AssetCategoryPage windowName={windowName} recordId={recordId} token={token} apiBaseUrl={apiBaseUrl} window={window || windowMeta} api={api} {...rest} />;
}
// @sf-generated-end component:App
