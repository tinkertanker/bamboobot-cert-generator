import { useCallback, useRef } from 'react';

/**
 * Hook that returns a throttled version of the provided function
 * Ensures the function is called at most once per specified interval
 * @param fn The function to throttle
 * @param delay The minimum delay between calls in milliseconds
 * @returns Throttled function
 */
export function useThrottle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const throttledFn = useCallback(
    (...args: Args) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;

      if (timeSinceLastCall >= delay) {
        lastCallRef.current = now;
        fn(...args);
      } else {
        // Schedule a call for when the delay period expires
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          fn(...args);
        }, delay - timeSinceLastCall);
      }
    },
    [fn, delay]
  );

  return throttledFn;
}
