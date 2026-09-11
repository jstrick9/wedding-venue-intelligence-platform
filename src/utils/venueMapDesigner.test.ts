import { describe, it, expect } from 'vitest';
import {
  addMapDrawing, addMapPoint, appendMapLineVertex, buildVenueMapDirectionSteps, moveMapDrawing, moveMapPoint, updateMapDrawing, updateMapPoint, removeMapPoint,
  addMapRoute, removeMapRoute, renameMapRoute, duplicateMapPoint, routePoints, pointColor, updateMapSize,
  findVenueMapRoute, hasRenderableVenueMapContent, isVenueMapGuestArrivalPoint,
  partitionVenueMapBaseImageIntegrity, partitionVenueMapDrawingIntegrity,
  partitionVenueMapDuplicateIdentities, partitionVenueMapIdentifierIntegrity,
  partitionVenueMapRainContingencyCollisions,
  partitionVenueMapRouteReferenceIntegrity,
  partitionVenueMapSpacePointLinkCollisions, partitionVenueMapTextIntegrity,
  preferredVenueMapDirectionsStart, projectVenueMap, projectVenueMapCurrentSpaceLinks,
  rainContingencyCollisionIssues,
  rainContingencyValidationIssue,
  unavailableVenueMapEventScopeIds, updateMapRoute, venueMapDrawingBounds,
  venueMapDrawingIntegrityIssue, venueMapDrawingPresentationIssues,
  venueMapDrawingRotationIssue, INVALID_VENUE_MAP_ROUTE_PRIORITY,
  venueMapEventScopeRecoveryLabel,
  venueMapHasInvalidDrawingGeometry, venueMapHasInvalidRoutePriorities,
  venueMapAudienceIntegrityIssues, venueMapBaseImageIntegrityIssues,
  venueMapHasInvalidAudiences, venueMapComplexityIssues, venueMapExceedsComplexityBudget,
  venueMapPointCoordinateIssue, venueMapPointGpsIssue,
  venueMapRouteAccessibilityIntegrityIssues, venueMapRouteAccessibilityIssue,
  venueMapRouteDeliveryIssues, venueMapRoutePriorityIssue,
  venueMapHasRouteDeliveryIssues, venueMapRouteReferenceIssues, venueMapSpacePointLinkIssue,
  venueMapTextIntegrityIssues, venueMapArtifactFilenameBase, venueMapArtifactRasterScale,
  venueMapArrivalRoleIntegrityIssues, venueMapDirectionsContextKey,
  venueMapGuestRouteCoverageIssues, venueMapPointArrivalRoleIssue, venueMapScopeArtifactCode,
  VENUE_MAP_MAX_IDENTIFIER_LENGTH, VENUE_MAP_MAX_LINE_VERTICES,
  VENUE_MAP_MAX_POINTS, VENUE_MAP_MAX_ROUTE_POINTS, VENUE_MAP_MAX_SERIALIZED_BYTES,
} from './venueMapDesigner';
import { emptyVenueMapConfig } from '../services/wayfinding/venueWayfindingService';
import type { Venue } from '../types';

