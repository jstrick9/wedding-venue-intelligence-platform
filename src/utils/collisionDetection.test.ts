import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  boxesOverlap,
  checkFixtureCollision,
  getFixtureBoundingBox,
  getFixtureFootprintPolygon,
  validateLayout,
} from './collisionDetection';
import { getSpacingSettings } from '../data/venueData';

vi.mock('../hooks/useLayoutState', () => ({
  getFixtureTypes: vi.fn(() => [
    { id: 'venue-fixture', width: 10, height: 10, category: 'venue', isExterior: false },
    { id: 'lodging-fixture', width: 10, height: 10, category: 'lodging', isExterior: false },
    { id: 'exterior-fixture', width: 10, height: 10, category: 'exterior', isExterior: true },
  ]),
  getTableSpecs: vi.fn(() => []),
}));

vi.mock('../data/venueData', () => ({
  getSpacingSettings: vi.fn(() => ({
    enableCollisionDetection: true,
    minFixtureSpacing: 4,
    minWallSpacing: 3,
    minTableSpacing: 3,
  })),
  getChairSpecs: vi.fn(() => []),
}));

describe('collisionDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSpacingSettings).mockReturnValue({
      enableCollisionDetection: true,
      showCollisionWarnings: true,
      minItemSpacing: 1,
      minFixtureSpacing: 4,
      minWallSpacing: 3,
      minTableSpacing: 3,
    });
  });

  it('applies fixture spacing only to venue fixtures', () => {
    const venueBox = getFixtureBoundingBox({ id: 'a', x: 10, y: 10, specId: 'venue-fixture' } as any);
    const lodgingBox = getFixtureBoundingBox({ id: 'b', x: 10, y: 10, specId: 'lodging-fixture' } as any);
    const exteriorBox = getFixtureBoundingBox({ id: 'c', x: 10, y: 10, specId: 'exterior-fixture' } as any);

    expect(venueBox.width).toBe(14);
    expect(venueBox.height).toBe(14);

    expect(lodgingBox.width).toBe(10);
    expect(lodgingBox.height).toBe(10);

    expect(exteriorBox.width).toBe(10);
    expect(exteriorBox.height).toBe(10);
  });

  it('does not enforce wall spacing for lodging fixtures', () => {
    const result = checkFixtureCollision(
      { x: 0, y: 0, specId: 'lodging-fixture' },
      [],
      [],
      { id: 'v1', width: 40, height: 40 } as any
    );

    expect(result.collides).toBe(false);
    expect(result.wallError).toBe('');
  });

  it('disables optional spacing collisions without erasing physical boundary geometry', () => {
    vi.mocked(getSpacingSettings).mockReturnValue({
      enableCollisionDetection: false,
      showCollisionWarnings: false,
      minItemSpacing: 1,
      minFixtureSpacing: 4,
      minWallSpacing: 3,
      minTableSpacing: 3,
    });

    const result = checkFixtureCollision(
      { x: 10, y: 10, specId: 'venue-fixture' },
      [],
      [{ id: 'existing', type: 'fixture', x: 10, y: 10, rotation: 0, label: 'Existing', specId: 'venue-fixture' }],
      { id: 'v1', width: 40, height: 40 } as any,
    );
    expect(result.collides).toBe(false);

    const footprint = getFixtureFootprintPolygon({ x: 10, y: 10, specId: 'venue-fixture' });
    expect(footprint).toHaveLength(4);
    expect(Math.min(...footprint.map((point) => point.x))).toBe(10);
    expect(Math.max(...footprint.map((point) => point.x))).toBe(20);
  });

  it('detects overlap correctly with epsilon-safe comparison', () => {
    expect(boxesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 5, height: 5 })).toBe(true);
    expect(boxesOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10.01, y: 0, width: 5, height: 5 })).toBe(false);
  });

  it('validateLayout flags a table too close to the wall', () => {
    const venue = { id: 'v1', width: 40, height: 40 } as any;
    // Table at the very edge (spec not found -> default 4x4 box at x=0).
    const table = { id: 't1', specId: 'unknown', x: 0, y: 0 } as any;

    const { tableWarnings } = validateLayout([table], [], venue);

    expect(tableWarnings.has('t1')).toBe(true);
    expect(tableWarnings.get('t1')?.toLowerCase()).toContain('wall');
  });

  it('validateLayout reports nothing for a clear layout', () => {
    const venue = { id: 'v1', width: 40, height: 40 } as any;
    const table = { id: 't1', specId: 'unknown', x: 20, y: 20 } as any;

    const { tableWarnings, fixtureWarnings } = validateLayout([table], [], venue);
    expect(tableWarnings.size).toBe(0);
    expect(fixtureWarnings.size).toBe(0);
  });
});
