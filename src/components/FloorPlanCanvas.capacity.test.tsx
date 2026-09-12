import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlacedTable, TableSpec, Venue } from '../types';
import { FloorPlanCanvas } from './FloorPlanCanvas';

const venue = {
  id: 'venue', name: 'Hall', category: 'reception', width: 80, height: 60,
  capacity: 150, shape: 'rectangle',
} as Venue;
const spec: TableSpec = {
  id: 'round', name: 'Round Table', shape: 'circle', width: 5, height: 5,
  capacity: 10, defaultChairType: 'white-plastic', showChairs: true,
};

function table(id: string, chairCount: number, x: number, showChairs = true): PlacedTable {
  return {
    id, type: 'table', specId: 'round', x, y: 20, rotation: 0,
    label: id, guests: [], chairCount, chairType: 'white-plastic', showChairs,
  };
}

const callbacks = {
  onSelect: vi.fn(), onDoubleClick: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(),
  onClickToPlace: vi.fn(), onViewImage: vi.fn(), onPanChange: vi.fn(), onZoomChange: vi.fn(),
};

function canvas(tables: PlacedTable[], capacityMode: 'venue' | 'assignments' = 'venue') {
  return <FloorPlanCanvas
    venue={venue}
    tables={tables}
    fixtures={[]}
    decor={[]}
    guests={[]}
    selectedId={null}
    zoom={1}
    showGrid={false}
    gridSize={1}
    isDragging={false}
    isAdmin
    panOffset={{ x: 0, y: 0 }}
    capacityMode={capacityMode}
    {...callbacks}
  />;
}

describe('FloorPlanCanvas capacity presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('spm_tableSpecs', JSON.stringify([spec]));
    localStorage.setItem('spm_studio_onboarding_seen', 'true');
  });

  it('shows configured venue seats and venue maximum, not assignment ratios', () => {
    render(canvas([
      table('one', 10, 5), table('two', 10, 20),
      table('three', 10, 35), table('four', 8, 50),
    ]));

    expect(screen.getByText('8 seats')).toBeInTheDocument();
    expect(screen.getByText(/38 seats .* Max: 150/)).toBeInTheDocument();
    expect(screen.queryByText('0/8')).not.toBeInTheDocument();
  });

  it('keeps hidden chairs in capacity but removes all graphics and capacity for explicit zero', () => {
    const { container, rerender } = render(canvas([table('visible', 10, 10)]));
    expect(container.querySelectorAll('[data-layout-chair="true"]')).toHaveLength(10);

    rerender(canvas([table('hidden', 10, 10, false)]));
    expect(container.querySelectorAll('[data-layout-chair="true"]')).toHaveLength(0);
    expect(screen.getByText(/10 seats .* Max: 150/)).toBeInTheDocument();

    rerender(canvas([table('standing', 0, 10)]));
    expect(container.querySelectorAll('[data-layout-chair="true"]')).toHaveLength(0);
    expect(screen.getByText(/0 seats .* Max: 150/)).toBeInTheDocument();
  });

  it('retains assignment ratios for couple-facing consumers', () => {
    render(canvas([table('one', 8, 10)], 'assignments'));
    expect(screen.getByText('0/8')).toBeInTheDocument();
  });

  it('marks keyboard nudges as exact while retaining their documented increments', () => {
    render(canvas([table('keyboard', 8, 10)]));
    const item = screen.getByRole('button', { name: 'keyboard, Round Table' });

    fireEvent.keyDown(item, { key: 'ArrowRight' });
    expect(callbacks.onMove).toHaveBeenLastCalledWith(
      'keyboard',
      { x: 10.5, y: 20 },
      false,
      true,
    );

    fireEvent.keyDown(item, { key: 'ArrowDown', shiftKey: true });
    expect(callbacks.onMove).toHaveBeenLastCalledWith(
      'keyboard',
      { x: 10, y: 21 },
      false,
      true,
    );
  });
});
