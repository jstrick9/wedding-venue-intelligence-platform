import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../platform', () => ({
  getPlatformProvider: () => 'supabase',
}));

const upsert = vi.fn();
const rpc = vi.fn();
let selectedRows: Array<{ domain: string; payload: unknown; updated_at?: string }> | null = null;
const supabaseClient = {
  rpc,
  from: (table: string) => {
    if (table === 'org_data') {
      return {
        upsert: (row: any, opts?: any) => ({ error: upsert(row, opts) }),
        select: () => ({
          eq: () => ({ data: selectedRows, error: null }),
        }),
      };
    }
    return { select: () => ({ eq: () => ({}) }) };
  },
};
vi.mock('../backend/supabaseClient', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => supabaseClient,
}));

// Provide backup-domains data: minimal read/write via localStorage.
vi.mock('../../utils/backupDomains', () => {
  const make = (key: string, defaultValue: unknown = []) => ({
    key,
    storageKey: `test_${key}`,
    defaultValue,
    read: () => JSON.parse(localStorage.getItem(`test_${key}`) || JSON.stringify(defaultValue)),
    write: (v: unknown) => localStorage.setItem(`test_${key}`, JSON.stringify(v)),
  });
  return {
    BACKUP_DOMAINS: [
      make('venues'),
      make('tableSpecs'),
      make('decorItems'),
      make('vendors'),
      make('staffTasks'),
      make('venueMapConfigs', null),
      make('venueMapStructuralRecovery', null),
    ],
  };
});

import { on } from '../../utils/appEvents';
import {
  captureEntityDomainPayload,
  getEntityDomainRevision,
  SupabaseEntityRepository,
  isSyncableDomain,
} from './entityRepository';
import {
  cacheVenueMapConfigFromServer,
  emptyVenueMapConfig,
} from '../wayfinding/venueWayfindingService';

