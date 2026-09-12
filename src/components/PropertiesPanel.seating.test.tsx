import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PropertiesPanel } from './PropertiesPanel';

vi.mock('../hooks/useLayoutState', () => ({
  getTableSpecs: () => [
    {
      id: 'seat-row',
      name: 'Ceremony Seating Row',
      shape: 'rectangle',
      width: 20,
      height: 2,
      capacity: 10,
      color: '#f8f4e3',
      category: 'interior',
      isSeatingType: true,
      seatingRowCount: 2,
      seatingRowSpacing: 3,
    },
    {
      id: 'chiavari-table',
      name: 'Chiavari Table',
      shape: 'circle',
      width: 5,
      height: 5,
      capacity: 8,
      defaultChairType: 'chiavari',
    },
  ],
  getFixtureTypes: () => [],
  getDecorItems: () => [],
  getLinenColors: () => [
    { id: 'white', name: 'White', hex: '#FFFFFF', textColor: '#374151', enabled: true },
  ],
}));

vi.mock('../data/venueData', () => ({
  getChairSpecs: () => [
    { id: 'white-plastic', name: 'White Plastic', width: 1.5, depth: 1.5, color: '#ffffff', icon: '🪑' },
    { id: 'chiavari', name: 'Chiavari', width: 1.5, depth: 1.5, color: '#d4af37', icon: '🪑' },
  ],
}));

vi.mock('../config', () => ({
  getConfig: () => ({
    primaryColor: '#4A1942',
    primaryDark: '#3d1a45',
    headerTextColor: '#ffffff',
  }),
  useBrandingConfig: () => ({
    primaryColor: '#4A1942',
    primaryDark: '#3d1a45',
    headerTextColor: '#ffffff',
  }),
}));

describe('PropertiesPanel seating types', () => {
  it('shows row count/spacing summary and updates chair count with seating defaults', () => {
    const onUpdateTable = vi.fn();

    render(
      <PropertiesPanel
        selectedId="t1"
        tables={[
          {
            id: 't1',
            type: 'table',
            specId: 'seat-row',
            x: 10,
            y: 10,
            rotation: 0,
            label: 'Row A',
            guests: [],
            chairCount: 4,
          },
        ]}
        fixtures={[]}
        onUpdateTable={onUpdateTable}
        onUpdateFixture={() => undefined}
        onRemoveItem={() => undefined}
        onDuplicateItem={() => undefined}
        onClose={() => undefined}
        onViewImage={() => undefined}
        visible
        onToggleVisibility={() => undefined}
        arrangements={[]}
      />,
    );

    expect(screen.getByText(/Rows:/i)).toBeInTheDocument();
    expect(screen.getByText(/Row Spacing:/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Chairs:/i)).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Rows: 2')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Row Spacing: 3 ft')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Total Chairs: 8')).toBeInTheDocument();

    // Seating types should not show linen controls.
    expect(screen.queryByText(/Table Linen/i)).not.toBeInTheDocument();

    const chairInput = screen.getByDisplayValue('4');
    fireEvent.change(chairInput, { target: { value: '5' } });

    expect(onUpdateTable).toHaveBeenCalledWith('t1', {
      chairCount: 5,
      showChairs: true,
    });
  });

  it('offers an explicit repair path for a historical missing catalog reference', () => {
    const onRepair = vi.fn();
    render(
      <PropertiesPanel
        selectedId="legacy"
        tables={[{
          id: 'legacy', type: 'table', specId: 'deleted-table', x: 7, y: 9,
          rotation: 30, label: 'Legacy table', guests: [],
        }]}
        fixtures={[]}
        onUpdateTable={() => undefined}
        onUpdateFixture={() => undefined}
        onRemoveItem={() => undefined}
        onDuplicateItem={() => undefined}
        onRepairCatalogReference={onRepair}
        onClose={() => undefined}
        onViewImage={() => undefined}
        visible
        onToggleVisibility={() => undefined}
        arrangements={[]}
      />,
    );

    expect(screen.getByText('Catalog definition is missing')).toBeInTheDocument();
    expect(screen.getByText(/Missing reference: deleted-table/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Replacement definition'), {
      target: { value: 'chiavari-table' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Repair catalog reference' }));
    expect(onRepair).toHaveBeenCalledWith('legacy', 'chiavari-table');
    expect(screen.getByRole('button', { name: /Duplicate/i })).toBeDisabled();
  });

  it('restores the table catalog default when chairs are re-enabled from explicit zero', () => {
    const onUpdateTable = vi.fn();
    render(
      <PropertiesPanel
        selectedId="t1"
        tables={[{
          id: 't1',
          type: 'table',
          specId: 'chiavari-table',
          x: 10,
          y: 10,
          rotation: 0,
          label: 'Dinner Table',
          guests: [],
          chairType: 'none',
          chairCount: 0,
          showChairs: false,
        }]}
        fixtures={[]}
        onUpdateTable={onUpdateTable}
        onUpdateFixture={() => undefined}
        onRemoveItem={() => undefined}
        onDuplicateItem={() => undefined}
        onClose={() => undefined}
        onViewImage={() => undefined}
        visible
        onToggleVisibility={() => undefined}
        arrangements={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add one configured chair' }));
    expect(onUpdateTable).toHaveBeenCalledWith('t1', {
      chairCount: 1,
      chairType: 'chiavari',
    });
  });
});
