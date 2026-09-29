/**
 * The single place the host imports observability provider SDKs (ETP-4578).
 *
 * Every telemetry payload has to cross the core's sanitizing gateway, whose provider adapters
 * receive their SDK by injection. A component that imported `@sentry/react`, `mixpanel-browser`
 * or `aws-rum-web` itself could reach a provider without passing through any of it, so
 * `test/no-direct-provider-sdk.test.js` fails on any other file that does.
 */
import * as Sentry from '@sentry/react';
import { AwsRum } from 'aws-rum-web';

export { Sentry, AwsRum };

// Lazy on purpose: Mixpanel is opt-in, and the SDK should only be downloaded when it is used.
export const loadMixpanel = () => import('mixpanel-browser');
