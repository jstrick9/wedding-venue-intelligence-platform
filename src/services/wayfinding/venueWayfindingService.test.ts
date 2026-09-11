import { describe, it, expect, beforeEach, vi } from 'vitest';
import { on } from '../../utils/appEvents';
import {
  INVALID_VENUE_MAP_ROUTE_PRIORITY,
  projectVenueMap,
  VENUE_MAP_MAX_IDENTIFIER_LENGTH,
  VENUE_MAP_MAX_POINTS,
  VENUE_MAP_MAX_SERIALIZED_BYTES,
} from '../../utils/venueMapDesigner';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import {
  saveVenueMapConfig,
  getVenueMapConfig,
  getVenueMapConfigForPortal,
  saveVenueRules,
  getVenueRules,
  findRainContingency,
  coupleWayfindingPoints,
  routePolyline,
  analyzeVenueMapConfig,
  assertVenueMapComplexityWithinBudget,
  assertVenueMapArrivalRolesResolved,
  assertVenueMapAudiencesResolved,
  assertVenueMapBaseImageResolved,
  assertVenueMapIdentifiersValid,
  assertVenueMapPointCoordinatesResolved,
  assertVenueMapPointGpsResolved,
  assertVenueMapPointKindFieldsCanonical,
  assertVenueMapRouteAccessibilityResolved,
  assertVenueMapRouteDeliveryCompatible,
  assertVenueMapRoutePrioritiesResolved,
  assertVenueMapSpacePointLinksUnique,
  assertVenueMapStructuralRecoveryResolved,
  assertVenueMapTextFieldsValid,
  cacheVenueMapConfigFromServer,
  emptyVenueMapConfig,
  getQuarantinedVenueMapForRecovery,
  getVenueMapStructuralRecoveryArtifacts,
  getVenueMapStructuralRecoveryForBackup,
  restoreVenueMapStructuralRecoveryFromBackup,
  venueMapStructuralRecoveryBackupIssue,
  venueMapFrameIssue,
  venueMapHasInvalidPointCoordinates,
  venueMapHasInvalidPointGps,
  normalizeVenueMapConfig,
  normalizeVenueMapConfigForPortal,
} from './venueWayfindingService';

const map = {
  width: 100,
  height: 80,
  updatedAt: new Date().toISOString(),
  points: [
    { id: 'p1', label: 'Main Entry', kind: 'entry', x: 10, y: 10 },
    { id: 'p2', label: 'Parking', kind: 'parking', x: 20, y: 20 },
    { id: 'p3', label: 'Ceremony Garden', kind: 'space', venueId: 'ceremony', x: 30, y: 30 },
    { id: 'p4', label: 'Reception Hall', kind: 'space', venueId: 'reception', x: 60, y: 60 },
    { id: 'p5', label: 'Ballroom', kind: 'space', venueId: 'ballroom', x: 70, y: 70 },
    { id: 'p6', label: 'Restroom', kind: 'amenity', x: 90, y: 20 },
  ],
  rainContingencies: [
    { id: 'rc1', outdoorVenueId: 'ceremony', indoorVenueId: 'ballroom' },
  ],
  routes: [{ id: 'r1', name: 'Main Path', pointIds: ['p1', 'p3'] }],
};

