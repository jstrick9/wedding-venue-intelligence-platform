import { describe, expect, it } from 'vitest';
import type { Guest, Layout } from '../types';
import { applyLayoutIdentityRepair, buildLayoutIdentityReview } from './layoutIdentity';

function duplicateLayout(): Pick<Layout, 'tables' | 'fixtures' | 'decor' | 'ceremonyRows'> {
  return {
    tables: [
      { id: 'same', type: 'table', specId: 'round', x: 1.25, y: 2.5, rotation: 7, label: 'Table A', guests: ['g1'] },
      { id: 'same', type: 'table', specId: 'round', x: 11.75, y: 12.5, rotation: 19, label: 'Table B', guests: [] },
    ],
    fixtures: [
      { id: 'cross', type: 'fixture', specId: 'arch', x: 20.25, y: 21.5, rotation: 12, label: 'Arch' },
    ],
    decor: [
      { id: 'cross', decorItemId: 'flowers', x: 3.125, y: 4.875, rotation: 23, scaleX: 1.2, scaleY: 0.8, opacity: 1, zIndex: 2, parentType: 'table', parentId: 'same', notes: 'Ambiguous garland' },
      { id: 'decor-child', decorItemId: 'sign', x: 5.5, y: 6.5, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, zIndex: 3, parentType: 'fixture', parentId: 'cross' },
    ],
    ceremonyRows: [],
  };
}

describe('guided layout identity repair', () => {
  it('keeps first IDs, rekeys later duplicates, preserves coordinates, and requires ambiguous choices', () => {
    const layout = duplicateLayout();
    const guests: Guest[] = [{ id: 'g1', name: 'Guest', tableId: 'same', rsvpStatus: 'confirmed' }];
    const review = buildLayoutIdentityReview(layout, guests);
    expect(review).not.toBeNull();
    expect(review?.changedEntityCount).toBe(2);
    expect(review?.ambiguousReferences.map((reference) => reference.key)).toEqual(['decor:0:parentId']);

    expect(() => applyLayoutIdentityRepair(layout, guests, review!, {})).toThrow(/Choose a valid target/i);
    const secondTable = review!.records.find((record) => record.key === 'table:1')!;
    const result = applyLayoutIdentityRepair(layout, guests, review!, {
      'decor:0:parentId': secondTable.key,
    });

    expect(result.layout.tables[0].id).toBe('same');
    expect(result.layout.tables[1].id).toBe(secondTable.repairedId);
    expect(result.layout.decor[0].parentId).toBe(secondTable.repairedId);
    // The fixture is the only fixture candidate for the cross-kind duplicate,
    // so its child relationship is repaired without guessing.
    expect(result.layout.decor[1].parentId).toBe(result.layout.fixtures[0].id);
    expect(result.guests[0].tableId).toBe('same');
    expect(result.layout.tables.map(({ x, y, rotation }) => ({ x, y, rotation }))).toEqual([
      { x: 1.25, y: 2.5, rotation: 7 },
      { x: 11.75, y: 12.5, rotation: 19 },
    ]);
    expect(result.layout.decor.map(({ x, y, rotation, scaleX, scaleY }) => ({ x, y, rotation, scaleX, scaleY }))).toEqual([
      { x: 3.125, y: 4.875, rotation: 23, scaleX: 1.2, scaleY: 0.8 },
      { x: 5.5, y: 6.5, rotation: 0, scaleX: 1, scaleY: 1 },
    ]);
    const ids = [
      ...result.layout.tables,
      ...result.layout.fixtures,
      ...result.layout.decor,
    ].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('requires a guest target when duplicate membership cannot disambiguate it', () => {
    const layout = duplicateLayout();
    layout.tables.forEach((table) => { table.guests = []; });
    const guests: Guest[] = [{ id: 'g1', name: 'Guest', tableId: 'same', rsvpStatus: 'confirmed' }];
    const review = buildLayoutIdentityReview(layout, guests)!;
    expect(review.ambiguousReferences.some((reference) => reference.key === 'guest:0:tableId')).toBe(true);
    const second = review.records.find((record) => record.key === 'table:1')!;
    const decorParent = review.records.find((record) => record.key === 'table:0')!;
    const repaired = applyLayoutIdentityRepair(layout, guests, review, {
      'decor:0:parentId': decorParent.key,
      'guest:0:tableId': second.key,
    });
    expect(repaired.guests[0].tableId).toBe(second.repairedId);
  });

  it('rejects stale repair reviews', () => {
    const layout = duplicateLayout();
    const review = buildLayoutIdentityReview(layout, [])!;
    const changed = { ...layout, tables: layout.tables.map((table, index) => index === 0 ? { ...table, id: 'changed' } : table) };
    expect(() => applyLayoutIdentityRepair(changed, [], review, {})).toThrow(/layout changed/i);
  });

  it('returns null for a healthy layout', () => {
    const layout = duplicateLayout();
    layout.tables[1].id = 'different';
    layout.decor[0].id = 'decor-one';
    expect(buildLayoutIdentityReview(layout, [])).toBeNull();
  });
});
