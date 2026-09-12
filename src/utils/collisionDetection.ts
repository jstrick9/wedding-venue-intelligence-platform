import type {
  ChairType,
  PlacedFixture,
  PlacedTable,
  Point,
  RectangularChairLayout,
  TableSpec,
  Venue,
} from '../types';
import { getTableSpecs, getFixtureTypes } from '../hooks/useLayoutState';
import { getSpacingSettings, getChairSpecs } from '../data/venueData';
import {
  configuredChairCount,
  configuredChairType,
  seatingGroupDimensions,
  usesChairClearance,
} from './layoutSeating';
import {
  convexPolygonsOverlap,
  footprintFitsVenue,
  polygonBounds,
  rotatedBoxPolygon,
} from './venueGeometry';

function normalizeSpacing(value: number | undefined, fallback: number): number {
  const raw = Number.isFinite(value as number) ? Number(value) : fallback;
  return Math.max(0, Math.min(10, raw));
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollisionResult {
  collides: boolean;
  collidingItems: string[];
  wallError: string;
  details?: string;
}

export interface TableCollisionCandidate {
  x: number;
  y: number;
  specId: string;
  showChairs?: boolean;
  chairType?: string;
  chairCount?: number;
  customCapacity?: number;
  chairLayout?: RectangularChairLayout;
  rotation?: number;
}

export interface FixtureCollisionCandidate {
  x: number;
  y: number;
  specId: string;
  isExterior?: boolean;
  rotation?: number;
}

interface TableGeometry {
  collision: Point[];
  physical: Point[];
  participatesInCollision: boolean;
}

function tableGeometry(table: TableCollisionCandidate | PlacedTable): TableGeometry {
  const tableSpecs = getTableSpecs();
  const chairSpecs = getChairSpecs();
  const spacingSettings = getSpacingSettings();
  const spec = tableSpecs.find((candidate) => candidate.id === table.specId);
  const tableSpacing = normalizeSpacing(spacingSettings.minTableSpacing, 3);

  if (!spec) {
    const physicalBox = { x: table.x, y: table.y, width: 4, height: 4 };
    const pivot = { x: table.x + 2, y: table.y + 2 };
    return {
      participatesInCollision: true,
      physical: rotatedBoxPolygon(physicalBox, pivot, table.rotation || 0),
      collision: rotatedBoxPolygon({
        x: physicalBox.x - tableSpacing / 2,
        y: physicalBox.y - tableSpacing / 2,
        width: physicalBox.width + tableSpacing,
        height: physicalBox.height + tableSpacing,
      }, pivot, table.rotation || 0),
    };
  }

  const chairCount = configuredChairCount(table, spec);
  const chairType = configuredChairType(
    { chairType: table.chairType as ChairType | undefined },
    spec,
  );
  const chairSpec = chairSpecs.find((candidate) => candidate.id === chairType);

  let width = Math.max(0, spec.width);
  let height = Math.max(0, spec.height);
  let offsetX = 0;
  let offsetY = 0;

  if (spec.isSeatingType) {
    const seating = seatingGroupDimensions(chairCount, spec, chairSpec);
    width = seating.rowWidthFt;
    height = seating.rowDepthFt;
  } else if (usesChairClearance(
    {
      chairCount,
      customCapacity: table.customCapacity,
      chairType: chairType as ChairType,
    },
    spec,
  )) {
    // Missing legacy chair specs remain conservatively measurable; allocation
    // mutations are blocked separately until the catalog reference is repaired.
    const chairDepth = Math.max(0.01, chairSpec?.depth || chairSpec?.width || 1.5);
    const layout = table.chairLayout || spec.defaultChairLayout || 'all-sides';
    const shape = spec.shape || 'rectangle';
    const horizontal = spec.width >= spec.height;

    if (['circle', 'oval', 'hexagon', 'octagon'].includes(shape)) {
      width += chairDepth * 2;
      height += chairDepth * 2;
      offsetX = chairDepth;
      offsetY = chairDepth;
    } else if (shape === 'semicircle') {
      height += chairDepth;
    } else if (shape === 'rectangle') {
      if (layout === 'head-table') {
        if (horizontal) height += chairDepth;
        else width += chairDepth;
      } else if (layout === 'long-sides-only') {
        if (horizontal) {
          height += chairDepth * 2;
          offsetY = chairDepth;
        } else {
          width += chairDepth * 2;
          offsetX = chairDepth;
        }
      } else {
        width += chairDepth * 2;
        height += chairDepth * 2;
        offsetX = chairDepth;
        offsetY = chairDepth;
      }
    } else {
      width += chairDepth * 2;
      height += chairDepth * 2;
      offsetX = chairDepth;
      offsetY = chairDepth;
    }
  }

  // An explicit zero-chair seating group is a logical placeholder only: it has
  // no rendered, boundary, or collision footprint of its own.
  if (spec.isSeatingType && chairCount === 0) {
    return { participatesInCollision: false, physical: [], collision: [] };
  }

  // Rotation in FloorPlanCanvas is around the rendered table/seating-group center.
  const pivotWidth = spec.isSeatingType ? width : spec.width;
  const pivotHeight = spec.isSeatingType ? height : spec.height;
  const pivot = {
    x: table.x + pivotWidth / 2,
    y: table.y + pivotHeight / 2,
  };
  const physicalBox = {
    x: table.x - offsetX,
    y: table.y - offsetY,
    width: Math.max(0.01, width),
    height: Math.max(0.01, height),
  };
  const participatesInCollision = !spec.isSeatingType || chairCount > 0;
  const collisionSpacing = participatesInCollision ? tableSpacing : 0;

  return {
    participatesInCollision,
    physical: rotatedBoxPolygon(physicalBox, pivot, table.rotation || 0),
    collision: rotatedBoxPolygon({
      x: physicalBox.x - collisionSpacing / 2,
      y: physicalBox.y - collisionSpacing / 2,
      width: physicalBox.width + collisionSpacing,
      height: physicalBox.height + collisionSpacing,
    }, pivot, table.rotation || 0),
  };
}

interface FixtureGeometry {
  collision: Point[];
  physical: Point[];
  usesVenueSpacing: boolean;
}

function fixtureGeometry(fixture: FixtureCollisionCandidate | PlacedFixture): FixtureGeometry {
  const fixtureTypes = getFixtureTypes();
  const spacingSettings = getSpacingSettings();
  const spec = fixtureTypes.find((candidate) => candidate.id === fixture.specId);
  if (!spec) {
    const box = { x: fixture.x, y: fixture.y, width: 4, height: 4 };
    const pivot = { x: fixture.x + 2, y: fixture.y + 2 };
    const polygon = rotatedBoxPolygon(box, pivot, fixture.rotation || 0);
    return { physical: polygon, collision: polygon, usesVenueSpacing: true };
  }

  const usesVenueSpacing = !fixture.isExterior
    && !spec.isExterior
    && spec.category !== 'exterior'
    && spec.category !== 'lodging'
    && !spec.ignoreSpacingRules;
  const spacing = usesVenueSpacing
    ? normalizeSpacing(spacingSettings.minFixtureSpacing, 1)
    : 0;
  const pivot = {
    x: fixture.x + spec.width / 2,
    y: fixture.y + spec.height / 2,
  };
  const physicalBox = {
    x: fixture.x,
    y: fixture.y,
    width: Math.max(0.01, spec.width),
    height: Math.max(0.01, spec.height),
  };
  return {
    usesVenueSpacing,
    physical: rotatedBoxPolygon(physicalBox, pivot, fixture.rotation || 0),
    collision: rotatedBoxPolygon({
      x: physicalBox.x - spacing / 2,
      y: physicalBox.y - spacing / 2,
      width: physicalBox.width + spacing,
      height: physicalBox.height + spacing,
    }, pivot, fixture.rotation || 0),
  };
}

/** Rotated physical table footprint, including configured chairs but not table spacing. */
export function getTableFootprintPolygon(table: TableCollisionCandidate | PlacedTable): Point[] {
  return tableGeometry(table).physical;
}

/** Rotated physical fixture footprint without inter-item spacing. */
export function getFixtureFootprintPolygon(fixture: FixtureCollisionCandidate | PlacedFixture): Point[] {
  return fixtureGeometry(fixture).physical;
}

// Get the effective axis-aligned bounds of a rotated table INCLUDING chairs and spacing.
export function getTableBoundingBoxWithChairs(table: PlacedTable): BoundingBox {
  return polygonBounds(tableGeometry(table).collision);
}

// Get the effective axis-aligned bounds of a rotated fixture including configured spacing.
export function getFixtureBoundingBox(fixture: PlacedFixture): BoundingBox {
  return polygonBounds(fixtureGeometry(fixture).collision);
}

// Backward-compatible box overlap helper used by tests and non-rotated callers.
export function boxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
  const epsilon = 0.01;
  return !(
    box1.x + box1.width <= box2.x + epsilon
    || box2.x + box2.width <= box1.x + epsilon
    || box1.y + box1.height <= box2.y + epsilon
    || box2.y + box2.height <= box1.y + epsilon
  );
}

