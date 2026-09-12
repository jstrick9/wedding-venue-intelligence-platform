import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Only the topmost active dialog owns keyboard containment. This prevents a
// parent dialog from competing with a nested builder or confirmation dialog.
const activeTrapStack: HTMLElement[] = [];

function removeFromTrapStack(container: HTMLElement) {
  const index = activeTrapStack.lastIndexOf(container);
  if (index >= 0) activeTrapStack.splice(index, 1);
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const previousActiveRef = useRef<HTMLElement | null>(null);

  // Register the active layer, move initial focus inside it, and restore focus
  // both when the trap is deactivated and when an always-open dialog unmounts.
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    previousActiveRef.current = document.activeElement as HTMLElement | null;
    removeFromTrapStack(container);
    activeTrapStack.push(container);

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const requestedInitialFocus = initialFocusRef?.current;
    const initialTarget = requestedInitialFocus && container.contains(requestedInitialFocus)
      ? requestedInitialFocus
      : focusable[0] || container;
    initialTarget.focus();

    return () => {
      removeFromTrapStack(container);
      const previousActive = previousActiveRef.current;
      previousActiveRef.current = null;
      if (previousActive?.isConnected) previousActive.focus();
    };
  }, [active, containerRef, initialFocusRef]);

  // Handle Tab containment and Escape only for the topmost active layer.
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeTrapStack[activeTrapStack.length - 1] !== container) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const nodes = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      if (nodes.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const currentIndex = current ? nodes.indexOf(current) : -1;

      if (currentIndex < 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, containerRef, onEscape]);
}
