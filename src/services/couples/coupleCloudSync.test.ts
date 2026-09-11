import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoupleEvent, getCoupleEvents } from './coupleService';
import { addCoupleGuest, getCoupleGuests } from './coupleGuestService';
import {
  cacheVenueMapConfigFromServer,
  emptyVenueMapConfig,
  getVenueMapConfig,
  getVenueMapStructuralRecoveryArtifacts,
  getVenueMapStructuralRecoveryForBackup,
  saveVenueMapConfig,
} from '../wayfinding/venueWayfindingService';
import { INVALID_VENUE_MAP_ROUTE_PRIORITY } from '../../utils/venueMapDesigner';
import {
  buildCouplePortalSnapshot,
  affectsCouplePortalSnapshots,
  hydrateCouplePortalSnapshot,
  isCoupleCloudEnabled,
  resolveAuthoritativePortalVenueMap,
} from './coupleCloudSync';

describe('couple cloud snapshot seam', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('never uses a global browser map while invitation-scoped cloud state is authoritative', () => {
    const cached = { ...emptyVenueMapConfig(), updatedAt: 'cached-other-venue' };
    const remote = { ...emptyVenueMapConfig(), updatedAt: 'invite-scoped' };

    expect(resolveAuthoritativePortalVenueMap(undefined, cached, true)).toBeNull();
    expect(resolveAuthoritativePortalVenueMap(null, cached, true)).toBeNull();
    expect(resolveAuthoritativePortalVenueMap(remote, cached, true)).toBe(remote);
    expect(resolveAuthoritativePortalVenueMap(undefined, cached, false)).toBe(cached);
    expect(resolveAuthoritativePortalVenueMap(null, cached, false)).toBeNull();
  });

  it('builds a snapshot scoped to one couple event', async () => {
    const first = createCoupleEvent({ coupleName: 'First Couple', eventDate: '2027-05-01' });
    const second = createCoupleEvent({ coupleName: 'Second Couple', eventDate: '2027-06-01' });
    addCoupleGuest(first.id, { name: 'First Guest' });
    addCoupleGuest(second.id, { name: 'Second Guest' });

    const snapshot = await buildCouplePortalSnapshot(first.id);
    expect(snapshot).toBeTruthy();
    expect((snapshot?.coupleEvents as Array<{ id: string }>)).toHaveLength(1);
    expect((snapshot?.coupleEvents as Array<{ id: string }>)[0].id).toBe(first.id);
    expect((snapshot?.coupleGuests as Array<{ eventName: string }>)).toHaveLength(1);
    expect((snapshot?.coupleGuests as Array<{ eventName: string }>)[0].eventName).toBe(first.id);
    expect(snapshot).not.toHaveProperty('venueMapStructuralRecovery');
    expect(getCoupleEvents()).toHaveLength(2);
    expect(getCoupleGuests(second.id)).toHaveLength(1);
  });

  it('hydrates a remote couple snapshot without deleting another local couple', async () => {
    const first = createCoupleEvent({ coupleName: 'First Couple', eventDate: '2027-05-01' });
    const second = createCoupleEvent({ coupleName: 'Second Couple', eventDate: '2027-06-01' });
    addCoupleGuest(first.id, { name: 'Remote Guest' });
    const snapshot = await buildCouplePortalSnapshot(first.id);
    expect(snapshot).toBeTruthy();

    hydrateCouplePortalSnapshot(snapshot!);
    expect(getCoupleEvents()).toHaveLength(2);
    expect(getCoupleGuests(first.id)[0].name).toBe('Remote Guest');
    expect(getCoupleGuests(second.id)).toHaveLength(0);
  });

  it('never hydrates admin-only map recovery metadata from a portal snapshot', () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1 }],
    });
    const map = getVenueMapConfig();
    const injected = getVenueMapStructuralRecoveryForBackup();
    injected.artifacts = [];

    hydrateCouplePortalSnapshot({
      venueMapStructuralRecovery: injected,
    }, { notify: false });

    expect(getVenueMapStructuralRecoveryArtifacts(map)).toHaveLength(1);
  });

  it('uses the snapshot event id to clear an authoritative empty scoped domain', () => {
    const event = createCoupleEvent({ coupleName: 'Empty Guest List', eventDate: '2027-05-01' });
    addCoupleGuest(event.id, { name: 'Stale Local Guest' });

    const report = hydrateCouplePortalSnapshot({
      coupleEvents: [event],
      coupleGuests: [],
    }, { notify: false });

    expect(report.failedDomains).toEqual([]);
    expect(getCoupleGuests(event.id)).toEqual([]);
  });

  it('reports rejected cache domains while continuing later hydration', () => {
    const event = createCoupleEvent({ coupleName: 'Quota Couple', eventDate: '2027-05-01' });
    const nativeSetItem = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(this: Storage, key, value) {
      if (key === 'spm_couple_events') throw new DOMException('Full', 'QuotaExceededError');
      return nativeSetItem.call(this, key, value);
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const report = hydrateCouplePortalSnapshot({
        coupleEvents: [event],
        venueRules: { rules: ['Current guidance'], updatedAt: '2026-09-07T00:00:00.000Z' },
      }, { notify: false });
      expect(report.failedDomains).toContain('coupleEvents');
      expect(report.failedDomains).not.toContain('venueRules');
    } finally {
      storage.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('projects an invocation-time map override instead of a realtime-clobbered cache', async () => {
    const event = createCoupleEvent({ coupleName: 'Map Couple', eventDate: '2027-05-01' });
    saveVenueMapConfig({
      width: 100,
      height: 80,
      points: [{ id: 'stale', label: 'Stale map', kind: 'entry', x: 10, y: 10 }],
      routes: [],
      drawings: [],
      rainContingencies: [],
      updatedAt: '2026-09-05T12:00:00.000Z',
    });

    const snapshot = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        width: 100,
        height: 80,
        points: [
          { id: 'new-public', label: 'Newest map', kind: 'entry', x: 20, y: 20 },
          { id: 'new-staff', label: 'Staff only', kind: 'amenity', x: 30, y: 30, audience: 'staff' },
        ],
        routes: [],
        drawings: [],
        rainContingencies: [],
        updatedAt: '2026-09-05T12:01:00.000Z',
      },
    });

    expect((snapshot?.venueMapConfigs as { points: Array<{ id: string }> }).points)
      .toEqual([expect.objectContaining({ id: 'new-public' })]);
    expect((snapshot?.guestVenueMap as { points: Array<{ id: string }> }).points)
      .toEqual([expect.objectContaining({ id: 'new-public' })]);
    expect(getVenueMapConfig()?.points.map((point) => point.id)).toEqual(['stale']);
  });

  it('omits the whole map from Couple and Guest snapshots when its frame is explicitly invalid', async () => {
    const event = createCoupleEvent({ coupleName: 'Frame Safety Couple', eventDate: '2027-05-01' });
    const invalidOverride = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        ...emptyVenueMapConfig(),
        width: '100',
        points: [{ id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 }],
      },
    });

    expect(invalidOverride?.venueMapConfigs).toBeNull();
    expect(invalidOverride?.guestVenueMap).toBeNull();

    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      height: 900,
      points: [{ id: 'parking', label: 'Parking', kind: 'parking', x: 5, y: 5 }],
    });
    const quarantinedLocal = await buildCouplePortalSnapshot(event.id);
    expect(quarantinedLocal?.venueMapConfigs).toBeNull();
    expect(quarantinedLocal?.guestVenueMap).toBeNull();
  });

  it('withholds an over-budget map from both Couple and Guest snapshots', async () => {
    const event = createCoupleEvent({ coupleName: 'Budget Couple', eventDate: '2027-05-01' });
    const snapshot = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        ...emptyVenueMapConfig(),
        points: Array.from({ length: 501 }, (_, index) => ({
          id: `point-${index}`,
          label: `Point ${index}`,
          kind: 'entry' as const,
          x: index % 100,
          y: index % 80,
        })),
      },
    });

    expect(snapshot?.venueMapConfigs).toBeNull();
    expect(snapshot?.guestVenueMap).toBeNull();
  });

  it('omits out-of-frame points and dependent routes from Couple and Guest snapshots', async () => {
    const event = createCoupleEvent({ coupleName: 'Point Safety Couple', eventDate: '2027-05-01' });
    const snapshot = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        ...emptyVenueMapConfig(),
        points: [
          { id: 'outside', label: 'Wrong gate', kind: 'entry', x: -1, y: 10 },
          { id: 'inside', label: 'Parking', kind: 'parking', x: 50, y: 40 },
        ],
        routes: [{
          id: 'dependent',
          name: 'Arrival path',
          pointIds: ['outside', 'inside'],
        }],
      },
    });

    for (const key of ['venueMapConfigs', 'guestVenueMap'] as const) {
      const map = snapshot?.[key] as { points: Array<{ id: string }>; routes: unknown[] };
      expect(map.points.map((point) => point.id)).toEqual(['inside']);
      expect(map.routes).toEqual([]);
    }
  });

  it('preserves classified arrival roles and quarantines malformed role paths in portal snapshots', async () => {
    const event = createCoupleEvent({ coupleName: 'Arrival Role Couple', eventDate: '2027-05-01' });
    const snapshot = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        ...emptyVenueMapConfig(),
        points: [
          { id: 'arrival', label: 'Main Gate', kind: 'entry', arrivalRole: 'both', x: 5, y: 5 },
          { id: 'malformed', label: 'Unknown Gate', kind: 'entry', arrivalRole: 'loading-dock', x: 20, y: 20 },
          { id: 'parking', label: 'Parking', kind: 'parking', x: 50, y: 40 },
        ],
        routes: [
          { id: 'valid', name: 'Main walk', pointIds: ['arrival', 'parking'] },
          { id: 'dependent', name: 'Unknown walk', pointIds: ['malformed', 'parking'] },
        ],
      } as any,
    });

    for (const key of ['venueMapConfigs', 'guestVenueMap'] as const) {
      const map = snapshot?.[key] as {
        points: Array<{ id: string; arrivalRole?: string }>;
        routes: Array<{ id: string }>;
      };
      expect(map.points).toEqual([
        expect.objectContaining({ id: 'arrival', arrivalRole: 'both' }),
        expect.objectContaining({ id: 'parking' }),
      ]);
      expect(map.routes).toEqual([expect.objectContaining({ id: 'valid' })]);
    }
  });

  it('defaults omitted legacy frames in Couple and Guest snapshots', async () => {
    const event = createCoupleEvent({ coupleName: 'Legacy Frame Couple', eventDate: '2027-05-01' });
    const snapshot = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        points: [{ id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 }],
        routes: [],
        drawings: [],
        rainContingencies: [],
      },
    });

    expect(snapshot?.venueMapConfigs).toMatchObject({ width: 100, height: 80 });
    expect(snapshot?.guestVenueMap).toMatchObject({ width: 100, height: 80 });
  });

  it('omits explicitly invalid-priority routes from both Couple and Guest snapshots', async () => {
    const event = createCoupleEvent({ coupleName: 'Route Safety Couple', eventDate: '2027-05-01' });
    const snapshot = await buildCouplePortalSnapshot(event.id, {
      venueMapConfig: {
        ...emptyVenueMapConfig(),
        points: [
          { id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 },
          { id: 'parking', label: 'Parking', kind: 'parking', x: 50, y: 40 },
        ],
        routes: [
          {
            id: 'unsafe',
            name: 'Damaged route',
            pointIds: ['gate', 'parking'],
            priority: INVALID_VENUE_MAP_ROUTE_PRIORITY,
          },
          {
            id: 'legacy',
            name: 'Legacy route',
            pointIds: ['gate', 'parking'],
          },
        ],
      },
    });

    for (const key of ['venueMapConfigs', 'guestVenueMap'] as const) {
      expect((snapshot?.[key] as { routes: Array<{ id: string; priority?: string }> }).routes)
        .toEqual([expect.objectContaining({ id: 'legacy', priority: 'standard' })]);
    }
  });

  it('preserves canonical venue globals during venue-member snapshot hydration', () => {
    saveVenueMapConfig({
      width: 100,
      height: 80,
      points: [
        { id: 'staff-yard', label: 'Service Yard', kind: 'amenity', x: 10, y: 10, audience: 'staff' },
      ],
      routes: [],
      drawings: [],
      rainContingencies: [],
      updatedAt: '2026-09-05T12:00:00.000Z',
    });

    hydrateCouplePortalSnapshot({
      venueMapConfigs: {
        width: 100,
        height: 80,
        points: [{ id: 'guest-gate', label: 'Guest Gate', kind: 'entry', x: 5, y: 5 }],
        routes: [],
        drawings: [],
        rainContingencies: [],
        updatedAt: '2026-09-04T12:00:00.000Z',
      },
    }, {
      notify: false,
      includeGlobalDomains: false,
    });

    expect(getVenueMapConfig()?.points.map((point) => point.id)).toEqual(['staff-yard']);
  });

  it('recognizes map domains as portal-snapshot invalidations', () => {
    expect(affectsCouplePortalSnapshots('venueMapConfigs')).toBe(true);
    expect(affectsCouplePortalSnapshots('spm_venue_map_configs')).toBe(true);
    expect(affectsCouplePortalSnapshots('venueRules')).toBe(true);
    expect(affectsCouplePortalSnapshots('staffTasks')).toBe(false);
  });

  it('stays a no-op until Supabase configuration is enabled', () => {
    expect(isCoupleCloudEnabled()).toBe(false);
  });
});