// Check an axis-aligned footprint against the venue's actual rendered boundary.
export function checkWallSpacing(
  itemBox: BoundingBox,
  venue: Venue,
  itemType: 'table' | 'fixture',
): { valid: boolean; message: string } {
  const spacingSettings = getSpacingSettings();
  if (!spacingSettings.enableCollisionDetection) return { valid: true, message: '' };
  const wallSpacing = normalizeSpacing(spacingSettings.minWallSpacing, 1);
  const footprint = rotatedBoxPolygon(
    itemBox,
    { x: itemBox.x + itemBox.width / 2, y: itemBox.y + itemBox.height / 2 },
    0,
  );
  const valid = footprintFitsVenue(footprint, venue, wallSpacing);
  return {
    valid,
    message: valid
      ? ''
      : `${itemType === 'table' ? 'Table (including configured chairs)' : 'Item'} crosses the venue boundary or is within ${wallSpacing}ft of a wall.`,
  };
}

function wallResult(
  footprint: Point[],
  venue: Venue,
  itemType: 'table' | 'fixture',
): { valid: boolean; message: string } {
  const spacingSettings = getSpacingSettings();
  if (!spacingSettings.enableCollisionDetection) return { valid: true, message: '' };
  const wallSpacing = normalizeSpacing(spacingSettings.minWallSpacing, 1);
  const valid = footprintFitsVenue(footprint, venue, wallSpacing);
  return {
    valid,
    message: valid
      ? ''
      : `${itemType === 'table' ? 'Table (including configured chairs)' : 'Item'} crosses the venue boundary or is within ${wallSpacing}ft of a wall.`,
  };
}

