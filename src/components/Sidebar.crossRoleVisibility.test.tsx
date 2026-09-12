import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Sidebar } from './Sidebar';
import { setTableSpecs, setFixtureTypes } from '../hooks/useLayoutState';

function renderSidebar(currentUser: any, isAdmin: boolean, currentVenueCategory: string) {
  return render(
    <Sidebar
      width={280}
      collapsed={false}
      onWidthChange={() => undefined}
      onCollapsedChange={() => undefined}
      zoom={1}
      onZoomChange={() => undefined}
      showGrid={true}
      onShowGridChange={() => undefined}
      gridSize={5}
      onGridSizeChange={() => undefined}
      onDragStart={() => undefined}
      onDragEnd={() => undefined}
      currentDragItem={null}
      onClearLayout={() => undefined}
      isAdmin={isAdmin}
      currentUser={currentUser}
      onViewImage={() => undefined}
      layoutCategories={[] as any}
      currentVenueCategory={currentVenueCategory}
      venueWidth={60}
      venueHeight={40}
      canvasWidth={100}
      canvasHeight={80}
      onResetView={() => undefined}
      onResetToVenue={() => undefined}
      onResetToCanvas={() => undefined}
      placedTables={[]}
      placedFixtures={[]}
    />,
  );
}

describe('Sidebar cross-role visibility for category-restricted items', () => {
  it('shows only category-matching table and visible venue fixture to basic users', async () => {
    const user = userEvent.setup();

    setTableSpecs([
      {
        id: 'tbl-rec',
        name: 'Reception Table',
        shape: 'rectangle',
        width: 6,
        height: 6,
        capacity: 10,
        color: '#ffffff',
        venueCategories: ['reception'],
      } as any,
      {
        id: 'tbl-cer',
        name: 'Ceremony Table',
        shape: 'rectangle',
        width: 6,
        height: 6,
        capacity: 10,
        color: '#ffffff',
        venueCategories: ['ceremony'],
      } as any,
    ]);

    setFixtureTypes([
      {
        id: 'fix-rec',
        name: 'Reception Fixture',
        category: 'interior',
        shape: 'rectangle',
        width: 4,
        height: 4,
        color: '#cccccc',
        icon: '🎉',
        visibleToUsers: true,
        isSelectable: true,
        venueCategories: ['reception'],
      } as any,
      {
        id: 'fix-hidden',
        name: 'Hidden Fixture',
        category: 'interior',
        shape: 'rectangle',
        width: 4,
        height: 4,
        color: '#cccccc',
        icon: '🚫',
        visibleToUsers: false,
        isSelectable: true,
        venueCategories: ['reception'],
      } as any,
    ]);

    renderSidebar(
      {
        id: 'u1',
        role: 'basic',
        name: 'Basic User',
        isActive: true,
      },
      false,
      'reception',
    );

    expect(screen.getByText('Reception Table')).toBeInTheDocument();
    expect(screen.queryByText('Ceremony Table')).not.toBeInTheDocument();

    await user.click(screen.getByTitle('Venue Items'));
    expect(screen.getByText('Reception Fixture')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Fixture')).not.toBeInTheDocument();
  });

  it('hides archived definitions from new placement even for venue admins', async () => {
    const user = userEvent.setup();
    setTableSpecs([
      {
        id: 'active-table', name: 'Active Table', shape: 'rectangle',
        width: 6, height: 6, capacity: 8,
      } as any,
      {
        id: 'archived-table', name: 'Archived Table', shape: 'rectangle',
        width: 6, height: 6, capacity: 8, archived: true,
      } as any,
    ]);
    setFixtureTypes([
      {
        id: 'archived-fixture', name: 'Archived Fixture', category: 'interior',
        shape: 'rectangle', width: 4, height: 4, archived: true,
      } as any,
    ]);

    renderSidebar(
      { id: 'admin', role: 'admin', name: 'Admin', isActive: true },
      true,
      'reception',
    );

    expect(screen.getByText('Active Table')).toBeInTheDocument();
    expect(screen.queryByText('Archived Table')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Venue Items'));
    expect(screen.queryByText('Archived Fixture')).not.toBeInTheDocument();
  });

  it('admin sees all category-restricted items regardless of current venue category', async () => {
    const user = userEvent.setup();

    setTableSpecs([
      {
        id: 'tbl-rec',
        name: 'Reception Table',
        shape: 'rectangle',
        width: 6,
        height: 6,
        capacity: 10,
        color: '#ffffff',
        venueCategories: ['reception'],
      } as any,
      {
        id: 'tbl-cer',
        name: 'Ceremony Table',
        shape: 'rectangle',
        width: 6,
        height: 6,
        capacity: 10,
        color: '#ffffff',
        venueCategories: ['ceremony'],
      } as any,
    ]);

    setFixtureTypes([
      {
        id: 'fix-rec',
        name: 'Reception Fixture',
        category: 'interior',
        shape: 'rectangle',
        width: 4,
        height: 4,
        color: '#cccccc',
        icon: '🎉',
        visibleToUsers: true,
        isSelectable: true,
        venueCategories: ['reception'],
      } as any,
      {
        id: 'fix-hidden',
        name: 'Hidden Fixture',
        category: 'interior',
        shape: 'rectangle',
        width: 4,
        height: 4,
        color: '#cccccc',
        icon: '🚫',
        visibleToUsers: false,
        isSelectable: true,
        venueCategories: ['reception'],
      } as any,
    ]);

    renderSidebar(
      {
        id: 'u2',
        role: 'admin',
        name: 'Admin User',
        isActive: true,
      },
      true,
      'reception',
    );

    expect(screen.getByText('Reception Table')).toBeInTheDocument();
    expect(screen.getByText('Ceremony Table')).toBeInTheDocument();

    await user.click(screen.getByTitle('Venue Items'));
    expect(screen.getByText('Reception Fixture')).toBeInTheDocument();
    expect(screen.getByText('Hidden Fixture')).toBeInTheDocument();
  });
});