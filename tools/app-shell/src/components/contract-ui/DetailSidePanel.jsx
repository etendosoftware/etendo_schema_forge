import React from 'react';
import { renderSidePanel } from './detailViewHelpers.jsx';

export function DetailSidePanel({
  sidePanel,
  sidePanelStyle,
  data,
  recordId,
  token,
  apiBaseUrl,
  api,
  isNew,
}) {
  return (
    <div
      className="w-full max-w-full shrink-0 self-stretch border-t lg:border-t-0 lg:w-[292px] lg:border-l border-border-subtle pt-3 lg:pt-0 pl-0 lg:pl-3 pr-0 lg:pr-3"
      style={sidePanelStyle}
    >
      {renderSidePanel(sidePanel, data, recordId, token, apiBaseUrl, api, isNew)}
    </div>
  );
}

export default DetailSidePanel;