describe('entityRepository (supabase)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: { ok: true, updated_at: '2026-09-06T12:05:00.000Z' },
      error: null,
    });
    localStorage.clear();
    selectedRows = null;
  });

  it('isSyncableDomain recognizes the catalog/asset domains', () => {
    expect(isSyncableDomain('venues')).toBe(true);
    expect(isSyncableDomain('vendors')).toBe(true);
    expect(isSyncableDomain('venueMapStructuralRecovery')).toBe(false);
    expect(isSyncableDomain('config')).toBe(false); // config is not org-scoped syncable
  });

  it('blocks generic map capture while structural recovery decisions are pending', () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1 }],
    });

    expect(() => captureEntityDomainPayload('venueMapConfigs')).toThrow(/explicitly reconstructed or removed/i);

    cacheVenueMapConfigFromServer(emptyVenueMapConfig());
    expect(() => captureEntityDomainPayload('venueMapConfigs')).not.toThrow();
  });

  it('blocks a direct generic map push while structural recovery is pending', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1 }],
    });
    const repo = new SupabaseEntityRepository();

    await expect(repo.pushDomain(
      { organizationId: 'org1', userId: 'u1' },
      'venueMapConfigs',
    )).rejects.toThrow(/explicitly reconstructed or removed/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks a direct canonical map save with an explicit invalid route priority', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry', x: 5, y: 5 },
        { id: 'lawn', label: 'Lawn', kind: 'space', x: 50, y: 40 },
      ],
      routes: [{
        id: 'unsafe',
        name: 'Unsafe route',
        pointIds: ['gate', 'lawn'],
        priority: 'emergency',
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid walkway priorities/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/Invalid walkway priorities/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves with incompatible walkway delivery', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'service', label: 'Service turn', kind: 'path' as const, x: 20, y: 20, audience: 'staff' as const },
      ],
      routes: [{
        id: 'guest-route',
        name: 'Guest route',
        audience: 'public' as const,
        pointIds: ['gate', 'service'],
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/audience or event scope/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/audience or event scope/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves with stale point-kind metadata', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'former-space',
        label: 'Parking',
        kind: 'parking' as const,
        x: 5,
        y: 5,
        venueId: 'garden',
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/current point kind/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/current point kind/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before authored map text can be truncated', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'east-ramp',
        label: 'East ramp',
        description: 'x'.repeat(1001),
        kind: 'entry' as const,
        x: 5,
        y: 5,
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/text must be repaired/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/text must be repaired/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before malformed mobility status can be rewritten', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'garden', label: 'Garden', kind: 'amenity' as const, x: 10, y: 10 },
      ],
      routes: [{
        id: 'garden-ramp',
        name: 'Garden ramp',
        pointIds: ['gate', 'garden'],
        accessibility: 'stepfree',
        priority: 'standard' as const,
      }],
    } as any;

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid walkway mobility status/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/Invalid walkway mobility status/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves for zero-length walkways before RPC', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'gate', label: 'Gate', kind: 'entry' as const, x: 5, y: 5 },
        { id: 'garden', label: 'Garden', kind: 'amenity' as const, x: 5, y: 5 },
      ],
      routes: [{
        id: 'invisible-ramp',
        name: 'Invisible ramp',
        pointIds: ['gate', 'garden'],
        accessibility: 'step-free' as const,
        priority: 'preferred' as const,
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/at least two different map positions/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/at least two different map positions/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before malformed visibility can be rewritten', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'private-gate',
        label: 'Private gate',
        kind: 'entry' as const,
        x: 5,
        y: 5,
        audience: 'vip',
      }],
    } as any;

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid point, walkway, or shape visibility/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/Invalid point, walkway, or shape visibility/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before a partial GPS pair can be erased', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'east-ramp',
        label: 'East ramp',
        kind: 'entry' as const,
        x: 5,
        y: 5,
        lat: 35.22,
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid, partial, or out-of-range GPS/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/Invalid, partial, or out-of-range GPS/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before malformed identifiers can be rewritten', async () => {
    const repo = new SupabaseEntityRepository();
    const overlongId = `point-${'x'.repeat(200)}`;
    const payload = {
      ...emptyVenueMapConfig(),
      points: [{
        id: overlongId,
        label: 'East ramp',
        kind: 'entry' as const,
        x: 5,
        y: 5,
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/identifiers must be explicitly repaired/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/identifiers must be explicitly repaired/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct canonical saves with an explicit invalid map frame', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      width: '100',
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid map width or height/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/Invalid map width or height/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct canonical saves that exceed the Venue Map budget', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: Array.from({ length: 501 }, (_, index) => ({
        id: `point-${index}`,
        label: `Point ${index}`,
        kind: 'entry' as const,
        x: index % 100,
        y: index % 80,
      })),
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/oversized Venue Map|complexity budget/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/complexity budget/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct canonical saves with out-of-frame points', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      points: [{ id: 'outside', label: 'Wrong gate', kind: 'entry', x: 101, y: 20 }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/out-of-frame map-point coordinates/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/out-of-frame map-point coordinates/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct canonical saves with out-of-frame shapes', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'clipped-zone',
        type: 'zone',
        x: 90,
        y: 10,
        width: 20,
        height: 10,
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/out-of-frame geometry/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/out-of-frame geometry/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before shape rotation can be clamped', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'turned-zone',
        type: 'rectangle',
        x: 40,
        y: 30,
        width: 20,
        height: 10,
        rotation: 450,
      }],
    };

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/geometry, rotation, or appearance/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/geometry, rotation, or appearance/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks malformed base configuration and unmanaged cloud image references before RPC', async () => {
    const repo = new SupabaseEntityRepository();
    const malformed = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'javascript:alert(1)',
      backgroundOpacity: 99,
    } as any;

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(malformed));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid base-map source or opacity/i);
    await expect(repo.saveVenueMap(
      { organizationId: '00000000-0000-4000-8000-000000000001', userId: 'u1' },
      malformed,
      null,
    )).rejects.toThrow(/Invalid base-map source or opacity/i);

    const unmanaged = {
      ...emptyVenueMapConfig(),
      backgroundImageUrl: 'https://example.com/map.png',
      backgroundOpacity: 0.8,
    };
    await expect(repo.saveVenueMap(
      { organizationId: '00000000-0000-4000-8000-000000000001', userId: 'u1' },
      unmanaged,
      null,
    )).rejects.toThrow(/managed venue-map storage/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks duplicate-linked venue destination pins before generic or direct cloud writes', async () => {
    const repo = new SupabaseEntityRepository();
    const duplicateLinkedMap = {
      ...emptyVenueMapConfig(),
      points: [
        { id: 'space-a', label: 'Garden A', kind: 'space', venueId: 'garden', x: 10, y: 10 },
        { id: 'space-b', label: 'Garden B', kind: 'space', venueId: 'garden', x: 20, y: 20 },
      ],
    } as any;

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(duplicateLinkedMap));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/only one canonical map pin/i);
    await expect(repo.saveVenueMap(
      { organizationId: '00000000-0000-4000-8000-000000000001', userId: 'u1' },
      duplicateLinkedMap,
      null,
    )).rejects.toThrow(/only one canonical map pin/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks malformed or misplaced arrival roles before generic or direct cloud writes', async () => {
    const repo = new SupabaseEntityRepository();
    const malformedRoleMap = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'legacy-gate',
        label: 'Legacy Gate',
        kind: 'entry',
        arrivalRole: 'loading-dock',
        x: 10,
        y: 10,
      }],
    } as any;

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(malformedRoleMap));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/Invalid or misplaced Entry \/ Exit arrival roles/i);
    await expect(repo.saveVenueMap(
      { organizationId: '00000000-0000-4000-8000-000000000001', userId: 'u1' },
      malformedRoleMap,
      null,
    )).rejects.toThrow(/Invalid or misplaced Entry \/ Exit arrival roles/i);

    const misplacedRoleMap = {
      ...emptyVenueMapConfig(),
      points: [{
        id: 'parking',
        label: 'Guest Parking',
        kind: 'parking',
        arrivalRole: 'guest-arrival',
        x: 10,
        y: 10,
      }],
    } as any;
    await expect(repo.saveVenueMap(
      { organizationId: '00000000-0000-4000-8000-000000000001', userId: 'u1' },
      misplacedRoleMap,
      null,
    )).rejects.toThrow(/Invalid or misplaced Entry \/ Exit arrival roles/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks generic capture and direct saves before malformed shape appearance can be rewritten', async () => {
    const repo = new SupabaseEntityRepository();
    const payload = {
      ...emptyVenueMapConfig(),
      drawings: [{
        id: 'hidden-zone',
        type: 'zone',
        x: 10,
        y: 10,
        width: 20,
        height: 10,
        fillColor: 'url(https://tracker.example/pixel)',
        opacity: -1,
      }],
    } as any;

    localStorage.setItem('test_venueMapConfigs', JSON.stringify(payload));
    expect(() => captureEntityDomainPayload('venueMapConfigs'))
      .toThrow(/geometry, rotation, or appearance/i);

    await expect(repo.saveVenueMap(
      { organizationId: 'org1', userId: 'u1' },
      payload,
      null,
    )).rejects.toThrow(/geometry, rotation, or appearance/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pushDomain upserts the domain into org_data', async () => {
    localStorage.setItem('test_venues', JSON.stringify([{ id: 'v1' }]));
    const repo = new SupabaseEntityRepository();
    await repo.pushDomain({ organizationId: 'org1', userId: 'u1' }, 'venues');

    expect(upsert).toHaveBeenCalledWith(
      { organization_id: 'org1', domain: 'venues', payload: [{ id: 'v1' }] },
      { onConflict: 'organization_id,domain' },
    );
  });

  it('saves the venue map against the revision observed during hydration', async () => {
    selectedRows = [{
      domain: 'venueMapConfigs',
      payload: { points: [] },
      updated_at: '2026-09-06T12:00:00.000Z',
    }];
    const repo = new SupabaseEntityRepository();
    const context = { organizationId: 'org-map-existing', userId: 'u1' };
    const nextMap = {
      ...emptyVenueMapConfig(),
      points: [{ id: 'new', label: 'New point', kind: 'entry', x: 5, y: 5 }],
    };
    await repo.pullAll(context);

    expect(getEntityDomainRevision(context.organizationId, 'venueMapConfigs'))
      .toBe('2026-09-06T12:00:00.000Z');
    await expect(repo.saveVenueMap(
      context,
      nextMap,
      getEntityDomainRevision(context.organizationId, 'venueMapConfigs'),
    )).resolves.toEqual({
      status: 'saved',
      updatedAt: '2026-09-06T12:05:00.000Z',
    });

    expect(rpc).toHaveBeenCalledWith('save_venue_map_config', {
      p_organization_id: 'org-map-existing',
      p_payload: nextMap,
      p_expected_updated_at: '2026-09-06T12:00:00.000Z',
      p_expected_missing: false,
      p_force: false,
    });
  });

  it('represents an observed missing map row separately from an unknown revision', async () => {
    const repo = new SupabaseEntityRepository();
    const context = { organizationId: 'org-map-missing', userId: 'u1' };
    await repo.pullAll(context);
    expect(getEntityDomainRevision(context.organizationId, 'venueMapConfigs')).toBeNull();

    await repo.saveVenueMap(context, { points: [] }, null);
    expect(rpc).toHaveBeenCalledWith(
      'save_venue_map_config',
      expect.objectContaining({
        p_expected_updated_at: null,
        p_expected_missing: true,
      }),
    );
  });

  it('returns the current server map without overwriting it on a revision conflict', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: false,
        error: 'conflict',
        current_payload: { points: [{ id: 'server' }] },
        current_updated_at: '2026-09-06T12:10:00.000Z',
      },
      error: null,
    });
    const repo = new SupabaseEntityRepository();
    const draftMap = {
      ...emptyVenueMapConfig(),
      points: [{ id: 'draft', label: 'Draft point', kind: 'entry', x: 5, y: 5 }],
    };
    await expect(repo.saveVenueMap(
      { organizationId: 'org-map-conflict', userId: 'u1' },
      draftMap,
      '2026-09-06T12:00:00.000Z',
    )).resolves.toEqual({
      status: 'conflict',
      currentPayload: { points: [{ id: 'server' }] },
      currentUpdatedAt: '2026-09-06T12:10:00.000Z',
    });
  });

  it('does not mutate the shared cache when a tenant pull was superseded', async () => {
    localStorage.setItem('test_venues', JSON.stringify([{ id: 'active-venue' }]));
    selectedRows = [{ domain: 'venues', payload: [{ id: 'stale-venue' }] }];

    const repo = new SupabaseEntityRepository();
    const applied = await repo.pullAll(
      { organizationId: 'stale-org', userId: 'stale-user' },
      () => false,
    );

    expect(applied).toBe(false);
    expect(JSON.parse(localStorage.getItem('test_venues') || 'null')).toEqual([
      { id: 'active-venue' },
    ]);
  });

  it('marks pull notifications as backend-originated to prevent pull-push loops', async () => {
    selectedRows = [{ domain: 'venues', payload: [{ id: 'venue-b' }] }];
    const details: unknown[] = [];
    const off = on('spm_data_changed', (detail) => details.push(detail));

    const repo = new SupabaseEntityRepository();
    await repo.pullAll({ organizationId: 'org-b', userId: 'user-b' });
    off();

    expect(details.length).toBeGreaterThan(1);
    expect(details.every((detail) =>
      (detail as { source?: string } | undefined)?.source === 'backend')).toBe(true);
  });

  it('clears domains missing from a new organization instead of retaining another tenant cache', async () => {
    localStorage.setItem('test_venues', JSON.stringify([{ id: 'venue-a' }]));
    localStorage.setItem(
      'test_venueMapConfigs',
      JSON.stringify({ points: [{ id: 'private-map-a' }] }),
    );
    selectedRows = [{ domain: 'venues', payload: [{ id: 'venue-b' }] }];

    const repo = new SupabaseEntityRepository();
    await repo.pullAll({ organizationId: 'org-b', userId: 'user-b' });

    expect(JSON.parse(localStorage.getItem('test_venues') || 'null')).toEqual([
      { id: 'venue-b' },
    ]);
    expect(JSON.parse(localStorage.getItem('test_venueMapConfigs') || 'false')).toBeNull();
  });
});
