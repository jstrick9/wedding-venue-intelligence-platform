import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useLayoutState, setTableSpecs, setVenues, getSavedLayouts } from './useLayoutState';

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
 * Design Studio venue-admin: unsaved-work (dirty) tracking + Save Layout overwrite.
 */
describe('layout save overwrite + dirty tracking', () => {
  beforeEach(() => {
    localStorage.clear();
    setVenues([
      { id: 'ballroom', name: 'Grand Ballroom', width: 80, height: 60, capacity: 250, category: 'reception', color: '#fff' },
      { id: 'garden', name: 'Garden', width: 60, height: 50, capacity: 150, category: 'ceremony', color: '#eef8ea' },
    ]);
    setTableSpecs([
      { id: 'round-60', name: 'Round 60"', shape: 'circle', width: 5, height: 5, capacity: 8, showChairs: true },
    ]);
  });

  it('saveLayoutWithOverwrite updates an existing layout in place', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    act(() => { result.current.saveLayout('Evening Plan'); });

    // Change the layout, then overwrite the same name.
    act(() => { result.current.addTable('round-60', { x: 30, y: 30 }); });
    act(() => { result.current.saveLayoutWithOverwrite('evening plan'); }); // case-insensitive match

    const named = getSavedLayouts().filter(
      (l) => l.name === 'evening plan' || l.name === 'Evening Plan',
    );
    // Only one layout with that name exists (overwritten, not duplicated).
    expect(named.length).toBe(1);
    expect(named[0].tables).toHaveLength(2);
  });

  it('keeps same-name layouts in different venues independent', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    act(() => { result.current.saveLayoutWithOverwrite('Shared Plan'); });

    act(() => { result.current.changeVenue('garden'); });
    act(() => { result.current.addTable('round-60', { x: 20, y: 20 }); });
    act(() => { result.current.saveLayoutWithOverwrite('shared plan'); });

    const named = getSavedLayouts().filter(
      (layout) => layout.name.toLowerCase() === 'shared plan',
    );
    expect(named).toHaveLength(2);
    expect(new Set(named.map((layout) => layout.venueId))).toEqual(new Set(['ballroom', 'garden']));
  });

  it('tracks layoutDirty across edits and clears on save', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    expect(result.current.layoutDirty).toBe(false);

    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    expect(result.current.layoutDirty).toBe(true);

    act(() => { result.current.saveLayoutWithOverwrite('Plan'); });
    expect(result.current.layoutDirty).toBe(false);
  });

  it('establishes the exact saved-layout payload as a clean baseline', () => {
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 10, y: 10 }); });
    let savedId = '';
    act(() => { savedId = result.current.saveLayout('Saved baseline'); });
    act(() => { result.current.addTable('round-60', { x: 20, y: 20 }); });
    expect(result.current.layoutDirty).toBe(true);

    act(() => { result.current.loadLayout(savedId); });
    expect(result.current.layout.tables).toHaveLength(1);
    expect(result.current.layoutDirty).toBe(false);
  });

  it('keeps venue-master and template replacements clean without a stale follow-up mark', () => {
    const venues = [
      ...resultingVenuesWithGardenMaster(),
    ];
    setVenues(venues);
    const { result } = renderHook(() => useLayoutState('ballroom'));
    act(() => { result.current.addTable('round-60', { x: 1, y: 1 }); });
    expect(result.current.layoutDirty).toBe(true);

    act(() => { result.current.changeVenue('garden'); });
    expect(result.current.layout.tables[0]?.id).toBe('master-table');
    expect(result.current.layout.decor[0]).toMatchObject({ id: 'master-decor', parentId: 'master-table' });
    expect(result.current.layoutDirty).toBe(false);

    act(() => { result.current.loadTemplate({
      id: 'template', name: 'Template', venueId: 'ballroom', category: 'reception',
      tables: [{ id: 'template-table', type: 'table', specId: 'round-60', x: 7, y: 8, rotation: 0, label: 'Template Table', guests: [] }],
      fixtures: [], decor: [], ceremonyRows: [], createdAt: new Date().toISOString(),
    } as any); });
    expect(result.current.layout.tables[0]?.id).toBe('template-table');
    expect(result.current.layoutDirty).toBe(false);
  });
});

function resultingVenuesWithGardenMaster() {
  return [
    { id: 'ballroom', name: 'Grand Ballroom', width: 80, height: 60, capacity: 250, category: 'reception' as const, color: '#fff' },
    {
      id: 'garden', name: 'Garden', width: 60, height: 50, capacity: 150, category: 'ceremony' as const, color: '#eef8ea',
      masterLayout: {
        tables: [{ id: 'master-table', type: 'table' as const, specId: 'round-60', x: 4, y: 5, rotation: 0, label: 'Master Table', guests: [] }],
        fixtures: [],
        decor: [{ id: 'master-decor', decorItemId: 'flowers', x: 5, y: 6, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, zIndex: 1, parentType: 'table' as const, parentId: 'master-table' }],
        ceremonyRows: [], savedAt: new Date().toISOString(),
      },
    },
  ];
}
