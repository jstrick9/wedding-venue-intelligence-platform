import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { on } from '../utils/appEvents';

export interface LayoutSnapshot {
  tables: any[];
  fixtures: any[];
  decor: any[];
  ceremonyRows?: any[];
  timestamp: number;
}

interface UndoRedoContextType {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushSnapshot: (snapshot: LayoutSnapshot) => void;
  clearHistory: () => void;
  historyLength: number;
}

const UndoRedoContext = createContext<UndoRedoContextType | null>(null);

const MAX_HISTORY = 50;

function appendBounded(items: LayoutSnapshot[], snapshot: LayoutSnapshot): LayoutSnapshot[] {
  const next = [...items, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

export function useUndoRedo(): UndoRedoContextType {
  const context = useContext(UndoRedoContext);
  if (!context) {
    throw new Error('useUndoRedo must be used within UndoRedoProvider');
  }
  return context;
}

interface UndoRedoProviderProps {
  children: ReactNode;
  onRestore: (snapshot: LayoutSnapshot) => void;
  /** Return the layout currently on the canvas so the opposite history stack is exact. */
  getCurrentSnapshot: () => LayoutSnapshot;
}

/**
 * History contract: callers push the current snapshot immediately BEFORE a
 * successful mutation. That snapshot is therefore an undo target, not the new
 * current state. Undo/redo capture the live canvas state before restoring the
 * target so the inverse operation is lossless.
 */
export function UndoRedoProvider({ children, onRestore, getCurrentSnapshot }: UndoRedoProviderProps) {
  const [past, setPast] = useState<LayoutSnapshot[]>([]);
  const [future, setFuture] = useState<LayoutSnapshot[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const pushSnapshot = useCallback((snapshot: LayoutSnapshot) => {
    setPast((items) => appendBounded(items, snapshot));
    // Any successful edit after Undo starts a new branch.
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const current = getCurrentSnapshot();
    setPast(past.slice(0, -1));
    setFuture((items) => [current, ...items].slice(0, MAX_HISTORY));
    onRestore(previous);
  }, [getCurrentSnapshot, onRestore, past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    const current = getCurrentSnapshot();
    setFuture(future.slice(1));
    setPast((items) => appendBounded(items, current));
    onRestore(next);
  }, [future, getCurrentSnapshot, onRestore]);

  const clearHistory = useCallback(() => {
    setPast([]);
    setFuture([]);
  }, []);

  // Listen for pre-action snapshot events from the app.
  useEffect(() => on('spm_push_undo_snapshot', pushSnapshot), [pushSnapshot]);

  // A venue switch, saved-layout load, or template load changes the identity of
  // the working document. Never let Undo cross that document boundary.
  useEffect(() => on('spm_clear_undo_history', clearHistory), [clearHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (isCtrlOrMeta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (isCtrlOrMeta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <UndoRedoContext.Provider value={{
      canUndo,
      canRedo,
      undo,
      redo,
      pushSnapshot,
      clearHistory,
      historyLength: past.length,
    }}>
      {children}
    </UndoRedoContext.Provider>
  );
}