// Check if a new table would collide with existing items.
export function checkTableCollision(
  newTable: TableCollisionCandidate,
  existingTables: PlacedTable[],
  existingFixtures: PlacedFixture[],
  venue?: Venue,
  excludeId?: string,
): CollisionResult {
  const spacingSettings = getSpacingSettings();
  if (!spacingSettings.enableCollisionDetection) {
    return { collides: false, collidingItems: [], wallError: '' };
  }

  const spec = getTableSpecs().find((candidate) => candidate.id === newTable.specId);
  if (!spec) return { collides: false, collidingItems: [], wallError: '' };

  const geometry = tableGeometry(newTable);
  if (!geometry.participatesInCollision) {
    return { collides: false, collidingItems: [], wallError: '' };
  }
  const wallCheck = venue ? wallResult(geometry.physical, venue, 'table') : { valid: true, message: '' };
  const collidingItems: string[] = [];

  for (const table of existingTables) {
    if (table.id === excludeId) continue;
    const existingGeometry = tableGeometry(table);
    if (!existingGeometry.participatesInCollision) continue;
    if (convexPolygonsOverlap(geometry.collision, existingGeometry.collision)) {
      collidingItems.push(table.id);
    }
  }

  const fixtureTypes = getFixtureTypes();
  for (const fixture of existingFixtures) {
    if (fixture.id === excludeId) continue;
    const existingSpec = fixtureTypes.find((candidate) => candidate.id === fixture.specId);
    if (!existingSpec) continue;
    if (
      existingSpec.isExterior
      || existingSpec.category === 'exterior'
      || existingSpec.category === 'lodging'
      || existingSpec.ignoreSpacingRules
      || spec.isRoom
    ) continue;
    if (convexPolygonsOverlap(geometry.collision, fixtureGeometry(fixture).collision)) {
      collidingItems.push(fixture.id);
    }
  }

  const tableSpacing = normalizeSpacing(spacingSettings.minTableSpacing, 3);
  return {
    collides: collidingItems.length > 0 || !wallCheck.valid,
    collidingItems,
    wallError: wallCheck.message,
    details: collidingItems.length > 0
      ? `Collision detected with ${collidingItems.length} item(s). Tables need ${tableSpacing}ft spacing around their configured chair footprint.`
      : '',
  };
}

