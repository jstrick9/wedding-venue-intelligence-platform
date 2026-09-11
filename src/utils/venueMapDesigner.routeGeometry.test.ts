import { describe, expect, it } from 'vitest';
import type { Venue, VenueMapConfig } from '../types';
import {
  addMapRoute,
  findVenueMapRoute,
  partitionVenueMapRouteReferenceIntegrity,
  projectVenueMap,
  routePoints,
  venueMapGuestRouteCoverageIssues,
  venueMapHasInvalidRouteGeometry,
  venueMapRouteGeometryIssue,
  venueMapRouteReferenceIssues,
} from './venueMapDesigner';
import {
  assertVenueMapRouteGeometryResolved,
  normalizeVenueMapConfigForPortal,
  routePolyline,
  saveVenueMapConfig,
} from '../services/wayfinding/venueWayfindingService';

const venue: Venue = {
  id: 'garden',
  name: 'Ceremony Garden',
  category: 'outdoor',
  width: 100,
  height: 80,
  capacity: 120,
};

function zeroGeometryMap(): VenueMapConfig {
  return {
    width: 100,
    height: 80,
    updatedAt: '2026-09-10T12:00:00.000Z',
    points: [
      {
        id: 'gate',
        label: 'Main Gate',
        kind: 'entry',
        arrivalRole: 'guest-arrival',
        x: 25,
        y: 25,
      },
      {
        id: 'garden-pin',
        label: 'Ceremony Garden',
        kind: 'space',
        venueId: 'garden',
        x: 25,
        y: 25,
      },
    ],
    routes: [{
      id: 'invisible-ramp',
      name: 'Accessible Garden Walk',
      pointIds: ['gate', 'garden-pin'],
      accessibility: 'step-free',
      priority: 'preferred',
    }],
    drawings: [],
    rainContingencies: [],
  };
}

describe('Venue Map route geometry integrity', () => {
  it('quarantines an invisible route from rendering, routing, projection, and coverage', () => {
    const map = zeroGeometryMap();
    const route = map.routes[0];

    expect(venueMapRouteGeometryIssue(route, map.points)).toMatch(/same map position/i);
    expect(venueMapHasInvalidRouteGeometry(map)).toBe(true);
    expect(venueMapRouteReferenceIssues(route, map.points)).toEqual([{
      index: 1,
      pointId: 'garden-pin',
      reason: 'coincident',
    }]);
    expect(partitionVenueMapRouteReferenceIntegrity(map).quarantinedRoutes)
      .toEqual([route]);
    expect(routePoints(map, route)).toEqual([]);
    expect(routePolyline(map, route.id)).toEqual([]);
    expect(findVenueMapRoute(map, 'gate', 'garden-pin')).toBeNull();
    expect(venueMapGuestRouteCoverageIssues(map, [venue]))
      .toEqual([expect.objectContaining({ kind: 'no-routine-route' })]);
    expect(projectVenueMap(map, 'guest', ['garden'], { venues: [venue] }).routes)
      .toEqual([]);
    expect(normalizeVenueMapConfigForPortal(map)?.routes).toEqual([]);
  });

  it('blocks zero-length route creation and every TypeScript persistence boundary', () => {
    const map = zeroGeometryMap();
    const mapWithoutRoute = { ...map, routes: [] };

    expect(addMapRoute(
      mapWithoutRoute,
      'Invisible route',
      ['gate', 'garden-pin'],
      { accessibility: 'step-free' },
    )).toBe(mapWithoutRoute);
    expect(() => assertVenueMapRouteGeometryResolved(map))
      .toThrow(/at least two different map positions/i);
    expect(() => saveVenueMapConfig(map))
      .toThrow(/at least two different map positions/i);
  });

  it('accepts a route once any stop spans a different coordinate position', () => {
    const map = zeroGeometryMap();
    map.points.splice(1, 0, {
      id: 'same-position-checkpoint',
      label: 'Welcome checkpoint',
      kind: 'path',
      x: 25,
      y: 25,
    });
    map.points[2] = { ...map.points[2], x: 60, y: 40 };
    map.routes[0] = {
      ...map.routes[0],
      pointIds: ['gate', 'same-position-checkpoint', 'garden-pin'],
    };

    expect(venueMapRouteGeometryIssue(map.routes[0], map.points)).toBeNull();
    expect(venueMapRouteReferenceIssues(map.routes[0], map.points)).toEqual([]);
    expect(findVenueMapRoute(map, 'gate', 'garden-pin')).toMatchObject({
      pointIds: ['gate', 'same-position-checkpoint', 'garden-pin'],
    });
    expect(() => assertVenueMapRouteGeometryResolved(map)).not.toThrow();
  });
});
