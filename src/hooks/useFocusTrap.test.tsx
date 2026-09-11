import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function FocusTrapHarness({
  active = true,
  onEscape,
  preferSecond = false,
}: {
  active?: boolean;
  onEscape?: () => void;
  preferSecond?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(ref, active, onEscape, preferSecond ? secondRef : undefined);

  return (
    <div>
      <button type="button">Outside Button</button>
      <div ref={ref} tabIndex={-1}>
        <button type="button">First Button</button>
        <button ref={secondRef} type="button">Second Button</button>
      </div>
    </div>
  );
}

function FocusTrapRerenderHarness({
  active = true,
  onEscape,
  tick,
}: {
  active?: boolean;
  onEscape?: () => void;
  tick: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active, onEscape);

  return (
    <div>
      <button type="button">Outside Button</button>
      <div ref={ref} tabIndex={-1}>
        <button type="button">Close Button</button>
        <input aria-label="Dialog Input" defaultValue="" />
        <span>{tick}</span>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element when activated', async () => {
    render(<FocusTrapHarness />);

    expect(await screen.findByRole('button', { name: 'First Button' })).toHaveFocus();
  });

  it('focuses an explicit safe initial target when provided', async () => {
    render(<FocusTrapHarness preferSecond />);

    expect(await screen.findByRole('button', { name: 'Second Button' })).toHaveFocus();
  });

  it('cycles focus forward with Tab', async () => {
    const user = userEvent.setup();
    render(<FocusTrapHarness />);

    const first = await screen.findByRole('button', { name: 'First Button' });
    const second = screen.getByRole('button', { name: 'Second Button' });

    expect(first).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(second).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(first).toHaveFocus();
  });

  it('cycles focus backward with Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<FocusTrapHarness />);

    const first = await screen.findByRole('button', { name: 'First Button' });
    const second = screen.getByRole('button', { name: 'Second Button' });

    expect(first).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(second).toHaveFocus();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(first).toHaveFocus();
  });

  it('calls onEscape when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onEscape = vi.fn();

    render(<FocusTrapHarness onEscape={onEscape} />);

    await screen.findByRole('button', { name: 'First Button' });
    await user.keyboard('{Escape}');

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus from an active input on rerender', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FocusTrapRerenderHarness active={true} onEscape={() => undefined} tick={1} />,
    );

    const input = await screen.findByRole('textbox', { name: 'Dialog Input' });

    await user.click(input);
    expect(input).toHaveFocus();

    rerender(
      <FocusTrapRerenderHarness active={true} onEscape={() => undefined} tick={2} />,
    );

    expect(screen.getByRole('textbox', { name: 'Dialog Input' })).toHaveFocus();
  });
});