import React from 'react';
import AppIframeHost from '../spike-apps-host/AppIframeHost.jsx';
import { findAppById } from '../../apps-registry.js';

const APP = findAppById('quick-order');
if (!APP) throw new Error('quick-order not found in apps registry');

const SLUG_TO_TYPE = {
  'quick-order-sales': 'sales',
  'quick-order-purchase': 'purchase',
};

export default function QuickOrderWindow({ token, windowName }) {
  const type = SLUG_TO_TYPE[windowName] || 'sales';
  const iframeUrl = `${APP.iframeUrl}?type=${encodeURIComponent(type)}`;
  return (
    <AppIframeHost
      appUrl={iframeUrl}
      appId={APP.appId}
      token={token}
      data-testid="AppIframeHost__9b0138" />
  );
}
