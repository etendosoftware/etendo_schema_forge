// @covers tools/app-shell/src/windows/custom/fiscal-models/incidentSeverity.js
// Pure-logic tests for the shared incidents severity helpers used by the list KPI card, the
// 303/349 incidents tab badges and the IncidentsTab banner.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getIncidentSeverity, getIncidentIndicator } from '../incidentSeverity.js';

describe('getIncidentSeverity', () => {
  it('returns "none" when there are no incidents', () => {
    assert.equal(getIncidentSeverity({ blocking: 0, warning: 0 }), 'none');
    assert.equal(getIncidentSeverity({}), 'none');
  });

  it('returns "warn" when there are only warnings', () => {
    assert.equal(getIncidentSeverity({ blocking: 0, warning: 3 }), 'warn');
  });

  it('returns "block" when there is a blocking incident', () => {
    assert.equal(getIncidentSeverity({ blocking: 1, warning: 0 }), 'block');
  });

  it('blocking wins when both are present', () => {
    assert.equal(getIncidentSeverity({ blocking: 2, warning: 5 }), 'block');
  });

  it('treats null/undefined as no incidents', () => {
    assert.equal(getIncidentSeverity(null), 'none');
    assert.equal(getIncidentSeverity(undefined), 'none');
  });

  describe('array input (aggregate over several declarations)', () => {
    it('returns the worst severity across the list', () => {
      assert.equal(getIncidentSeverity([{ warning: 1 }, { blocking: 1 }, null]), 'block');
      assert.equal(getIncidentSeverity([{ warning: 1 }, { blocking: 0, warning: 0 }]), 'warn');
      assert.equal(getIncidentSeverity([null, undefined, {}]), 'none');
    });

    it('a blocking entry after warnings still yields "block"', () => {
      assert.equal(getIncidentSeverity([{ warning: 4 }, { warning: 2 }, { blocking: 1 }]), 'block');
    });

    it('an empty array is "none"', () => {
      assert.equal(getIncidentSeverity([]), 'none');
    });
  });
});

describe('getIncidentIndicator', () => {
  const t = (key) => key;

  it('returns null when there are no incidents (callers keep their own neutral rendering)', () => {
    assert.equal(getIncidentIndicator({ blocking: 0, warning: 0 }, t), null);
    assert.equal(getIncidentIndicator(null, t), null);
    assert.equal(getIncidentIndicator([], t), null);
  });

  it('blocking → destructive role, danger tone, "Requiere revisión" label', () => {
    assert.deepEqual(getIncidentIndicator({ blocking: 1, warning: 2 }, t), {
      severity: 'block',
      tone: 'danger',
      label: 'fm.kpi.incidents_sub',
      iconColor: 'hsl(var(--destructive))',
      badgeBg: 'var(--status-destructive-bg)',
      badgeColor: 'hsl(var(--destructive))',
    });
  });

  it('warning-only → warning role, warn tone, "Advertencia" label', () => {
    assert.deepEqual(getIncidentIndicator({ blocking: 0, warning: 1 }, t), {
      severity: 'warn',
      tone: 'warn',
      label: 'fm.incidents.severity.warn',
      iconColor: 'var(--status-warning-fg)',
      badgeBg: 'var(--status-warning-bg)',
      badgeColor: 'var(--status-warning-fg)',
    });
  });

  it('aggregates an array input', () => {
    assert.equal(getIncidentIndicator([{ warning: 1 }, { blocking: 1 }], t).severity, 'block');
    assert.equal(getIncidentIndicator([{ warning: 1 }, {}], t).severity, 'warn');
  });

  it('falls back to the Spanish defaults when no t / t returns undefined', () => {
    assert.equal(getIncidentIndicator({ blocking: 1 }).label, 'Requiere revisión');
    assert.equal(getIncidentIndicator({ warning: 1 }, () => undefined).label, 'Advertencia');
  });
});
