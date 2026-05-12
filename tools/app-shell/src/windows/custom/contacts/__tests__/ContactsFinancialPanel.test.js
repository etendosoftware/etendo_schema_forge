import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ContactsFinancialPanel.jsx'), 'utf8');

describe('CreditLimitStepper — debounce on step()', () => {
  it('declares debounceRef with useRef', () => {
    assert.match(src, /debounceRef = useRef\(null\)/);
  });

  it('clears previous timer before scheduling new one', () => {
    assert.match(src, /debounceRef\.current\) clearTimeout\(debounceRef\.current\)/);
  });

  it('schedules onBlur via setTimeout with 400ms delay', () => {
    assert.match(src, /setTimeout\(\(\) => \{[\s\S]*?onBlur\(\)[\s\S]*?\}, 400\)/);
  });

  it('resets debounceRef to null after firing', () => {
    assert.match(src, /debounceRef\.current = null/);
  });

  it('cleans up timer on unmount via useEffect', () => {
    assert.match(src, /useEffect\(\(\) => \(\) => clearTimeout\(debounceRef\.current\)/);
  });

  it('does not call onBlur directly inside step() anymore', () => {
    const stepFn = src.match(/function step\(delta\)[\s\S]*?^  \}/m)?.[0] ?? src;
    assert.doesNotMatch(stepFn, /setTimeout\(onBlur, 0\)/);
  });
});

describe('CreditLimitStepper — YesNoRadio layout', () => {
  it('renders BillingPreferencesForm', () => {
    assert.match(src, /BillingPreferencesForm/);
  });

  it('passes editing prop to BillingPreferencesForm', () => {
    assert.match(src, /editing=\{editing\}/);
  });
});

describe('ContactsFinancialPanel — separator', () => {
  it('renders hr separator between credit and billing sections', () => {
    assert.match(src, /<hr/);
    assert.match(src, /border-\[#E8EAEF\]/);
  });
});
