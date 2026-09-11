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

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const wasActiveRef = useRef(false);
  const previousActiveRef = useRef<HTMLElement | null>(null);

  // Handle initial focus and focus restoration only when active changes
  useEffect(() => {
    const container = containerRef.current;

    if (active && container && !wasActiveRef.current) {
      previousActiveRef.current = document.activeElement as HTMLElement | null;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      const requestedInitialFocus = initialFocusRef?.current;
      const initialTarget = requestedInitialFocus && focusable.includes(requestedInitialFocus)
        ? requestedInitialFocus
        : focusable[0] || container;
      initialTarget.focus();
      wasActiveRef.current = true;
    }

    if (!active && wasActiveRef.current) {
      previousActiveRef.current?.focus?.();
      previousActiveRef.current = null;
      wasActiveRef.current = false;
    }
  }, [active, containerRef, initialFocusRef]);

  // Handle tab trapping and escape while active
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
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

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active, containerRef, onEscape]);
}