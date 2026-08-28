import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { centeredPopupDimensions, openCenteredPopup } from '../popupWindow.js';

describe('centeredPopupDimensions', () => {
  const originalScreen = window.screen;

  beforeEach(() => {
    Object.defineProperty(window, 'screen', {
      configurable: true,
      value: { width: 1920, height: 1080 },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'screen', { configurable: true, value: originalScreen });
  });

  it('sizes to 70% of the screen by default, centered', () => {
    // Same fraction Classic uses for every Salt Edge popup (payment authorization, consent,
    // reconnect) and Etendo Go's own bank-connection flow already used — see popupWindow.js.
    expect(centeredPopupDimensions()).toBe('width=1344,height=756,left=288,top=162');
  });

  it('honors a custom ratio', () => {
    expect(centeredPopupDimensions(0.5)).toBe('width=960,height=540,left=480,top=270');
  });

  it('falls back to a sane default when screen dimensions are unavailable (e.g. jsdom edge cases)', () => {
    Object.defineProperty(window, 'screen', { configurable: true, value: {} });
    expect(centeredPopupDimensions()).toBe('width=716,height=537,left=154,top=115');
  });
});

describe('openCenteredPopup', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'screen', {
      configurable: true,
      value: { width: 1920, height: 1080 },
    });
    vi.spyOn(window, 'open').mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the given url and name with the centered 70% dimensions', () => {
    openCenteredPopup('https://bank.example/sca', 'saltEdgePisWidget');
    expect(window.open).toHaveBeenCalledWith(
      'https://bank.example/sca', 'saltEdgePisWidget', 'width=1344,height=756,left=288,top=162');
  });

  it('prepends extra window-features before the computed dimensions', () => {
    openCenteredPopup('https://bank.example/sca', 'saltEdgePisWidget', 'popup=yes,resizable=yes,scrollbars=yes');
    expect(window.open).toHaveBeenCalledWith(
      'https://bank.example/sca',
      'saltEdgePisWidget',
      'popup=yes,resizable=yes,scrollbars=yes,width=1344,height=756,left=288,top=162');
  });

  it('supports opening blank and navigating later, like the bank-connection flow does', () => {
    openCenteredPopup('', 'bank-connection-connect');
    expect(window.open).toHaveBeenCalledWith(
      '', 'bank-connection-connect', 'width=1344,height=756,left=288,top=162');
  });
});
