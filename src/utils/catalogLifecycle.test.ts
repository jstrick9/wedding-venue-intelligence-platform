import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSavedLayouts,
  getTableSpecs,
  getTemplates,
  getVenues,
  setSavedLayouts,
  setTableSpecs,
  setTemplates,
  setVenues,
} from '../hooks/useLayoutState';
import {
  createCoupleEvent,
  getCoupleEvents,
  saveCoupleSpaceLayout,
} from '../services/couples/coupleService';
import { applyCatalogReplacementToStoredData } from './catalogLifecycle';

function placedTable(id: string) {
  return {
    id,
    type: 'table' as const,
    specId: 'old-table',
    x: 11,
    y: 12,
    rotation: 45,
    label: 'Family table',
    guests: [],
  };
}

describe('catalog replacement persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    setTableSpecs([
      { id: 'old-table', name: 'Old', shape: 'circle', width: 5, height: 5, capacity: 8 },
      { id: 'new-table', name: 'New', shape: 'circle', width: 5, height: 5, capacity: 10 },
    ]);
    setVenues([{
      id: 'venue-1', name: 'Hall', category: 'reception', capacity: 100,
      width: 60, height: 40,
      masterLayout: {
        tables: [placedTable('master-table')], fixtures: [], decor: [], savedAt: 'now',
      },
    }]);
    setSavedLayouts([{
      id: 'saved-1', name: 'Saved', venueId: 'venue-1',
      tables: [placedTable('saved-table')], fixtures: [], decor: [], guests: [],
      createdAt: 'now', updatedAt: 'now',
    }]);
    setTemplates([{
      id: 'template-1', name: 'Template', category: 'reception', venueId: 'venue-1',
      tables: [placedTable('template-table')], fixtures: [], createdAt: 'now',
    }]);
    const event = createCoupleEvent({
      coupleName: 'A & B', availableSpaces: ['venue-1'], eventDate: '2099-01-01',
    });
    saveCoupleSpaceLayout(event.id, 'venue-1', {
      tables: [placedTable('couple-table')], fixtures: [], decor: [], updatedAt: 'now',
    });
  });

  it('updates every persisted layout while retaining the source recovery definition', () => {
    const oldSpec = getTableSpecs().find((spec) => spec.id === 'old-table')!;
    const result = applyCatalogReplacementToStoredData(
      'table', 'old-table', 'new-table', { oldTableSpec: oldSpec },
    );

    expect(result.persistentLayoutsUpdated).toBe(4);
    const tables = [
      getVenues()[0].masterLayout!.tables[0],
      getSavedLayouts()[0].tables[0],
      getTemplates()[0].tables[0],
      getCoupleEvents()[0].spaceLayouts!['venue-1'].layout!.tables[0],
    ];
    tables.forEach((table) => {
      expect(table).toMatchObject({
        specId: 'new-table', x: 11, y: 12, rotation: 45,
        label: 'Family table', chairCount: 8,
      });
    });
    expect(getTableSpecs().some((spec) => spec.id === 'old-table')).toBe(true);
  });
});
