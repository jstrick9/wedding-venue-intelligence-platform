import type {
  CeremonyChairRow,
  DecorItem,
  PlacedDecor,
  PlacedFixture,
  PlacedTable,
  Point,
  Venue,
} from '../types';
import {
  getDecorArrangements,
  getDecorItems,
  getFixtureTypes,
  getTableSpecs,
} from '../hooks/useLayoutState';
import { getChairSpecs } from '../data/venueData';
import { ceremonyChairFootprints } from './ceremonyRowGeometry';
import { appliedArrangementFootprints } from './decorGeometry';
import {
  getFixtureFootprintPolygon,
  getTableFootprintPolygon,
} from './collisionDetection';
import {
  customPathForPoints,
  customPathPoints,
  effectiveCanvasGeometry,
  footprintFitsVenue,
  rotatedBoxPolygon,
  venueShapePolygon,
} from './venueGeometry';

export type GeometryImpactSourceKind = 'working' | 'master' | 'named' | 'couple';

export interface GeometryImpactSource {
  id: string;
  label: string;
  kind: GeometryImpactSourceKind;
  tables: PlacedTable[];
  fixtures: PlacedFixture[];
  decor: PlacedDecor[];
  ceremonyRows?: CeremonyChairRow[];
}

export interface GeometryImpactRow {
  id: string;
  label: string;
  kind: GeometryImpactSourceKind;
  itemCount: number;
  outsideVenueBefore: number;
  outsideVenueAfter: number;
  outsideCanvasBefore: number;
  outsideCanvasAfter: number;
  newlyAffectedCount: number;
  affectedItemIds: string[];
}

export interface VenueGeometryImpactReport {
  rows: GeometryImpactRow[];
  layoutsReviewed: number;
  itemsReviewed: number;
  affectedLayouts: number;
  affectedItems: number;
  newlyAffectedItems: number;
  venueOutsideCanvasBefore: boolean;
  venueOutsideCanvasAfter: boolean;
}

