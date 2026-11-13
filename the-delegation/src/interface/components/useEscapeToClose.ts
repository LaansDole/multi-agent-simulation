import { useEffect, useRef } from 'react';

// Open overlays in mount order; Escape closes only the topmost one.
const stack: Array<() => void> = [];

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length > 0) stack[stack.length - 1]();
});

/** Calls onClose on Escape while active, unless an overlay opened later is also active. */
export function useEscapeToClose(onClose: () => void, active = true): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!active) return;
    const close = () => latest.current();
    stack.push(close);
    return () => {
      stack.splice(stack.indexOf(close), 1);
    };
  }, [active]);
}
