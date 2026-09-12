import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useLayoutState, setTableSpecs, setFixtureTypes, setVenues, setDecorItems, setTemplates, getTemplates, getVenues, getSavedLayouts } from './useLayoutState';
import { venueGeometrySignature } from '../utils/venueGeometry';
import { on } from '../utils/appEvents';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', username: 'admin', role: 'admin', name: 'Admin User', isActive: true, createdAt: new Date().toISOString() },
    isAdmin: true, isBasicUser: false, isGuest: false,
    login: vi.fn(), logout: vi.fn(), continueAsGuest: vi.fn(), createUser: vi.fn(),
    updateUser: vi.fn(), deleteUser: vi.fn(), getAllUsers: vi.fn(() => []),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/**
 * Venue-admin persona: using the Layout Studio canvas to build a floor plan —
 * place tables/fixtures/decor, move, duplicate, remove, save a master layout,
 * and load a template. Exercises the real layout-state mutations.
 */
describe('layout studio canvas (venue admin)', () => {
  beforeEach(() => {
    localStorage.clear();
    setVenues([
      { id: 'ballroom', name: 'Grand Ballroom', width: 80, height: 60, capacity: 250, category: 'reception', color: '#fff' },
    ]);
    setTableSpecs([
      { id: 'round-60', name: 'Round 60"', shape: 'circle', width: 5, height: 5, capacity: 8, showChairs: true },
    ]);
    setFixtureTypes([
      { id: 'dance-floor', name: 'Dance Floor', shape: 'rectangle', width: 18, height: 18, category: 'interior' },
    ]);
    setDecorItems([{ id: 'centerpiece', name: 'Centerpiece', icon: '💐', width: 1, height: 1, categoryId: 'c1', createdAt: new Date().toISOString() } as any]);
  });

  it('places a table and a fixture on the canvas', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    act(() => { result.current.addFixture('dance-floor', { x: 40, y: 30 }); });
    expect(result.current.layout.tables).toHaveLength(1);
    expect(result.current.layout.fixtures).toHaveLength(1);
    expect(result.current.layout.tables[0].x).toBe(10);
    expect(result.current.layout.fixtures[0].label).toBe('Dance Floor');
  });

  it('keeps rapid same-millisecond placements uniquely addressable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => {
      for (let index = 0; index < 25; index += 1) {
        result.current.addTable('round-60', { x: index, y: index });
      }
    });
    const ids = result.current.layout.tables.map((table) => table.id);
    expect(new Set(ids).size).toBe(25);
    vi.restoreAllMocks();
  });

  it('moves and duplicates a placed table', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    const tableId = result.current.layout.tables[0].id;
    act(() => { result.current.updateTable(tableId, { x: 25, y: 20 }); });
    expect(result.current.layout.tables[0].x).toBe(25);
    act(() => { result.current.duplicateItem(tableId); });
    expect(result.current.layout.tables).toHaveLength(2);
    // Duplicate offset by +3.
    expect(result.current.layout.tables[1].x).toBe(28);
  });

  it('removes a placed item', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    act(() => { result.current.addFixture('dance-floor', { x: 40, y: 30 }); });
    const tableId = result.current.layout.tables[0].id;
    act(() => { result.current.removeItem(tableId); });
    expect(result.current.layout.tables).toHaveLength(0);
    expect(result.current.layout.fixtures).toHaveLength(1);
  });

  it('saves a master layout onto the current venue', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    act(() => { result.current.saveMasterLayout(); });
    const venue = getVenues().find((v) => v.id === 'ballroom');
    expect(venue?.masterLayout).toBeTruthy();
    expect(venue?.masterLayout?.tables).toHaveLength(1);
    expect(venue?.isMaster).toBe(true);
  });

  it('applies geometry onto the latest venue without overwriting fields or item coordinates', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => {
      result.current.addTable('round-60', { x: 12.375, y: 9.625 });
      result.current.addFixture('dance-floor', { x: 41.125, y: 30.875 });
      result.current.addDecor('centerpiece', { x: 6.75, y: 7.25 });
    });
    act(() => { result.current.saveLayout('Coordinate proof'); });
    const exactCoordinates = {
      table: { x: result.current.layout.tables[0].x, y: result.current.layout.tables[0].y },
      fixture: { x: result.current.layout.fixtures[0].x, y: result.current.layout.fixtures[0].y },
      decor: { x: result.current.layout.decor[0].x, y: result.current.layout.decor[0].y },
    };
    const openedVenue = { ...result.current.currentVenue };
    const baseline = venueGeometrySignature(openedVenue);

    act(() => {
      setVenues([{
        ...openedVenue,
        name: 'Ballroom renamed elsewhere',
        capacity: 300,
        masterLayout: { tables: [], fixtures: [], decor: [], savedAt: 'latest' },
      }]);
    });

    let venueChangeEvents = 0;
    const stopListening = on('spm_data_changed', (detail) => {
      if (detail?.type === 'venues') venueChangeEvents += 1;
    });
    let status: ReturnType<typeof result.current.updateCurrentVenue> | undefined;
    act(() => {
      status = result.current.updateCurrentVenue(
        { ...openedVenue, width: 90, canvasWidth: 130 },
        baseline,
      );
    });
    stopListening();

    expect(status).toBe('applied');
    expect(venueChangeEvents).toBe(1);
    expect(getVenues()[0]).toMatchObject({
      name: 'Ballroom renamed elsewhere',
      capacity: 300,
      width: 90,
      canvasWidth: 130,
    });
    expect(getVenues()[0].masterLayout?.savedAt).toBe('latest');
    expect({ x: result.current.layout.tables[0].x, y: result.current.layout.tables[0].y }).toEqual(exactCoordinates.table);
    expect({ x: result.current.layout.fixtures[0].x, y: result.current.layout.fixtures[0].y }).toEqual(exactCoordinates.fixture);
    expect({ x: result.current.layout.decor[0].x, y: result.current.layout.decor[0].y }).toEqual(exactCoordinates.decor);
    const persisted = getSavedLayouts().find((layout) => layout.name === 'Coordinate proof');
    expect({ x: persisted?.tables[0].x, y: persisted?.tables[0].y }).toEqual(exactCoordinates.table);
    expect({ x: persisted?.fixtures[0].x, y: persisted?.fixtures[0].y }).toEqual(exactCoordinates.fixture);
    expect({ x: persisted?.decor?.[0].x, y: persisted?.decor?.[0].y }).toEqual(exactCoordinates.decor);
  });

  it('rejects stale geometry and never resurrects a deleted venue', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    const openedVenue = { ...result.current.currentVenue };
    const baseline = venueGeometrySignature(openedVenue);

    act(() => {
      setVenues([{ ...openedVenue, width: 75 }]);
    });
    let conflict: ReturnType<typeof result.current.updateCurrentVenue> | undefined;
    act(() => {
      conflict = result.current.updateCurrentVenue({ ...openedVenue, width: 90 }, baseline);
    });
    expect(conflict).toBe('conflict');
    expect(getVenues()[0].width).toBe(75);

    act(() => setVenues([]));
    let missing: ReturnType<typeof result.current.updateCurrentVenue> | undefined;
    act(() => {
      missing = result.current.updateCurrentVenue({ ...openedVenue, width: 95 }, baseline);
    });
    expect(missing).toBe('venue-changed');
    expect(getVenues().some((candidate) => candidate.id === openedVenue.id)).toBe(false);
  });

  it('loads a template onto the canvas', () => {
    setTemplates([
      {
        id: 'tpl-1', name: 'Classic Reception', category: 'reception', venueId: 'ballroom',
        tables: [{ id: 'T1', type: 'table', specId: 'round-60', x: 5, y: 5, rotation: 0, label: 'T1', guests: [] }],
        fixtures: [],
        decor: [{ id: 'D1', decorItemId: 'centerpiece', x: 6, y: 6, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, zIndex: 1, parentType: 'table', parentId: 'T1' }],
        createdAt: new Date().toISOString(),
      },
    ] as any);
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.loadTemplate(getTemplates()[0]); });
    expect(result.current.layout.tables).toHaveLength(1);
    expect(result.current.layout.tables[0].id).toBe('T1');
    expect(result.current.layout.decor[0]).toMatchObject({ id: 'D1', parentType: 'table', parentId: 'T1' });
    expect(result.current.layout.name).toBe('Classic Reception');
  });
});
