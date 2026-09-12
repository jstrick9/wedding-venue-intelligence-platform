import type { Point, ShapeType, Venue } from '../types';

const EPSILON = 0.01;

export const SUPPORTED_VENUE_SHAPES = [
  'rectangle',
  'l-shape',
  't-shape',
  'u-shape',
  'custom',
] as const satisfies readonly ShapeType[];

export type SupportedVenueShape = (typeof SUPPORTED_VENUE_SHAPES)[number];

/** Venue outlines intentionally support fewer shapes than furniture specs. */
export function isSupportedVenueShape(shape: ShapeType | undefined): boolean {
  return SUPPORTED_VENUE_SHAPES.includes((shape || 'rectangle') as SupportedVenueShape);
}

const VENUE_GEOMETRY_FIELDS = [
  'width',
  'height',
  'canvasWidth',
  'canvasHeight',
  'venueX',
  'venueY',
  'shape',
  'isCustomShape',
  'shapePoints',
  'customPath',
] as const satisfies readonly (keyof Venue)[];

export interface GeometryBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function finite(value: unknown, fallback = 0): number {
  return Number.isFinite(value as number) ? Number(value) : fallback;
}

/** Resolve one canonical canvas and venue offset for modern and legacy records. */
export function effectiveCanvasGeometry(venue: Venue): {
  canvasWidth: number;
  canvasHeight: number;
  venueX: number;
  venueY: number;
} {
  const horizontalPadding = venue.exteriorPadding
    ? Math.max(0, finite(venue.exteriorPadding.left))
      + Math.max(0, finite(venue.exteriorPadding.right))
    : 80;
  const verticalPadding = venue.exteriorPadding
    ? Math.max(0, finite(venue.exteriorPadding.top))
      + Math.max(0, finite(venue.exteriorPadding.bottom))
    : 80;
  const canvasWidth = Math.max(0.01, finite(venue.canvasWidth, venue.width + horizontalPadding));
  const canvasHeight = Math.max(0.01, finite(venue.canvasHeight, venue.height + verticalPadding));
  return {
    canvasWidth,
    canvasHeight,
    venueX: finite(
      venue.venueX,
      venue.exteriorPadding
        ? Math.max(0, finite(venue.exteriorPadding.left))
        : Math.max(0, (canvasWidth - venue.width) / 2),
    ),
    venueY: finite(
      venue.venueY,
      venue.exteriorPadding
        ? Math.max(0, finite(venue.exteriorPadding.top))
        : Math.max(0, (canvasHeight - venue.height) / 2),
    ),
  };
}

/** Canonical geometry-only fingerprint used to detect stale modal baselines. */
export function venueGeometrySignature(venue: Venue): string {
  const canvas = effectiveCanvasGeometry(venue);
  const sourcePoints = venue.shape === 'custom'
    ? (venue.shapePoints && venue.shapePoints.length >= 3
        ? venue.shapePoints
        : customPathPoints(venue.customPath))
    : null;
  return JSON.stringify({
    width: venue.width,
    height: venue.height,
    canvasWidth: canvas.canvasWidth,
    canvasHeight: canvas.canvasHeight,
    venueX: canvas.venueX,
    venueY: canvas.venueY,
    shape: venue.shape || 'rectangle',
    isCustomShape: !!venue.isCustomShape,
    shapePoints: sourcePoints?.map((point) => ({ x: point.x, y: point.y })) || [],
    unrecoverableCustomPath: venue.shape === 'custom' && !sourcePoints
      ? venue.customPath || null
      : null,
  });
}

/** Merge an approved geometry draft without overwriting unrelated venue data. */
export function mergeVenueGeometry(latest: Venue, draft: Venue): Venue {
  const merged = { ...latest } as Venue;
  VENUE_GEOMETRY_FIELDS.forEach((field) => {
    (merged as unknown as Record<string, unknown>)[field] = field === 'shapePoints'
      ? draft.shapePoints?.map((point) => ({ ...point }))
      : draft[field];
  });
  return merged;
}

export function polygonBounds(points: Point[]): GeometryBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function rotatePoint(point: Point, pivot: Point, degrees: number): Point {
  const angle = (finite(degrees) * Math.PI) / 180;
  if (Math.abs(angle) < Number.EPSILON) return { ...point };
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * cosine - dy * sine,
    y: pivot.y + dx * sine + dy * cosine,
  };
}

/** Build a rotated rectangular footprint. Rotation uses the supplied item pivot. */
export function rotatedBoxPolygon(box: GeometryBox, pivot: Point, rotation = 0): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ].map((point) => rotatePoint(point, pivot, rotation));
}