describe('venue map designer helpers', () => {
  it('adds a point clamped to bounds', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Grand Ballroom', kind: 'space', x: 200, y: -5, venueId: 'ballroom' });
    expect(map.points).toHaveLength(1);
    expect(map.points[0].x).toBe(100); // clamped to width 100
    expect(map.points[0].y).toBe(0);   // clamped to >= 0
    expect(map.points[0].kind).toBe('space');
  });

  it('recognizes renderable portal maps even when they contain no pins', () => {
    const empty = emptyVenueMapConfig();
    expect(hasRenderableVenueMapContent(empty)).toBe(false);
    expect(hasRenderableVenueMapContent({
      ...empty,
      drawings: [{ id: 'garden', type: 'zone', x: 5, y: 5, width: 20, height: 10 }],
    })).toBe(true);
    expect(hasRenderableVenueMapContent({
      ...empty,
      backgroundImageUrl: 'data:image/png;base64,AA==',
    })).toBe(true);
    expect(hasRenderableVenueMapContent({
      ...empty,
      backgroundImageUnavailable: true,
    })).toBe(true);
    // Rain guidance is independently deliverable and must not be mistaken for
    // drawable SVG content (portals render its guidance card without a blank map).
    expect(hasRenderableVenueMapContent({
      ...empty,
      rainContingencies: [{
        id: 'rain', outdoorVenueId: 'garden', indoorVenueId: 'ballroom',
      }],
    })).toBe(false);
  });

  it('creates order-independent full-set artifact codes for wedding-space scopes', () => {
    const first = venueMapScopeArtifactCode(['garden', 'ballroom', 'gallery', 'terrace']);
    expect(first).toMatch(/^v1-[a-f0-9]{32}$/);
    expect(venueMapScopeArtifactCode(['terrace', 'gallery', 'garden', 'ballroom'])).toBe(first);
    expect(venueMapScopeArtifactCode(['garden', 'ballroom', 'gallery', 'orchard']))
      .not.toBe(first);
    expect(venueMapScopeArtifactCode(['garden', 'garden', 'ballroom', 'gallery', 'terrace']))
      .toBe(first);
  });

  it('bounds the readable venue filename segment without affecting provenance suffixes', () => {
    const base = venueMapArtifactFilenameBase(
      `The Extremely Long Wedding Property ${'and Event Pavilion '.repeat(20)}`,
    );
    expect(base.length).toBeLessThanOrEqual(64);
    expect(base).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(venueMapArtifactFilenameBase('  Rose & Pine Estate  ')).toBe('rose-pine-estate');
    expect(venueMapArtifactFilenameBase('婚礼会場')).toBe('venue-map');
    expect(venueMapArtifactFilenameBase(undefined)).toBe('venue-map');
  });

  it('scales abstract Venue Map coordinates to print-usable bounded raster dimensions', () => {
    expect(venueMapArtifactRasterScale(100, 80)).toBe(20);
    expect(venueMapArtifactRasterScale(500, 500)).toBe(4);
    expect(venueMapArtifactRasterScale(500, 20)).toBe(30);
    expect(venueMapArtifactRasterScale(20, 500)).toBe(30);
    expect(venueMapArtifactRasterScale(20, 20)).toBe(100);
    expect(venueMapArtifactRasterScale(Number.NaN, 0)).toBe(20);
  });

  it('enforces bounded whole-map and per-object complexity budgets', () => {
    const points = Array.from({ length: VENUE_MAP_MAX_POINTS }, (_, index) => ({
      id: `point-${index}`,
      label: `Point ${index}`,
      kind: 'entry' as const,
      x: index % 100,
      y: index % 80,
    }));
    const atLimit = { ...emptyVenueMapConfig(), points };
    expect(venueMapComplexityIssues(atLimit)).toEqual([]);
    expect(addMapPoint(atLimit, { label: 'Too many', kind: 'entry', x: 1, y: 1 })).toBe(atLimit);

    const overPointLimit = {
      ...atLimit,
      points: [...points, { id: 'point-over', label: 'Over', kind: 'entry' as const, x: 1, y: 1 }],
    };
    expect(venueMapComplexityIssues(overPointLimit))
      .toEqual([expect.stringMatching(/501 points.*limit is 500/i)]);
    expect(projectVenueMap(overPointLimit, 'couple').points).toEqual([]);

    expect(venueMapComplexityIssues({
      ...emptyVenueMapConfig(),
      routes: [{
        id: 'long-route',
        name: 'Long route',
        pointIds: Array.from({ length: VENUE_MAP_MAX_ROUTE_POINTS + 1 }, (_, index) => `point-${index}`),
      }],
    })).toEqual([expect.stringMatching(/101 ordered points.*limit is 100/i)]);

    expect(venueMapComplexityIssues({
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'long-line',
        type: 'line',
        points: Array.from({ length: 501 }, (_, index) => ({ x: index % 100, y: index % 80 })),
      }],
    })).toEqual([expect.stringMatching(/501 vertices.*limit is 500/i)]);

    expect(venueMapExceedsComplexityBudget({
      ...emptyVenueMapConfig(),
      unknownOversizedField: 'x'.repeat(VENUE_MAP_MAX_SERIALIZED_BYTES),
    })).toBe(true);
    expect(venueMapExceedsComplexityBudget('x'.repeat(VENUE_MAP_MAX_SERIALIZED_BYTES - 2)))
      .toBe(false);
    expect(venueMapExceedsComplexityBudget('x'.repeat(VENUE_MAP_MAX_SERIALIZED_BYTES)))
      .toBe(true);
    expect(venueMapExceedsComplexityBudget(null)).toBe(false);
    expect(venueMapExceedsComplexityBudget(undefined)).toBe(false);
  });

  it('detects malformed mobility status and projects it only as not verified', () => {
    const malformedRoute = {
      id: 'garden-ramp',
      name: 'Garden ramp',
      pointIds: ['gate', 'garden'],
      accessibility: 'stepfree',
      priority: 'standard',
    } as any;
    expect(venueMapRouteAccessibilityIssue(malformedRoute)).toMatch(/invalid/i);
    expect(venueMapRouteAccessibilityIssue({ ...malformedRoute, accessibility: undefined })).toBeNull();
    expect(venueMapRouteAccessibilityIntegrityIssues({ routes: [malformedRoute] })).toEqual([
      expect.objectContaining({
        routeId: 'garden-ramp',
        savedValue: 'stepfree',
      }),
    ]);

    const projected = projectVenueMap({
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 1, y: 1 },
        { id: 'garden', label: 'Garden', kind: 'amenity', x: 2, y: 2 },
      ],
      routes: [malformedRoute],
    }, 'couple');
    expect(projected.routes).toEqual([
      expect.objectContaining({ id: 'garden-ramp', accessibility: 'unknown' }),
    ]);
  });

  it('detects exact malformed audiences and fails closed with dependent routes in projections', () => {
    const malformedAudienceMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'restricted', label: 'Restricted point', kind: 'entry', x: 1, y: 1, audience: 'vip' },
        { id: 'public', label: 'Public point', kind: 'entry', x: 2, y: 2, audience: 'public' },
      ],
      routes: [
        {
          id: 'dependent',
          name: 'Dependent walkway',
          pointIds: ['restricted', 'public'],
          audience: 'public',
          accessibility: 'unknown',
          priority: 'standard',
        },
        {
          id: 'invalid-route',
          name: 'Invalid walkway visibility',
          pointIds: ['public', 'public'],
          audience: null,
          accessibility: 'unknown',
          priority: 'standard',
        },
      ],
      drawings: [{ id: 'invalid-shape', type: 'zone', x: 5, y: 5, width: 10, height: 10, audience: false }],
    } as any;

    expect(venueMapHasInvalidAudiences(malformedAudienceMap)).toBe(true);
    expect(venueMapAudienceIntegrityIssues(malformedAudienceMap)).toEqual([
      expect.objectContaining({ family: 'point', objectId: 'restricted', savedValue: 'vip' }),
      expect.objectContaining({ family: 'route', objectId: 'invalid-route', savedValue: null }),
      expect.objectContaining({ family: 'drawing', objectId: 'invalid-shape', savedValue: false }),
    ]);

    const projected = projectVenueMap(malformedAudienceMap, 'couple');
    expect(projected.points.map((point) => point.id)).toEqual(['public']);
    expect(projected.routes).toEqual([]);
    expect(projected.drawings).toEqual([]);
  });

  it('treats optional GPS as one valid pair and strips malformed values from projections', () => {
    expect(venueMapPointGpsIssue({})).toBeNull();
    expect(venueMapPointGpsIssue({ lat: 35.2 })).toMatch(/provided together/i);
    expect(venueMapPointGpsIssue({ lat: 91, lng: -80 })).toMatch(/-90 to 90/i);
    expect(venueMapPointGpsIssue({ lat: 35, lng: -181 })).toMatch(/-180 to 180/i);
    expect(venueMapPointGpsIssue({ lat: 35.2, lng: -80.8 })).toBeNull();

    const projected = projectVenueMap({
      ...emptyVenueMapConfig(),
      points: [
        { id: 'partial', label: 'Partial', kind: 'entry', x: 1, y: 1, lat: 35.2 },
        { id: 'valid', label: 'Valid', kind: 'entry', x: 2, y: 2, lat: 35.3, lng: -80.9 },
      ],
    }, 'staff');
    expect(projected.points).toEqual([
      expect.objectContaining({ id: 'partial', lat: undefined, lng: undefined }),
      expect.objectContaining({ id: 'valid', lat: 35.3, lng: -80.9 }),
    ]);
  });

  it('fails closed for malformed identities even when projection receives an unnormalized map', () => {
    const overlongId = `point-${'x'.repeat(VENUE_MAP_MAX_IDENTIFIER_LENGTH)}`;
    const source = {
      ...emptyVenueMapConfig(),
      points: [
        { id: overlongId, label: 'Unsafe', kind: 'entry' as const, x: 1, y: 1 },
        { id: 'safe-a', label: 'Parking', kind: 'parking' as const, x: 10, y: 10 },
        { id: 'safe-b', label: 'Ballroom', kind: 'amenity' as const, x: 20, y: 20 },
      ],
      routes: [
        { id: 'depends-on-unsafe', name: 'Unsafe', pointIds: ['safe-a', overlongId] },
        { id: 'safe-route', name: 'Safe', pointIds: ['safe-a', 'safe-b'] },
      ],
      drawings: [{ id: overlongId, type: 'circle' as const, x: 30, y: 30, radius: 5 }],
      rainContingencies: [{
        id: overlongId,
        outdoorVenueId: 'garden',
        indoorVenueId: 'hall',
      }],
    };

    const partitioned = partitionVenueMapIdentifierIntegrity(source);
    expect(partitioned.points.map((point) => point.id)).toEqual(['safe-a', 'safe-b']);
    expect(partitioned.routes.map((route) => route.id)).toEqual(['safe-route']);
    expect(partitioned.drawings).toEqual([]);
    expect(partitioned.rainContingencies).toEqual([]);

    const projected = projectVenueMap(source, 'staff');
    expect(projected.points.map((point) => point.id)).toEqual(['safe-a', 'safe-b']);
    expect(projected.routes.map((route) => route.id)).toEqual(['safe-route']);
    expect(projected.drawings).toEqual([]);
    expect(projected.rainContingencies).toEqual([]);
  });

  it('identifies invalid canonical text and fails dependent portal routes closed', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'good', label: 'Main gate', kind: 'entry' as const, x: 1, y: 1 },
        {
          id: 'overlong-guidance',
          label: 'Garden turn',
          description: 'x'.repeat(1001),
          kind: 'path' as const,
          x: 2,
          y: 2,
        },
        { id: 'blank', label: '   ', kind: 'amenity' as const, x: 3, y: 3 },
      ],
      routes: [
        { id: 'dependent', name: 'Garden route', pointIds: ['good', 'overlong-guidance'] },
        { id: 'overlong-name', name: 'n'.repeat(201), pointIds: ['good', 'blank'] },
      ],
      drawings: [{
        id: 'shape',
        type: 'zone' as const,
        x: 5,
        y: 5,
        width: 10,
        height: 10,
        text: 's'.repeat(301),
      }],
      rainContingencies: [{
        id: 'rain',
        outdoorVenueId: 'garden',
        indoorVenueId: 'hall',
        note: 'r'.repeat(1001),
      }],
    };

    expect(venueMapTextIntegrityIssues(map)).toEqual(expect.arrayContaining([
      expect.objectContaining({ family: 'point', objectId: 'overlong-guidance', field: 'description', reason: 'too-long' }),
      expect.objectContaining({ family: 'point', objectId: 'blank', field: 'label', reason: 'blank' }),
      expect.objectContaining({ family: 'route', objectId: 'overlong-name', field: 'name', reason: 'too-long' }),
      expect.objectContaining({ family: 'drawing', objectId: 'shape', field: 'text', reason: 'too-long' }),
      expect.objectContaining({ family: 'rainContingency', objectId: 'rain', field: 'note', reason: 'too-long' }),
    ]));

    const safe = partitionVenueMapTextIntegrity(map);
    expect(safe.points.map((point) => point.id)).toEqual(['good']);
    expect(safe.routes).toEqual([]);
    expect(safe.drawings).toEqual([]);
    expect(safe.rainContingencies).toEqual([]);
    expect(projectVenueMap(map, 'couple')).toMatchObject({
      points: [expect.objectContaining({ id: 'good' })],
      routes: [],
      drawings: [],
      rainContingencies: [],
    });
  });

  it('adds a distinct in-frame line vertex and refuses to exceed the vertex budget', () => {
    const edgePoints = [{ x: 95, y: 80 }, { x: 100, y: 80 }];
    const appended = appendMapLineVertex(edgePoints, 100, 80);
    expect(appended).toHaveLength(3);
    expect(appended[2]).not.toEqual(appended[1]);
    expect(appended[2].x).toBeGreaterThanOrEqual(0);
    expect(appended[2].x).toBeLessThanOrEqual(100);
    expect(appended[2].y).toBeGreaterThanOrEqual(0);
    expect(appended[2].y).toBeLessThanOrEqual(80);

    const occupiedNearby = [
      { x: 10, y: 10 },
      { x: 15, y: 10 },
      { x: 5, y: 10 },
      { x: 10, y: 15 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ];
    const fallback = appendMapLineVertex(occupiedNearby, 100, 80);
    expect(fallback).toHaveLength(occupiedNearby.length + 1);
    expect(occupiedNearby).not.toContainEqual(fallback[fallback.length - 1]);

    const atLimit = Array.from({ length: VENUE_MAP_MAX_LINE_VERTICES }, (_, index) => ({
      x: index,
      y: 1,
    }));
    expect(appendMapLineVertex(atLimit, 500, 80)).toBe(atLimit);
  });

  it('moves a point (clamped) and updates metadata', () => {
    let map = addMapPoint(emptyVenueMapConfig(), { label: 'Parking A', kind: 'parking', x: 10, y: 10 });
    const id = map.points[0].id;
    map = moveMapPoint(map, id, 30, 40);
    expect(map.points[0].x).toBe(30);
    expect(map.points[0].y).toBe(40);
    map = updateMapPoint(map, id, { label: 'Parking A (West)', lat: 35.1, lng: -80.8 });
    expect(map.points[0].label).toBe('Parking A (West)');
    expect(map.points[0].lat).toBe(35.1);
  });

  it('clears kind-inapplicable point metadata during live updates', () => {
    let map = addMapPoint(emptyVenueMapConfig(), {
      label: 'Scoped restroom',
      kind: 'amenity',
      x: 10,
      y: 10,
      eventSpaceIds: ['garden'],
    });
    const id = map.points[0].id;

    map = updateMapPoint(map, id, { kind: 'space', venueId: 'garden' });
    expect(map.points[0]).toMatchObject({ kind: 'space', venueId: 'garden' });
    expect(map.points[0].eventSpaceIds).toBeUndefined();

    map = updateMapPoint(map, id, { kind: 'entry', arrivalRole: 'both' });
    expect(map.points[0]).toMatchObject({ kind: 'entry', arrivalRole: 'both' });
    expect(map.points[0].venueId).toBeUndefined();

    map = updateMapPoint(map, id, { kind: 'parking' });
    expect(map.points[0].kind).toBe('parking');
    expect(map.points[0].venueId).toBeUndefined();
    expect(map.points[0].arrivalRole).toBeUndefined();
  });

  it('removes a point without inventing a direct segment in dependent routes', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'space', x: 20, y: 20 });
    map = addMapPoint(map, { label: 'C', kind: 'space', x: 40, y: 20 });
    const ids = map.points.map((p) => p.id);
    map = addMapRoute(map, 'Walkway', [ids[0], ids[1], ids[2]]);
    expect(map.routes).toHaveLength(1);
    map = removeMapPoint(map, ids[1]);
    expect(map.points).toHaveLength(2);
    expect(map.routes[0].pointIds).toEqual(ids);
    expect(partitionVenueMapRouteReferenceIntegrity(map).quarantinedRoutes)
      .toEqual(map.routes);
  });

  it('adds/removes routes and resolves their polyline coordinates', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Entry', kind: 'entry', x: 2, y: 2 });
    map = addMapPoint(map, { label: 'Ceremony', kind: 'space', x: 30, y: 20 });
    map = addMapPoint(map, { label: 'Reception', kind: 'space', x: 60, y: 20 });
    const ids = map.points.map((p) => p.id);
    map = addMapRoute(map, 'Main Walkway', ids);
    expect(map.routes).toHaveLength(1);
    const pts = routePoints(map, map.routes[0]);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 2, y: 2 });
    // Removing a route clears it.
    map = removeMapRoute(map, map.routes[0].id);
    expect(map.routes).toHaveLength(0);
  });

  it('exposes kind accent colors', () => {
    expect(pointColor('space')).toBe('#0d9488');
    expect(pointColor('parking')).toBe('#6366f1');
    expect(pointColor('path')).toBe('#94a3b8');
  });

  it('resizes the map and clamps points back into bounds', () => {
    let map = emptyVenueMapConfig(); // 100 x 80
    map = addMapPoint(map, { label: 'Ceremony', kind: 'space', x: 90, y: 75 });
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 5, y: 5 });
    // Shrink below existing points -> they clamp into the new bounds.
    map = updateMapSize(map, 50, 40);
    expect(map.width).toBe(50);
    expect(map.height).toBe(40);
    const ceremony = map.points.find((p) => p.label === 'Ceremony')!;
    expect(ceremony.x).toBe(50);
    expect(ceremony.y).toBe(40);
    // Grow keeps points where they are.
    map = updateMapSize(map, 200, 160);
    expect(map.width).toBe(200);
    expect(map.points.find((p) => p.label === 'Parking')!.x).toBe(5);
  });

  it('keeps vector zones inside resized map bounds', () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [{ id: 'zone', type: 'zone', x: 80, y: 70, width: 40, height: 30 }],
    };
    const resized = updateMapSize(map, 50, 40);
    expect(resized.drawings?.[0]).toMatchObject({ x: 10, y: 10, width: 40, height: 30 });
  });

  it('keeps zones and legacy circles wholly inside bounds during add and edit', () => {
    let map = addMapDrawing(emptyVenueMapConfig(), {
      id: 'zone',
      type: 'zone',
      x: 90,
      y: 70,
      width: 40,
      height: 30,
    });
    expect(map.drawings?.[0]).toMatchObject({ x: 60, y: 50, width: 40, height: 30 });

    map = updateMapDrawing(map, 'zone', { x: 95, y: 79 });
    expect(map.drawings?.[0]).toMatchObject({ x: 60, y: 50 });

    map = addMapDrawing(map, {
      id: 'circle',
      type: 'circle',
      x: 0,
      y: 80,
      radius: 20,
    });
    expect(map.drawings?.[1]).toMatchObject({ x: 20, y: 60, radius: 20 });
  });

  it('translates whole rectangle, circle, and line shapes without distortion or overflow', () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'zone', type: 'zone', x: 80, y: 60, width: 20, height: 20 },
        { id: 'circle', type: 'circle', x: 10, y: 10, radius: 10 },
        { id: 'line', type: 'line', x: 0, y: 0, points: [{ x: 5, y: 5 }, { x: 25, y: 15 }] },
      ],
    };

    const movedZone = moveMapDrawing(map, 'zone', 50, 50);
    expect(movedZone.drawings?.[0]).toMatchObject({ x: 80, y: 60 });

    const movedCircle = moveMapDrawing(movedZone, 'circle', -50, 8);
    expect(movedCircle.drawings?.[1]).toMatchObject({ x: 10, y: 18, radius: 10 });

    const movedLine = moveMapDrawing(movedCircle, 'line', -10, 70);
    expect(movedLine.drawings?.[2].points).toEqual([
      { x: 0, y: 70 },
      { x: 20, y: 80 },
    ]);
  });

  it('withholds a malformed base source or opacity instead of rewriting it', () => {
    const malformedBaseMap = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'javascript:alert(1)',
      backgroundOpacity: 99,
    } as any;
    expect(venueMapBaseImageIntegrityIssues(malformedBaseMap)).toEqual([
      expect.objectContaining({ field: 'backgroundImageUrl', savedValue: 'javascript:alert(1)' }),
      expect.objectContaining({ field: 'backgroundOpacity', savedValue: 99 }),
    ]);
    expect(venueMapBaseImageIntegrityIssues({
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'https://example.com/map.png',
      backgroundOpacity: 0.1,
    })).toEqual([]);
    expect(venueMapBaseImageIntegrityIssues({
      ...emptyVenueMapConfig(),
      backgroundOpacity: 0.8,
    })).toEqual([
      expect.objectContaining({ field: 'backgroundOpacity', savedValue: 0.8 }),
    ]);

    const safe = partitionVenueMapBaseImageIntegrity(malformedBaseMap);
    expect(safe).toMatchObject({
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
      backgroundImageUnavailable: true,
    });
    expect(projectVenueMap(malformedBaseMap, 'couple')).toMatchObject({
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
      backgroundImageUnavailable: true,
    });
  });

  it('quarantines a whole shape instead of rewriting malformed SVG appearance', () => {
    const malformedAppearance = {
      id: 'hidden-zone',
      type: 'zone',
      x: 10,
      y: 10,
      width: 20,
      height: 10,
      fillColor: 'url(https://tracker.example/pixel)',
      strokeColor: null,
      strokeWidth: 40,
      opacity: -1,
      fontSize: 'large',
    } as any;
    expect(venueMapDrawingPresentationIssues(malformedAppearance)).toEqual([
      expect.objectContaining({ field: 'fillColor', savedValue: 'url(https://tracker.example/pixel)' }),
      expect.objectContaining({ field: 'strokeColor', savedValue: null }),
      expect.objectContaining({ field: 'strokeWidth', savedValue: 40 }),
      expect.objectContaining({ field: 'opacity', savedValue: -1 }),
      expect.objectContaining({ field: 'fontSize', savedValue: 'large' }),
    ]);
    expect(venueMapDrawingPresentationIssues({
      ...malformedAppearance,
      fillColor: 'transparent',
      strokeColor: '#0f766e',
      strokeWidth: 1,
      opacity: 0,
      fontSize: 12,
    })).toEqual([]);

    const map = { ...emptyVenueMapConfig(), drawings: [malformedAppearance] };
    expect(partitionVenueMapDrawingIntegrity(map).map.drawings).toEqual([]);
    expect(projectVenueMap(map, 'couple').drawings).toEqual([]);
  });

  it('quarantines unsupported and malformed shapes while retaining all known valid geometry', () => {
    const validShapes = [
      { id: 'zone', type: 'zone', x: 1, y: 1, width: 10, height: 8 },
      { id: 'rectangle', type: 'rectangle', x: 2, y: 2, width: 4, height: 5 },
      { id: 'circle', type: 'circle', x: 20, y: 20, radius: 5 },
      { id: 'line', type: 'line', x: 0, y: 0, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
    ];
    const invalidShapes = [
      { id: 'unknown', type: 'polygon', x: 1, y: 1 },
      { id: 'widthless', type: 'zone', x: 1, y: 1 },
      { id: 'radiusless', type: 'circle', x: 5, y: 5 },
      { id: 'short-line', type: 'line', x: 0, y: 0, points: [{ x: 1, y: 1 }] },
      { id: 'zero-line', type: 'line', x: 0, y: 0, points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] },
      { id: 'over-rotated', type: 'rectangle', x: 40, y: 25, width: 20, height: 10, rotation: 450 },
    ];
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [...validShapes, ...invalidShapes],
    } as any;

    const partition = partitionVenueMapDrawingIntegrity(map);
    expect(partition.map.drawings?.map((drawing) => drawing.id)).toEqual(
      validShapes.map((drawing) => drawing.id),
    );
    expect(partition.quarantinedDrawings.map((drawing) => drawing.id)).toEqual(
      invalidShapes.map((drawing) => drawing.id),
    );
    expect(venueMapHasInvalidDrawingGeometry(map)).toBe(true);
    expect(venueMapDrawingIntegrityIssue(validShapes[3] as any)).toBeNull();
    expect(venueMapDrawingIntegrityIssue(invalidShapes[0] as any)).toMatch(/not supported/i);
    expect(venueMapDrawingIntegrityIssue(invalidShapes[4] as any)).toMatch(/different vertex/i);
    expect(venueMapDrawingRotationIssue(invalidShapes[5] as any)).toMatch(/-360° to 360°/i);
    expect(projectVenueMap(map, 'guest').drawings?.map((drawing) => drawing.id)).toEqual(
      validShapes.map((drawing) => drawing.id),
    );
  });

  it('quarantines every shape whose rendered geometry crosses the map frame', () => {
    const map = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'valid-rotated', type: 'rectangle', x: 40, y: 25, width: 20, height: 20, rotation: 45 },
        { id: 'outside-rectangle', type: 'zone', x: 90, y: 10, width: 20, height: 10 },
        { id: 'outside-circle', type: 'circle', x: 5, y: 20, radius: 10 },
        { id: 'outside-line', type: 'line', x: 0, y: 0, points: [{ x: 1, y: 1 }, { x: 101, y: 2 }] },
        { id: 'outside-rotated', type: 'rectangle', x: 0, y: 0, width: 20, height: 20, rotation: 45 },
      ],
    } as any;

    const partition = partitionVenueMapDrawingIntegrity(map);
    expect(partition.map.drawings?.map((drawing) => drawing.id)).toEqual(['valid-rotated']);
    expect(partition.quarantinedDrawings.map((drawing) => drawing.id)).toEqual([
      'outside-rectangle',
      'outside-circle',
      'outside-line',
      'outside-rotated',
    ]);
    expect(venueMapDrawingIntegrityIssue(map.drawings[4], map)).toMatch(/outside.*map frame/i);
    expect(projectVenueMap(map, 'guest').drawings?.map((drawing) => drawing.id))
      .toEqual(['valid-rotated']);
  });

  it('constrains authored and moved rotated shapes by their rendered corners', () => {
    let map = addMapDrawing(emptyVenueMapConfig(), {
      id: 'rotated-zone',
      type: 'zone',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      rotation: 45,
    });
    let drawing = map.drawings![0];
    expect(venueMapDrawingIntegrityIssue(drawing, map)).toBeNull();
    expect(venueMapDrawingBounds(drawing).minX).toBeCloseTo(0);
    expect(venueMapDrawingBounds(drawing).minY).toBeCloseTo(0);

    map = moveMapDrawing(map, 'rotated-zone', 500, 500);
    drawing = map.drawings![0];
    const movedBounds = venueMapDrawingBounds(drawing);
    expect(movedBounds.maxX).toBeLessThanOrEqual(map.width);
    expect(movedBounds.maxX).toBeGreaterThan(map.width - 0.1);
    expect(movedBounds.maxY).toBeLessThanOrEqual(map.height);
    expect(movedBounds.maxY).toBeGreaterThan(map.height - 0.1);
    expect(drawing).toMatchObject({ width: 20, height: 20, rotation: 45 });
    expect(venueMapDrawingIntegrityIssue(drawing, map)).toBeNull();
  });

  it('clamps size input to sane bounds and ignores non-finite values', () => {
    let map = updateMapSize(emptyVenueMapConfig(), 5, 9999); // below/above bounds
    expect(map.width).toBe(20);
    expect(map.height).toBe(500);
    map = updateMapSize(emptyVenueMapConfig(), NaN, 40);
    expect(map.width).toBe(100); // fallback to current width
    expect(map.height).toBe(40);
  });

  it('duplicates a point at a small offset, labeled "(copy)"', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Parking', kind: 'parking', x: 30, y: 30 });
    const id = map.points[0].id;
    map = duplicateMapPoint(map, id);
    expect(map.points).toHaveLength(2);
    const copy = map.points[1];
    expect(copy.label).toBe('Parking (copy)');
    expect(copy.x).toBeGreaterThan(30); // offset in +x
    expect(copy.y).toBeGreaterThan(30); // offset in +y
    expect(copy.id).not.toBe(id);
  });

  it('duplicate is clamped to bounds and does not copy route membership', () => {
    let map = emptyVenueMapConfig(); // 100 x 80
    map = addMapPoint(map, { label: 'Edge', kind: 'amenity', x: 95, y: 75 });
    map = addMapPoint(map, { label: 'Other', kind: 'entry', x: 5, y: 5 });
    map = addMapRoute(map, 'Walkway', map.points.map((p) => p.id));
    const id = map.points[0].id;
    map = duplicateMapPoint(map, id, 20);
    // The copy is the appended point.
    const copy = map.points[map.points.length - 1];
    expect(copy.label).toBe('Edge (copy)');
    expect(copy.x).toBe(100); // clamped to width
    expect(copy.y).toBe(80);  // clamped to height
    // The new point isn't in any route (route only references the two originals).
    expect(map.routes[0].pointIds).not.toContain(copy.id);
  });

  it('renames a route and keeps the existing name for a blank input', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'space', x: 20, y: 20 });
    map = addMapRoute(map, 'Old Name', map.points.map((p) => p.id));
    const id = map.routes[0].id;
    map = renameMapRoute(map, id, 'Ceremony Walkway');
    expect(map.routes[0].name).toBe('Ceremony Walkway');
    // Blank keeps the current name.
    map = renameMapRoute(map, id, '   ');
    expect(map.routes[0].name).toBe('Ceremony Walkway');
  });

  it('quarantines every affected route regardless of how many other points remain', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'space', x: 20, y: 20 });
    map = addMapPoint(map, { label: 'C', kind: 'space', x: 40, y: 20 });
    map = addMapRoute(map, 'Short', [map.points[0].id, map.points[1].id]); // 2 points
    map = addMapRoute(map, 'Long', map.points.map((p) => p.id)); // 3 points
    // Remove point B (shared by both routes).
    map = removeMapPoint(map, map.points[1].id);
    // Neither route is rewritten into a new direct connection.
    expect(map.routes.map((r) => r.name)).toEqual(['Short', 'Long']);
    expect(map.routes[0].pointIds).toHaveLength(2);
    expect(map.routes[1].pointIds).toHaveLength(3);
    expect(partitionVenueMapRouteReferenceIntegrity(map).quarantinedRoutes)
      .toEqual(map.routes);
  });

  it('rejects missing and duplicate point ids when adding a route', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'space', x: 20, y: 20 });
    const [a, b] = map.points.map((point) => point.id);
    map = addMapRoute(map, 'Valid', [a, 'deleted-point', a, b]);
    expect(map.routes[0].pointIds).toEqual([a, b]);
    const unchanged = addMapRoute(map, 'Invalid', [a, 'deleted-point']);
    expect(unchanged).toBe(map);
  });

  it('updates route order safely and can clear event scope', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'A', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'B', kind: 'path', x: 20, y: 10 });
    map = addMapPoint(map, { label: 'C', kind: 'space', x: 40, y: 20, venueId: 'garden' });
    const [a, b, c] = map.points.map((point) => point.id);
    map = addMapRoute(map, 'Scoped', [a, b, c], { eventSpaceIds: ['garden'] });
    const routeId = map.routes[0].id;

    map = updateMapRoute(map, routeId, {
      pointIds: [c, 'missing', b, a, b],
      eventSpaceIds: undefined,
    });
    expect(map.routes[0].pointIds).toEqual([c, b, a]);
    expect(map.routes[0].eventSpaceIds).toBeUndefined();

    map = updateMapRoute(map, routeId, { pointIds: [a, 'missing'] });
    expect(map.routes[0].pointIds).toEqual([c, b, a]);
  });

  it('quarantines every duplicate identity and dependent route before portal projection', () => {
    const duplicateMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'dup-point', label: 'Public entrance', kind: 'entry', x: 5, y: 5, audience: 'public' },
        { id: 'dup-point', label: 'Staff entrance', kind: 'entry', x: 8, y: 8, audience: 'staff' },
        { id: 'destination', label: 'Garden', kind: 'space', venueId: 'garden', x: 40, y: 40, audience: 'public' },
      ],
      routes: [
        { id: 'dependent', name: 'Dependent path', pointIds: ['dup-point', 'destination'], audience: 'public' },
        { id: 'dup-route', name: 'First route', pointIds: ['dup-point', 'destination'], audience: 'public' },
        { id: 'dup-route', name: 'Second route', pointIds: ['dup-point', 'destination'], audience: 'staff' },
      ],
      drawings: [
        { id: 'dup-zone', type: 'zone', x: 1, y: 1, width: 5, height: 5, text: 'Guest zone', audience: 'public' },
        { id: 'dup-zone', type: 'zone', x: 2, y: 2, width: 5, height: 5, text: 'Staff zone', audience: 'staff' },
      ],
    } as any;

    const partition = partitionVenueMapDuplicateIdentities(duplicateMap);
    expect(partition.duplicateGroups.map((group) => [group.family, group.id, group.objects.length]))
      .toEqual([
        ['point', 'dup-point', 2],
        ['route', 'dup-route', 2],
        ['drawing', 'dup-zone', 2],
      ]);
    expect(partition.map.points.map((point) => point.id)).toEqual(['destination']);
    expect(partition.map.routes).toEqual([]);
    expect(partition.map.drawings).toEqual([]);
    expect(partition.dependentRoutes.map((route) => route.id)).toEqual(['dependent']);

    const projected = projectVenueMap(duplicateMap, 'couple');
    expect(projected.points.map((point) => point.id)).toEqual(['destination']);
    expect(projected.routes).toEqual([]);
    expect(projected.drawings).toEqual([]);
  });

  it('omits out-of-frame points and every dependent route from portal projections', () => {
    const coordinateMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'outside', label: 'Wrong gate', kind: 'entry', x: 101, y: 20 },
        { id: 'inside', label: 'Garden', kind: 'space', venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [{
        id: 'dependent',
        name: 'Arrival path',
        pointIds: ['outside', 'inside'],
      }],
    } as any;

    expect(venueMapPointCoordinateIssue(coordinateMap.points[0], coordinateMap))
      .toMatch(/horizontal coordinate must be from 0 to 100/i);
    const projected = projectVenueMap(coordinateMap, 'couple');
    expect(projected.points.map((point) => point.id)).toEqual(['inside']);
    expect(projected.routes).toEqual([]);
  });

  it('counts duplicate point identities before coordinate filtering', () => {
    const duplicateMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'ambiguous', label: 'Inside twin', kind: 'entry', x: 5, y: 5 },
        { id: 'ambiguous', label: 'Outside twin', kind: 'entry', x: -5, y: 5 },
      ],
      routes: [],
    } as any;

    expect(projectVenueMap(duplicateMap, 'couple').points).toEqual([]);
  });

  it('quarantines a whole walkway instead of connecting across a missing point', () => {
    const brokenMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'parking', label: 'Parking', kind: 'parking', x: 5, y: 5 },
        { id: 'ceremony', label: 'Ceremony', kind: 'space', venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [{
        id: 'broken-route',
        name: 'Arrival path',
        pointIds: ['parking', 'deleted-checkpoint', 'ceremony'],
      }],
    } as any;

    expect(venueMapRouteReferenceIssues(brokenMap.routes[0], brokenMap.points)).toEqual([{
      index: 1,
      pointId: 'deleted-checkpoint',
      reason: 'unavailable',
    }]);
    const partition = partitionVenueMapRouteReferenceIntegrity(brokenMap);
    expect(partition.map.routes).toEqual([]);
    expect(partition.quarantinedRoutes).toEqual(brokenMap.routes);
    expect(routePoints(brokenMap, brokenMap.routes[0])).toEqual([]);
    expect(projectVenueMap(brokenMap, 'couple').routes).toEqual([]);
  });

  it('quarantines explicit invalid priorities while preserving omitted legacy priorities as Standard', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'lawn', label: 'Lawn', kind: 'space' as const, venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [
        {
          id: 'damaged-emergency-route',
          name: 'Damaged emergency route',
          pointIds: ['gate', 'lawn'],
          priority: INVALID_VENUE_MAP_ROUTE_PRIORITY,
        },
        {
          id: 'legacy-route',
          name: 'Legacy route',
          pointIds: ['gate', 'lawn'],
        },
      ],
    };

    expect(venueMapRoutePriorityIssue(map.routes[0])).toMatch(/invalid/i);
    expect(venueMapRoutePriorityIssue(map.routes[1])).toBeNull();
    expect(venueMapHasInvalidRoutePriorities(map)).toBe(true);
    const partition = partitionVenueMapRouteReferenceIntegrity(map);
    expect(partition.quarantinedRoutes.map((route) => route.id))
      .toEqual(['damaged-emergency-route']);
    expect(partition.map.routes.map((route) => route.id)).toEqual(['legacy-route']);
    expect(routePoints(map, map.routes[0])).toEqual([]);
    expect(projectVenueMap(map, 'guest', ['garden']).routes).toEqual([
      expect.objectContaining({ id: 'legacy-route', priority: 'standard' }),
    ]);
    expect(findVenueMapRoute({ ...map, routes: [map.routes[0]] }, 'gate', 'lawn'))
      .toBeNull();
    expect(findVenueMapRoute({ ...map, routes: [map.routes[1]] }, 'gate', 'lawn'))
      .toMatchObject({ priority: 'standard' });
  });

  it('projects guest, couple, and staff audiences without orphan route shortcuts', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Gate', kind: 'entry', x: 5, y: 5, audience: 'public' });
    map = addMapPoint(map, { label: 'Ceremony', kind: 'space', x: 40, y: 20, venueId: 'ceremony', audience: 'public' });
    map = addMapPoint(map, { label: 'Planning Suite', kind: 'space', x: 50, y: 30, venueId: 'suite', audience: 'couple' });
    map = addMapPoint(map, { label: 'Service Yard', kind: 'space', x: 60, y: 40, venueId: 'service', audience: 'staff' });
    const [gate, ceremony, suite, service] = map.points.map((point) => point.id);
    map = addMapRoute(map, 'Guest Walk', [gate, ceremony], { audience: 'public', accessibility: 'step-free' });
    map = addMapRoute(map, 'Service Road', [gate, service], { audience: 'staff' });
    map = addMapRoute(map, 'Hidden shortcut', [gate, service, ceremony], { audience: 'public' });
    map = addMapRoute(map, 'Couple Walk', [gate, suite], { audience: 'couple' });

    const guest = projectVenueMap(map, 'guest', ['ceremony']);
    expect(guest.points.map((point) => point.label)).toEqual(['Gate', 'Ceremony']);
    expect(guest.routes.map((route) => route.name)).toEqual(['Guest Walk']);

    const couple = projectVenueMap(map, 'couple');
    expect(couple.points.map((point) => point.label)).toContain('Planning Suite');
    expect(couple.points.map((point) => point.label)).not.toContain('Service Yard');
    expect(couple.routes.map((route) => route.name)).toContain('Couple Walk');

    const staff = projectVenueMap(map, 'staff');
    expect(staff.points.map((point) => point.label)).toContain('Service Yard');
  });

  it('quarantines every rain plan in duplicate-ID or competing-source collision components', () => {
    const map = {
      ...emptyVenueMapConfig(),
      rainContingencies: [
        { id: 'duplicate-id', outdoorVenueId: 'lawn', indoorVenueId: 'hall' },
        { id: 'duplicate-id', outdoorVenueId: 'terrace', indoorVenueId: 'barn' },
        { id: 'third-plan', outdoorVenueId: 'terrace', indoorVenueId: 'hall' },
        { id: 'safe-plan', outdoorVenueId: 'courtyard', indoorVenueId: 'barn' },
      ],
    };

    expect(rainContingencyCollisionIssues(
      map.rainContingencies[0],
      map.rainContingencies,
    )).toEqual(['Plan ID “duplicate-id” is duplicated.']);
    expect(rainContingencyCollisionIssues(
      map.rainContingencies[1],
      map.rainContingencies,
    )).toEqual([
      'Plan ID “duplicate-id” is duplicated.',
      'Outdoor space “terrace” has competing rain plans.',
    ]);

    const partition = partitionVenueMapRainContingencyCollisions(map);
    expect(partition.map.rainContingencies.map((plan) => plan.id)).toEqual(['safe-plan']);
    expect(partition.quarantinedContingencies.map((plan) => plan.id)).toEqual([
      'duplicate-id',
      'duplicate-id',
      'third-plan',
    ]);
    expect(partition.collisionGroups).toHaveLength(1);
    expect(partition.collisionGroups[0]).toMatchObject({
      duplicatedIds: ['duplicate-id'],
      duplicatedOutdoorVenueIds: ['terrace'],
    });
    expect(projectVenueMap(map, 'couple').rainContingencies.map((plan) => plan.id))
      .toEqual(['safe-plan']);
  });

  it('validates current rain-space roles and excludes stale pairs before portal scope expansion', () => {
    const venues = [
      { id: 'lawn', name: 'Ceremony Lawn', category: 'ceremony', environment: 'outdoor' },
      { id: 'hall', name: 'Main Hall', category: 'reception', environment: 'indoor' },
      { id: 'terrace', name: 'Terrace', category: 'reception', environment: 'outdoor' },
    ] as any;
    expect(rainContingencyValidationIssue(
      { id: 'valid', outdoorVenueId: 'lawn', indoorVenueId: 'hall' },
      venues,
    )).toBeNull();
    expect(rainContingencyValidationIssue(
      { id: 'missing', outdoorVenueId: 'removed-space', indoorVenueId: 'hall' },
      venues,
    )).toMatch(/no longer exists/i);
    expect(rainContingencyValidationIssue(
      { id: 'wrong-role', outdoorVenueId: 'lawn', indoorVenueId: 'terrace' },
      venues,
    )).toMatch(/no longer marked indoor/i);

    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'lawn-pin', label: 'Lawn', kind: 'space', venueId: 'lawn', x: 10, y: 10 },
        { id: 'hall-pin', label: 'Hall', kind: 'space', venueId: 'hall', x: 20, y: 20 },
        { id: 'terrace-pin', label: 'Terrace', kind: 'space', venueId: 'terrace', x: 30, y: 30 },
      ],
      rainContingencies: [
        {
          id: 'valid',
          outdoorVenueId: 'lawn',
          indoorVenueId: 'hall',
          note: 'Follow the covered walkway to the hall.',
        },
        { id: 'invalid', outdoorVenueId: 'terrace', indoorVenueId: 'lawn' },
      ],
    } as any;
    const guest = projectVenueMap(map, 'guest', ['lawn'], { venues });
    expect(guest.rainContingencies).toEqual([{
      id: 'valid',
      outdoorVenueId: 'lawn',
      indoorVenueId: 'hall',
      note: 'Follow the covered walkway to the hall.',
    }]);
    expect(guest.points.map((point) => point.venueId)).toEqual(['lawn', 'hall']);
  });

  it('fails portal projections closed for missing, stale, or ambiguous space-pin links and dependent routes', () => {
    const venues = [
      { id: 'garden', name: 'Garden' },
      { id: 'ballroom', name: 'Ballroom' },
      { id: 'duplicate', name: 'Duplicate A' },
      { id: 'duplicate', name: 'Duplicate B' },
    ] as any;
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 1, y: 1 },
        { id: 'valid', label: 'Garden', kind: 'space', venueId: 'garden', x: 10, y: 10 },
        { id: 'missing', label: 'Unlinked', kind: 'space', x: 20, y: 20 },
        { id: 'stale', label: 'Deleted hall', kind: 'space', venueId: 'deleted', x: 30, y: 30 },
        { id: 'ambiguous', label: 'Ambiguous hall', kind: 'space', venueId: 'duplicate', x: 40, y: 40 },
        { id: 'reclassified', label: 'Former space', kind: 'amenity', venueId: 'deleted', x: 50, y: 50 },
      ],
      routes: [
        { id: 'valid-route', name: 'Garden route', pointIds: ['gate', 'valid'] },
        { id: 'missing-route', name: 'Unlinked route', pointIds: ['gate', 'missing'] },
        { id: 'stale-route', name: 'Deleted route', pointIds: ['gate', 'stale'] },
        { id: 'ambiguous-route', name: 'Ambiguous route', pointIds: ['gate', 'ambiguous'] },
      ],
    } as any;

    expect(venueMapSpacePointLinkIssue(map.points[1], venues)).toBeNull();
    expect(venueMapSpacePointLinkIssue(map.points[2], venues)).toMatch(/not linked/i);
    expect(venueMapSpacePointLinkIssue(map.points[3], venues)).toMatch(/no longer exists/i);
    expect(venueMapSpacePointLinkIssue(map.points[4], venues)).toMatch(/not unique/i);
    expect(venueMapSpacePointLinkIssue(map.points[5], venues)).toBeNull();

    const catalogSafe = projectVenueMapCurrentSpaceLinks(map, venues);
    expect(catalogSafe.points.map((point) => point.id)).toEqual(['gate', 'valid', 'reclassified']);
    expect(catalogSafe.routes.map((route) => route.id)).toEqual(['valid-route']);

    const couple = projectVenueMap(map, 'couple', undefined, { venues });
    expect(couple.points.map((point) => point.id)).toEqual(['gate', 'valid', 'reclassified']);
    expect(couple.routes.map((route) => route.id)).toEqual(['valid-route']);

    const guest = projectVenueMap(map, 'guest', ['garden'], { venues });
    expect(guest.points.map((point) => point.id)).toEqual(['gate', 'valid', 'reclassified']);
    expect(guest.routes.map((route) => route.id)).toEqual(['valid-route']);
  });

  it('rejects duplicate space identities before catalog filtering can make one appear canonical', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 1, y: 1 },
        { id: 'same', label: 'Current', kind: 'space', venueId: 'garden', x: 10, y: 10 },
        { id: 'same', label: 'Stale', kind: 'space', venueId: 'deleted', x: 20, y: 20 },
      ],
      routes: [{ id: 'route', name: 'Route', pointIds: ['gate', 'same'] }],
    } as any;
    const projected = projectVenueMap(map, 'couple', undefined, {
      venues: [{ id: 'garden', name: 'Garden' }] as any,
    });
    expect(projected.points.map((point) => point.id)).toEqual(['gate']);
    expect(projected.routes).toEqual([]);
  });

  it('quarantines every space pin sharing one venue link and all dependent routes', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 1, y: 1 },
        { id: 'garden-a', label: 'Garden A', kind: 'space', venueId: 'garden', x: 10, y: 10 },
        { id: 'garden-b', label: 'Garden B', kind: 'space', venueId: ' garden ', x: 20, y: 20 },
        { id: 'hall', label: 'Hall', kind: 'space', venueId: 'hall', x: 30, y: 30 },
      ],
      routes: [
        { id: 'route-a', name: 'A', pointIds: ['gate', 'garden-a'] },
        { id: 'route-b', name: 'B', pointIds: ['gate', 'garden-b'] },
        { id: 'hall-route', name: 'Hall', pointIds: ['gate', 'hall'] },
      ],
    } as any;

    expect(duplicateMapPoint(map, 'garden-a')).toBe(map);

    const partition = partitionVenueMapSpacePointLinkCollisions(map);
    expect(partition.collisionGroups).toEqual([
      expect.objectContaining({ venueId: 'garden', points: [map.points[1], map.points[2]] }),
    ]);
    expect(partition.map.points.map((point) => point.id)).toEqual(['gate', 'hall']);
    expect(partition.map.routes.map((route) => route.id)).toEqual(['hall-route']);
    expect(partition.dependentRoutes.map((route) => route.id)).toEqual(['route-a', 'route-b']);

    const projected = projectVenueMap(map, 'couple');
    expect(projected.points.map((point) => point.id)).toEqual(['gate', 'hall']);
    expect(projected.routes.map((route) => route.id)).toEqual(['hall-route']);
  });

  it('identifies stale and malformed event scopes without changing valid selections', () => {
    const venues = [
      { id: 'garden', name: 'Garden' },
      { id: 'ballroom', name: 'Ballroom' },
    ] as any;
    expect(unavailableVenueMapEventScopeIds(
      ['garden', 'deleted-space', '__invalid_event_scope__'],
      venues,
    )).toEqual(['deleted-space', '__invalid_event_scope__']);
    expect(venueMapEventScopeRecoveryLabel('__invalid_event_scope__'))
      .toBe('Malformed saved scope');
    expect(venueMapEventScopeRecoveryLabel('deleted-space')).toBe('deleted-space');
    expect(unavailableVenueMapEventScopeIds(
      ['garden'],
      [...venues, { id: 'garden', name: 'Duplicate Garden' }] as any,
    )).toEqual(['garden']);
  });

  it('fails closed when persisted audience or event scope is explicitly malformed', () => {
    const malformedAudienceMap = {
      ...emptyVenueMapConfig(),
      points: [{ id: 'private', label: 'Private', kind: 'amenity', x: 1, y: 1, audience: 'everyone' }],
    } as any;
    expect(projectVenueMap(malformedAudienceMap, 'guest').points).toEqual([]);
    expect(projectVenueMap(malformedAudienceMap, 'couple').points).toEqual([]);
    expect(projectVenueMap(malformedAudienceMap, 'staff').points).toHaveLength(1);
    for (const malformedAudience of [null, '']) {
      const map = {
        ...emptyVenueMapConfig(),
        points: [{ id: 'private', label: 'Private', kind: 'amenity', x: 1, y: 1, audience: malformedAudience }],
      } as any;
      expect(projectVenueMap(map, 'guest').points).toEqual([]);
      expect(projectVenueMap(map, 'couple').points).toEqual([]);
    }

    const malformedScopeMap = {
      ...emptyVenueMapConfig(),
      points: [{ id: 'bad-scope', label: 'Bad scope', kind: 'amenity', x: 1, y: 1, eventSpaceIds: 'ceremony' }],
    } as any;
    expect(projectVenueMap(malformedScopeMap, 'guest', ['ceremony']).points).toEqual([]);
  });

  it('allowlists projection fields instead of leaking structurally wider JSON', () => {
    const map = {
      width: 100,
      height: 80,
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5, internalNotes: 'gate code 1234' },
        { id: 'garden', label: 'Garden', kind: 'space', venueId: 'ceremony', x: 40, y: 20 },
      ],
      routes: [{ id: 'walk', name: 'Walk', pointIds: ['gate', 'garden'], internalNotes: 'staff shortcut' }],
      drawings: [{ id: 'zone', type: 'zone', x: 1, y: 1, width: 4, height: 4, internalNotes: 'alarm location' }],
      rainContingencies: [],
      updatedAt: '2026-09-05T12:00:00.000Z',
      internalVenueNotes: 'private operations details',
    } as any;

    const guest = projectVenueMap(map, 'guest', ['ceremony']);
    expect(JSON.stringify(guest)).not.toContain('internal');
    expect(JSON.stringify(guest)).not.toContain('1234');
    expect(guest.points[0]).not.toHaveProperty('internalNotes');
    expect(guest.routes[0]).not.toHaveProperty('internalNotes');
    expect(guest.drawings?.[0]).not.toHaveProperty('internalNotes');
    expect(guest).not.toHaveProperty('internalVenueNotes');
    expect(guest.routes[0].pointIds).not.toBe(map.routes[0].pointIds);
  });

  it('applies event-space scope to points, routes, and zones', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, { label: 'Main Gate', kind: 'entry', x: 5, y: 5 });
    map = addMapPoint(map, { label: 'Ceremony Lawn', kind: 'space', x: 30, y: 20, venueId: 'ceremony' });
    map = addMapPoint(map, { label: 'Reception Hall', kind: 'space', x: 70, y: 20, venueId: 'reception' });
    map = addMapPoint(map, { label: 'Ceremony Restroom', kind: 'amenity', x: 25, y: 15, eventSpaceIds: ['ceremony'] });
    map = addMapPoint(map, { label: 'Reception Bar', kind: 'amenity', x: 75, y: 15, eventSpaceIds: ['reception'] });
    const [gate, ceremony, reception, ceremonyAmenity, receptionAmenity] = map.points.map((point) => point.id);
    map = addMapRoute(map, 'Ceremony route', [gate, ceremonyAmenity, ceremony], { eventSpaceIds: ['ceremony'] });
    map = addMapRoute(map, 'Reception route', [gate, receptionAmenity, reception], { eventSpaceIds: ['reception'] });
    map = {
      ...map,
      drawings: [
        { id: 'ceremony-zone', type: 'zone', x: 10, y: 10, width: 20, height: 20, eventSpaceIds: ['ceremony'] },
        { id: 'reception-zone', type: 'zone', x: 60, y: 10, width: 20, height: 20, eventSpaceIds: ['reception'] },
        { id: 'global-zone', type: 'zone', x: 0, y: 0, width: 5, height: 5 },
      ],
    };

    const ceremonyMap = projectVenueMap(map, 'guest', ['ceremony']);
    expect(ceremonyMap.points.map((point) => point.label)).toEqual([
      'Main Gate',
      'Ceremony Lawn',
      'Ceremony Restroom',
    ]);
    expect(ceremonyMap.routes.map((route) => route.name)).toEqual(['Ceremony route']);
    expect(ceremonyMap.drawings?.map((drawing) => drawing.id)).toEqual(['ceremony-zone', 'global-zone']);

    const noEventContext = projectVenueMap(map, 'guest');
    expect(noEventContext.points.map((point) => point.label)).toEqual(['Main Gate']);
    expect(noEventContext.routes).toEqual([]);
    expect(noEventContext.drawings?.map((drawing) => drawing.id)).toEqual(['global-zone']);
  });

  it('finds route points that cannot serve the walkway audience or event scope', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Main Gate', kind: 'entry' as const, x: 5, y: 5, audience: 'public' as const },
        { id: 'staff-turn', label: 'Service Turn', kind: 'path' as const, x: 20, y: 10, audience: 'staff' as const },
        { id: 'ceremony-ramp', label: 'Ceremony Ramp', kind: 'path' as const, x: 30, y: 15, eventSpaceIds: ['ceremony'] },
      ],
      routes: [{
        id: 'guest-walk',
        name: 'Guest Walk',
        audience: 'public' as const,
        pointIds: ['gate', 'staff-turn', 'ceremony-ramp'],
      }],
    };

    const issues = venueMapRouteDeliveryIssues(map);
    expect(issues).toHaveLength(2);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        point: expect.objectContaining({ id: 'staff-turn' }),
        audienceIncompatible: true,
        eventScopeIncompatible: false,
      }),
      expect.objectContaining({
        point: expect.objectContaining({ id: 'ceremony-ramp' }),
        audienceIncompatible: false,
        eventScopeIncompatible: true,
        routeTargetsAllEvents: true,
      }),
    ]));
    expect(venueMapHasRouteDeliveryIssues(map)).toBe(true);
    expect(projectVenueMap(map, 'guest', ['ceremony']).routes).toEqual([]);
  });

  it('accepts points that cover every claimed route viewer and selected event', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Main Gate', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'couple-turn', label: 'Couple Turn', kind: 'path' as const, x: 20, y: 10, audience: 'couple' as const, eventSpaceIds: ['ceremony', 'reception'] },
      ],
      routes: [{
        id: 'couple-walk',
        name: 'Couple Walk',
        audience: 'couple' as const,
        eventSpaceIds: ['ceremony'],
        pointIds: ['gate', 'couple-turn'],
      }],
    };

    expect(venueMapRouteDeliveryIssues(map)).toEqual([]);
    expect(venueMapHasRouteDeliveryIssues(map)).toBe(false);
  });

  it('finds only authored graph paths and can require verified step-free routes', () => {
    let map = emptyVenueMapConfig();
    map = addMapPoint(map, {
      label: 'Parking',
      description: 'Meet beside the blue parking sign.',
      kind: 'parking',
      x: 5,
      y: 5,
    });
    map = addMapPoint(map, {
      label: 'Junction',
      description: 'Turn left at the fountain.',
      kind: 'path',
      x: 20,
      y: 10,
    });
    map = addMapPoint(map, {
      label: 'Ceremony',
      description: 'Check in with the usher.',
      kind: 'space',
      x: 40,
      y: 20,
    });
    map = addMapPoint(map, { label: 'Unconnected', kind: 'amenity', x: 80, y: 70 });
    const [parking, junction, ceremony, unconnected] = map.points.map((point) => point.id);
    map = addMapRoute(map, 'Parking Path', [parking, junction], { accessibility: 'step-free' });
    map = addMapRoute(map, 'Garden Path', [junction, ceremony], { accessibility: 'step-free', notes: 'Use the ramp.' });

    const route = findVenueMapRoute(map, parking, ceremony, { stepFreeOnly: true });
    expect(route?.pointIds).toEqual([parking, junction, ceremony]);
    expect(route?.segments.map((segment) => segment.route.name))
      .toEqual(['Parking Path', 'Garden Path']);
    expect(route?.routes.map((item) => item.name)).toEqual(['Parking Path', 'Garden Path']);
    expect(buildVenueMapDirectionSteps(map, route!)).toEqual([
      'Start at Parking.',
      'Meet beside the blue parking sign.',
      'Follow route “Parking Path”. Mobility: Verified step-free.',
      'At Junction: Turn left at the fountain.',
      'Follow route “Garden Path”. Mobility: Verified step-free.',
      'Use the ramp.',
      'Arrive at Ceremony.',
      'Check in with the usher.',
    ]);
    expect(findVenueMapRoute(map, parking, unconnected)).toBeNull();
  });

  it.each([
    ['step-free', 'Verified step-free'],
    ['not-step-free', 'Not step-free'],
    ['unknown', 'Mobility not verified'],
  ] as const)('states %s mobility status in ordered directions', (accessibility, expectedLabel) => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'start', label: 'Parking', kind: 'parking' as const, x: 0, y: 0 },
        { id: 'finish', label: 'Ceremony', kind: 'space' as const, x: 20, y: 0 },
      ],
      routes: [{
        id: 'walk',
        name: 'Arrival Walk',
        pointIds: ['start', 'finish'],
        accessibility,
      }],
    };
    const path = findVenueMapRoute(map, 'start', 'finish');

    expect(buildVenueMapDirectionSteps(map, path!)).toContain(
      `Follow route “Arrival Walk”. Mobility: ${expectedLabel}.`,
    );
  });

  it('counts only explicitly classified entries and parking as normal guest arrivals', () => {
    const legacy = { id: 'legacy', label: 'Legacy door', kind: 'entry' as const, x: 1, y: 1 };
    const exitOnly = { ...legacy, id: 'exit', arrivalRole: 'exit-only' as const };
    const arrival = { ...legacy, id: 'arrival', arrivalRole: 'guest-arrival' as const };
    const both = { ...legacy, id: 'both', arrivalRole: 'both' as const };
    const parking = { ...legacy, id: 'parking', kind: 'parking' as const };
    const malformedParking = { ...parking, id: 'bad-parking', arrivalRole: 'guest-arrival' as any };

    expect(isVenueMapGuestArrivalPoint(legacy)).toBe(false);
    expect(isVenueMapGuestArrivalPoint(exitOnly)).toBe(false);
    expect(isVenueMapGuestArrivalPoint(arrival)).toBe(true);
    expect(isVenueMapGuestArrivalPoint(both)).toBe(true);
    expect(isVenueMapGuestArrivalPoint(parking)).toBe(true);
    expect(isVenueMapGuestArrivalPoint(malformedParking)).toBe(false);
    expect(preferredVenueMapDirectionsStart([malformedParking])).toBeUndefined();
    expect(projectVenueMap({
      ...emptyVenueMapConfig(),
      points: [legacy],
    }, 'guest').points[0].arrivalRole).toBe('unknown');
  });

  it('preserves invalid or misplaced arrival roles for explicit recovery', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'bad-entry', label: 'Bad entry', kind: 'entry' as const, x: 1, y: 1, arrivalRole: 'loading-dock' as any },
        { id: 'bad-amenity', label: 'Bad amenity', kind: 'amenity' as const, x: 2, y: 2, arrivalRole: 'guest-arrival' as any },
      ],
    };

    expect(venueMapPointArrivalRoleIssue(map.points[0])).toMatch(/invalid/i);
    expect(venueMapPointArrivalRoleIssue(map.points[1])).toMatch(/Only Entry \/ Exit/i);
    expect(venueMapArrivalRoleIntegrityIssues(map)).toEqual([
      expect.objectContaining({ pointId: 'bad-entry', savedValue: 'loading-dock' }),
      expect.objectContaining({ pointId: 'bad-amenity', savedValue: 'guest-arrival' }),
    ]);
    expect(projectVenueMap(map, 'guest').points).toEqual([]);
  });

  it('prefers entry, then parking, over arbitrary authoring order for directions', () => {
    const destination = { id: 'garden', label: 'Garden', kind: 'space' as const, x: 20, y: 20 };
    const parking = { id: 'parking', label: 'Guest Parking', kind: 'parking' as const, x: 5, y: 5 };
    const entry = { id: 'entry', label: 'Main Gate', kind: 'entry' as const, x: 10, y: 10, arrivalRole: 'guest-arrival' as const };

    expect(preferredVenueMapDirectionsStart([destination, parking, entry])?.id).toBe('entry');
    expect(preferredVenueMapDirectionsStart([destination, parking])?.id).toBe('parking');
    expect(preferredVenueMapDirectionsStart([destination])).toBeUndefined();
    expect(preferredVenueMapDirectionsStart([])).toBeUndefined();

    const routedMap = {
      ...emptyVenueMapConfig(),
      points: [destination, parking, entry],
      routes: [{
        id: 'parking-walk',
        name: 'Parking walk',
        pointIds: ['parking', 'garden'],
        accessibility: 'step-free' as const,
      }],
    };
    expect(preferredVenueMapDirectionsStart(routedMap.points, {
      map: routedMap,
      destinationPointId: 'garden',
    })?.id).toBe('parking');
    expect(preferredVenueMapDirectionsStart(routedMap.points, {
      map: routedMap,
      destinationPointId: 'garden',
      stepFreeOnly: true,
    })?.id).toBe('parking');
  });

  it('preflights guest arrival, routine-route, and verified step-free coverage by wedding scope', () => {
    const venues: Venue[] = [
      { id: 'garden', name: 'Ceremony Garden', category: 'outdoor', width: 100, height: 80, capacity: 120 },
      { id: 'cottage', name: 'Cottage', category: 'lodging', width: 40, height: 30, capacity: 8 },
    ];
    const destination = {
      id: 'garden-pin', label: 'Garden Pin', kind: 'space' as const, x: 40, y: 20, venueId: 'garden',
    };
    expect(venueMapGuestRouteCoverageIssues(emptyVenueMapConfig(), venues)).toEqual([
      expect.objectContaining({
        kind: 'missing-destination-pin',
        venueId: 'garden',
        venueName: 'Ceremony Garden',
      }),
    ]);

    const baseMap = {
      ...emptyVenueMapConfig(),
      points: [destination],
    };

    expect(venueMapGuestRouteCoverageIssues(baseMap, venues)).toEqual([
      expect.objectContaining({
        kind: 'no-arrival-point',
        pointId: 'garden-pin',
        venueName: 'Ceremony Garden',
      }),
    ]);

    const arrivalMap = {
      ...baseMap,
      points: [
        { id: 'gate', label: 'Main Gate', kind: 'entry' as const, x: 5, y: 5, arrivalRole: 'guest-arrival' as const },
        destination,
      ],
    };
    expect(venueMapGuestRouteCoverageIssues(arrivalMap, venues)).toEqual([
      expect.objectContaining({ kind: 'no-routine-route' }),
    ]);

    const unverifiedMap = {
      ...arrivalMap,
      routes: [{
        id: 'garden-walk',
        name: 'Garden Walk',
        pointIds: ['gate', 'garden-pin'],
        accessibility: 'unknown' as const,
      }],
    };
    expect(venueMapGuestRouteCoverageIssues(unverifiedMap, venues)).toEqual([
      expect.objectContaining({ kind: 'no-step-free-route' }),
    ]);

    const stepFreeMap = {
      ...unverifiedMap,
      routes: [{ ...unverifiedMap.routes[0], accessibility: 'step-free' as const }],
    };
    expect(venueMapGuestRouteCoverageIssues(stepFreeMap, venues)).toEqual([]);
  });

  it('ignores non-guest and lodging pins and does not borrow arrivals from another event scope', () => {
    const venues: Venue[] = [
      { id: 'garden', name: 'Garden', category: 'outdoor', width: 100, height: 80, capacity: 120 },
      { id: 'ballroom', name: 'Ballroom', category: 'reception', width: 80, height: 60, capacity: 200 },
      { id: 'cottage', name: 'Cottage', category: 'lodging', width: 40, height: 30, capacity: 8 },
    ];
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'other-gate', label: 'Ballroom Gate', kind: 'entry' as const, x: 5, y: 5, arrivalRole: 'guest-arrival' as const, eventSpaceIds: ['ballroom'] },
        { id: 'garden', label: 'Garden', kind: 'space' as const, x: 30, y: 20, venueId: 'garden' },
        { id: 'couple-room', label: 'Couple Room', kind: 'space' as const, x: 50, y: 20, venueId: 'ballroom', audience: 'couple' as const },
        { id: 'cottage', label: 'Cottage', kind: 'space' as const, x: 70, y: 20, venueId: 'cottage' },
      ],
    };

    expect(venueMapGuestRouteCoverageIssues(map, venues)).toEqual([
      expect.objectContaining({ kind: 'no-arrival-point', pointId: 'garden' }),
    ]);
  });

  it('keys displayed directions to the exact map, wedding scope, and routing catalog', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry' as const, x: 0, y: 0 },
        { id: 'garden', label: 'Garden', kind: 'space' as const, venueId: 'garden', x: 10, y: 0 },
      ],
      routes: [{ id: 'arrival', name: 'Arrival', pointIds: ['gate', 'garden'], notes: 'Use the left fork.' }],
    };
    const venues = [{
      id: 'garden', name: 'Garden', category: 'outdoor', width: 10, height: 10, capacity: 50,
    }] as any;
    const key = venueMapDirectionsContextKey(map, ['garden'], venues, true);

    expect(venueMapDirectionsContextKey(map, ['garden', 'garden'], venues, true)).toBe(key);
    expect(venueMapDirectionsContextKey(
      { ...map, routes: [{ ...map.routes[0], notes: 'Use the right fork.' }] },
      ['garden'],
      venues,
      true,
    )).not.toBe(key);
    expect(venueMapDirectionsContextKey(map, [], venues, true)).not.toBe(key);
    expect(venueMapDirectionsContextKey(
      map,
      ['garden'],
      [{ ...venues[0], category: 'ceremony' }],
      true,
    )).not.toBe(key);
    expect(venueMapDirectionsContextKey(map, ['garden'], venues, false)).not.toBe(key);
  });

  it('uses venue priority before geometric distance and distance instead of authored segment count', () => {
    const base = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'start', label: 'Start', kind: 'entry' as const, x: 0, y: 0 },
        { id: 'far', label: 'Far bend', kind: 'path' as const, x: 5, y: 20 },
        { id: 'near-1', label: 'Near one', kind: 'path' as const, x: 3, y: 0 },
        { id: 'near-2', label: 'Near two', kind: 'path' as const, x: 7, y: 0 },
        { id: 'end', label: 'End', kind: 'space' as const, x: 10, y: 0 },
      ],
      routes: [
        { id: 'short-standard', name: 'Short standard', pointIds: ['start', 'near-1', 'near-2', 'end'], priority: 'standard' as const },
        { id: 'long-standard', name: 'Long standard', pointIds: ['start', 'far', 'end'], priority: 'standard' as const },
      ],
    };

    const shortest = findVenueMapRoute(base, 'start', 'end');
    expect(shortest?.pointIds).toEqual(['start', 'near-1', 'near-2', 'end']);
    expect(shortest?.distance).toBe(10);
    expect(shortest?.priority).toBe('standard');

    const preferred = {
      ...base,
      routes: base.routes.map((route) => route.id === 'long-standard'
        ? { ...route, priority: 'preferred' as const }
        : route),
    };
    expect(findVenueMapRoute(preferred, 'start', 'end')?.pointIds)
      .toEqual(['start', 'far', 'end']);
    expect(findVenueMapRoute(preferred, 'start', 'end')?.priority).toBe('preferred');
  });

  it('keeps venue priority ahead of distance after an unavoidable lower-tier connector', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'start', label: 'Start', kind: 'entry' as const, x: 0, y: 0 },
        { id: 'junction', label: 'Junction', kind: 'path' as const, x: 1, y: 0 },
        { id: 'preferred-bend', label: 'Preferred bend', kind: 'path' as const, x: 5, y: 20 },
        { id: 'end', label: 'End', kind: 'space' as const, x: 10, y: 0 },
      ],
      routes: [
        { id: 'connector', name: 'Arrival connector', pointIds: ['start', 'junction'], priority: 'standard' as const },
        { id: 'preferred-branch', name: 'Venue preferred', pointIds: ['junction', 'preferred-bend', 'end'], priority: 'preferred' as const },
        { id: 'standard-shortcut', name: 'Standard shortcut', pointIds: ['junction', 'end'], priority: 'standard' as const },
      ],
    };

    const path = findVenueMapRoute(map, 'start', 'end');
    expect(path?.pointIds).toEqual(['start', 'junction', 'preferred-bend', 'end']);
    expect(path?.routes.map((route) => route.id)).toEqual(['connector', 'preferred-branch']);
    expect(path?.priority).toBe('standard');
    expect(path!.distance).toBeGreaterThan(40);
  });

  it('excludes emergency-only paths from routine directions and validates identical endpoints', () => {
    const map = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'start', label: 'Start', kind: 'entry' as const, x: 0, y: 0 },
        { id: 'end', label: 'End', kind: 'space' as const, x: 10, y: 0 },
      ],
      routes: [{
        id: 'evacuation',
        name: 'Evacuation Route',
        pointIds: ['start', 'end'],
        priority: 'emergency-only' as const,
        accessibility: 'step-free' as const,
      }],
    };

    expect(findVenueMapRoute(map, 'start', 'end')).toBeNull();
    expect(findVenueMapRoute(map, 'start', 'end', { includeEmergencyOnly: true }))
      .toMatchObject({ pointIds: ['start', 'end'], priority: 'emergency-only', distance: 10 });
    expect(findVenueMapRoute(map, 'missing', 'missing')).toBeNull();
  });
});
