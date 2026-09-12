import type {
  ChairSpec,
  DecorArrangement,
  DecorItem,
  FixtureType,
  TableSpec,
  Venue,
} from '../types';
import {
  getFixtureFootprintPolygon,
  getTableFootprintPolygon,
  validateLayout,
} from './collisionDetection';
import { decorInventoryUsage } from './layoutInventory';
import { configuredChairType, tableSeatCount } from './layoutSeating';
import { catalogFamilyIds, catalogFamilyInventory } from './catalogFamily';
import {
  catalogReplacementCompatibilityIssue,
  replaceCatalogConfigurationReferences,
  replaceCatalogReferencesInLayout,
  type CatalogDefinition,
  type CatalogKind,
  type CatalogLayoutSource,
} from './catalogReferences';
import {
  effectiveCanvasGeometry,
  footprintFitsVenue,
  rotatedBoxPolygon,
} from './venueGeometry';

export interface CatalogReplacementReviewIssue {
  sourceId: string;
  sourceLabel: string;
  message: string;
}

export interface CatalogReplacementReview {
  blockers: CatalogReplacementReviewIssue[];
  warnings: CatalogReplacementReviewIssue[];
  incompatibleArrangementIds: string[];
  affectedSourceIds: string[];
  affectedInstances: number;
}

export interface CatalogReplacementReviewInput {
  kind: CatalogKind;
  oldId: string;
  replacementId: string;
  sourceDefinition: CatalogDefinition;
  replacementDefinition: CatalogDefinition;
  sources: CatalogLayoutSource[];
  venues: Venue[];
  tableSpecs: TableSpec[];
  fixtureTypes: FixtureType[];
  chairSpecs: ChairSpec[];
  decorItems: DecorItem[];
  arrangements: DecorArrangement[];
}

function sourceAffectedIds(
  input: CatalogReplacementReviewInput,
  source: CatalogLayoutSource,
): { tableIds: string[]; fixtureIds: string[]; decorIds: string[]; count: number } {
  const specsById = new Map(input.tableSpecs.map((spec) => [spec.id, spec]));
  const tableIds = source.tables.filter((item) =>
    input.kind === 'table'
      ? item.specId === input.oldId
      : input.kind === 'chair'
        ? configuredChairType(item, specsById.get(item.specId)) === input.oldId
        : false).map((item) => item.id);
  const fixtureIds = source.fixtures.filter((item) =>
    input.kind === 'fixture' && item.specId === input.oldId).map((item) => item.id);
  const decorIds = source.decor.filter((item) =>
    input.kind === 'decor' && item.decorItemId === input.oldId).map((item) => item.id);
  const rowCount = input.kind === 'chair'
    ? source.ceremonyRows.filter((row) => row.chairType === input.oldId).length
    : 0;
  return {
    tableIds,
    fixtureIds,
    decorIds,
    count: tableIds.length + fixtureIds.length + decorIds.length + rowCount,
  };
}

