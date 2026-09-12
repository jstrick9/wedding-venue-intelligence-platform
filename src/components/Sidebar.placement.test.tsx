import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

const arrangement = {
  id: 'design-one',
  name: 'Garden Arch Design',
  baseType: 'arch',
  items: [{ decorItemId: 'flowers', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 }],
};

function renderSidebar(overrides: Record<string, unknown> = {}) {
  const props = {
    width: 280,
    collapsed: false,
    onWidthChange: vi.fn(),
    onCollapsedChange: vi.fn(),
    zoom: 1,
    onZoomChange: vi.fn(),
    showGrid: false,
    onShowGridChange: vi.fn(),
    gridSize: 5,
    onGridSizeChange: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onCancelPlacement: vi.fn(),
    currentDragItem: null,
    keepAdding: false,
    onKeepAddingChange: vi.fn(),
    onClearLayout: vi.fn(),
    isAdmin: true,
    currentUser: { id: 'u1', role: 'admin', name: 'Admin', isActive: true },
    onViewImage: vi.fn(),
    layoutCategories: [],
    currentVenueCategory: 'reception',
    venueWidth: 60,
    venueHeight: 40,
    canvasWidth: 100,
    canvasHeight: 80,
    onResetView: vi.fn(),
    onResetToVenue: vi.fn(),
    onResetToCanvas: vi.fn(),
    placedTables: [],
    placedFixtures: [],
    ...overrides,
  };
  return { ...render(<Sidebar {...(props as any)} />), props };
}

describe('Sidebar guided placement controls', () => {
  beforeEach(() => {
    localStorage.setItem('spm_decor_arrangements', JSON.stringify([arrangement]));
    localStorage.setItem('spm_decor_catalog', JSON.stringify([
      { id: 'flowers', name: 'Flowers', width: 1, height: 1, categoryId: 'floral', createdAt: new Date().toISOString() },
    ]));
  });

  it('supports click and keyboard activation for saved designs', () => {
    const { props } = renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: /Decor Designs/i }));
    const design = screen.getByRole('button', { name: 'Place saved design Garden Arch Design' });

    fireEvent.click(design);
    expect(props.onDragStart).toHaveBeenCalledWith('arrangement', 'design-one');

    fireEvent.keyDown(design, { key: 'Enter' });
    fireEvent.keyDown(design, { key: ' ' });
    expect(props.onDragStart).toHaveBeenCalledTimes(3);
  });

  it('shows an explicit Keep adding option and cancellation while placement is active', () => {
    const onKeepAddingChange = vi.fn();
    const onCancelPlacement = vi.fn();
    renderSidebar({
      currentDragItem: { type: 'arrangement', specId: 'design-one' },
      keepAdding: true,
      onKeepAddingChange,
      onCancelPlacement,
    });

    expect(screen.getByText('Placement mode active')).toBeInTheDocument();
    expect(screen.getByText(/Escape cancels/)).toBeInTheDocument();
    const keepAdding = screen.getByLabelText('Keep adding after each successful placement') as HTMLInputElement;
    expect(keepAdding.checked).toBe(true);
    fireEvent.click(keepAdding);
    expect(onKeepAddingChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel placement' }));
    expect(onCancelPlacement).toHaveBeenCalledTimes(1);
  });

  it('ends a browser drag through the placement callback and exposes keyboard resizing', () => {
    const onDragEnd = vi.fn();
    const onWidthChange = vi.fn();
    renderSidebar({ onDragEnd, onWidthChange });
    fireEvent.click(screen.getByRole('button', { name: /Decor Designs/i }));
    const design = screen.getByRole('button', { name: 'Place saved design Garden Arch Design' });
    fireEvent.dragEnd(design);
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    const separator = screen.getByRole('separator', { name: 'Resize Layout Tools' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(onWidthChange).toHaveBeenNthCalledWith(1, 290);
    expect(onWidthChange).toHaveBeenNthCalledWith(2, 200);
  });

  it('keeps every tool section reachable and resets the content scroll on section changes', () => {
    renderSidebar();
    const region = screen.getByRole('region', { name: 'Tables/Seating tools' });
    Object.defineProperty(region, 'scrollTop', { configurable: true, writable: true, value: 120 });

    for (const section of ['Venue Items', 'Lodging Items', 'Arch/Landscape Items', 'Decor Designs', 'Settings', 'Tips']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(section, 'i') }));
      expect(region.scrollTop).toBe(0);
      region.scrollTop = 120;
    }
    expect(region).toHaveClass('overflow-y-auto');
  });
});
