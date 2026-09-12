import { useEffect, useState } from 'react';
import { announce } from './LiveRegion';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  dismissible?: boolean;
  onClose: () => void;
}

export interface ToastOptions {
  /** Milliseconds the visible notification remains mounted. */
  duration?: number;
  /** Whether a manual close control is shown. Auto-dismiss still applies. */
  dismissible?: boolean;
}

export function Toast({
  message,
  type = 'info',
  dismissible = true,
  onClose,
}: ToastProps) {
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
    info: 'bg-blue-600',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        ${colors[type]}
        text-white px-4 py-3 rounded-lg shadow-lg
        flex items-center
      `}
    >
      <span className="font-semibold mr-2">{icons[type]}</span>
      <span className="flex-1">{message}</span>
      {dismissible && (
        <button
          onClick={onClose}
          className="ml-2 hover:bg-white/20 rounded-full p-1 transition-colors"
          aria-label="Dismiss notification"
          type="button"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// Toast container for managing multiple toasts
interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
  duration: number;
  dismissible: boolean;
}

let toastId = 0;
const TOAST_DEDUPE_MS = 1200;
let toastListeners: Array<(toasts: ToastItem[]) => void> = [];
let currentToasts: ToastItem[] = [];
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRemoval(id: string, duration: number) {
  const existing = toastTimers.get(id);
  if (existing) clearTimeout(existing);
  toastTimers.set(id, setTimeout(() => removeToast(id), duration));
}

// Cleanup function for tests/module unload.
export function cleanupToastListeners(): void {
  toastListeners = [];
  currentToasts = [];
  toastTimers.forEach((timer) => clearTimeout(timer));
  toastTimers.clear();
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  options: ToastOptions = {},
) {
  const now = Date.now();
  const duration = Math.max(0, options.duration ?? 3500);
  const dismissible = options.dismissible ?? true;

  const duplicate = currentToasts.find(
    (toast) =>
      toast.message === message &&
      toast.type === type &&
      now - toast.createdAt < TOAST_DEDUPE_MS,
  );

  if (duplicate) {
    currentToasts = currentToasts.map((toast) => toast.id === duplicate.id
      ? { ...toast, createdAt: now, duration, dismissible }
      : toast);
    toastListeners.forEach((listener) => listener(currentToasts));
    scheduleRemoval(duplicate.id, duration);
    announce(message);
    return duplicate.id;
  }

  const id = String(++toastId);
  const newToast: ToastItem = {
    id,
    message,
    type,
    createdAt: now,
    duration,
    dismissible,
  };
  currentToasts = [...currentToasts, newToast];
  toastListeners.forEach((listener) => listener(currentToasts));
  announce(message);

  scheduleRemoval(id, duration);
  return id;
}

function removeToast(id: string) {
  const timer = toastTimers.get(id);
  if (timer) clearTimeout(timer);
  toastTimers.delete(id);
  currentToasts = currentToasts.filter((t) => t.id !== id);
  toastListeners.forEach((listener) => listener(currentToasts));
}

export function useToasts() {
  const [toasts, setToasts] = useState(currentToasts);

  useEffect(() => {
    toastListeners.push(setToasts);

    return () => {
      const index = toastListeners.indexOf(setToasts);
      if (index > -1) {
        toastListeners.splice(index, 1);
      }
    };
  }, []);

  return { toasts, removeToast };
}

export function ToastContainer() {
  const { toasts, removeToast } = useToasts();

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          dismissible={toast.dismissible}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}