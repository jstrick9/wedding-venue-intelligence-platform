import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { isConfirmDialogOpen } from '../utils/modalEscape';

export type ModalType = 
  | 'vendors' 
  | 'timeline' 
  | 'admin' 
  | 'templates' 
  | 'print' 
  | 'operations' 
  | 'messages' 
  | 'submission' 
  | 'eventQuestions' 
  | 'decorDesigner';

interface ModalContextType {
  modals: Record<ModalType, boolean>;
  editingArrangementId?: string;
  open: (type: ModalType, id?: string) => void;
  close: (type: ModalType) => void;
  toggle: (type: ModalType) => void;
  closeAll: () => void;
  setEditingArrangementId: (id?: string) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [modals, setModals] = useState<Record<ModalType, boolean>>({
    vendors: false,
    timeline: false,

    admin: false,
    templates: false,
    print: false,
    operations: false,
    messages: false,
    submission: false,
    eventQuestions: false,
    decorDesigner: false,
  });
  const [editingArrangementId, setEditingArrangementId] = useState<string | undefined>();

  const open = useCallback((type: ModalType, id?: string) => {
    setModals(prev => ({ ...prev, [type]: true }));
    if (id) setEditingArrangementId(id);
  }, []);

  const close = useCallback((type: ModalType) => {
    setModals(prev => ({ ...prev, [type]: false }));
    if (type === 'decorDesigner') setEditingArrangementId(undefined);
  }, []);

  const closeAll = useCallback(() => {
    setModals({
      vendors: false,
      timeline: false,
      admin: false,
      templates: false,
      print: false,
      operations: false,
      messages: false,
      submission: false,
      eventQuestions: false,
      decorDesigner: false,
    });
    setEditingArrangementId(undefined);
  }, []);

  const toggle = useCallback((type: ModalType) => {
    setModals(prev => ({ ...prev, [type]: !prev[type] }));
  }, []);

  // Pressing Escape closes the open panel modal(s). When a ConfirmDialog is on
  // top it owns the Escape key (cancels the confirm) and defers the modal close
  // so pressing Escape doesn't accidentally close the panel underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isConfirmDialogOpen()) return;
      setModals(prev => {
        const hasOpen = Object.values(prev).some(Boolean);
        if (!hasOpen) return prev;
        return Object.fromEntries(
          Object.entries(prev).map(([k]) => [k, false]),
        ) as Record<ModalType, boolean>;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <ModalContext.Provider value={{ modals, editingArrangementId, open, close, toggle, closeAll, setEditingArrangementId }}>
      {children}
    </ModalContext.Provider>
  );
}

export function useModals() {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModals must be used within a ModalProvider');
  return context;
}
