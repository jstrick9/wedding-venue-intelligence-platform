import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, ToastContainer } from './Toast';

describe('Toast transient collision warnings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    cleanup();
    vi.useRealTimers();
  });

  it('automatically removes a non-dismissible warning after exactly 1.5 seconds', () => {
    render(<ToastContainer />);

    act(() => {
      showToast('Collision at the west wall', 'warning', { duration: 1500, dismissible: false });
    });
    expect(screen.getByText('Collision at the west wall')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss notification/i })).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByText('Collision at the west wall')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Collision at the west wall')).not.toBeInTheDocument();
  });

  it('uses the store as the sole owner and dismisses a manual toast immediately', () => {
    render(<ToastContainer />);

    act(() => {
      showToast('Saved layout', 'success');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(screen.queryByText('Saved layout')).not.toBeInTheDocument();
  });

  it('refreshes the full lifetime when the same warning is repeated', () => {
    render(<ToastContainer />);

    act(() => {
      showToast('Collision beside another table', 'warning', { duration: 1500, dismissible: false });
      vi.advanceTimersByTime(1000);
      showToast('Collision beside another table', 'warning', { duration: 1500, dismissible: false });
    });

    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(screen.getByText('Collision beside another table')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('Collision beside another table')).not.toBeInTheDocument();
  });
});
