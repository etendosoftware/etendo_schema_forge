import { playSendSound, playReceiveSound } from '../chatSounds.js';

// Minimal Web Audio API fake — jsdom has no real AudioContext, so every test
// here stands in a fake one exposing just the surface chatSounds.js touches:
// createOscillator/createGain (each returning a node with .connect), plus
// .destination and .currentTime read once at construction time.
class FakeGainNode {
  constructor() {
    this.gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  }
  connect() {}
}

class FakeOscillatorNode {
  constructor() {
    this.frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    this.onended = null;
  }
  connect() {}
  start() {}
  stop() {
    queueMicrotask(() => this.onended?.());
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.close = vi.fn();
  }
  createOscillator() { return new FakeOscillatorNode(); }
  createGain() { return new FakeGainNode(); }
}

describe('chatSounds', () => {
  afterEach(() => {
    delete window.AudioContext;
    delete window.webkitAudioContext;
    vi.restoreAllMocks();
  });

  it('exports playSendSound and playReceiveSound as callable functions', () => {
    expect(typeof playSendSound).toBe('function');
    expect(typeof playReceiveSound).toBe('function');
  });

  it('playSendSound runs the oscillator/gain sequence without throwing when AudioContext is available', () => {
    window.AudioContext = FakeAudioContext;
    expect(() => playSendSound()).not.toThrow();
  });

  it('playReceiveSound runs the oscillator/gain sequence without throwing when AudioContext is available', () => {
    window.AudioContext = FakeAudioContext;
    expect(() => playReceiveSound()).not.toThrow();
  });

  it('playSendSound falls back to window.webkitAudioContext when window.AudioContext is absent', () => {
    window.webkitAudioContext = FakeAudioContext;
    expect(() => playSendSound()).not.toThrow();
  });

  it('playReceiveSound falls back to window.webkitAudioContext when window.AudioContext is absent', () => {
    window.webkitAudioContext = FakeAudioContext;
    expect(() => playReceiveSound()).not.toThrow();
  });

  it('playSendSound silently no-ops when neither AudioContext nor webkitAudioContext exist', () => {
    expect(window.AudioContext).toBeUndefined();
    expect(window.webkitAudioContext).toBeUndefined();
    expect(() => playSendSound()).not.toThrow();
  });

  it('playReceiveSound silently no-ops when neither AudioContext nor webkitAudioContext exist', () => {
    expect(window.AudioContext).toBeUndefined();
    expect(window.webkitAudioContext).toBeUndefined();
    expect(() => playReceiveSound()).not.toThrow();
  });

  it('playSendSound silently swallows an error thrown mid-sequence (e.g. a broken audio node)', () => {
    class ThrowingAudioContext extends FakeAudioContext {
      createOscillator() { throw new Error('audio hardware unavailable'); }
    }
    window.AudioContext = ThrowingAudioContext;
    expect(() => playSendSound()).not.toThrow();
  });

  it('playReceiveSound silently swallows an error thrown mid-sequence (e.g. a broken audio node)', () => {
    class ThrowingAudioContext extends FakeAudioContext {
      createOscillator() { throw new Error('audio hardware unavailable'); }
    }
    window.AudioContext = ThrowingAudioContext;
    expect(() => playReceiveSound()).not.toThrow();
  });
});