function projection(points: Point[], axis: Point): { min: number; max: number } {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Separating-axis test for convex polygons (used for rotated item footprints). */
export function convexPolygonsOverlap(first: Point[], second: Point[]): boolean {
  if (first.length < 3 || second.length < 3) return false;
  const polygons = [first, second];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const axis = { x: -(b.y - a.y), y: b.x - a.x };
      const length = Math.hypot(axis.x, axis.y);
      if (length <= EPSILON) continue;
      axis.x /= length;
      axis.y /= length;
      const p1 = projection(first, axis);
      const p2 = projection(second, axis);
      // Touching at the configured clearance boundary is valid, matching the
      // historical axis-aligned boxesOverlap behavior.
      if (p1.max <= p2.min + EPSILON || p2.max <= p1.min + EPSILON) return false;
    }
  }
  return true;
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  const cross = (point.y - start.y) * (end.x - start.x)
    - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (point.x - start.x) * (end.x - start.x)
    + (point.y - start.y) * (end.y - start.y);
  if (dot < -EPSILON) return false;
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= squaredLength + EPSILON;
}

/** Inclusive point-in-polygon test for simple convex or concave venue outlines. */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function properSegmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return ((first > EPSILON && second < -EPSILON) || (first < -EPSILON && second > EPSILON))
    && ((third > EPSILON && fourth < -EPSILON) || (third < -EPSILON && fourth > EPSILON));
}

function segmentsIntersectInclusive(a: Point, b: Point, c: Point, d: Point): boolean {
  const tolerance = 1e-7;
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  const opposite = (left: number, right: number) =>
    (left > tolerance && right < -tolerance) || (left < -tolerance && right > tolerance);
  if (opposite(first, second) && opposite(third, fourth)) return true;
  const onSegment = (point: Point, start: Point, end: Point) =>
    point.x >= Math.min(start.x, end.x) - tolerance
    && point.x <= Math.max(start.x, end.x) + tolerance
    && point.y >= Math.min(start.y, end.y) - tolerance
    && point.y <= Math.max(start.y, end.y) + tolerance;
  return (Math.abs(first) <= tolerance && onSegment(c, a, b))
    || (Math.abs(second) <= tolerance && onSegment(d, a, b))
    || (Math.abs(third) <= tolerance && onSegment(a, c, d))
    || (Math.abs(fourth) <= tolerance && onSegment(b, c, d));
}

/** Return a repair message when points do not form one finite, simple polygon. */
export function polygonValidationIssue(points: Point[]): string | null {
  if (points.length < 3) return 'A custom venue shape needs at least three points.';
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return 'Every custom outline point must use finite X and Y coordinates.';
  }

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    if (Math.hypot(next.x - point.x, next.y - point.y) <= 1e-7) {
      return 'Custom outline points must be distinct.';
    }
  }

  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      const adjacent = first === second
        || firstNext === second
        || secondNext === first;
      if (adjacent) continue;
      if (segmentsIntersectInclusive(
        points[first],
        points[firstNext],
        points[second],
        points[secondNext],
      )) {
        return 'Custom outline edges cannot cross or touch non-adjacent edges.';
      }
    }
  }

  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += point.x * next.y - next.x * point.y;
  }
  if (Math.abs(twiceArea) <= 1e-7) {
    return 'The custom outline must enclose a non-zero area.';
  }
  return null;
}

/**
 * Recover polygon points from the simple M/L/Z path format historically stored
 * by the venue shape builder. Unsupported or malformed SVG commands fail closed
 * rather than being guessed into a different footprint.
 */
