import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlacedFixture, PlacedTable, Venue } from '../types';
import {
  checkFixtureCollision,
  checkTableCollision,
  getTableBoundingBoxWithChairs,
  getTableFootprintPolygon,
  validateLayout,
} from './collisionDetection';

vi.mock('../hooks/useLayoutState', () => ({
  getTableSpecs: vi.fn(() => [{
    id: 'ceremony-row',
    name: 'Ceremony Row',
    shape: 'rectangle',
    width: 99,
    height: 99,
    capacity: 6,
    isSeatingType: true,
    seatingStyle: 'semicircle-row',
    seatingRowCount: 2,
    seatingRowSpacing: 3,
    defaultChairType: 'white-plastic',
  }]),
  getFixtureTypes: vi.fn(() => [{
    id: 'fixture', name: 'Fixture', shape: 'rectangle', width: 2, height: 2,
    category: 'interior',
  }]),
}));

vi.mock('../data/venueData', () => ({
  getSpacingSettings: vi.fn(() => ({
    enableCollisionDetection: true,
    minFixtureSpacing: 2,
    minWallSpacing: 1,
    minTableSpacing: 3,
  })),
  getChairSpecs: vi.fn(() => [{
    id: 'white-plastic', name: 'Chair', width: 1.5, depth: 1.5,
  }]),
}));

const venue = { id: 'venue', width: 50, height: 50, shape: 'rectangle' } as Venue;

function row(chairCount: number, overrides: Partial<PlacedTable> = {}): PlacedTable {
  return {
    id: 'row', type: 'table', specId: 'ceremony-row', x: 10, y: 10,
    rotation: 0, label: 'Row', guests: [], chairCount,
    chairType: 'white-plastic',
    ...overrides,
  };
}

const fixture: PlacedFixture = {
  id: 'fixture', type: 'fixture', specId: 'fixture', x: 10, y: 10,
  rotation: 0, label: 'Fixture',
};

describe('chair-only collision geometry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses curved rendered seating bounds instead of stale catalog dimensions', () => {
    const bounds = getTableBoundingBoxWithChairs(row(6));
    expect(bounds.width).toBeGreaterThan(9);
    expect(bounds.width).toBeLessThan(30);
    expect(bounds.height).toBeLessThan(30);
  });

  it('treats an explicit zero-chair row as physically empty', () => {
    const emptyAtFixture = row(0);
    const emptyAtWall = row(0, { id: 'wall-row', x: 0, y: 0 });

    expect(getTableFootprintPolygon(emptyAtFixture)).toEqual([]);
    expect(checkTableCollision(emptyAtFixture, [], [fixture], venue).collides).toBe(false);
    expect(checkFixtureCollision(fixture, [emptyAtFixture], [], venue).collides).toBe(false);
    const warnings = validateLayout([emptyAtWall], [fixture], venue);
    expect(warnings.tableWarnings.has(emptyAtWall.id)).toBe(false);
    expect(warnings.fixtureWarnings.has(fixture.id)).toBe(false);
  });
});
