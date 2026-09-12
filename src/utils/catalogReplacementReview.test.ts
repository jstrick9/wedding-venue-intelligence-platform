import { beforeEach, describe, expect, it } from 'vitest';
import { setFixtureTypes, setTableSpecs } from '../hooks/useLayoutState';
import { setChairSpecs, setSpacingSettings } from '../data/venueData';
import { reviewCatalogReplacement } from './catalogReplacementReview';

const venue = {
  id: 'venue', name: 'Hall', category: 'reception', capacity: 100,
  width: 20, height: 20, canvasWidth: 30, canvasHeight: 30, venueX: 5, venueY: 5,
} as any;

const oldSpec = {
  id: 'old', name: 'Small', shape: 'rectangle', width: 2, height: 2,
  capacity: 0, inventoryCount: 10,
} as any;
const largeSpec = {
  id: 'large', name: 'Large', shape: 'rectangle', width: 10, height: 10,
  capacity: 0, inventoryCount: 10,
} as any;

function source(tableCount = 1) {
  return {
    id: 'working', label: 'Current working layout', kind: 'working' as const,
    venueId: venue.id,
    tables: Array.from({ length: tableCount }, (_, index) => ({
      id: `table-${index}`, type: 'table' as const, specId: 'old',
      x: index === 0 ? 12 : 2, y: index === 0 ? 5 : 2,
      rotation: 0, label: `Table ${index}`, guests: [], chairCount: 0,
    })),
    fixtures: [], decor: [], ceremonyRows: [],
  };
}

describe('catalog replacement impact review', () => {
  beforeEach(() => {
    localStorage.clear();
    setTableSpecs([oldSpec, largeSpec]);
    setFixtureTypes([]);
    setChairSpecs([{ id: 'none', name: 'No Chairs', color: 'transparent', width: 0, depth: 0, icon: '' }]);
    setSpacingSettings({
      minTableSpacing: 0,
      minFixtureSpacing: 0,
      minWallSpacing: 0,
      showCollisionWarnings: true,
    } as any);
  });

  it('blocks a larger replacement that would cross a venue boundary', () => {
    const review = reviewCatalogReplacement({
      kind: 'table', oldId: 'old', replacementId: 'large',
      sourceDefinition: oldSpec, replacementDefinition: largeSpec,
      sources: [source()], venues: [venue], tableSpecs: [oldSpec, largeSpec],
      fixtureTypes: [], chairSpecs: [], decorItems: [], arrangements: [],
    });
    expect(review.blockers.some((issue) => /boundary|crosses/i.test(issue.message))).toBe(true);
  });

  it('blocks replacement when target inventory cannot cover the reviewed layout', () => {
    const target = { ...oldSpec, id: 'limited', name: 'Limited', inventoryCount: 1 };
    setTableSpecs([oldSpec, target]);
    const review = reviewCatalogReplacement({
      kind: 'table', oldId: 'old', replacementId: 'limited',
      sourceDefinition: oldSpec, replacementDefinition: target,
      sources: [source(2)], venues: [venue], tableSpecs: [oldSpec, target],
      fixtureTypes: [], chairSpecs: [], decorItems: [], arrangements: [],
    });
    expect(review.blockers.some((issue) => /inventory is 1/i.test(issue.message))).toBe(true);
  });
});
