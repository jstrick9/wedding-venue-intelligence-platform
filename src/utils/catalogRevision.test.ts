import { describe, expect, it } from 'vitest';
import { catalogFamilyIds, catalogFamilyInventory } from './catalogFamily';
import { catalogPhysicalChanges, createCatalogRevision } from './catalogRevision';

const table = {
  id: 'round', name: 'Round', shape: 'circle', width: 5, height: 5,
  capacity: 8, color: '#fff', inventoryCount: 20,
} as any;

describe('catalog revisions', () => {
  it('distinguishes metadata edits from physical/seating edits', () => {
    expect(catalogPhysicalChanges('table', table, { ...table, name: 'Renamed', color: '#000' }))
      .toEqual([]);
    expect(catalogPhysicalChanges('table', table, { ...table, width: 6, capacity: 10 })
      .map((change) => change.field)).toEqual(['width', 'capacity']);
  });

  it('archives the source and creates collision-safe family revision IDs', () => {
    const existingRevision = {
      ...table, id: 'round-rev-2', catalogFamilyId: 'round', catalogRevision: 2,
    };
    const result = createCatalogRevision(
      table,
      { ...table, width: 6 },
      [table, existingRevision],
    );

    expect(result.archivedSource).toMatchObject({
      id: 'round', archived: true, catalogFamilyId: 'round', catalogRevision: 1,
    });
    expect(result.revision).toMatchObject({
      id: 'round-rev-3', width: 6, archived: false,
      catalogFamilyId: 'round', catalogRevision: 3,
    });
  });

  it('shares the newest active inventory limit across archived revisions', () => {
    const family = [
      { ...table, archived: true, catalogFamilyId: 'round', catalogRevision: 1 },
      {
        ...table, id: 'round-rev-2', archived: false, catalogFamilyId: 'round',
        catalogRevision: 2, inventoryCount: 12,
      },
    ];
    expect(catalogFamilyIds(family, family[0])).toEqual(new Set(['round', 'round-rev-2']));
    expect(catalogFamilyInventory(family, family[0])).toBe(12);
  });
});
