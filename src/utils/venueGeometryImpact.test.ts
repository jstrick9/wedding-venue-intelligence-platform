import { beforeEach, describe, expect, it } from 'vitest';
import type { DecorArrangement, DecorItem, PlacedFixture, PlacedTable, TableSpec, Venue } from '../types';
import { analyzeVenueGeometryImpact, type GeometryImpactSource } from './venueGeometryImpact';

const tableSpec: TableSpec = {
  id: 'base',
  name: 'Base',
  shape: 'rectangle',
  width: 2,
  height: 2,
  capacity: 0,
};
const decorItems = [{
  id: 'garland',
  name: 'Garland',
  categoryId: 'greenery',
  width: 4,
  height: 1,
  color: '#0f0',
  createdAt: '2026-01-01T00:00:00.000Z',
}];
const arrangement = {
  id: 'design',
  name: 'Wide design',
  baseType: 'table',
  baseSpecId: 'base',
  items: [{ decorItemId: 'garland', x: 36, y: 0, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 }],
} as DecorArrangement;

const before: Venue = {
  id: 'venue',
  name: 'Venue',
  category: 'reception',
  width: 20,
  height: 25,
  capacity: 100,
  color: '#fff',
  shape: 'rectangle',
  canvasWidth: 40,
  canvasHeight: 40,
  venueX: 10,
  venueY: 5,
};

function table(overrides: Partial<PlacedTable> = {}): PlacedTable {
  return {
    id: 'table',
    type: 'table',
    specId: 'base',
    x: 8,
    y: 8,
    rotation: 0,
    label: 'Base',
    guests: [],
    chairCount: 0,
    appliedArrangementId: 'design',
    ...overrides,
  };
}

function source(tables: PlacedTable[] = [], fixtures: PlacedFixture[] = []): GeometryImpactSource {
  return {
    id: 'working:venue',
    label: 'Current working layout',
    kind: 'working',
    tables,
    fixtures,
    decor: [],
  };
}

describe('venue geometry impact coverage', () => {
  beforeEach(() => {
    localStorage.setItem('spm_tableSpecs', JSON.stringify([tableSpec]));
    localStorage.setItem('spm_fixtureTypes', JSON.stringify([{
      id: 'tree', name: 'Tree', shape: 'rectangle', width: 2, height: 2,
      icon: 'tree', color: '#0f0', category: 'exterior',
    }]));
    localStorage.setItem('spm_decor_arrangements', JSON.stringify([arrangement]));
  });

  it('reports applied-design components separately when the base still fits', () => {
    const report = analyzeVenueGeometryImpact(
      before,
      { ...before, width: 11 },
      [source([table()])],
      decorItems,
    );
    const row = report.rows[0];

    expect(row.itemCount).toBe(2);
    expect(row.outsideVenueBefore).toBe(0);
    expect(row.outsideVenueAfter).toBe(1);
    expect(row.newlyAffectedCount).toBe(1);
    expect(row.affectedItemIds).toEqual(['table:arrangement:design:0']);
  });

  it('includes target rotation when testing applied-design boundaries', () => {
    const report = analyzeVenueGeometryImpact(
      before,
      { ...before, height: 20 },
      [source([table({ y: 15, rotation: 90 })])],
      decorItems,
    );

    expect(report.rows[0].outsideVenueBefore).toBe(0);
    expect(report.rows[0].outsideVenueAfter).toBe(1);
    expect(report.rows[0].affectedItemIds).toContain('table:arrangement:design:0');
  });

  it('keeps exterior canvas anchors fixed when only the venue moves', () => {
    const fixture: PlacedFixture = {
      id: 'tree', type: 'fixture', specId: 'tree', x: 35, y: 10,
      rotation: 0, label: 'Tree', isExterior: true,
    };
    const moved = analyzeVenueGeometryImpact(
      before,
      { ...before, venueX: 15, venueY: 10 },
      [source([], [fixture])],
      decorItems,
    );
    const shrunk = analyzeVenueGeometryImpact(
      before,
      { ...before, canvasWidth: 36 },
      [source([], [fixture])],
      decorItems,
    );

    expect(moved.affectedItems).toBe(0);
    expect(shrunk.rows[0].outsideCanvasAfter).toBe(1);
    expect(shrunk.rows[0].newlyAffectedCount).toBe(1);
  });
});
