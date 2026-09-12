import { describe, expect, it } from 'vitest';
import {
  changeVenueShape,
  convexPolygonsOverlap,
  customPathPoints,
  effectiveCanvasGeometry,
  footprintFitsVenue,
  isSupportedVenueShape,
  mergeVenueGeometry,
  polygonBounds,
  polygonValidationIssue,
  resizeVenueOutline,
  rotatedBoxPolygon,
  venueGeometrySignature,
  venueShapePolygon,
} from './venueGeometry';

const rectangle = { width: 40, height: 30, shape: 'rectangle' as const };

describe('venue geometry', () => {
  it('uses one effective canvas fallback while honoring legacy exterior padding', () => {
    const baseVenue = {
      id: 'v', name: 'Venue', category: 'reception' as const,
      capacity: 100, width: 40, height: 30,
    };
    expect(effectiveCanvasGeometry(baseVenue)).toEqual({
      canvasWidth: 120, canvasHeight: 110, venueX: 40, venueY: 40,
    });
    expect(effectiveCanvasGeometry({
      ...baseVenue,
      exteriorPadding: { left: 10, right: 20, top: 5, bottom: 15 },
    })).toEqual({
      canvasWidth: 70, canvasHeight: 50, venueX: 10, venueY: 5,
    });
    expect(effectiveCanvasGeometry({
      ...baseVenue,
      canvasWidth: 100, canvasHeight: 90, venueX: 7, venueY: 8,
      exteriorPadding: { left: 10, right: 20, top: 5, bottom: 15 },
    })).toEqual({
      canvasWidth: 100, canvasHeight: 90, venueX: 7, venueY: 8,
    });
  });

  it('flags furniture-only shape values while preserving a rectangular compatibility outline', () => {
    expect(isSupportedVenueShape('rectangle')).toBe(true);
    expect(isSupportedVenueShape('custom')).toBe(true);
    expect(isSupportedVenueShape('circle')).toBe(false);
    expect(isSupportedVenueShape('polygon')).toBe(false);
    expect(venueShapePolygon({ width: 40, height: 30, shape: 'circle' })).toEqual([
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 },
    ]);
  });

  it('fingerprints only canonical geometry and merges drafts without clobbering venue data', () => {
    const latest = {
      id: 'venue', name: 'Renamed Hall', category: 'reception', capacity: 220,
      width: 40, height: 30, shape: 'rectangle', canvasWidth: 80,
      canvasHeight: 70, venueX: 20, venueY: 20,
      masterLayout: { tables: [], fixtures: [], decor: [], savedAt: 'latest' },
    } as any;
    const draft = {
      ...latest,
      name: 'Stale Hall',
      capacity: 100,
      width: 50,
      canvasWidth: 90,
      venueX: 10,
    };

    expect(venueGeometrySignature({ ...latest, name: 'Another name', capacity: 999 }))
      .toBe(venueGeometrySignature(latest));
    expect(venueGeometrySignature(draft)).not.toBe(venueGeometrySignature(latest));

    const merged = mergeVenueGeometry(latest, draft);
    expect(merged).toMatchObject({
      name: 'Renamed Hall', capacity: 220, width: 50, canvasWidth: 90, venueX: 10,
    });
    expect(merged.masterLayout).toBe(latest.masterLayout);
  });

  it('rotates an item footprint around its visual center', () => {
    const polygon = rotatedBoxPolygon(
      { x: 10, y: 10, width: 8, height: 2 },
      { x: 14, y: 11 },
      90,
    );
    const bounds = polygonBounds(polygon);
    expect(bounds.x).toBeCloseTo(13);
    expect(bounds.y).toBeCloseTo(7);
    expect(bounds.width).toBeCloseTo(2);
    expect(bounds.height).toBeCloseTo(8);
  });

  it('detects overlap between rotated convex footprints without treating touching as overlap', () => {
    const first = rotatedBoxPolygon({ x: 5, y: 5, width: 8, height: 2 }, { x: 9, y: 6 }, 45);
    const overlapping = rotatedBoxPolygon({ x: 8, y: 5, width: 8, height: 2 }, { x: 12, y: 6 }, -45);
    const separate = rotatedBoxPolygon({ x: 20, y: 20, width: 4, height: 4 }, { x: 22, y: 22 }, 0);
    expect(convexPolygonsOverlap(first, overlapping)).toBe(true);
    expect(convexPolygonsOverlap(first, separate)).toBe(false);
  });

  it('requires the configured wall clearance around a footprint', () => {
    const valid = rotatedBoxPolygon({ x: 3, y: 3, width: 4, height: 4 }, { x: 5, y: 5 }, 0);
    const tooClose = rotatedBoxPolygon({ x: 2.5, y: 3, width: 4, height: 4 }, { x: 4.5, y: 5 }, 0);
    expect(footprintFitsVenue(valid, rectangle, 3)).toBe(true);
    expect(footprintFitsVenue(tooClose, rectangle, 3)).toBe(false);
  });

  it('rejects furniture placed in the opening of a rendered U-shaped venue', () => {
    const venue = { width: 40, height: 30, shape: 'u-shape' as const };
    const opening = rotatedBoxPolygon({ x: 16, y: 3, width: 8, height: 6 }, { x: 20, y: 6 }, 0);
    const lowerFloor = rotatedBoxPolygon({ x: 16, y: 21, width: 8, height: 5 }, { x: 20, y: 23.5 }, 0);
    expect(footprintFitsVenue(opening, venue)).toBe(false);
    expect(footprintFitsVenue(lowerFloor, venue)).toBe(true);
  });

  it('uses the custom outline rather than the rectangular width/height envelope', () => {
    const venue = {
      width: 40,
      height: 30,
      shape: 'custom' as const,
      shapePoints: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 30 },
        { x: 0, y: 30 },
      ],
    };
    const outsideOutline = rotatedBoxPolygon({ x: 25, y: 10, width: 4, height: 4 }, { x: 27, y: 12 }, 0);
    expect(footprintFitsVenue(outsideOutline, venue)).toBe(false);
  });

  it('recovers and scales legacy polygon-only custom paths without guessing unsupported SVG', () => {
    const customPath = 'M 0 0 L 40 0 L 20 20 L 0 20 Z';
    expect(customPathPoints(customPath)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]);
    expect(customPathPoints('M 0 0 C 10 0 10 10 20 20 Z')).toBeNull();

    const legacyVenue = {
      id: 'v1', name: 'Legacy Custom Hall', category: 'reception' as const,
      capacity: 100, width: 40, height: 20, shape: 'custom' as const, customPath,
    };
    expect(venueShapePolygon(legacyVenue)).toEqual(customPathPoints(customPath));
    expect(resizeVenueOutline(legacyVenue, 80, 40).shapePoints).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 40 },
    ]);
  });

  it('scales custom outline points with venue dimensions', () => {
    const venue = {
      id: 'v1',
      name: 'Custom Hall',
      category: 'reception' as const,
      capacity: 100,
      width: 40,
      height: 20,
      shape: 'custom' as const,
      shapePoints: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 20, y: 20 },
      ],
    };
    const resized = resizeVenueOutline(venue, 80, 40);
    expect(resized.shapePoints).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 40, y: 40 },
    ]);
    expect(resized.customPath).toContain('80 0');
  });

  it('rejects self-intersecting custom outlines while retaining tiny valid footprints', () => {
    expect(polygonValidationIssue([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ])).toMatch(/cannot cross/i);
    expect(polygonValidationIssue([
      { x: 0, y: 0 },
      { x: 0.01, y: 0 },
      { x: 0.01, y: 0.01 },
      { x: 0, y: 0.01 },
    ])).toBeNull();
  });

  it('turns a rendered preset outline into an editable custom outline', () => {
    const venue = {
      id: 'v1',
      name: 'L Hall',
      category: 'reception' as const,
      capacity: 100,
      width: 40,
      height: 30,
      shape: 'l-shape' as const,
    };
    const expected = venueShapePolygon(venue);
    const custom = changeVenueShape(venue, 'custom');
    expect(custom.shape).toBe('custom');
    expect(custom.shapePoints).toEqual(expected);
  });
});
