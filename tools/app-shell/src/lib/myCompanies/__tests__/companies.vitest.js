// @covers tools/app-shell/src/lib/myCompanies/companies.js

import { groupCompanies, isOpenInvitation, uniqueCompanies } from '../companies.js';

const NOW = Date.parse('2026-10-13T12:00:00Z');

describe('uniqueCompanies', () => {
  it('keeps one entry per company although /environments lists one per organization', () => {
    const companies = uniqueCompanies([
      { clientId: 'a', clientName: 'Acme', orgName: 'Acme North', plan: 'free' },
      { clientId: 'a', clientName: 'Acme', orgName: 'Acme South', plan: 'free' },
      { clientId: 'b', clientName: 'Beta', plan: 'free' },
    ]);

    expect(companies.map((env) => env.clientId)).toEqual(['a', 'b']);
    expect(companies[0].orgName).toBe('Acme North');
  });

  it('puts the productive company first, like the rest of the app, and skips entries with no client', () => {
    const companies = uniqueCompanies([
      { clientId: 'a', clientName: 'Acme', plan: 'free' },
      { clientId: 'z', clientName: 'Zeta', plan: 'productive' },
      { clientName: 'Orphan' },
      null,
    ]);

    expect(companies.map((env) => env.clientId)).toEqual(['z', 'a']);
  });

  it('treats a missing list as empty', () => {
    expect(uniqueCompanies(undefined)).toEqual([]);
  });
});

describe('isOpenInvitation', () => {
  it.each([
    ['PENDING', true],
    ['SENT', true],
    ['sent', true],
    ['ACCEPTED', false],
    ['REVOKED', false],
    ['EXPIRED', false],
    ['DELIVERY_FAILED', false],
    [undefined, false],
  ])('status %s → open %s', (status, expected) => {
    expect(isOpenInvitation({ status }, NOW)).toBe(expected);
  });

  it('treats a PENDING/SENT row past its expiry as closed, since the backend flips it lazily', () => {
    expect(isOpenInvitation({ status: 'SENT', expiresAt: '2026-10-12T00:00:00Z' }, NOW)).toBe(false);
    expect(isOpenInvitation({ status: 'SENT', expiresAt: '2026-10-20T00:00:00Z' }, NOW)).toBe(true);
  });

  it('keeps an invitation open when its expiry is missing or unreadable', () => {
    expect(isOpenInvitation({ status: 'PENDING' }, NOW)).toBe(true);
    expect(isOpenInvitation({ status: 'PENDING', expiresAt: 'not-a-date' }, NOW)).toBe(true);
  });
});

describe('groupCompanies', () => {
  const environments = [
    { clientId: 'own-1', clientName: 'GOClient', relationship: 'OWNER', plan: 'productive' },
    { clientId: 'own-2', clientName: 'GOClient Retail', relationship: 'OWNER', plan: 'free' },
    { clientId: 'inv-1', clientName: 'Distribuciones Norte', relationship: 'INVITED', plan: 'free' },
    { clientId: 'inv-2', clientName: 'Ferreteria Sol', relationship: 'INVITED', plan: 'free' },
  ];

  it('splits owned and invited companies', () => {
    const { owned, invited, pendingInvitations } = groupCompanies(environments, [], NOW);

    expect(owned.map((env) => env.clientId)).toEqual(['own-1', 'own-2']);
    expect(invited.map((env) => env.clientId)).toEqual(['inv-1', 'inv-2']);
    expect(pendingInvitations).toEqual([]);
  });

  it('shows an invited company with an open invitation only in the pending notice', () => {
    const invitations = [
      { id: 'i-1', clientId: 'inv-2', clientName: 'Ferreteria Sol', status: 'SENT' },
      { id: 'i-2', clientId: 'inv-1', clientName: 'Distribuciones Norte', status: 'ACCEPTED' },
    ];

    const { invited, pendingInvitations } = groupCompanies(environments, invitations, NOW);

    expect(pendingInvitations.map((invitation) => invitation.id)).toEqual(['i-1']);
    expect(invited.map((env) => env.clientId)).toEqual(['inv-1']);
  });

  it('never hides an owned company behind an invitation', () => {
    const invitations = [{ id: 'i-1', clientId: 'own-2', status: 'PENDING' }];

    const { owned } = groupCompanies(environments, invitations, NOW);

    expect(owned.map((env) => env.clientId)).toEqual(['own-1', 'own-2']);
  });

  it('keeps an invitation without a client id in the notice without hiding any company', () => {
    const { invited, pendingInvitations } = groupCompanies(
      environments,
      [{ id: 'i-1', clientName: 'Old backend', status: 'SENT' }],
      NOW,
    );

    expect(pendingInvitations).toHaveLength(1);
    expect(invited).toHaveLength(2);
  });

  it('tolerates a missing invitation list', () => {
    expect(groupCompanies(environments, null, NOW).pendingInvitations).toEqual([]);
  });
});
