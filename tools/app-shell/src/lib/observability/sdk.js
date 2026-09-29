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

// `aws-rum-web` is pinned to an EXACT version in package.json: the core's RUM adapter sanitizes
// batches through the SDK's private `defaultClientBuilder`, so a bump must be deliberate. The
// adapter fails closed if it disappears, and the real-SDK test goes red.
export { Sentry, AwsRum };

// Lazy on purpose: Mixpanel is opt-in, and the SDK should only be downloaded when it is used.
export const loadMixpanel = () => import('mixpanel-browser');
