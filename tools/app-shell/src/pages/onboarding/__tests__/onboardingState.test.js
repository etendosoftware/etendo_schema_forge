import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProgressMessage,
  buildEnvironmentSessionStorage,
  buildOnboardingPayload,
  initialSetupSteps,
  isCompanyStepValid,
  isProfileStepValid,
  mapBackendStepStatus,
  selectPreferredOrg,
} from '../onboardingState.js';

describe('onboardingState', () => {
  it('initialSetupSteps returns fresh pending step objects', () => {
    const first = initialSetupSteps();
    const second = initialSetupSteps();

    first[0].status = 'done';

    assert.equal(second[0].name, 'setup');
    assert.equal(second[0].status, 'pending');
    assert.notEqual(first[0], second[0]);
    assert.deepEqual(second.map(step => step.name), [
      'setup',
      'client',
      'organization',
      'dataset',
      'sequences',
      'finalize',
    ]);
  });


  it('mapBackendStepStatus preserves frontend status vocabulary', () => {
    assert.equal(mapBackendStepStatus('in_progress'), 'running');
    assert.equal(mapBackendStepStatus('done'), 'done');
    assert.equal(mapBackendStepStatus('error'), 'failed');
    assert.equal(mapBackendStepStatus('pending'), 'pending');
  });

  it('applyProgressMessage updates only the matching step', () => {
    const steps = initialSetupSteps();
    const next = applyProgressMessage(steps, {
      type: 'progress',
      step: 'client',
      status: 'done',
      ms: 123,
    });

    assert.equal(next.find(step => step.name === 'client').status, 'done');
    assert.equal(next.find(step => step.name === 'client').ms, 123);
    assert.equal(next.find(step => step.name === 'organization').status, 'pending');
  });

  it('applyProgressMessage stores error text for failed steps', () => {
    const next = applyProgressMessage(initialSetupSteps(), {
      type: 'progress',
      step: 'organization',
      status: 'error',
      message: 'Organization failed',
    });

    const failed = next.find(step => step.name === 'organization');
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'Organization failed');
  });

  it('buildOnboardingPayload sends only fields owned by the onboarding API contract', () => {
    assert.deepEqual(buildOnboardingPayload({
      fullName: 'QA User',
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      fiscalIdValue: 'B12345678',
      address: 'QA Street',
    }), {
      clientName: 'QA Company',
      currency: 'EUR',
      language: 'es_ES',
      countryCode: 'ES',
      address: 'QA Street',
    });
  });

  it('selectPreferredOrg prefers a non-star organization', () => {
    assert.deepEqual(selectPreferredOrg({
      orgList: [
        { id: 'STAR', name: '*' },
        { id: 'ORG_1', name: 'QA Org' },
      ],
    }), { id: 'ORG_1', name: 'QA Org' });
  });

  it('selectPreferredOrg falls back to the first organization', () => {
    assert.deepEqual(selectPreferredOrg({
      orgList: [{ id: 'STAR', name: '*' }],
    }), { id: 'STAR', name: '*' });
  });

  it('buildEnvironmentSessionStorage serializes environment login state', () => {
    const storage = buildEnvironmentSessionStorage(
      { adminUserName: 'QA Admin', adminUser: 'qa-admin' },
      {
        token: 'env-token',
        roleList: [
          {
            id: 'ROLE_1',
            name: 'Admin',
            orgList: [{ id: 'ORG_1', name: 'QA Org' }],
          },
        ],
      }
    );

    assert.equal(storage.sf_auth_token, 'env-token');
    assert.equal(storage.sf_auth_user, 'QA Admin');
    assert.equal(JSON.parse(storage.sf_auth_rolelist)[0].id, 'ROLE_1');
    assert.equal(JSON.parse(storage.sf_auth_selected_role).id, 'ROLE_1');
    assert.equal(JSON.parse(storage.sf_auth_selected_org).id, 'ORG_1');
  });

  it('isProfileStepValid requires full name and country', () => {
    assert.equal(isProfileStepValid({ fullName: 'QA User', countryCode: 'ES' }), true);
    assert.equal(isProfileStepValid({ fullName: ' ', countryCode: 'ES' }), false);
    assert.equal(isProfileStepValid({ fullName: 'QA User', countryCode: '' }), false);
  });

  it('isCompanyStepValid requires company name and fiscal id', () => {
    assert.equal(isCompanyStepValid({ clientName: 'QA Company', fiscalIdValue: 'B12345678' }), true);
    assert.equal(isCompanyStepValid({ clientName: ' ', fiscalIdValue: 'B12345678' }), false);
    assert.equal(isCompanyStepValid({ clientName: 'QA Company', fiscalIdValue: ' ' }), false);
  });
});
