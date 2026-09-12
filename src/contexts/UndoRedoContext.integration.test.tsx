import { useCallback } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emit, type UndoSnapshot } from '../utils/appEvents';
import { setTableSpecs, setVenues, useLayoutState } from '../hooks/useLayoutState';
import { UndoRedoProvider, useUndoRedo } from './UndoRedoContext';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', username: 'admin', role: 'admin', name: 'Admin User', isActive: true, createdAt: new Date().toISOString() },
    isAdmin: true, isBasicUser: false, isGuest: false,
  }),
}));

function Controls({ addTable, count, dirty }: { addTable: () => void; count: number; dirty: boolean }) {
  const history = useUndoRedo();
  return (
    <>
      <button type="button" onClick={addTable}>Add table</button>
      <button type="button" onClick={history.undo} disabled={!history.canUndo}>Undo</button>
      <button type="button" onClick={history.redo} disabled={!history.canRedo}>Redo</button>
      <output aria-label="table count">{count}</output>
      <output aria-label="dirty state">{dirty ? 'dirty' : 'clean'}</output>
    </>
  );
}

function Harness() {
  const state = useLayoutState('venue');
  const capture = useCallback((): UndoSnapshot => ({
    tables: [...state.layout.tables],
    fixtures: [...state.layout.fixtures],
    decor: [...state.layout.decor],
    ceremonyRows: [...(state.layout.ceremonyRows || [])],
    timestamp: Date.now(),
  }), [state.layout]);
  const restore = useCallback((snapshot: UndoSnapshot) => {
    state.updateLayout({
      tables: snapshot.tables as any[],
      fixtures: snapshot.fixtures as any[],
      decor: snapshot.decor as any[],
      ceremonyRows: (snapshot.ceremonyRows || []) as any[],
    });
  }, [state]);
  const addTable = () => {
    emit('spm_push_undo_snapshot', capture());
    state.addTable('table', { x: 5, y: 6 });
  };
  return (
    <UndoRedoProvider onRestore={restore} getCurrentSnapshot={capture}>
      <Controls addTable={addTable} count={state.layout.tables.length} dirty={state.layoutDirty} />
    </UndoRedoProvider>
  );
}

describe('Design Studio undo/dirty integration', () => {
  beforeEach(() => {
    localStorage.clear();
    setVenues([{ id: 'venue', name: 'Hall', category: 'reception', width: 50, height: 40, capacity: 100, color: '#fff' }]);
    setTableSpecs([{ id: 'table', name: 'Table', shape: 'rectangle', width: 4, height: 4, capacity: 8 }]);
  });

  it('undoes the first placement, updates dirty state, and redoes it exactly', async () => {
    render(<Harness />);
    expect(screen.getByLabelText('table count')).toHaveTextContent('0');
    expect(screen.getByLabelText('dirty state')).toHaveTextContent('clean');

    fireEvent.click(screen.getByRole('button', { name: 'Add table' }));
    await waitFor(() => expect(screen.getByLabelText('table count')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByLabelText('dirty state')).toHaveTextContent('dirty'));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByLabelText('table count')).toHaveTextContent('0'));
    await waitFor(() => expect(screen.getByLabelText('dirty state')).toHaveTextContent('clean'));

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    await waitFor(() => expect(screen.getByLabelText('table count')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByLabelText('dirty state')).toHaveTextContent('dirty'));
  });
});
