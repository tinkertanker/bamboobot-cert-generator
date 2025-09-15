import { useEffect, RefObject } from 'react';

export function useClickOutside(
  refs: Array<RefObject<HTMLElement | null>> | RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const arr = Array.isArray(refs) ? refs : [refs];

    const handle = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInside = arr.some(ref => {
        const el = ref.current;
        return el ? el.contains(target) : false;
      });
      if (!isInside) onOutside();
    };

    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [enabled, refs, onOutside]);
}

