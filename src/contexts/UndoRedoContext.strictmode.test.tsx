import { StrictMode } from 'react';
import { render, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UndoRedoProvider } from './UndoRedoContext';
import { emit, type UndoSnapshot } from '../utils/appEvents';

const snap = (n: number): UndoSnapshot => ({
  tables: [{ n }],
  fixtures: [],
  decor: [],
  timestamp: n,
});

function pressUndo() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
  });
}

function pressRedo() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
  });
}

function renderHistory(initial = snap(0)) {
  let current = initial;
  const restored: UndoSnapshot[] = [];
  const onRestore = vi.fn((snapshot: UndoSnapshot) => {
    current = snapshot;
    restored.push(snapshot);
  });
  render(
    <StrictMode>
      <UndoRedoProvider onRestore={onRestore} getCurrentSnapshot={() => current}>
        <div />
      </UndoRedoProvider>
    </StrictMode>,
  );
  return {
    onRestore,
    restored,
    mutateTo(next: UndoSnapshot) {
      act(() => { emit('spm_push_undo_snapshot', current); });
      current = next;
    },
    current: () => current,
  };
}

describe('UndoRedoProvider pre-action history contract', () => {
  it('undoes the very first action exactly once under StrictMode', () => {
    const history = renderHistory(snap(0));
    history.mutateTo(snap(1));

    pressUndo();
    expect(history.onRestore).toHaveBeenCalledTimes(1);
    expect(history.current()).toEqual(snap(0));

    pressUndo();
    expect(history.onRestore).toHaveBeenCalledTimes(1);
  });

  it('walks one action at a time and redo round-trips exact live states', () => {
    const history = renderHistory(snap(0));
    history.mutateTo(snap(1));
    history.mutateTo(snap(2));

    pressUndo();
    expect(history.current()).toEqual(snap(1));
    pressUndo();
    expect(history.current()).toEqual(snap(0));
    pressRedo();
    expect(history.current()).toEqual(snap(1));
    pressRedo();
    expect(history.current()).toEqual(snap(2));
    expect(history.onRestore).toHaveBeenCalledTimes(4);
  });

  it('clears the redo branch when a new action starts after Undo', () => {
    const history = renderHistory(snap(0));
    history.mutateTo(snap(1));
    history.mutateTo(snap(2));
    pressUndo();
    expect(history.current()).toEqual(snap(1));

    history.mutateTo(snap(3));
    pressRedo();
    expect(history.current()).toEqual(snap(3));
    expect(history.onRestore).toHaveBeenCalledTimes(1);
  });
});
