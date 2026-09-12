import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../hooks/useLayoutState', () => ({
  getTableSpecs: () => [
    { id: 's1', name: 'Round Table', shape: 'circle', width: 6, height: 6, capacity: 8, showChairs: true },
  ],
  getFixtureTypes: () => [
    { id: 'f1', name: 'Dance Floor', shape: 'rect', width: 18, height: 18, visibleToUsers: true, isSelectable: true },
  ],
  getDecorItems: () => [{ id: 'd1', name: 'Centerpiece', width: 1, height: 1 }],
  getLinenColors: () => [],
  getDecorArrangements: () => [],
}));

import { CoupleLayoutEditor } from './CoupleLayoutEditor';

const venue = {
  id: 'reception',
  name: 'Reception Hall',
  width: 80,
  height: 60,
  canvasWidth: 80,
  canvasHeight: 60,
  capacity: 200,
  category: 'reception',
} as any;

describe('CoupleLayoutEditor', () => {
  it('renders the space name and palette items', () => {
    render(<CoupleLayoutEditor venue={venue} initial={null} onSave={() => {}} onClose={() => {}} />);
    expect(screen.getAllByText(/Reception Hall/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Round Table/i)).toBeTruthy();
    expect(screen.getByText(/Dance Floor/i)).toBeTruthy();
  });

  it('places a palette item with the documented pick-then-canvas flow', () => {
    const onSave = vi.fn();
    const { container } = render(
      <CoupleLayoutEditor venue={venue} initial={null} onSave={onSave} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Round Table (6×6)' }));
    fireEvent.click(container.querySelector('svg')!, { clientX: 80, clientY: 80 });
    expect(screen.getByText(/1 item\(s\)/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /save layout/i }));
    expect(onSave.mock.calls[0][0].tables).toHaveLength(1);
  });

  it('shows saved item counts in the toolbar', () => {
    render(
      <CoupleLayoutEditor
        venue={venue}
        initial={{
          tables: [{ id: 't1', type: 'table', specId: 's1', x: 10, y: 10, rotation: 0, label: 'Round Table', guests: [] }],
          fixtures: [],
          decor: [],
          updatedAt: new Date().toISOString(),
        }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/1 item\(s\)/i)).toBeTruthy();
  });

  it('renders, counts, and preserves legacy ceremony rows when saving', () => {
    const onSave = vi.fn();
    const ceremonyRow = {
      id: 'row-1', x: 20, y: 20, rotation: 0, label: 'Ceremony Row',
      chairType: 'white-plastic', chairCount: 6, spacing: 2, rowWidth: 12,
      rowStyle: 'straight', facingDirection: 0,
    } as const;
    render(
      <CoupleLayoutEditor
        venue={venue}
        guestCount={6}
        initial={{
          tables: [], fixtures: [], decor: [], ceremonyRows: [ceremonyRow],
          updatedAt: new Date().toISOString(),
        }}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/1 item\(s\)/i)).toBeTruthy();
    expect(screen.getByText(/Seats 6 \/ 6 guests/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /save layout/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ ceremonyRows: [ceremonyRow] }));
  });

  it('warns when placed seating capacity is below the expected guest count', () => {
    render(
      <CoupleLayoutEditor
        venue={venue}
        guestCount={10}
        initial={{
          tables: [{ id: 't1', type: 'table', specId: 's1', x: 10, y: 10, rotation: 0, label: 'Round Table', guests: [] }], // capacity 8
          fixtures: [],
          decor: [],
          updatedAt: new Date().toISOString(),
        }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Seats 8 \/ 10 guests/i)).toBeTruthy();
  });

  it('does not warn when seating capacity meets the expected guest count', () => {
    render(
      <CoupleLayoutEditor
        venue={venue}
        guestCount={8}
        initial={{
          tables: [{ id: 't1', type: 'table', specId: 's1', x: 10, y: 10, rotation: 0, label: 'Round Table', guests: [] }], // capacity 8
          fixtures: [],
          decor: [],
          updatedAt: new Date().toISOString(),
        }}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Seats 8 \/ 8 guests/i)).toBeTruthy();
    expect(screen.queryByText(/⚠️/i)).toBeNull();
  });
});
