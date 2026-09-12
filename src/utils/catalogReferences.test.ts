import { describe, expect, it } from 'vitest';
import type { CatalogLayoutSource } from './catalogReferences';
import {
  catalogReplacementCompatibilityIssue,
  replaceCatalogConfigurationReferences,
  replaceCatalogReferencesInLayout,
  summarizeCatalogReferences,
} from './catalogReferences';

const source: CatalogLayoutSource = {
  id: 'named:layout-1',
  label: 'Reception plan',
  kind: 'named',
  venueId: 'venue-1',
  tables: [{
    id: 'table-1', type: 'table', specId: 'old-table', x: 11, y: 13,
    rotation: 45, label: 'Family', guests: [],
  }],
  fixtures: [{
    id: 'fixture-1', type: 'fixture', specId: 'old-fixture', x: 20, y: 22,
    rotation: 90, label: 'Arch', appliedArrangementId: 'arrangement-fixture',
  }],
  decor: [{
    id: 'decor-1', decorItemId: 'old-decor', x: 2, y: 3,
    rotation: 15, scaleX: 1, scaleY: 1, opacity: 1, zIndex: 1, parentType: 'canvas',
  }],
  ceremonyRows: [{
    id: 'row-1', x: 1, y: 1, chairCount: 8, chairType: 'old-chair' as any,
    rowStyle: 'straight', spacing: 1.5, rowWidth: 12, rotation: 0, facingDirection: 180,
  }],
};

const oldTable = {
  id: 'old-table', name: 'Old table', shape: 'circle', width: 5, height: 5,
  capacity: 8, defaultChairType: 'old-chair', allowedChairTypes: ['old-chair'],
} as any;

const arrangements = [{
  id: 'arrangement-table', name: 'Old table design', userId: 'admin',
  baseType: 'table', baseSpecId: 'old-table', createdAt: 'now',
  items: [{ decorItemId: 'old-decor', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, zIndex: 1 }],
}] as any;

describe('catalog reference lifecycle', () => {
  it('counts layout and indirect configuration dependencies before deletion', () => {
    const tableSummary = summarizeCatalogReferences('table', 'old-table', {
      sources: [source], tableSpecs: [oldTable], arrangements,
    });
    expect(tableSummary.totalReferences).toBe(2);
    expect(tableSummary.affectedLayouts).toBe(1);
    expect(tableSummary.entries.map((entry) => entry.label)).toEqual([
      'Reception plan', 'Décor design · Old table design',
    ]);

    const chairSummary = summarizeCatalogReferences('chair', 'old-chair', {
      sources: [source], tableSpecs: [oldTable], arrangements,
    });
    expect(chairSummary.totalReferences).toBe(4);
    expect(chairSummary.entries.some((entry) => entry.sourceKind === 'configuration')).toBe(true);

    const decorSummary = summarizeCatalogReferences('decor', 'old-decor', {
      sources: [source], tableSpecs: [oldTable], arrangements,
    });
    expect(decorSummary.totalReferences).toBe(2);
  });

  it('preserves placed identity and coordinates while materializing legacy table capacity', () => {
    const result = replaceCatalogReferencesInLayout(
      source,
      'table',
      'old-table',
      'new-table',
      { oldTableSpec: oldTable },
    );
    expect(result.tables[0]).toMatchObject({
      id: 'table-1', specId: 'new-table', x: 11, y: 13, rotation: 45,
      label: 'Family', chairCount: 8,
    });
    expect(source.tables[0]).not.toHaveProperty('chairCount');
  });

  it('replaces chair/decor configuration references without creating duplicates', () => {
    const chairResult = replaceCatalogConfigurationReferences(
      'chair', 'old-chair', 'new-chair',
      [{ ...oldTable, allowedChairTypes: ['old-chair', 'new-chair'] }],
      arrangements,
    );
    expect(chairResult.tableSpecs[0]).toMatchObject({
      defaultChairType: 'new-chair', allowedChairTypes: ['new-chair'],
    });

    const decorResult = replaceCatalogConfigurationReferences(
      'decor', 'old-decor', 'new-decor', [oldTable], arrangements,
    );
    expect(decorResult.arrangements[0].items[0].decorItemId).toBe('new-decor');
  });

  it('blocks replacements that change core spatial semantics', () => {
    expect(catalogReplacementCompatibilityIssue(
      'table', oldTable, { ...oldTable, id: 'seating', isSeatingType: true },
    )).toMatch(/cannot replace/i);
    expect(catalogReplacementCompatibilityIssue(
      'fixture',
      { id: 'inside', name: 'Inside', shape: 'rectangle', width: 2, height: 2, category: 'interior' } as any,
      { id: 'outside', name: 'Outside', shape: 'rectangle', width: 2, height: 2, category: 'exterior' } as any,
    )).toMatch(/cannot replace/i);
  });
});