// Check if a new fixture would collide with existing items.
export function checkFixtureCollision(
  newFixture: FixtureCollisionCandidate,
  existingTables: PlacedTable[],
  existingFixtures: PlacedFixture[],
  venue?: Venue,
  excludeId?: string,
): CollisionResult {
  const spacingSettings = getSpacingSettings();
  if (!spacingSettings.enableCollisionDetection) {
    return { collides: false, collidingItems: [], wallError: '' };
  }

  const spec = getFixtureTypes().find((candidate) => candidate.id === newFixture.specId);
  if (!spec) return { collides: false, collidingItems: [], wallError: '' };
  const geometry = fixtureGeometry(newFixture);
  if (!geometry.usesVenueSpacing) {
    return { collides: false, collidingItems: [], wallError: '' };
  }

  const wallCheck = venue ? wallResult(geometry.physical, venue, 'fixture') : { valid: true, message: '' };
  const collidingItems: string[] = [];
  const tableSpecs = getTableSpecs();

  for (const table of existingTables) {
    if (table.id === excludeId) continue;
    const tableSpec = tableSpecs.find((candidate) => candidate.id === table.specId);
    if (tableSpec?.isRoom) continue;
    const existingGeometry = tableGeometry(table);
    if (!existingGeometry.participatesInCollision) continue;
    if (convexPolygonsOverlap(geometry.collision, existingGeometry.collision)) {
      collidingItems.push(table.id);
    }
  }

  for (const fixture of existingFixtures) {
    if (fixture.id === excludeId) continue;
    const existingGeometry = fixtureGeometry(fixture);
    if (!existingGeometry.usesVenueSpacing) continue;
    if (convexPolygonsOverlap(geometry.collision, existingGeometry.collision)) {
      collidingItems.push(fixture.id);
    }
  }

  return {
    collides: collidingItems.length > 0 || !wallCheck.valid,
    collidingItems,
    wallError: wallCheck.message,
    details: collidingItems.length > 0
      ? `Collision detected with ${collidingItems.length} item(s).`
      : '',
  };
}

// Validate all participating items in a layout for persistent warnings.
export function validateLayout(
  tables: PlacedTable[],
  fixtures: PlacedFixture[],
  venue: Venue,
): { tableWarnings: Map<string, string>; fixtureWarnings: Map<string, string> } {
  const tableWarnings = new Map<string, string>();
  const fixtureWarnings = new Map<string, string>();
  const spacingSettings = getSpacingSettings();
  if (!spacingSettings.enableCollisionDetection) return { tableWarnings, fixtureWarnings };

  const fixtureTypes = getFixtureTypes();
  const tableSpecs = getTableSpecs();

  for (const table of tables) {
    const geometry = tableGeometry(table);
    if (!geometry.participatesInCollision) continue;
    const wallCheck = wallResult(geometry.physical, venue, 'table');
    if (!wallCheck.valid) {
      tableWarnings.set(table.id, wallCheck.message);
      continue;
    }

    const otherTable = tables.find((candidate) => {
      if (candidate.id === table.id) return false;
      const candidateGeometry = tableGeometry(candidate);
      return candidateGeometry.participatesInCollision
        && convexPolygonsOverlap(geometry.collision, candidateGeometry.collision);
    });
    if (otherTable) {
      tableWarnings.set(table.id, 'Table is too close to another table.');
      continue;
    }

    const tableSpec = tableSpecs.find((candidate) => candidate.id === table.specId);
    if (tableSpec?.isRoom) continue;
    const fixture = fixtures.find((candidate) => {
      const candidateSpec = fixtureTypes.find((item) => item.id === candidate.specId);
      return candidateSpec
        && !candidateSpec.isExterior
        && candidateSpec.category !== 'exterior'
        && candidateSpec.category !== 'lodging'
        && !candidateSpec.ignoreSpacingRules
        && convexPolygonsOverlap(geometry.collision, fixtureGeometry(candidate).collision);
    });
    if (fixture) tableWarnings.set(table.id, 'Table is too close to a venue fixture.');
  }

  for (const fixture of fixtures) {
    const geometry = fixtureGeometry(fixture);
    if (!geometry.usesVenueSpacing) continue;
    const wallCheck = wallResult(geometry.physical, venue, 'fixture');
    if (!wallCheck.valid) {
      fixtureWarnings.set(fixture.id, wallCheck.message);
      continue;
    }

    const otherFixture = fixtures.find((candidate) =>
      candidate.id !== fixture.id
      && fixtureGeometry(candidate).usesVenueSpacing
      && convexPolygonsOverlap(geometry.collision, fixtureGeometry(candidate).collision));
    if (otherFixture) {
      fixtureWarnings.set(fixture.id, 'Fixture is too close to another venue fixture.');
      continue;
    }

    const table = tables.find((candidate) => {
      const candidateSpec = tableSpecs.find((item) => item.id === candidate.specId);
      const candidateGeometry = tableGeometry(candidate);
      return !candidateSpec?.isRoom
        && candidateGeometry.participatesInCollision
        && convexPolygonsOverlap(geometry.collision, candidateGeometry.collision);
    });
    if (table) fixtureWarnings.set(fixture.id, 'Fixture is too close to a table.');
  }

  return { tableWarnings, fixtureWarnings };
}
