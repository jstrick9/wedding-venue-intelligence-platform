import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildLayoutIdentityReview } from '../utils/layoutIdentity';
import { LayoutIdentityRepairDialog } from './LayoutIdentityRepairDialog';

function reviewFixture() {
  return buildLayoutIdentityReview({
    tables: [
      { id: 'duplicate', type: 'table', specId: 'table', x: 1, y: 2, rotation: 0, label: 'Table One', guests: [] },
      { id: 'duplicate', type: 'table', specId: 'table', x: 9, y: 10, rotation: 0, label: 'Table Two', guests: [] },
    ],
    fixtures: [],
    decor: [{
      id: 'decor', decorItemId: 'flowers', x: 3, y: 4, rotation: 0,
      scaleX: 1, scaleY: 1, opacity: 1, zIndex: 1,
      parentType: 'table', parentId: 'duplicate', notes: 'Garland',
    }],
    ceremonyRows: [],
  }, [])!;
}

describe('LayoutIdentityRepairDialog', () => {
  it('requires explicit ambiguous-link review and acknowledgement before Apply', async () => {
    const user = userEvent.setup();
    const review = reviewFixture();
    const onApply = vi.fn();
    render(<LayoutIdentityRepairDialog review={review} onApply={onApply} onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Repair duplicate layout identities/i })).toHaveFocus();
    expect(screen.getByText(/read-only until/i)).toBeInTheDocument();
    expect(screen.getByText(/Labels, coordinates, rotations, seating, dimensions, and catalog references do not change/i)).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply identity repair' });
    expect(apply).toBeDisabled();

    const relationship = screen.getByText('Garland').closest('label');
    expect(relationship).not.toBeNull();
    await user.selectOptions(within(relationship as HTMLElement).getByRole('combobox'), 'table:1');
    await user.click(screen.getByRole('checkbox'));
    expect(apply).toBeEnabled();
    await user.click(apply);
    expect(onApply).toHaveBeenCalledWith({ 'decor:0:parentId': 'table:1' });
  });
});