function inventoryBlocker(
  input: CatalogReplacementReviewInput,
  source: CatalogLayoutSource,
  after: CatalogLayoutSource,
  transformedArrangements: DecorArrangement[],
): string | null {
  if (input.kind === 'table') {
    const spec = input.replacementDefinition as TableSpec;
    const familyIds = catalogFamilyIds(input.tableSpecs, spec);
    const used = after.tables.filter((table) => familyIds.has(table.specId)).length;
    const inventory = catalogFamilyInventory(input.tableSpecs, spec);
    if (inventory !== undefined && used > inventory) {
      return `${used} ${spec.name} tables would be allocated, but inventory is ${inventory}.`;
    }
  }
  if (input.kind === 'fixture') {
    const spec = input.replacementDefinition as FixtureType;
    const familyIds = catalogFamilyIds(input.fixtureTypes, spec);
    const used = after.fixtures.filter((fixture) => familyIds.has(fixture.specId)).length;
    const inventory = catalogFamilyInventory(input.fixtureTypes, spec);
    if (inventory !== undefined && used > inventory) {
      return `${used} ${spec.name} fixtures would be allocated, but inventory is ${inventory}.`;
    }
  }
  if (input.kind === 'chair') {
    const spec = input.replacementDefinition as ChairSpec;
    const tableSpecsById = new Map(input.tableSpecs.map((tableSpec) => [tableSpec.id, tableSpec]));
    const familyIds = catalogFamilyIds(input.chairSpecs, spec);
    const usedByTables = after.tables.reduce((total, table) => {
      const tableSpec = tableSpecsById.get(table.specId);
      return familyIds.has(configuredChairType(table, tableSpec))
        ? total + tableSeatCount(table, tableSpec)
        : total;
    }, 0);
    const usedByRows = after.ceremonyRows.reduce((total, row) =>
      familyIds.has(row.chairType) ? total + Math.max(0, row.chairCount || 0) : total, 0);
    const used = usedByTables + usedByRows;
    const inventory = catalogFamilyInventory(input.chairSpecs, spec);
    if (inventory !== undefined && used > inventory) {
      return `${used} ${spec.name} chairs would be allocated, but inventory is ${inventory}.`;
    }
  }
  if (input.kind === 'decor') {
    const spec = input.replacementDefinition as DecorItem;
    const usage = decorInventoryUsage(
      after.tables,
      after.fixtures,
      after.decor,
      transformedArrangements,
    );
    const familyIds = catalogFamilyIds(input.decorItems, spec);
    const used = [...familyIds].reduce((total, id) => total + (usage.get(id) || 0), 0);
    const inventory = catalogFamilyInventory(input.decorItems, spec);
    if (inventory !== undefined && used > inventory) {
      return `${used} ${spec.name} décor items would be allocated, but inventory is ${inventory}.`;
    }
  }
  return null;
}

function decorBoundaryBlocker(
  input: CatalogReplacementReviewInput,
  source: CatalogLayoutSource,
  after: CatalogLayoutSource,
  venue: Venue | undefined,
  affectedDecorIds: string[],
): string | null {
  if (input.kind !== 'decor' || !venue || affectedDecorIds.length === 0) return null;
  const spec = input.replacementDefinition as DecorItem;
  const width = Math.max(0.01, spec.width + (spec.widthInches || 0) / 12);
  const height = Math.max(0.01, spec.height + (spec.heightInches || 0) / 12);
  const canvas = effectiveCanvasGeometry(venue);
  for (const item of after.decor.filter((candidate) => affectedDecorIds.includes(candidate.id))) {
    const scaledWidth = width * Math.abs(Number.isFinite(item.scaleX) ? item.scaleX : 1);
    const scaledHeight = height * Math.abs(Number.isFinite(item.scaleY) ? item.scaleY : 1);
    const footprint = rotatedBoxPolygon(
      { x: item.x, y: item.y, width: scaledWidth, height: scaledHeight },
      { x: item.x + scaledWidth / 2, y: item.y + scaledHeight / 2 },
      item.rotation || 0,
    );
    const fits = item.parentType === 'canvas'
      ? footprint.every((point) => point.x >= 0 && point.y >= 0
          && point.x <= canvas.canvasWidth && point.y <= canvas.canvasHeight)
      : footprintFitsVenue(footprint, venue, 0);
    if (!fits) return `${spec.name} would extend beyond this layout's spatial boundary.`;
  }
  return null;
}