describe('venueWayfindingService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads the venue map config', () => {
    expect(getVenueMapConfig()).toBeNull();
    saveVenueMapConfig(map as any);
    expect(getVenueMapConfig()!.points).toHaveLength(6);
  });

  it('preserves duplicate identities only for admin recovery and refuses to save them', () => {
    const duplicateMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'duplicate', label: 'First', kind: 'entry', x: 1, y: 1 },
        { id: 'duplicate', label: 'Second', kind: 'parking', x: 2, y: 2 },
      ],
    };

    expect(normalizeVenueMapConfig(duplicateMap)?.points).toHaveLength(1);
    expect(normalizeVenueMapConfig(
      duplicateMap,
      { preserveDuplicateIds: true },
    )?.points).toHaveLength(2);

    cacheVenueMapConfigFromServer(duplicateMap);
    expect(getVenueMapConfig()?.points.map((point) => point.label)).toEqual(['First', 'Second']);
    expect(() => saveVenueMapConfig(duplicateMap as any)).toThrow(/Duplicate map identities/i);
    expect(getVenueMapConfig()?.points).toHaveLength(2);
  });

  it('preserves malformed shape geometry for recovery and refuses to save it', () => {
    const malformedMap = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'bad-circle', type: 'circle', x: 10, y: 10, radius: -5 },
        { id: 'unknown', type: 'polygon', x: 1, y: 1 },
        {
          id: 'bad-line',
          type: 'line',
          x: 0,
          y: 0,
          points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 'bad', y: 3 }],
        },
      ],
    };

    cacheVenueMapConfigFromServer(malformedMap);
    expect(getVenueMapConfig()?.drawings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bad-circle', radius: -5 }),
      expect.objectContaining({ id: 'unknown', type: 'polygon' }),
      expect.objectContaining({ id: 'bad-line' }),
    ]));
    expect(projectVenueMap(getVenueMapConfig()!, 'guest').drawings).toEqual([]);
    expect(() => saveVenueMapConfig(malformedMap as any)).toThrow(/unsupported or malformed map shapes/i);
  });

  it('preserves exact out-of-frame shape geometry for explicit recovery', () => {
    const malformedMap = {
      ...emptyVenueMapConfig(),
      drawings: [
        { id: 'outside-zone', type: 'zone', x: 90, y: 10, width: 20, height: 10 },
        {
          id: 'outside-line',
          type: 'line',
          x: 0,
          y: 0,
          points: [{ x: -4, y: 5 }, { x: 40, y: 20 }],
        },
      ],
    };

    cacheVenueMapConfigFromServer(malformedMap);
    expect(getVenueMapConfig()?.drawings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'outside-zone', x: 90, width: 20 }),
      expect.objectContaining({
        id: 'outside-line',
        points: [{ x: -4, y: 5 }, { x: 40, y: 20 }],
      }),
    ]));
    expect(projectVenueMap(getVenueMapConfig()!, 'guest').drawings).toEqual([]);
    expect(() => saveVenueMapConfig(malformedMap as any)).toThrow(/out-of-frame geometry/i);
  });

  it('preserves an out-of-range finite rotation exactly and withholds the whole shape', () => {
    const overRotatedMap = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'turned-zone',
        type: 'rectangle',
        text: 'Turned zone',
        x: 40,
        y: 30,
        width: 20,
        height: 10,
        rotation: 450,
      }],
    };

    cacheVenueMapConfigFromServer(overRotatedMap);
    expect(getVenueMapConfig()?.drawings?.[0].rotation).toBe(450);
    expect(normalizeVenueMapConfig(overRotatedMap)?.drawings).toEqual([]);
    expect(normalizeVenueMapConfigForPortal(overRotatedMap)?.drawings).toEqual([]);
    expect(getVenueMapConfigForPortal()?.drawings).toEqual([]);
    expect(projectVenueMap(getVenueMapConfig()!, 'guest').drawings).toEqual([]);
    expect(() => saveVenueMapConfig(overRotatedMap))
      .toThrow(/geometry, rotation, or appearance/i);
  });

  it('preserves malformed shape appearance exactly and withholds the whole shape', () => {
    const malformedAppearanceMap = {
      ...emptyVenueMapConfig(),
      drawings: [{
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
      }],
    } as any;

    cacheVenueMapConfigFromServer(malformedAppearanceMap);
    expect(getVenueMapConfig()?.drawings?.[0]).toMatchObject({
      fillColor: 'url(https://tracker.example/pixel)',
      strokeColor: null,
      strokeWidth: 40,
      opacity: -1,
      fontSize: 'large',
    });
    expect(normalizeVenueMapConfig(malformedAppearanceMap)?.drawings).toEqual([]);
    expect(normalizeVenueMapConfigForPortal(malformedAppearanceMap)?.drawings).toEqual([]);
    expect(getVenueMapConfigForPortal()?.drawings).toEqual([]);
    expect(projectVenueMap(getVenueMapConfig()!, 'couple').drawings).toEqual([]);
    expect(() => saveVenueMapConfig(malformedAppearanceMap))
      .toThrow(/geometry, rotation, or appearance/i);
  });

  it('preserves duplicate-linked space pins for admin repair but withholds every occurrence from portals', () => {
    const duplicateLinkedMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 1, y: 1 },
        { id: 'garden-a', label: 'Garden A', kind: 'space', venueId: 'garden', x: 10, y: 10 },
        { id: 'garden-b', label: 'Garden B', kind: 'space', venueId: 'garden', x: 20, y: 20 },
      ],
      routes: [
        { id: 'a', name: 'A', pointIds: ['gate', 'garden-a'] },
        { id: 'b', name: 'B', pointIds: ['gate', 'garden-b'] },
      ],
    } as any;

    cacheVenueMapConfigFromServer(duplicateLinkedMap);
    expect(getVenueMapConfig()?.points.map((point) => point.id)).toEqual([
      'gate', 'garden-a', 'garden-b',
    ]);
    expect(getVenueMapConfigForPortal()?.points.map((point) => point.id)).toEqual(['gate']);
    expect(normalizeVenueMapConfigForPortal(duplicateLinkedMap)?.points.map((point) => point.id))
      .toEqual(['gate']);
    expect(projectVenueMap(duplicateLinkedMap, 'couple').points.map((point) => point.id))
      .toEqual(['gate']);
    expect(() => assertVenueMapSpacePointLinksUnique(duplicateLinkedMap))
      .toThrow(/only one canonical map pin/i);
    expect(() => saveVenueMapConfig(duplicateLinkedMap))
      .toThrow(/only one canonical map pin/i);
  });

  it('preserves malformed base-image configuration for admin repair and withholds it from portals', () => {
    const malformedBaseMap = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'javascript:alert(1)',
      backgroundOpacity: 99,
    } as any;

    cacheVenueMapConfigFromServer(malformedBaseMap);
    expect(getVenueMapConfig()).toMatchObject({
      backgroundImageUrl: 'javascript:alert(1)',
      backgroundOpacity: 99,
    });
    expect(normalizeVenueMapConfig(malformedBaseMap)).toMatchObject({
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
    });
    expect(normalizeVenueMapConfigForPortal(malformedBaseMap)).toMatchObject({
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
    });
    expect(getVenueMapConfigForPortal()).toMatchObject({
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
      backgroundImageUnavailable: true,
    });
    expect(projectVenueMap(getVenueMapConfig()!, 'couple')).toMatchObject({
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
      backgroundImageUnavailable: true,
    });
    expect(() => assertVenueMapBaseImageResolved(malformedBaseMap))
      .toThrow(/Invalid base-map source or opacity/i);
    expect(() => saveVenueMapConfig(malformedBaseMap))
      .toThrow(/Invalid base-map source or opacity/i);
  });

  it('preserves overlong authored guidance for admin repair and omits its object from portals', () => {
    const overlongGuidance = 'Use the east ramp. '.repeat(70);
    expect(overlongGuidance.length).toBeGreaterThan(1000);
    const malformedMap = {
      ...emptyVenueMapConfig(),
      points: [
        {
          id: 'caution',
          label: 'East ramp',
          description: overlongGuidance,
          kind: 'entry',
          x: 10,
          y: 10,
        },
        { id: 'ballroom', label: 'Ballroom', kind: 'space', x: 30, y: 30 },
      ],
      routes: [{
        id: 'accessible-route',
        name: 'Accessible route',
        pointIds: ['caution', 'ballroom'],
      }],
    };

    cacheVenueMapConfigFromServer(malformedMap);
    expect(getVenueMapConfig()?.points[0].description).toBe(overlongGuidance);
    expect(() => assertVenueMapTextFieldsValid(malformedMap)).toThrow(/1000/);
    expect(() => saveVenueMapConfig(malformedMap as any)).toThrow(/text must be repaired/i);
    expect(getVenueMapConfigForPortal()).toMatchObject({
      points: [expect.objectContaining({ id: 'ballroom' })],
      routes: [],
    });
    expect(normalizeVenueMapConfigForPortal(malformedMap)).toMatchObject({
      points: [expect.objectContaining({ id: 'ballroom' })],
      routes: [],
    });
  });

  it('preserves malformed arrival roles for admin repair and quarantines affected portal paths', () => {
    const malformedArrivalMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'exit', label: 'Emergency exit', kind: 'entry', x: 5, y: 5, arrivalRole: 'maybe' },
        { id: 'garden', label: 'Garden', kind: 'amenity', x: 10, y: 10 },
      ],
      routes: [{
        id: 'exit-route',
        name: 'Exit route',
        pointIds: ['exit', 'garden'],
      }],
    } as any;

    cacheVenueMapConfigFromServer(malformedArrivalMap);
    expect(getVenueMapConfig()?.points[0].arrivalRole).toBe('maybe');
    expect(normalizeVenueMapConfig(malformedArrivalMap)?.points[0].arrivalRole).toBe('maybe');
    expect(() => assertVenueMapArrivalRolesResolved(malformedArrivalMap))
      .toThrow(/Invalid or misplaced Entry \/ Exit arrival roles/i);
    expect(() => saveVenueMapConfig(malformedArrivalMap))
      .toThrow(/Invalid or misplaced Entry \/ Exit arrival roles/i);
    expect(getVenueMapConfigForPortal()).toMatchObject({
      points: [expect.objectContaining({ id: 'garden' })],
      routes: [],
    });
    expect(normalizeVenueMapConfigForPortal(malformedArrivalMap)).toMatchObject({
      points: [expect.objectContaining({ id: 'garden' })],
      routes: [],
    });
  });

  it('preserves malformed walkway mobility status for admin repair and fails closed in portals', () => {
    const malformedAccessibilityMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 },
        { id: 'garden', label: 'Garden', kind: 'amenity', x: 10, y: 10 },
      ],
      routes: [{
        id: 'garden-ramp',
        name: 'Garden ramp',
        pointIds: ['gate', 'garden'],
        accessibility: { status: 'step-free' },
        priority: 'standard',
      }],
    } as any;

    const analysis = analyzeVenueMapConfig(malformedAccessibilityMap, { preserveDuplicateIds: true });
    expect(analysis.map?.routes[0].accessibility).toEqual({ status: 'step-free' });
    expect(() => assertVenueMapRouteAccessibilityResolved(malformedAccessibilityMap))
      .toThrow(/Invalid walkway mobility status/i);
    expect(() => saveVenueMapConfig(malformedAccessibilityMap))
      .toThrow(/Invalid walkway mobility status/i);

    cacheVenueMapConfigFromServer(malformedAccessibilityMap);
    expect(getVenueMapConfig()?.routes[0].accessibility).toEqual({ status: 'step-free' });
    expect(normalizeVenueMapConfig(malformedAccessibilityMap)?.routes[0].accessibility).toBe('unknown');
    expect(projectVenueMap(getVenueMapConfig()!, 'couple').routes[0].accessibility).toBe('unknown');
  });

  it('preserves explicit malformed audiences for admin repair and rejects unresolved saves', () => {
    const malformedAudienceMap = {
      ...emptyVenueMapConfig(),
      points: [{ id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5, audience: 'vip' }],
      routes: [{
        id: 'walkway',
        name: 'Walkway',
        pointIds: ['gate', 'gate'],
        audience: null,
        accessibility: 'unknown',
        priority: 'standard',
      }],
      drawings: [{
        id: 'zone',
        type: 'zone',
        x: 5,
        y: 5,
        width: 10,
        height: 10,
        audience: { tier: 'private' },
      }],
    } as any;

    const analysis = analyzeVenueMapConfig(malformedAudienceMap, { preserveDuplicateIds: true });
    expect(analysis.map?.points[0].audience).toBe('vip');
    expect(analysis.map?.routes[0].audience).toBeNull();
    expect(analysis.map?.drawings?.[0].audience).toEqual({ tier: 'private' });
    expect(() => assertVenueMapAudiencesResolved(malformedAudienceMap))
      .toThrow(/Invalid point, walkway, or shape visibility/i);
    expect(() => saveVenueMapConfig(malformedAudienceMap))
      .toThrow(/Invalid point, walkway, or shape visibility/i);

    cacheVenueMapConfigFromServer(malformedAudienceMap);
    expect(getVenueMapConfig()?.points[0].audience).toBe('vip');
    expect(getVenueMapConfig()?.routes[0].audience).toBeNull();
    expect(getVenueMapConfig()?.drawings?.[0].audience).toEqual({ tier: 'private' });

    const normalized = normalizeVenueMapConfig(malformedAudienceMap);
    expect(normalized!.points[0].audience).toBe('staff');
    expect(normalized!.routes[0].audience).toBe('staff');
    expect(normalized!.drawings?.[0].audience).toBe('staff');
    expect(projectVenueMap(getVenueMapConfig()!, 'couple')).toMatchObject({
      points: [],
      routes: [],
      drawings: [],
    });
  });

  it('preserves invalid GPS pairs for admin repair and strips them only from portals', () => {
    const malformedGpsMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'partial', label: 'Partial GPS', kind: 'entry', x: 5, y: 5, lat: 35.22 },
        { id: 'range', label: 'Out of range', kind: 'parking', x: 10, y: 10, lat: 95, lng: -80.8 },
        { id: 'malformed', label: 'Malformed GPS', kind: 'amenity', x: 15, y: 15, lat: 'north', lng: null },
        { id: 'valid', label: 'Valid GPS', kind: 'entry', x: 20, y: 20, lat: 35.1, lng: -80.9 },
      ],
    } as any;

    const analysis = analyzeVenueMapConfig(malformedGpsMap, { preserveDuplicateIds: true });
    expect(analysis.map?.points).toEqual([
      expect.objectContaining({ id: 'partial', lat: 35.22, lng: undefined }),
      expect.objectContaining({ id: 'range', lat: 95, lng: -80.8 }),
      expect.objectContaining({ id: 'malformed', lat: 'north', lng: null }),
      expect.objectContaining({ id: 'valid', lat: 35.1, lng: -80.9 }),
    ]);
    expect(venueMapHasInvalidPointGps(malformedGpsMap)).toBe(true);
    expect(() => assertVenueMapPointGpsResolved(malformedGpsMap))
      .toThrow(/Invalid, partial, or out-of-range GPS/i);
    expect(() => saveVenueMapConfig(malformedGpsMap))
      .toThrow(/Invalid, partial, or out-of-range GPS/i);

    cacheVenueMapConfigFromServer(malformedGpsMap);
    expect(getVenueMapConfig()?.points).toEqual([
      expect.objectContaining({ id: 'partial', lat: 35.22, lng: undefined }),
      expect.objectContaining({ id: 'range', lat: 95, lng: -80.8 }),
      expect.objectContaining({ id: 'malformed', lat: 'north', lng: null }),
      expect.objectContaining({ id: 'valid', lat: 35.1, lng: -80.9 }),
    ]);

    for (const portalMap of [
      normalizeVenueMapConfigForPortal(malformedGpsMap),
      projectVenueMap(getVenueMapConfig()!, 'staff'),
    ]) {
      expect(portalMap?.points).toEqual([
        expect.objectContaining({ id: 'partial', lat: undefined, lng: undefined }),
        expect.objectContaining({ id: 'range', lat: undefined, lng: undefined }),
        expect.objectContaining({ id: 'malformed', lat: undefined, lng: undefined }),
        expect.objectContaining({ id: 'valid', lat: 35.1, lng: -80.9 }),
      ]);
    }
  });

  it('retains structurally malformed occurrences in a separate admin-only recovery layer', () => {
    const malformed = {
      ...emptyVenueMapConfig(),
      points: [null, { id: '', label: 'Mystery point', kind: 'secret', x: 1, y: 2 }],
      routes: [{ name: 'Unnamed-ID walkway', pointIds: ['a', 'b'] }],
      drawings: [
        { type: 'zone', x: 1, y: 1, width: 2, height: 2, text: 'Missing ID' },
        42,
      ],
      rainContingencies: [
        { id: 'missing-backup', outdoorVenueId: 'garden' },
        { id: 'self-pair', outdoorVenueId: 'garden', indoorVenueId: 'garden' },
      ],
    };
    const analysis = analyzeVenueMapConfig(malformed, { preserveDuplicateIds: true });

    expect(analysis.structuralRecoveryArtifacts).toHaveLength(6);
    expect(analysis.structuralRecoveryArtifacts.map((artifact) => artifact.family)).toEqual([
      'point', 'point', 'route', 'drawing', 'drawing', 'rainContingency',
    ]);
    expect(analysis.map?.points).toEqual([]);
    expect(analysis.map?.routes).toEqual([]);
    expect(analysis.map?.drawings).toEqual([]);
    expect(analysis.map?.rainContingencies).toEqual([
      expect.objectContaining({ id: 'self-pair' }),
    ]);

    cacheVenueMapConfigFromServer(malformed);
    const cached = getVenueMapConfig();
    expect(getVenueMapStructuralRecoveryArtifacts(cached)).toHaveLength(6);
    expect(() => assertVenueMapStructuralRecoveryResolved(cached)).toThrow(/explicitly reconstructed or removed/i);

    saveVenueMapConfig({ ...cached!, rainContingencies: [] });
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([]);
  });

  it('never truncates malformed identities and preserves their recovery candidates exactly', () => {
    const overlongPointId = `point-${'p'.repeat(VENUE_MAP_MAX_IDENTIFIER_LENGTH)}`;
    const overlongRouteId = `route-${'r'.repeat(VENUE_MAP_MAX_IDENTIFIER_LENGTH)}`;
    const overlongDrawingId = `shape-${'s'.repeat(VENUE_MAP_MAX_IDENTIFIER_LENGTH)}`;
    const overlongRainId = `rain-${'c'.repeat(VENUE_MAP_MAX_IDENTIFIER_LENGTH)}`;
    const overlongLabel = 'Gate '.repeat(60);
    const overlongGuidance = 'Keep left. '.repeat(120);
    const malformed = {
      ...emptyVenueMapConfig(),
      points: [
        {
          id: overlongPointId,
          label: overlongLabel,
          description: overlongGuidance,
          kind: 'entry',
          x: 4,
          y: 5,
        },
        { id: 'safe-a', label: 'Parking', kind: 'parking', x: 10, y: 10 },
        { id: 'safe-b', label: 'Ballroom', kind: 'amenity', x: 20, y: 20 },
      ],
      routes: [
        { id: overlongRouteId, name: 'Malformed ID route', pointIds: ['safe-a', 'safe-b'] },
        { id: 'broken-reference', name: 'Broken reference', pointIds: ['safe-a', overlongPointId] },
      ],
      drawings: [{
        id: overlongDrawingId,
        type: 'circle',
        x: 30,
        y: 30,
        radius: 5,
      }],
      rainContingencies: [{
        id: overlongRainId,
        outdoorVenueId: 'garden',
        indoorVenueId: 'hall',
      }],
    };

    const analysis = analyzeVenueMapConfig(malformed, { preserveDuplicateIds: true });
    expect(analysis.map?.points.map((point) => point.id)).toEqual(['safe-a', 'safe-b']);
    expect(analysis.map?.routes).toEqual([
      expect.objectContaining({
        id: 'broken-reference',
        pointIds: ['safe-a', overlongPointId],
      }),
    ]);
    expect(analysis.map?.drawings).toEqual([]);
    expect(analysis.map?.rainContingencies).toEqual([]);
    expect(analysis.structuralRecoveryArtifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'point',
        candidate: expect.objectContaining({
          id: overlongPointId,
          label: overlongLabel,
          description: overlongGuidance,
        }),
      }),
      expect.objectContaining({
        family: 'route',
        candidate: expect.objectContaining({ id: overlongRouteId }),
      }),
      expect.objectContaining({
        family: 'drawing',
        candidate: expect.objectContaining({ id: overlongDrawingId }),
      }),
      expect.objectContaining({
        family: 'rainContingency',
        candidate: expect.objectContaining({ id: overlongRainId }),
      }),
    ]));

    cacheVenueMapConfigFromServer(malformed);
    const cached = getVenueMapConfig();
    expect(cached?.routes[0].pointIds[1]).toBe(overlongPointId);
    expect(getVenueMapStructuralRecoveryArtifacts(cached)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        family: 'point',
        candidate: expect.objectContaining({
          id: overlongPointId,
          label: overlongLabel,
          description: overlongGuidance,
        }),
      }),
      expect.objectContaining({
        family: 'route',
        candidate: expect.objectContaining({ id: overlongRouteId }),
      }),
      expect.objectContaining({
        family: 'drawing',
        candidate: expect.objectContaining({ id: overlongDrawingId }),
      }),
      expect.objectContaining({
        family: 'rainContingency',
        candidate: expect.objectContaining({ id: overlongRainId }),
      }),
    ]));
    expect(projectVenueMap(cached!, 'guest').routes).toEqual([]);
    expect(() => assertVenueMapIdentifiersValid(malformed)).toThrow(/limit is 200/i);
    expect(() => saveVenueMapConfig(malformed as any)).toThrow(/identifiers must be explicitly repaired/i);
  });

  it('defaults genuinely omitted legacy dimensions without quarantining the map', () => {
    const analysis = analyzeVenueMapConfig({
      points: [],
      routes: [],
      drawings: [],
      rainContingencies: [],
    }, { preserveDuplicateIds: true });

    expect(analysis.map).toMatchObject({ width: 100, height: 80 });
    expect(analysis.structuralRecoveryArtifacts).toEqual([]);
    expect(venueMapFrameIssue(analysis.map)).toBeNull();
    expect(normalizeVenueMapConfigForPortal({ points: [], routes: [] }))
      .toMatchObject({ width: 100, height: 80 });
  });

  it('quarantines an explicitly invalid whole map frame until it is accepted', () => {
    const malformedFrame = {
      ...emptyVenueMapConfig(),
      width: 900,
      height: '80',
      points: [{ id: 'gate', label: 'Gate', kind: 'entry', x: 50, y: 40 }],
    };

    const analysis = analyzeVenueMapConfig(malformedFrame, { preserveDuplicateIds: true });
    expect(analysis.map).toMatchObject({ width: 500, height: 80 });
    expect(analysis.structuralRecoveryArtifacts).toEqual([
      expect.objectContaining({
        key: 'map:frame',
        family: 'map',
        mapFrameMalformed: true,
        issues: expect.arrayContaining([
          expect.stringMatching(/map width/i),
          expect.stringMatching(/map height/i),
        ]),
      }),
    ]);
    expect(() => saveVenueMapConfig(malformedFrame as any)).toThrow(/Invalid map width or height/i);
    expect(normalizeVenueMapConfigForPortal(malformedFrame)).toBeNull();

    cacheVenueMapConfigFromServer(malformedFrame);
    const recoveryMap = getVenueMapConfig();
    expect(recoveryMap).toMatchObject({ width: 500, height: 80 });
    expect(getVenueMapConfigForPortal()).toBeNull();
    expect(() => assertVenueMapStructuralRecoveryResolved(recoveryMap)).toThrow(/explicitly accepted or reset/i);

    const envelope = getVenueMapStructuralRecoveryForBackup();
    expect(envelope.artifacts).toEqual([
      expect.objectContaining({ mapFrameMalformed: true }),
    ]);
    saveVenueMapConfig(recoveryMap!);
    expect(getVenueMapConfigForPortal()).not.toBeNull();
    restoreVenueMapStructuralRecoveryFromBackup(envelope);
    expect(getVenueMapConfigForPortal()).toBeNull();
  });

  it('quarantines an over-budget map as a whole and keeps its exact source admin-recoverable', () => {
    const oversizedMap = {
      ...emptyVenueMapConfig(),
      points: Array.from({ length: VENUE_MAP_MAX_POINTS + 1 }, (_, index) => ({
        id: `point-${index}`,
        label: `Point ${index}`,
        kind: 'entry' as const,
        x: index % 100,
        y: index % 80,
      })),
    };

    const analysis = analyzeVenueMapConfig(oversizedMap, { preserveDuplicateIds: true });
    expect(analysis.map).toMatchObject({ points: [], routes: [], drawings: [] });
    expect(analysis.structuralRecoveryArtifacts).toEqual([
      expect.objectContaining({ family: 'map', mapComplexityExceeded: true }),
    ]);
    expect(analysis.quarantinedMap).toEqual(oversizedMap);
    expect(normalizeVenueMapConfigForPortal(oversizedMap)).toBeNull();
    expect(() => assertVenueMapComplexityWithinBudget(oversizedMap))
      .toThrow(/complexity budget/i);
    expect(() => saveVenueMapConfig(oversizedMap)).toThrow(/complexity budget/i);

    cacheVenueMapConfigFromServer(oversizedMap);
    expect(getVenueMapConfig()?.points).toEqual([]);
    expect(getVenueMapConfigForPortal()).toBeNull();
    expect(getQuarantinedVenueMapForRecovery()).toEqual(oversizedMap);
    const envelope = getVenueMapStructuralRecoveryForBackup();
    expect(envelope).toEqual(expect.objectContaining({
      quarantinedMap: oversizedMap,
      quarantinedMapFingerprint: expect.stringMatching(/^map-v1:/),
    }));
    expect(venueMapStructuralRecoveryBackupIssue({
      ...envelope,
      quarantinedMap: { ...oversizedMap, points: oversizedMap.points.slice(0, -1) },
    }, getVenueMapConfig())).toMatch(/malformed/i);
    expect(() => assertVenueMapStructuralRecoveryResolved())
      .toThrow(/oversized Venue Map/i);
  });

  it('quarantines and preserves an oversized malformed root before structural normalization', () => {
    const oversizedRoot = 'x'.repeat(VENUE_MAP_MAX_SERIALIZED_BYTES);

    const analysis = analyzeVenueMapConfig(oversizedRoot);
    expect(analysis.map).toMatchObject({ points: [], routes: [], drawings: [] });
    expect(analysis.structuralRecoveryArtifacts).toEqual([
      expect.objectContaining({ family: 'map', mapComplexityExceeded: true }),
    ]);
    expect(analysis.quarantinedMap).toBe(oversizedRoot);
    expect(normalizeVenueMapConfigForPortal(oversizedRoot)).toBeNull();
    expect(() => assertVenueMapComplexityWithinBudget(oversizedRoot))
      .toThrow(/complexity budget/i);

    cacheVenueMapConfigFromServer(oversizedRoot);
    expect(getVenueMapConfigForPortal()).toBeNull();
    expect(getQuarantinedVenueMapForRecovery()).toBe(oversizedRoot);
    expect(getVenueMapStructuralRecoveryForBackup()).toEqual(expect.objectContaining({
      quarantinedMap: oversizedRoot,
      quarantinedMapFingerprint: expect.stringMatching(/^map-v1:/),
    }));
  });

  it('keeps an oversized recovery source in memory when local storage quota rejects its envelope', () => {
    const oversizedMap = {
      ...emptyVenueMapConfig(),
      points: Array.from({ length: VENUE_MAP_MAX_POINTS + 1 }, (_, index) => ({
        id: `quota-point-${index}`,
        label: `Point ${index}`,
        kind: 'entry' as const,
        x: index % 100,
        y: index % 80,
      })),
    };
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItemWithQuota(
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === STORAGE_KEYS.VENUE_MAP_STRUCTURAL_RECOVERY) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      cacheVenueMapConfigFromServer(oversizedMap);
      expect(localStorage.getItem(STORAGE_KEYS.VENUE_MAP_STRUCTURAL_RECOVERY)).toBeNull();
      expect(getVenueMapConfigForPortal()).toBeNull();
      expect(getQuarantinedVenueMapForRecovery()).toEqual(oversizedMap);
    } finally {
      setItem.mockRestore();
      cacheVenueMapConfigFromServer(emptyVenueMapConfig());
    }
  });

  it('quarantines out-of-frame points and withholds every dependent route', () => {
    const malformedPointMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'outside', label: 'Service gate', kind: 'entry', x: -12, y: 40 },
        { id: 'inside', label: 'Ballroom', kind: 'space', x: 70, y: 40 },
      ],
      routes: [{
        id: 'dependent',
        name: 'Gate to ballroom',
        pointIds: ['outside', 'inside'],
      }],
    };

    const analysis = analyzeVenueMapConfig(malformedPointMap, { preserveDuplicateIds: true });
    expect(analysis.map?.points.map((point) => point.id)).toEqual(['inside']);
    expect(analysis.map?.routes.map((route) => route.id)).toEqual(['dependent']);
    expect(analysis.structuralRecoveryArtifacts).toEqual([
      expect.objectContaining({
        family: 'point',
        occurrenceIndex: 0,
        issues: [expect.stringMatching(/outside the current map frame/i)],
        candidate: expect.objectContaining({ id: 'outside', x: -12, y: 40 }),
      }),
    ]);
    expect(projectVenueMap(analysis.map!, 'couple').points.map((point) => point.id))
      .toEqual(['inside']);
    expect(projectVenueMap(analysis.map!, 'couple').routes).toEqual([]);
    expect(venueMapHasInvalidPointCoordinates(malformedPointMap)).toBe(true);
    expect(() => assertVenueMapPointCoordinatesResolved(malformedPointMap))
      .toThrow(/out-of-frame map-point coordinates/i);
    expect(() => saveVenueMapConfig(malformedPointMap as any))
      .toThrow(/out-of-frame map-point coordinates/i);

    cacheVenueMapConfigFromServer(malformedPointMap);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([
      expect.objectContaining({ family: 'point', candidate: expect.objectContaining({ x: -12 }) }),
    ]);
  });

  it('preserves a point outside a temporary quarantined frame for explicit repair', () => {
    const malformed = {
      ...emptyVenueMapConfig(),
      width: 900,
      points: [{ id: 'far', label: 'Far lawn', kind: 'space', x: 800, y: 40 }],
    };
    const analysis = analyzeVenueMapConfig(malformed, { preserveDuplicateIds: true });

    expect(analysis.structuralRecoveryArtifacts).toEqual([
      expect.objectContaining({ family: 'map', mapFrameMalformed: true }),
      expect.objectContaining({
        family: 'point',
        issues: [expect.stringMatching(/temporary recovery map frame/i)],
        candidate: expect.objectContaining({ id: 'far', x: 800, y: 40 }),
      }),
    ]);
    expect(analysis.map?.points).toEqual([]);

    cacheVenueMapConfigFromServer(malformed);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([
      expect.objectContaining({ family: 'map', mapFrameMalformed: true }),
      expect.objectContaining({
        family: 'point',
        candidate: expect.objectContaining({ id: 'far', x: 800, y: 40 }),
      }),
    ]);
  });

  it('accepts point coordinates on every inclusive frame edge', () => {
    const edgeMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'origin', label: 'Origin', kind: 'entry', x: 0, y: 0 },
        { id: 'edge', label: 'Edge', kind: 'parking', x: 100, y: 80 },
      ],
    };
    expect(venueMapHasInvalidPointCoordinates(edgeMap)).toBe(false);
    expect(() => assertVenueMapPointCoordinatesResolved(edgeMap)).not.toThrow();
  });

  it.each([
    [{ width: null }, 'width'],
    [{ width: Number.NaN }, 'width'],
    [{ height: Number.POSITIVE_INFINITY }, 'height'],
    [{ width: 19.99 }, 'width'],
    [{ height: 500.01 }, 'height'],
  ])('detects explicit malformed frame values in %j', (patch, field) => {
    expect(venueMapFrameIssue({ ...emptyVenueMapConfig(), ...patch }))
      .toMatch(new RegExp(field, 'i'));
  });

  it('accepts inclusive frame bounds', () => {
    expect(venueMapFrameIssue({ ...emptyVenueMapConfig(), width: 20, height: 500 })).toBeNull();
  });

  it('re-reads structural recovery state changed by another browser tab', () => {
    const malformed = {
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1 }],
    };
    cacheVenueMapConfigFromServer(malformed);
    const safeMap = getVenueMapConfig()!;
    const discoveredEnvelope = localStorage.getItem(STORAGE_KEYS.VENUE_MAP_STRUCTURAL_RECOVERY)!;
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)).toHaveLength(1);

    const resolvedEnvelope = JSON.parse(discoveredEnvelope);
    resolvedEnvelope.data.artifacts = [];
    localStorage.setItem(
      STORAGE_KEYS.VENUE_MAP_STRUCTURAL_RECOVERY,
      JSON.stringify(resolvedEnvelope),
    );
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)).toEqual([]);

    localStorage.setItem(STORAGE_KEYS.VENUE_MAP_STRUCTURAL_RECOVERY, discoveredEnvelope);
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)).toHaveLength(1);
  });

  it('round-trips a compact, fingerprint-bound recovery envelope for admin backups', () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1, injected: 'discard-me' }],
    });
    const safeMap = getVenueMapConfig()!;
    const envelope = getVenueMapStructuralRecoveryForBackup();
    expect(envelope.mapFingerprint).toMatch(/^map-v1:\d+:[0-9a-f]{32}$/);
    expect(envelope.mapFingerprint.length).toBeLessThan(100);
    expect(envelope.artifacts[0].candidate).not.toHaveProperty('injected');

    saveVenueMapConfig(safeMap);
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)).toEqual([]);
    const importedEnvelope = structuredClone(envelope) as any;
    importedEnvelope.artifacts[0].candidate.injected = 'discard-me';
    expect(venueMapStructuralRecoveryBackupIssue(importedEnvelope, safeMap)).toBeNull();
    restoreVenueMapStructuralRecoveryFromBackup(importedEnvelope);
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)).toHaveLength(1);
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)[0].candidate).not.toHaveProperty('injected');

    expect(venueMapStructuralRecoveryBackupIssue(envelope, {
      ...safeMap,
      updatedAt: 'different-revision',
    })).toMatch(/does not match/i);
    expect(venueMapStructuralRecoveryBackupIssue({ ...envelope, artifacts: [] }, {
      ...safeMap,
      points: [{ label: 'Still malformed', kind: 'entry', x: 1, y: 1 }],
    })).toMatch(/omits malformed occurrences/i);
  });

  it('retains a malformed top-level map as a removable admin-only document artifact', () => {
    cacheVenueMapConfigFromServer('not-a-map');

    const safeMap = getVenueMapConfig();
    expect(safeMap).toEqual(expect.objectContaining({ points: [], routes: [], drawings: [] }));
    expect(getVenueMapStructuralRecoveryArtifacts(safeMap)).toEqual([
      expect.objectContaining({
        key: 'map:root',
        family: 'map',
        collectionMalformed: true,
      }),
    ]);
    expect(() => assertVenueMapStructuralRecoveryResolved(safeMap)).toThrow(/explicitly reconstructed or removed/i);
  });

  it('quarantines points whose required map coordinates cannot be interpreted', () => {
    const analysis = analyzeVenueMapConfig({
      ...emptyVenueMapConfig(),
      points: [{ id: 'bad-location', label: 'Mystery', kind: 'entry', x: 'unknown', y: 12 }],
    }, { preserveDuplicateIds: true });

    expect(analysis.map?.points).toEqual([]);
    expect(analysis.structuralRecoveryArtifacts).toEqual([
      expect.objectContaining({
        family: 'point',
        issues: expect.arrayContaining([expect.stringMatching(/horizontal coordinate/i)]),
        candidate: expect.objectContaining({ id: 'bad-location', x: 50, y: 12 }),
      }),
    ]);
  });

  it('preserves broken route order for recovery and never draws or saves a shortcut', () => {
    const brokenMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'parking', label: 'Parking', kind: 'parking', x: 1, y: 1 },
        { id: 'ceremony', label: 'Ceremony', kind: 'space', x: 20, y: 20 },
      ],
      routes: [{
        id: 'arrival',
        name: 'Arrival path',
        pointIds: ['parking', 'deleted-checkpoint', 42, 'ceremony'],
      }],
    };
    const normalized = normalizeVenueMapConfig(brokenMap)!;

    expect(normalized.routes[0].pointIds).toEqual([
      'parking',
      'deleted-checkpoint',
      '__invalid_map_point_reference__',
      'ceremony',
    ]);
    expect(routePolyline(normalized, 'arrival')).toEqual([]);
    expect(() => saveVenueMapConfig(normalized)).toThrow(/point ID|walkway point references/i);
  });

  it('rejects persistence when a walkway overclaims a referenced point audience or event scope', () => {
    const incompatibleMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'parking', label: 'Parking', kind: 'parking' as const, x: 1, y: 1 },
        { id: 'staff-turn', label: 'Service Turn', kind: 'path' as const, x: 10, y: 10, audience: 'staff' as const },
      ],
      routes: [{
        id: 'arrival',
        name: 'Guest arrival',
        audience: 'public' as const,
        pointIds: ['parking', 'staff-turn'],
      }],
    };

    expect(() => assertVenueMapRouteDeliveryCompatible(incompatibleMap))
      .toThrow(/audience or event scope/i);
    expect(() => saveVenueMapConfig(incompatibleMap))
      .toThrow(/audience or event scope/i);
  });

  it('emits one canonical persistence notification for a map save', async () => {
    const handler = vi.fn();
    const off = on('spm_data_changed', handler);

    saveVenueMapConfig(map as any);
    await Promise.resolve();
    off();

    const mapEvents = handler.mock.calls.filter(([detail]) => detail?.type === 'venueMapConfigs');
    expect(mapEvents).toHaveLength(1);
  });

  it('saves and loads venue rules', () => {
    saveVenueRules(['No open flames', 'Quiet after 10pm']);
    expect(getVenueRules().rules).toEqual(['No open flames', 'Quiet after 10pm']);
  });

  it('finds the rain contingency for an outdoor space', () => {
    const contingency = findRainContingency(map as any, 'ceremony');
    expect(contingency?.indoorVenueId).toBe('ballroom');
    expect(findRainContingency(map as any, 'reception')).toBeUndefined();
    expect(findRainContingency({
      ...map,
      rainContingencies: [
        { id: 'first', outdoorVenueId: 'ceremony', indoorVenueId: 'ballroom' },
        { id: 'second', outdoorVenueId: 'ceremony', indoorVenueId: 'reception' },
      ],
    } as any, 'ceremony')).toBeUndefined();
    expect(findRainContingency({
      ...map,
      rainContingencies: [
        { id: 'self', outdoorVenueId: 'ceremony', indoorVenueId: 'ceremony' },
      ],
    } as any, 'ceremony')).toBeUndefined();
  });

  it('returns couple-scoped wayfinding points (selected spaces + parking/entry + backup)', () => {
    const points = coupleWayfindingPoints(map as any, ['ceremony', 'reception']);
    const labels = points.map((point) => point.label);
    expect(labels).toContain('Main Entry');
    expect(labels).toContain('Parking');
    expect(labels).toContain('Ceremony Garden');
    expect(labels).toContain('Reception Hall');
    expect(labels).toContain('Ballroom');
    expect(labels).toContain('Restroom');
    expect(points).toHaveLength(6);
  });

  it('includes couple-visible wayfinding without exposing staff-only points', () => {
    const scopedMap = {
      ...map,
      points: [
        ...map.points,
        { id: 'couple-suite', label: 'Planning Suite', kind: 'amenity', x: 15, y: 15, audience: 'couple', eventSpaceIds: ['ceremony'] },
        { id: 'staff-yard', label: 'Service Yard', kind: 'amenity', x: 16, y: 16, audience: 'staff' },
      ],
    };

    const labels = coupleWayfindingPoints(scopedMap as any, ['ceremony']).map((point) => point.label);
    expect(labels).toContain('Planning Suite');
    expect(labels).not.toContain('Service Yard');
  });

  it('returns no points when there is no map', () => {
    expect(coupleWayfindingPoints(null, ['ceremony'])).toHaveLength(0);
  });

  it('resolves a route polyline to ordered coordinates', () => {
    const polyline = routePolyline(map as any, 'r1');
    expect(polyline).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 30 },
    ]);
    expect(routePolyline(map as any, 'missing')).toHaveLength(0);
  });

  it('defaults empty map config to empty routes', () => {
    expect(emptyVenueMapConfig().routes).toEqual([]);
  });
});

