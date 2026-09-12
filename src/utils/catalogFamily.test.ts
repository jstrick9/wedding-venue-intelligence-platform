import { describe, expect, it } from 'vitest';
import {
  catalogFamilyStatus,
  catalogFamilyWithMultipleActiveMembers,
  changedHistoricalCatalogMember,
} from './catalogFamily';

const revisionOne = {
  id: 'table-r1', name: 'Round Table', archived: true,
  catalogFamilyId: 'round-family', catalogRevision: 1, inventoryCount: 10,
};
const revisionTwo = {
  id: 'table-r2', name: 'Round Table', archived: false,
  catalogFamilyId: 'round-family', catalogRevision: 2, inventoryCount: 10,
};

describe('catalog family lifecycle invariants', () => {
  it('identifies historical and current revisions', () => {
    const definitions = [revisionOne, revisionTwo];
    expect(catalogFamilyStatus(definitions, revisionOne)).toMatchObject({
      isHistoricalRevision: true,
      hasActiveSibling: true,
      revision: 1,
    });
    expect(catalogFamilyStatus(definitions, revisionTwo)).toMatchObject({
      isCurrentRevision: true,
      revision: 2,
    });
  });

  it('detects attempted mutation or restoration of a historical revision', () => {
    expect(changedHistoricalCatalogMember(
      [revisionOne, revisionTwo],
      [{ ...revisionOne, archived: false }, revisionTwo],
    )?.id).toBe('table-r1');
    expect(changedHistoricalCatalogMember(
      [revisionOne, revisionTwo],
      [{ ...revisionOne, name: 'Changed old name' }, revisionTwo],
    )?.id).toBe('table-r1');
  });

  it('rejects multiple active members but permits one restored deletion archive', () => {
    expect(catalogFamilyWithMultipleActiveMembers([
      { ...revisionOne, archived: false }, revisionTwo,
    ])?.map((item) => item.id)).toEqual(['table-r1', 'table-r2']);
    expect(catalogFamilyWithMultipleActiveMembers([
      { id: 'standalone', archived: false },
      { id: 'deleted', archived: true },
    ])).toBeUndefined();
  });
});
