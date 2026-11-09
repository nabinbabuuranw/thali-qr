import { useEffect, useRef, useState } from 'react';

/** Loads a JSON resource now and then every `ms`, stopping when the tab is hidden. Keeps the last good value on error. */
export function usePoll<T>(load: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const run = async () => {
    if (document.visibilityState === 'hidden') return;
    setBusy(true);
    try {
      const v = await load();
      if (alive.current) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void run();
    const t = window.setInterval(run, ms);
    return () => {
      alive.current = false;
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, busy, reload: run };
}