describe('normalizeVenueMapConfig', () => {
  it('rejects non-object map payloads', () => {
    expect(normalizeVenueMapConfig(null)).toBeNull();
    expect(normalizeVenueMapConfig([])).toBeNull();
    expect(normalizeVenueMapConfig('map')).toBeNull();
  });

  it('rebuilds untrusted map JSON from an allowlist and fails closed on invalid point geometry', () => {
    const normalized = normalizeVenueMapConfig({
      width: 900,
      height: -20,
      backgroundImageUrl: 'javascript:alert(1)',
      backgroundOpacity: 99,
      internalVenueNotes: 'do not publish',
      points: [
        {
          id: 'gate',
          label: '  Main Gate  ',
          kind: 'entry',
          x: -5,
          y: 999,
          eventSpaceIds: ['ceremony', 'ceremony'],
          lat: 35.1,
          lng: 181,
          internalNotes: 'staff alarm code',
        },
        { id: 'garden', label: 'Garden', kind: 'space', x: 40, y: 15, venueId: 'ceremony' },
        { id: 'garden', label: 'Duplicate', kind: 'space', x: 1, y: 1 },
        { id: 'bad-kind', label: 'Bad', kind: 'secret', x: 1, y: 1 },
      ],
      routes: [
        {
          id: 'walk',
          name: '  Garden Walk ',
          pointIds: ['gate', 'garden', 'garden', 'missing'],
          accessibility: 'bogus',
          priority: 'bogus',
          internalNotes: 'private route data',
        },
        { id: 'orphan', name: 'Orphan', pointIds: ['gate', 'missing'] },
      ],
      drawings: [
        {
          id: 'zone',
          type: 'zone',
          x: -1,
          y: 500,
          width: 800,
          height: 0,
          audience: 'staff',
          fillColor: 'url(https://tracker.example/pixel)',
          strokeColor: '#0f766e',
          points: [{ x: -20, y: 999 }],
          internalNotes: 'security perimeter details',
        },
      ],
      rainContingencies: [
        { id: 'rain', outdoorVenueId: 'ceremony', indoorVenueId: 'hall', note: '  Use hall. ' },
        { id: 'broken', outdoorVenueId: '', indoorVenueId: 'hall' },
      ],
      updatedAt: '2026-09-05T12:00:00.000Z',
    } as any);

    expect(normalized).not.toBeNull();
    expect(normalized).toMatchObject({
      width: 500,
      height: 20,
      backgroundImageUrl: undefined,
      backgroundOpacity: undefined,
      updatedAt: '2026-09-05T12:00:00.000Z',
    });
    expect(normalized?.points).toHaveLength(1);
    expect(normalized?.points[0]).toEqual({
      id: 'garden',
      label: 'Garden',
      description: undefined,
      x: 40,
      y: 15,
      kind: 'space',
      audience: 'public',
      eventSpaceIds: undefined,
      venueId: 'ceremony',
      lat: undefined,
      lng: undefined,
    });
    expect(normalized?.points[0]).not.toHaveProperty('internalNotes');
    expect(normalized?.routes).toEqual([
      expect.objectContaining({
        id: 'walk',
        name: 'Garden Walk',
        pointIds: ['gate', 'garden', 'garden', 'missing'],
        accessibility: 'unknown',
        priority: INVALID_VENUE_MAP_ROUTE_PRIORITY,
        audience: 'public',
      }),
      expect.objectContaining({
        id: 'orphan',
        name: 'Orphan',
        pointIds: ['gate', 'missing'],
      }),
    ]);
    expect(normalized?.routes[0]).not.toHaveProperty('internalNotes');
    expect(projectVenueMap(normalized!, 'couple').routes).toEqual([]);
    // Unsafe SVG paint now withholds the whole shape instead of silently
    // dropping the paint value and publishing a differently styled zone.
    expect(normalized?.drawings).toEqual([]);
    expect(normalized?.rainContingencies).toEqual([
      { id: 'rain', outdoorVenueId: 'ceremony', indoorVenueId: 'hall', note: 'Use hall.' },
    ]);
    expect(normalized).not.toHaveProperty('internalVenueNotes');
  });

  it('canonicalizes kind-dependent point fields and uses one blank-label fallback', () => {
    const noncanonical = {
      ...emptyVenueMapConfig(),
      points: [
        {
          id: 'former-space',
          label: '   ',
          kind: 'parking',
          x: 5,
          y: 5,
          venueId: 'garden',
        },
        {
          id: 'garden-space',
          label: 'Garden',
          kind: 'space',
          x: 20,
          y: 20,
          venueId: 'garden',
          eventSpaceIds: ['ballroom'],
        },
      ],
    };

    const normalized = normalizeVenueMapConfig(noncanonical)!;
    expect(normalized.points[0]).toMatchObject({ label: 'Point', kind: 'parking' });
    expect(normalized.points[0].venueId).toBeUndefined();
    expect(normalized.points[1].eventSpaceIds).toBeUndefined();
    expect(() => assertVenueMapPointKindFieldsCanonical(noncanonical))
      .toThrow(/current point kind/i);
    expect(() => assertVenueMapPointKindFieldsCanonical(normalized)).not.toThrow();
  });

  it('distinguishes omitted legacy route priority from an explicitly malformed priority', () => {
    const normalized = normalizeVenueMapConfig({
      width: 100,
      height: 80,
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 },
        { id: 'lawn', label: 'Lawn', kind: 'space', venueId: 'garden', x: 50, y: 40 },
      ],
      routes: [
        { id: 'legacy', name: 'Legacy route', pointIds: ['gate', 'lawn'] },
        { id: 'bad-string', name: 'Bad string', pointIds: ['gate', 'lawn'], priority: 'emergency' },
        { id: 'bad-null', name: 'Bad null', pointIds: ['gate', 'lawn'], priority: null },
      ],
      drawings: [],
      rainContingencies: [],
    }, { preserveDuplicateIds: true });

    expect(normalized?.routes.map((route) => route.priority)).toEqual([
      'standard',
      INVALID_VENUE_MAP_ROUTE_PRIORITY,
      INVALID_VENUE_MAP_ROUTE_PRIORITY,
    ]);
    expect(projectVenueMap(normalized!, 'guest', ['garden']).routes.map((route) => route.id))
      .toEqual(['legacy']);
    expect(() => saveVenueMapConfig(normalized!)).toThrow(/Invalid walkway priorities/i);
    expect(() => assertVenueMapRoutePrioritiesResolved(normalized))
      .toThrow(/Invalid walkway priorities/i);
    expect(() => assertVenueMapRoutePrioritiesResolved({
      ...normalized,
      routes: [normalized!.routes[0]],
    })).not.toThrow();
  });

  it('fails closed for explicitly malformed audience and event-scope metadata', () => {
    const normalized = normalizeVenueMapConfig({
      width: 100,
      height: 80,
      points: [
        { id: 'legacy-missing', label: 'Legacy missing audience', kind: 'amenity', x: 0, y: 0 },
        { id: 'bad-audience', label: 'Bad audience', kind: 'amenity', x: 1, y: 1, audience: 'everyone' },
        { id: 'null-audience', label: 'Null audience', kind: 'amenity', x: 1, y: 2, audience: null },
        { id: 'blank-audience', label: 'Blank audience', kind: 'amenity', x: 1, y: 3, audience: '' },
        { id: 'null-scope', label: 'Null scope', kind: 'amenity', x: 2, y: 1, eventSpaceIds: null },
        { id: 'bad-scope', label: 'Bad scope', kind: 'amenity', x: 2, y: 2, eventSpaceIds: 'ceremony' },
      ],
      routes: [],
      rainContingencies: [],
    });

    expect(normalized?.points[0].audience).toBe('public');
    expect(normalized?.points.slice(1, 4).map((point) => point.audience)).toEqual([
      'staff',
      'staff',
      'staff',
    ]);
    expect(normalized?.points.slice(4, 6).map((point) => point.eventSpaceIds)).toEqual([
      ['__invalid_event_scope__'],
      ['__invalid_event_scope__'],
    ]);
    const projectedIds = projectVenueMap(
      normalized!,
      'guest',
      ['__invalid_event_scope__'],
    ).points.map((point) => point.id);
    expect(projectedIds).not.toContain('null-scope');
    expect(projectedIds).not.toContain('bad-scope');
  });

  it('keeps one distinct indoor backup per outdoor space', () => {
    const normalized = normalizeVenueMapConfig({
      width: 100,
      height: 80,
      points: [],
      routes: [],
      drawings: [],
      rainContingencies: [
        { id: 'first', outdoorVenueId: 'garden', indoorVenueId: 'hall' },
        { id: 'duplicate-source', outdoorVenueId: 'garden', indoorVenueId: 'barn' },
        { id: 'self-backup', outdoorVenueId: 'pavilion', indoorVenueId: 'pavilion' },
        { id: 'second', outdoorVenueId: 'terrace', indoorVenueId: 'barn' },
      ],
    });

    expect(normalized?.rainContingencies).toEqual([
      { id: 'first', outdoorVenueId: 'garden', indoorVenueId: 'hall', note: undefined },
      { id: 'second', outdoorVenueId: 'terrace', indoorVenueId: 'barn', note: undefined },
    ]);
  });

  it('preserves colliding rain plans for admin recovery and refuses to save them', () => {
    const collidingMap = {
      ...emptyVenueMapConfig(),
      rainContingencies: [
        { id: 'duplicate', outdoorVenueId: 'garden', indoorVenueId: 'hall' },
        { id: 'duplicate', outdoorVenueId: 'terrace', indoorVenueId: 'barn' },
        { id: 'other', outdoorVenueId: 'terrace', indoorVenueId: 'hall' },
      ],
    };

    expect(normalizeVenueMapConfig(collidingMap)?.rainContingencies).toHaveLength(2);
    expect(normalizeVenueMapConfig(
      collidingMap,
      { preserveDuplicateIds: true },
    )?.rainContingencies).toHaveLength(3);
    cacheVenueMapConfigFromServer(collidingMap);
    expect(getVenueMapConfig()?.rainContingencies).toHaveLength(3);
    expect(() => saveVenueMapConfig(collidingMap)).toThrow(/competing rain plans/i);
    expect(getVenueMapConfig()?.rainContingencies).toHaveLength(3);
  });

  it('preserves server-authored base-image availability only for portal reads', () => {
    const base = {
      width: 100,
      height: 80,
      points: [],
      routes: [],
      rainContingencies: [],
      backgroundImageUnavailable: true,
    };
    expect(normalizeVenueMapConfig(base)?.backgroundImageUnavailable).toBeUndefined();
    expect(normalizeVenueMapConfig(
      base,
      { preservePortalStatus: true },
    )?.backgroundImageUnavailable).toBe(true);
  });

  it('keeps supported private, HTTPS, and inline raster background references', () => {
    const base = { width: 100, height: 80, points: [], routes: [], rainContingencies: [] };
    expect(normalizeVenueMapConfig({ ...base, backgroundImageUrl: 'sp://venue-map-images/org/map.png' })?.backgroundImageUrl)
      .toBe('sp://venue-map-images/org/map.png');
    expect(normalizeVenueMapConfig({ ...base, backgroundImageUrl: 'https://cdn.example/map.webp' })?.backgroundImageUrl)
      .toBe('https://cdn.example/map.webp');
    expect(normalizeVenueMapConfig({ ...base, backgroundImageUrl: 'data:image/png;base64,AA==' })?.backgroundImageUrl)
      .toBe('data:image/png;base64,AA==');
  });
});
