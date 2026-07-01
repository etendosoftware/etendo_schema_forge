import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoogleSsoPayload,
  getConfiguredSsoProviders,
  loadGoogleIdentityScript,
  readCookie,
  renderSsoProviderButton,
} from '../onboardingSso.js';

describe('onboardingSso', () => {
  it('returns only configured providers', () => {
    assert.deepEqual(getConfiguredSsoProviders({}), []);
    assert.deepEqual(getConfiguredSsoProviders({
      VITE_GOOGLE_CLIENT_ID: ' client-id.apps.googleusercontent.com ',
    }), [{
      id: 'google',
      clientId: 'client-id.apps.googleusercontent.com',
    }]);
  });

  it('reads encoded cookies by name', () => {
    const documentRef = {
      cookie: 'other=value; g_csrf_token=csrf-token; session=abc',
    };

    assert.equal(readCookie('g_csrf_token', documentRef), 'csrf-token');
    assert.equal(readCookie('missing', documentRef), '');
  });

  it('builds the Google SSO payload without browser profile fields', () => {
    const payload = buildGoogleSsoPayload({
      credential: 'id-token',
      clientId: 'client-id.apps.googleusercontent.com',
      select_by: 'btn',
      email: 'browser@example.com',
      name: 'Browser User',
      g_csrf_token: 'csrf-token',
    });

    assert.deepEqual(payload, {
      credential: 'id-token',
    });
  });

  it('rejects incomplete Google SSO responses', () => {
    assert.throws(() => buildGoogleSsoPayload({ credential: '' }), {
      code: 'onboardingSsoFailed',
    });
  });

  it('rejects when the Google script loads without the identity API', async () => {
    const scripts = [];
    const documentRef = {
      createElement: () => ({}),
      head: {
        appendChild: (script) => scripts.push(script),
      },
    };

    const promise = loadGoogleIdentityScript(documentRef, {});
    scripts[0].onload();

    await assert.rejects(promise, /Google Identity Services could not be loaded/);
  });

  it('renders the Google button without requiring callbacks', async () => {
    let initializedOptions;
    let rendered = false;
    const container = {
      clientWidth: 320,
      replaceChildren: () => {},
    };
    const windowRef = {
      google: {
        accounts: {
          id: {
            initialize: (options) => {
              initializedOptions = options;
            },
            renderButton: () => {
              rendered = true;
            },
          },
        },
      },
    };

    await renderSsoProviderButton({
      id: 'google',
      clientId: 'client-id.apps.googleusercontent.com',
    }, container, undefined, { documentRef: {}, windowRef });

    assert.equal(rendered, true);
    assert.doesNotThrow(() => initializedOptions.callback({ credential: 'id-token' }));
    assert.doesNotThrow(() => initializedOptions.callback({ credential: '' }));
  });
});
