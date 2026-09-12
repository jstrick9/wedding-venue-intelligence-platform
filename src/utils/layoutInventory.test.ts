import { describe, expect, it } from 'vitest';
import type { ChairSpec, DecorArrangement, DecorItem, PlacedTable, TableSpec } from '../types';
import {
  arrangementPlacementInventoryIssue,
  decorPlacementInventoryIssue,
  tablePlacementInventoryIssue,
} from './layoutInventory';

const tableSpec: TableSpec = {
  id: 'round',
  name: 'Round Table',
  shape: 'circle',
  width: 5,
  height: 5,
  capacity: 10,
  inventoryCount: 4,
  defaultChairType: 'white-plastic',
};
const chairs: ChairSpec[] = [{
  id: 'white-plastic',
  name: 'White Chair',
  color: '#fff',
  width: 1.5,
  depth: 1.5,
  icon: 'chair',
  inventoryCount: 40,
}];

function table(id: string, chairCount: number): PlacedTable {
  return {
    id,
    type: 'table',
    specId: tableSpec.id,
    x: 0,
    y: 0,
    rotation: 0,
    label: id,
    guests: [],
    chairType: 'white-plastic',
    chairCount,
  };
}

describe('replacement-aware layout inventory', () => {
  it('allows a 10-seat table to be edited to 8 seats without counting its old allocation', () => {
    const placed = [table('one', 10), table('two', 10), table('three', 10), table('four', 10)];
    expect(tablePlacementInventoryIssue(
      { specId: 'round', chairType: 'white-plastic', chairCount: 8 },
      placed,
      [tableSpec],
      chairs,
      'four',
    )).toBeNull();
  });

  it('blocks an increase when replacement-aware chair demand still exceeds stock', () => {
    const placed = [table('one', 10), table('two', 10), table('three', 10), table('four', 8)];
    expect(tablePlacementInventoryIssue(
      { specId: 'round', chairType: 'white-plastic', chairCount: 12 },
      placed,
      [tableSpec],
      chairs,
      'four',
    )).toContain('only 10 remain');
  });

  it('blocks positive chair allocation when its catalog definition is missing', () => {
    expect(tablePlacementInventoryIssue(
      { specId: 'round', chairType: 'chiavari', chairCount: 8 },
      [],
      [tableSpec],
      chairs,
    )).toContain('missing chair type');
    expect(tablePlacementInventoryIssue(
      { specId: 'round', chairType: 'chiavari', chairCount: 0 },
      [],
      [tableSpec],
      chairs,
    )).toBeNull();
  });

  it('does not allocate chairs for an explicit zero-chair replacement', () => {
    expect(tablePlacementInventoryIssue(
      { specId: 'round', chairType: 'white-plastic', chairCount: 0 },
      [table('one', 10), table('two', 10), table('three', 10), table('four', 10)],
      [tableSpec],
      chairs,
      'four',
    )).toBeNull();
  });

  it('counts archived and active catalog revisions against one inventory pool', () => {
    const revisions = [
      {
        id: 'round-old', name: 'Round old', shape: 'circle', width: 5, height: 5,
        capacity: 0, inventoryCount: 1, archived: true,
        catalogFamilyId: 'round-family', catalogRevision: 1,
      },
      {
        id: 'round-new', name: 'Round new', shape: 'circle', width: 6, height: 6,
        capacity: 0, inventoryCount: 1, archived: false,
        catalogFamilyId: 'round-family', catalogRevision: 2,
      },
    ] as any;
    const issue = tablePlacementInventoryIssue(
      { specId: 'round-new', chairCount: 0 },
      [{ id: 'old-placement', type: 'table', specId: 'round-old', x: 1, y: 1, rotation: 0, label: 'Old', guests: [], chairCount: 0 }],
      revisions,
      [],
    );
    expect(issue).toBe('Round new inventory is fully allocated.');
  });

  it('excludes the target design before checking a replacement design', () => {
    const decorItems: DecorItem[] = [{
      id: 'vase',
      name: 'Vase',
      categoryId: 'centerpiece',
      width: 1,
      height: 1,
      color: '#fff',
      inventoryCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    }];
    const arrangements: DecorArrangement[] = [
      { id: 'old', name: 'Old', baseType: 'table', items: [{ decorItemId: 'vase', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 }] },
      { id: 'new', name: 'New', baseType: 'table', items: [{ decorItemId: 'vase', x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 }] },
    ] as DecorArrangement[];
    const targets = [
      { id: 'target', appliedArrangementId: 'old' },
      { id: 'other', appliedArrangementId: 'old' },
    ];

    expect(arrangementPlacementInventoryIssue(
      'new', targets, [], [], arrangements, decorItems, 'target',
    )).toBeNull();
    expect(arrangementPlacementInventoryIssue(
      'new', targets, [], [], arrangements, decorItems,
    )).toContain('0 remaining');
    expect(decorPlacementInventoryIssue(
      'vase', [], decorItems, targets, [], arrangements,
    )).toContain('0 remaining');
  });
});
