import { describe, expect, it } from 'vitest';
import type { DecorArrangement, DecorItem, PlacedTable, TableSpec } from '../types';
import { appliedArrangementBaseDimensions, appliedArrangementFootprints } from './decorGeometry';
import { polygonBounds } from './venueGeometry';

const decorItems = [{
  id: 'runner',
  name: 'Runner',
  categoryId: 'linens',
  width: 2,
  height: 1,
  color: '#fff',
  createdAt: '2026-01-01T00:00:00.000Z',
}];

function arrangement(rotation = 0): DecorArrangement {
  return {
    id: 'design',
    name: 'Design',
    baseType: 'table',
    items: [{ decorItemId: 'runner', x: 12, y: 0, scaleX: 1, scaleY: 1, rotation, zIndex: 0 }],
  } as DecorArrangement;
}

const base: PlacedTable = {
  id: 'table',
  type: 'table',
  specId: 'regular',
  x: 10,
  y: 20,
  rotation: 90,
  label: 'Table',
  guests: [],
  chairCount: 0,
};
const regularSpec: TableSpec = {
  id: 'regular',
  name: 'Regular',
  shape: 'rectangle',
  width: 4,
  height: 2,
  capacity: 0,
};

describe('applied arrangement geometry', () => {
  it('rotates component offsets and footprints with the target base', () => {
    const [footprint] = appliedArrangementFootprints(base, regularSpec, arrangement(), decorItems);
    const bounds = polygonBounds(footprint.polygon);

    expect(bounds.x).toBeCloseTo(11.5);
    expect(bounds.x + bounds.width).toBeCloseTo(12.5);
    expect(bounds.y).toBeCloseTo(21);
    expect(bounds.y + bounds.height).toBeCloseTo(23);
  });

  it('combines component rotation with target rotation', () => {
    const [footprint] = appliedArrangementFootprints(base, regularSpec, arrangement(90), decorItems);
    const bounds = polygonBounds(footprint.polygon);

    expect(bounds.x).toBeCloseTo(11);
    expect(bounds.x + bounds.width).toBeCloseTo(13);
    expect(bounds.y).toBeCloseTo(21.5);
    expect(bounds.y + bounds.height).toBeCloseTo(22.5);
  });

  it('uses rendered chair-only dimensions instead of stale catalog dimensions', () => {
    const seatingSpec: TableSpec = {
      ...regularSpec,
      id: 'seating',
      width: 99,
      height: 99,
      capacity: 2,
      isSeatingType: true,
      seatingRowCount: 1,
      seatingRowSpacing: 3,
      seatingStyle: 'straight-row',
      defaultChairType: 'white-plastic',
    };
    const seatingBase: PlacedTable = {
      ...base,
      specId: 'seating',
      rotation: 0,
      chairCount: 2,
      chairType: 'white-plastic',
    };
    const dimensions = appliedArrangementBaseDimensions(seatingBase, seatingSpec);
    const [footprint] = appliedArrangementFootprints(
      seatingBase,
      seatingSpec,
      { ...arrangement(), items: [{ ...arrangement().items[0], x: 0 }] },
      decorItems,
    );
    const bounds = polygonBounds(footprint.polygon);

    expect(dimensions.width).toBeCloseTo(3.225);
    expect(dimensions.height).toBeCloseTo(1.5);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(10 + dimensions.width / 2);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(20 + dimensions.height / 2);
  });

  it('skips components whose catalog definitions are missing', () => {
    expect(appliedArrangementFootprints(base, regularSpec, arrangement(), [])).toEqual([]);
  });
});
