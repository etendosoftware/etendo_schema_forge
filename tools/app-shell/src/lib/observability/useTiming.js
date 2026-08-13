import { useCallback, useEffect, useRef } from 'react';
import { startTiming } from './timing.js';

export function useTiming(name, options = {}) {
  const stopRef = useRef(null);
  const client = options.client;
  const now = options.now;

  const start = useCallback((properties = {}) => {
    const stop = startTiming(name, { client, now, properties });
    stopRef.current = stop;
    return stop;
  }, [client, name, now]);

  const stop = useCallback((extraProps = {}) => {
    const activeStop = stopRef.current;
    stopRef.current = null;

    return activeStop ? activeStop(extraProps) : undefined;
  }, []);

  const cancel = useCallback(() => {
    stopRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    start,
    stop,
    cancel,
  };
}
