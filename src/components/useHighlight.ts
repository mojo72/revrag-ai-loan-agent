import { useEffect, useState } from 'react';
import { useApp } from '../state/store';

/** True for ~3s after the agent points at `target`; switches off as soon as it points elsewhere. */
export function useHighlight(target: string) {
  const h = useApp((s) => s.highlight);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!h || h.target !== target || Date.now() - h.at > 3000) {
      setOn(false);
      return;
    }
    setOn(true);
    const t = setTimeout(() => setOn(false), 2800);
    return () => clearTimeout(t);
  }, [h, target]);
  return on;
}