export function customPathPoints(path: string | undefined): Point[] | null {
  if (!path?.trim()) return null;
  const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
  const nonNumeric = path.replace(numberPattern, '');
  const commands = nonNumeric.match(/[A-Za-z]/g) || [];
  if (commands.some((command) => !['M', 'L', 'Z'].includes(command))) return null;
  if (nonNumeric.replace(/[MLZ,\s]/g, '') !== '') return null;
  if (commands[0] !== 'M' || commands.filter((command) => command === 'M').length !== 1) return null;
  const numbers = path.match(numberPattern)?.map(Number) || [];
  if (numbers.length < 6 || numbers.length % 2 !== 0 || numbers.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const points: Point[] = [];
  for (let index = 0; index < numbers.length; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return polygonValidationIssue(points) ? null : points;
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  ));
  const projectionPoint = { x: start.x + ratio * dx, y: start.y + ratio * dy };
  return Math.hypot(point.x - projectionPoint.x, point.y - projectionPoint.y);
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (properSegmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/**
 * Canonical local venue outline. These points deliberately mirror the shapes
 * rendered by FloorPlanCanvas so collision validation and the visual boundary
 * cannot drift apart.
 */
export function venueShapePolygon(venue: Pick<Venue, 'width' | 'height' | 'shape' | 'shapePoints' | 'customPath'>): Point[] {
  const width = Math.max(0, finite(venue.width));
  const height = Math.max(0, finite(venue.height));
  const shape = venue.shape || 'rectangle';

  if (shape === 'custom') {
    if (Array.isArray(venue.shapePoints) && venue.shapePoints.length >= 3) {
      const points = venue.shapePoints
        .map((point) => ({ x: finite(point.x, Number.NaN), y: finite(point.y, Number.NaN) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (points.length >= 3) return points;
    }
    const recovered = customPathPoints(venue.customPath);
    if (recovered) return recovered;
  }

  if (shape === 'l-shape') {
    const thickX = width * 0.4;
    const thickY = height * 0.4;
    return [
      { x: 0, y: 0 },
      { x: thickX, y: 0 },
      { x: thickX, y: height - thickY },
      { x: width, y: height - thickY },
      { x: width, y: height },
      { x: 0, y: height },
    ];
  }

  if (shape === 't-shape') {
    const thickX = width * 0.4;
    const thickY = height * 0.4;
    const startX = (width - thickX) / 2;
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: thickY },
      { x: startX + thickX, y: thickY },
      { x: startX + thickX, y: height },
      { x: startX, y: height },
      { x: startX, y: thickY },
      { x: 0, y: thickY },
    ];
  }

  if (shape === 'u-shape') {
    const thickX = width * 0.3;
    const thickY = height * 0.4;
    return [
      { x: 0, y: 0 },
      { x: thickX, y: 0 },
      { x: thickX, y: height - thickY },
      { x: width - thickX, y: height - thickY },
      { x: width - thickX, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
  }

  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

/**
 * True only when the entire convex item footprint is inside the venue's real
 * outline and at least `clearance` feet from every boundary segment.
 */
export function footprintFitsVenue(
  footprint: Point[],
  venue: Pick<Venue, 'width' | 'height' | 'shape' | 'shapePoints'>,
  clearance = 0,
): boolean {
  if (footprint.length < 3) return false;
  const boundary = venueShapePolygon(venue);
  if (boundary.length < 3) return false;

  for (let index = 0; index < footprint.length; index += 1) {
    const point = footprint[index];
    const next = footprint[(index + 1) % footprint.length];
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    if (!pointInPolygon(point, boundary) || !pointInPolygon(midpoint, boundary)) return false;
  }

  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let itemIndex = 0; itemIndex < footprint.length; itemIndex += 1) {
    const itemStart = footprint[itemIndex];
    const itemEnd = footprint[(itemIndex + 1) % footprint.length];
    for (let venueIndex = 0; venueIndex < boundary.length; venueIndex += 1) {
      const venueStart = boundary[venueIndex];
      const venueEnd = boundary[(venueIndex + 1) % boundary.length];
      if (properSegmentsIntersect(itemStart, itemEnd, venueStart, venueEnd)) return false;
      minimumDistance = Math.min(
        minimumDistance,
        segmentDistance(itemStart, itemEnd, venueStart, venueEnd),
      );
    }
  }

  return minimumDistance + EPSILON >= Math.max(0, clearance);
}

export function customPathForPoints(points: Point[]): string | undefined {
  if (points.length < 3) return undefined;
  return `M ${points.map((point, index) => `${index === 0 ? '' : 'L '}${point.x} ${point.y}`).join(' ')} Z`;
}

/** Scale the custom outline with its venue while leaving every placed item untouched. */
export function resizeVenueOutline(venue: Venue, width: number, height: number): Venue {
  const nextWidth = Math.max(0.01, finite(width, venue.width));
  const nextHeight = Math.max(0.01, finite(height, venue.height));
  const sourcePoints = venue.shape === 'custom'
    ? (venue.shapePoints && venue.shapePoints.length >= 3
        ? venue.shapePoints
        : customPathPoints(venue.customPath))
    : null;
  if (!sourcePoints) return { ...venue, width: nextWidth, height: nextHeight };
  const oldWidth = Math.max(0.01, finite(venue.width, nextWidth));
  const oldHeight = Math.max(0.01, finite(venue.height, nextHeight));
  const shapePoints = sourcePoints.map((point) => ({
    x: Math.round((finite(point.x) / oldWidth) * nextWidth * 100) / 100,
    y: Math.round((finite(point.y) / oldHeight) * nextHeight * 100) / 100,
  }));
  return {
    ...venue,
    width: nextWidth,
    height: nextHeight,
    shapePoints,
    customPath: customPathForPoints(shapePoints),
  };
}

export function changeVenueShape(venue: Venue, shape: ShapeType): Venue {
  if (shape !== 'custom') return { ...venue, shape, isCustomShape: false };
  const persistedPoints = venue.shapePoints && venue.shapePoints.length >= 3
    ? venue.shapePoints
    : customPathPoints(venue.customPath);
  const shapePoints = persistedPoints
    ? persistedPoints.map((point) => ({ ...point }))
    : venueShapePolygon(venue);
  return {
    ...venue,
    shape: 'custom',
    isCustomShape: true,
    shapePoints,
    customPath: customPathForPoints(shapePoints),
  };
}