interface ImpactFootprint {
  id: string;
  localPolygon: Point[];
  anchor: 'venue' | 'canvas';
  assessVenue: boolean;
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export { effectiveCanvasGeometry };

/** Materialize effective defaults so a Design Studio draft has editable values. */
export function normalizeVenueGeometryDraft(venue: Venue): Venue {
  const effective = effectiveCanvasGeometry(venue);
  const recoveredPoints = venue.shape === 'custom'
    && (!venue.shapePoints || venue.shapePoints.length < 3)
    ? customPathPoints(venue.customPath)
    : null;
  return {
    ...venue,
    ...(recoveredPoints
      ? { shapePoints: recoveredPoints, customPath: customPathForPoints(recoveredPoints) }
      : {}),
    canvasWidth: effective.canvasWidth,
    canvasHeight: effective.canvasHeight,
    venueX: effective.venueX,
    venueY: effective.venueY,
  };
}

function pointsFitCanvas(points: Point[], venue: Venue, anchor: 'venue' | 'canvas'): boolean {
  const canvas = effectiveCanvasGeometry(venue);
  const offsetX = anchor === 'venue' ? canvas.venueX : 0;
  const offsetY = anchor === 'venue' ? canvas.venueY : 0;
  return points.every((point) => {
    const x = point.x + offsetX;
    const y = point.y + offsetY;
    return x >= -0.01
      && y >= -0.01
      && x <= canvas.canvasWidth + 0.01
      && y <= canvas.canvasHeight + 0.01;
  });
}

function decorFootprint(decor: PlacedDecor, decorItems: DecorItem[]): Point[] {
  const spec = decorItems.find((item) => item.id === decor.decorItemId);
  const baseWidth = spec
    ? Math.max(0.01, spec.width + (spec.widthInches || 0) / 12)
    : 1;
  const baseHeight = spec
    ? Math.max(0.01, spec.height + (spec.heightInches || 0) / 12)
    : 1;
  const width = Math.max(0.01, baseWidth * Math.abs(finite(decor.scaleX, 1)));
  const height = Math.max(0.01, baseHeight * Math.abs(finite(decor.scaleY, 1)));
  const pivot = { x: decor.x + width / 2, y: decor.y + height / 2 };
  return rotatedBoxPolygon(
    { x: decor.x, y: decor.y, width, height },
    pivot,
    finite(decor.rotation, 0),
  );
}

function sourceFootprints(source: GeometryImpactSource, decorItems: DecorItem[]): ImpactFootprint[] {
  const chairSpecs = getChairSpecs();
  const arrangements = getDecorArrangements();
  const tableSpecs = getTableSpecs();
  const fixtureTypes = getFixtureTypes();
  const appliedDecor = [
    ...source.tables.flatMap((table) => {
      const arrangement = arrangements.find((candidate) => candidate.id === table.appliedArrangementId);
      const spec = tableSpecs.find((candidate) => candidate.id === table.specId);
      if (!arrangement || !spec) return [];
      return appliedArrangementFootprints(table, spec, arrangement, decorItems).map((item): ImpactFootprint => ({
        id: item.id,
        localPolygon: item.polygon,
        anchor: 'venue',
        assessVenue: true,
      }));
    }),
    ...source.fixtures.flatMap((fixture) => {
      const arrangement = arrangements.find((candidate) => candidate.id === fixture.appliedArrangementId);
      const spec = fixtureTypes.find((candidate) => candidate.id === fixture.specId);
      if (!arrangement || !spec) return [];
      return appliedArrangementFootprints(fixture, spec, arrangement, decorItems).map((item): ImpactFootprint => ({
        id: item.id,
        localPolygon: item.polygon,
        anchor: fixture.isExterior ? 'canvas' : 'venue',
        assessVenue: !fixture.isExterior,
      }));
    }),
  ];
  const ceremonyChairs = (source.ceremonyRows || []).flatMap((row) => {
    const chair = chairSpecs.find((candidate) => candidate.id === row.chairType) || chairSpecs[0];
    if (!chair) return [];
    return ceremonyChairFootprints(row, chair.width).map((polygon, index): ImpactFootprint => ({
      id: `${row.id}:chair:${index}`,
      localPolygon: polygon,
      anchor: 'venue',
      assessVenue: true,
    }));
  });
  return [
    ...source.tables.map((table): ImpactFootprint => {
      const localPolygon = getTableFootprintPolygon(table);
      return {
        id: table.id,
        localPolygon,
        anchor: 'venue',
        assessVenue: localPolygon.length > 0,
      };
    }),
    ...source.fixtures.map((fixture): ImpactFootprint => ({
      id: fixture.id,
      localPolygon: getFixtureFootprintPolygon(fixture),
      anchor: fixture.isExterior ? 'canvas' : 'venue',
      assessVenue: !fixture.isExterior,
    })),
    ...source.decor.map((decor): ImpactFootprint => ({
      id: decor.id,
      localPolygon: decorFootprint(decor, decorItems),
      anchor: decor.parentType === 'canvas' ? 'canvas' : 'venue',
      assessVenue: decor.parentType !== 'canvas',
    })),
    ...appliedDecor,
    ...ceremonyChairs,
  ];
}

function venueFitsCanvas(venue: Venue): boolean {
  return pointsFitCanvas(venueShapePolygon(venue), venue, 'venue');
}

/**
 * Compare every persisted layout family without mutating it. Item coordinates
 * remain in feet; only the proposed venue/canvas geometry changes around them.
 */
export function analyzeVenueGeometryImpact(
  beforeVenue: Venue,
  afterVenue: Venue,
  sources: GeometryImpactSource[],
  decorItems: DecorItem[] = getDecorItems(),
): VenueGeometryImpactReport {
  const rows = sources.map((source): GeometryImpactRow => {
    const footprints = sourceFootprints(source, decorItems);
    const outsideVenueBefore = new Set<string>();
    const outsideVenueAfter = new Set<string>();
    const outsideCanvasBefore = new Set<string>();
    const outsideCanvasAfter = new Set<string>();

    footprints.forEach((item) => {
      if (item.assessVenue && !footprintFitsVenue(item.localPolygon, beforeVenue, 0)) {
        outsideVenueBefore.add(item.id);
      }
      if (item.assessVenue && !footprintFitsVenue(item.localPolygon, afterVenue, 0)) {
        outsideVenueAfter.add(item.id);
      }
      if (!pointsFitCanvas(item.localPolygon, beforeVenue, item.anchor)) {
        outsideCanvasBefore.add(item.id);
      }
      if (!pointsFitCanvas(item.localPolygon, afterVenue, item.anchor)) {
        outsideCanvasAfter.add(item.id);
      }
    });

    const affectedAfter = new Set([...outsideVenueAfter, ...outsideCanvasAfter]);
    const affectedBefore = new Set([...outsideVenueBefore, ...outsideCanvasBefore]);
    const newlyAffected = [...affectedAfter].filter((id) => !affectedBefore.has(id));

    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      itemCount: footprints.length,
      outsideVenueBefore: outsideVenueBefore.size,
      outsideVenueAfter: outsideVenueAfter.size,
      outsideCanvasBefore: outsideCanvasBefore.size,
      outsideCanvasAfter: outsideCanvasAfter.size,
      newlyAffectedCount: newlyAffected.length,
      affectedItemIds: [...affectedAfter],
    };
  });

  const affectedIds = new Set<string>();
  const newlyAffectedIds = new Set<string>();
  rows.forEach((row) => {
    row.affectedItemIds.forEach((id) => affectedIds.add(`${row.id}:${id}`));
    if (row.newlyAffectedCount > 0) {
      const source = sources.find((candidate) => candidate.id === row.id);
      if (!source) return;
      // Re-run identity comparison only for this compact aggregate. Layout item
      // ids are namespaced by source because historical copies can reuse ids.
      const footprints = sourceFootprints(source, decorItems);
      footprints.forEach((item) => {
        const beforeAffected = (item.assessVenue && !footprintFitsVenue(item.localPolygon, beforeVenue, 0))
          || !pointsFitCanvas(item.localPolygon, beforeVenue, item.anchor);
        const afterAffected = (item.assessVenue && !footprintFitsVenue(item.localPolygon, afterVenue, 0))
          || !pointsFitCanvas(item.localPolygon, afterVenue, item.anchor);
        if (afterAffected && !beforeAffected) newlyAffectedIds.add(`${row.id}:${item.id}`);
      });
    }
  });

  return {
    rows,
    layoutsReviewed: rows.length,
    itemsReviewed: rows.reduce((sum, row) => sum + row.itemCount, 0),
    affectedLayouts: rows.filter((row) => row.affectedItemIds.length > 0).length,
    affectedItems: affectedIds.size,
    newlyAffectedItems: newlyAffectedIds.size,
    venueOutsideCanvasBefore: !venueFitsCanvas(beforeVenue),
    venueOutsideCanvasAfter: !venueFitsCanvas(afterVenue),
  };
}
