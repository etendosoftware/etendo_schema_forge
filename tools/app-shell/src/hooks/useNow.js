import { useEffect, useState } from 'react';

// One interval per distinct period, shared by every subscriber (a list of N rows ticks together
// instead of running N timers). The interval starts with the first subscriber and stops with the last.
const channels = new Map();

function subscribe(intervalMs, listener) {
  let channel = channels.get(intervalMs);
  if (!channel) {
    channel = { listeners: new Set(), timer: null };
    channels.set(intervalMs, channel);
  }
  channel.listeners.add(listener);
  if (!channel.timer) {
    channel.timer = setInterval(() => {
      const now = Date.now();
      channel.listeners.forEach((l) => l(now));
    }, intervalMs);
  }
  return () => {
    channel.listeners.delete(listener);
    if (channel.listeners.size === 0) {
      clearInterval(channel.timer);
      channels.delete(intervalMs);
    }
  };
}

/**
 * Immediately pushes `Date.now()` to every active channel, so relative labels recompute right
 * away (e.g. when the user clicks a manual refresh) instead of waiting for the next tick.
 * Safe to call with no subscribers.
 */
export function refreshNow() {
  const now = Date.now();
  channels.forEach((channel) => channel.listeners.forEach((l) => l(now)));
}

/**
 * Current time in ms, re-rendered every `intervalMs` so relative labels ("hace 54 segundos")
 * advance without a reload.
 */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    return subscribe(intervalMs, setNow);
  }, [intervalMs]);
  return now;
}
