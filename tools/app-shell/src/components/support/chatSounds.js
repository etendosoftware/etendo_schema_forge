// Shared Web Audio "pop" sounds for the support chat — both are the same short sine-wave
// pop, just mirrored: send sweeps down (outgoing), receive sweeps up (incoming), so they
// read as one family instead of two unrelated sounds. Exported so both the in-conversation
// view (ConversationView) and the background unread-poll (SupportChatContext) can play the
// same receive sound regardless of whether the conversation panel is open.

export function playSendSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Short descending "pop" — outgoing feel
    osc.frequency.setValueAtTime(1100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(550, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.11);
    osc.onended = () => ctx.close();
  } catch { /* ignore if AudioContext not supported */ }
}

export function playReceiveSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Mirror of the send pop — ascending instead of descending, and a touch longer
    // so an incoming reply doesn't feel like a plain echo of the outgoing one.
    osc.frequency.setValueAtTime(550, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => ctx.close();
  } catch { /* ignore if AudioContext not supported */ }
}
