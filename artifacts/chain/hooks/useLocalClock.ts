import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Local wall clock: refresh on minute boundaries and after returning from the background. */
export function useLocalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      timer = setTimeout(refresh, 60_000 - (current.getTime() % 60_000) + 25);
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
      else clearTimeout(timer);
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return now;
}
