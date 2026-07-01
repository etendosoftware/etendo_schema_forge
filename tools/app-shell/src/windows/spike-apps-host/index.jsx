import React from 'react';
import AppIframeHost from './AppIframeHost.jsx';
import { findAppById } from '../../apps-registry.js';

const APP = findAppById('spike-hello-app');

export default function SpikeHelloAppWindow({ token }) {
  return (
    <AppIframeHost
      appUrl={import.meta.env.VITE_SPIKE_APP_URL || APP.iframeUrl}
      appId={APP.appId}
      token={token}
      data-testid="AppIframeHost__fc61ef" />
  );
}