/** Review coordinate-preserving replacement against every known layout. */
export function reviewCatalogReplacement(
  input: CatalogReplacementReviewInput,
): CatalogReplacementReview {
  const blockers: CatalogReplacementReviewIssue[] = [];
  const warnings: CatalogReplacementReviewIssue[] = [];
  const compatibility = catalogReplacementCompatibilityIssue(
    input.kind,
    input.sourceDefinition,
    input.replacementDefinition,
  );
  if (compatibility) {
    blockers.push({ sourceId: 'catalog', sourceLabel: 'Catalog compatibility', message: compatibility });
  }

  const incompatibleArrangementIds = (input.kind === 'table' || input.kind === 'fixture')
    ? input.arrangements
        .filter((arrangement) => arrangement.baseSpecId === input.oldId)
        .map((arrangement) => arrangement.id)
    : [];
  const configAfter = replaceCatalogConfigurationReferences(
    input.kind,
    input.oldId,
    input.replacementId,
    input.tableSpecs,
    input.arrangements,
  );
  const affectedSourceIds: string[] = [];
  let affectedInstances = 0;

  input.sources.forEach((source) => {
    const affected = sourceAffectedIds(input, source);
    if (affected.count === 0) return;
    affectedSourceIds.push(source.id);
    affectedInstances += affected.count;
    const after = replaceCatalogReferencesInLayout(
      source,
      input.kind,
      input.oldId,
      input.replacementId,
      {
        oldTableSpec: input.kind === 'table' ? input.sourceDefinition as TableSpec : undefined,
        tableSpecs: input.tableSpecs,
        incompatibleArrangementIds: new Set(incompatibleArrangementIds),
      },
    );
    const venue = input.venues.find((candidate) => candidate.id === source.venueId);

    if (venue && (affected.tableIds.length > 0 || affected.fixtureIds.length > 0)) {
      affected.tableIds.forEach((id) => {
        const table = after.tables.find((candidate) => candidate.id === id);
        if (table && !footprintFitsVenue(getTableFootprintPolygon(table), venue, 0)) {
          blockers.push({
            sourceId: source.id,
            sourceLabel: source.label,
            message: 'The replacement table and chair footprint would cross the venue boundary.',
          });
        }
      });
      const canvas = effectiveCanvasGeometry(venue);
      affected.fixtureIds.forEach((id) => {
        const fixture = after.fixtures.find((candidate) => candidate.id === id);
        if (!fixture) return;
        const fixtureSpec = input.fixtureTypes.find((candidate) => candidate.id === fixture.specId);
        const exterior = !!fixture.isExterior || !!fixtureSpec?.isExterior
          || fixtureSpec?.category === 'exterior';
        const footprint = getFixtureFootprintPolygon(fixture);
        const fits = exterior
          ? footprint.every((point) => point.x >= 0 && point.y >= 0
              && point.x <= canvas.canvasWidth && point.y <= canvas.canvasHeight)
          : footprintFitsVenue(footprint, venue, 0);
        if (!fits) {
          blockers.push({
            sourceId: source.id,
            sourceLabel: source.label,
            message: `The replacement fixture would cross the ${exterior ? 'canvas' : 'venue'} boundary.`,
          });
        }
      });

      const beforeValidation = validateLayout(source.tables, source.fixtures, venue);
      const afterValidation = validateLayout(after.tables, after.fixtures, venue);
      affected.tableIds.forEach((id) => {
        const before = beforeValidation.tableWarnings.get(id);
        const next = afterValidation.tableWarnings.get(id);
        if (next && next !== before) {
          blockers.push({ sourceId: source.id, sourceLabel: source.label, message: next });
        } else if (next) {
          warnings.push({
            sourceId: source.id,
            sourceLabel: source.label,
            message: `Existing issue remains after replacement: ${next}`,
          });
        }
      });
      affected.fixtureIds.forEach((id) => {
        const before = beforeValidation.fixtureWarnings.get(id);
        const next = afterValidation.fixtureWarnings.get(id);
        if (next && next !== before) {
          blockers.push({ sourceId: source.id, sourceLabel: source.label, message: next });
        } else if (next) {
          warnings.push({
            sourceId: source.id,
            sourceLabel: source.label,
            message: `Existing issue remains after replacement: ${next}`,
          });
        }
      });
    }

    const inventory = inventoryBlocker(input, source, after, configAfter.arrangements);
    if (inventory) blockers.push({ sourceId: source.id, sourceLabel: source.label, message: inventory });
    const decorBoundary = decorBoundaryBlocker(
      input,
      source,
      after,
      venue,
      affected.decorIds,
    );
    if (decorBoundary) {
      blockers.push({ sourceId: source.id, sourceLabel: source.label, message: decorBoundary });
    }
  });

  if (incompatibleArrangementIds.length > 0) {
    warnings.push({
      sourceId: 'decor-designs',
      sourceLabel: 'Applied décor designs',
      message: `${incompatibleArrangementIds.length} design${incompatibleArrangementIds.length === 1 ? '' : 's'} tied to the old base will be retargeted, and existing applications will be detached for explicit review.`,
    });
  }

  return {
    blockers,
    warnings,
    incompatibleArrangementIds,
    affectedSourceIds,
    affectedInstances,
  };
}
