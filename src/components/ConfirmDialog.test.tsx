import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(container.textContent).toBe('');
  });

  it('calls onConfirm when the confirm button is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Confirm deletion" message="Sure?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="T" message="M" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('supports a distinct alternate conflict-resolution action', () => {
    const onAlternate = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Conflict"
        message="Choose"
        alternateLabel="Reload shared map"
        onAlternate={onAlternate}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload shared map' }));
    expect(onAlternate).toHaveBeenCalledTimes(1);
  });

  it('can fail-close only the confirm action while safer conflict exits remain available', () => {
    const onConfirm = vi.fn();
    const onAlternate = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        confirmDisabled
        title="Conflict"
        message="Apply edits first"
        confirmLabel="Overwrite shared map"
        alternateLabel="Reload shared map"
        onConfirm={onConfirm}
        onAlternate={onAlternate}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('button', { name: 'Overwrite shared map' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload shared map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onAlternate).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('can focus the safe cancel action first in a destructive confirmation', () => {
    render(
      <ConfirmDialog
        open
        title="Discard changes?"
        message="Unsaved changes will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        initialFocus="cancel"
        tone="danger"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('closes on Escape unless a resolution is in progress', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open title="T" message="M" onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <ConfirmDialog open busy title="T" message="M" onConfirm={() => {}} onCancel={onCancel} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
