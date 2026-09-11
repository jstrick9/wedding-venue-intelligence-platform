import { describe, expect, it } from 'vitest';
import type { VenueMapConfig } from '../types';
import { preferredVenueMapDirectionsStart } from './venueMapDesigner';

const map: VenueMapConfig = {
  width: 100,
  height: 80,
  points: [
    {
      id: 'gate',
      label: 'Main Gate',
      kind: 'entry',
      arrivalRole: 'guest-arrival',
      x: 10,
      y: 10,
    },
    {
      id: 'parking',
      label: 'Guest Parking',
      kind: 'parking',
      x: 20,
      y: 20,
    },
  ],
  routes: [],
  rainContingencies: [],
  drawings: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('destination-aware automatic directions start', () => {
  it('never falls back to the destination itself when another arrival is available', () => {
    expect(preferredVenueMapDirectionsStart(map.points, {
      map,
      destinationPointId: 'gate',
    })?.id).toBe('parking');
  });

  it('returns no automatic start when the destination is the only arrival', () => {
    expect(preferredVenueMapDirectionsStart([map.points[0]], {
      map: { ...map, points: [map.points[0]] },
      destinationPointId: 'gate',
    })).toBeUndefined();
  });

  it('excludes a destination even when route context is not available', () => {
    expect(preferredVenueMapDirectionsStart(map.points, {
      destinationPointId: 'gate',
    })?.id).toBe('parking');
  });
});
