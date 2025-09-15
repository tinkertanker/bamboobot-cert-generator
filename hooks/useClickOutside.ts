import { useEffect, RefObject } from 'react';

export function useClickOutside(
  refs: RefObject<HTMLElement>[] | RefObject<HTMLElement>,
  onOutside: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handle = (event: MouseEvent) => {
      const arr = Array.isArray(refs) ? refs : [refs];
      const target = event.target as Node;
      const isInside = arr.some(ref => {
        const el = ref.current;
        return el ? el.contains(target) : false;
      });
      if (!isInside) onOutside();
    };

    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
    // Intentionally omit `refs` to avoid re-binding on every render when an array literal is passed.
    // Refs are stable objects; current values are read at event time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, onOutside]);
}
