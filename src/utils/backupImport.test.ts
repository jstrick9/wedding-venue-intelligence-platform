import { on } from './appEvents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  getConfig: () => ({
    venueName: 'Seven Paths Manor',
    tagline: 'Where Your Love Story Unfolds',
    location: 'Spring Hope, NC',
    websiteUrl: 'https://www.sevenpathsmanor.com',
    supportEmail: 'events@sevenpathsmanor.com',
    logoUrl: '',
    primaryColor: '#4A1942',
    primaryDark: '#3d1a45',
    primaryLight: '#6b2c5c',
    accentColor: '#8B5A8B',
    backgroundColor: '#f3f4f6',
    textColor: '#1f2937',
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFontFamily: 'Inter, system-ui, sans-serif',
    headerTextColor: '#FFFFFF',
    bodyTextColor: '#374151',
    accentTextColor: '#4A1942',
  }),
}));

vi.mock('../hooks/useLayoutState', () => ({
  getVenues: () => [
    {
      id: 'v1',
      name: 'Venue 1',
      width: 50,
      height: 40,
      capacity: 100,
      category: 'reception',
    },
  ],
  getTableSpecs: () => [
    {
      id: 't1',
      name: 'Table 1',
      shape: 'rectangle',
      width: 6,
      height: 3,
      capacity: 8,
    },
  ],
  getFixtureTypes: () => [
    {
      id: 'f1',
      name: 'Fixture 1',
      shape: 'rectangle',
      width: 4,
      height: 4,
    },
  ],
  getGuidelines: () => [{ id: 'g1', title: 'Guideline 1' }],
  getTemplates: () => [
    {
      id: 'tpl1',
      name: 'Template 1',
      venueId: 'v1',
      tables: [],
      fixtures: [],
      category: 'reception',
      createdAt: new Date().toISOString(),
    },
  ],
  getUsers: () => [
    {
      id: 'u1',
      username: 'admin',
      name: 'Admin User',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ],
  getSavedLayouts: () => [{ id: 'l1', name: 'Layout 1' }],
  getDecorItems: () => [
    {
      id: 'd1',
      name: 'Decor Item 1',
      categoryId: 'c1',
      width: 1,
      height: 1,
    },
  ],
  getDecorCategories: () => [{ id: 'dc1', name: 'Decor Category 1' }],
  getDecorArrangements: () => [
    {
      id: 'da1',
      name: 'Decor Arrangement 1',
      userId: 'u1',
      baseType: 'table',
      items: [{ decorItemId: 'd1' }],
      createdAt: new Date().toISOString(),
    },
  ],
  getDecorPackages: () => [
    {
      id: 'dp1',
      name: 'Decor Package 1',
      style: 'Modern',
      arrangements: [{ arrangementId: 'da1', targetCategory: 'reception' }],
    },
  ],
  getLinenColors: () => [{ id: 'lc1', name: 'White' }],
}));

vi.mock('../data/venueData', () => ({
  getChairSpecs: () => [{ id: 'c1', name: 'Chair 1' }],
  getWallStyles: () => [{ id: 'w1', name: 'Wall 1' }],
  getSpacingSettings: () => ({
    minItemSpacing: 2,
    minWallSpacing: 1,
    minFixtureSpacing: 3,
    minTableSpacing: 3,
    enableCollisionDetection: true,
    showCollisionWarnings: true,
  }),
  getAlignmentSettings: () => ({ enabled: true, snapToGrid: true }),
  getIndoorFeatureTemplates: () => [{ id: 'ift1', name: 'Door' }],
  getOutdoorFeatureTemplates: () => [{ id: 'oft1', name: 'Tree' }],
}));

vi.mock('../hooks/useDirectMessages', () => ({
  getStoredDirectMessages: () => [],
}));

vi.mock('./guestPortal', () => ({
  getGuestPortalConfig: () => null,
  getPortalGuests: () => [],
  getPortalRSVPSubmissions: () => [],
}));

import { buildBackupBundle, buildRedactedExportBundle } from './backupExport';
import {
  cacheVenueMapConfigFromServer,
  emptyVenueMapConfig,
  getQuarantinedVenueMapForRecovery,
  getVenueMapConfig,
  getVenueMapStructuralRecoveryArtifacts,
  saveVenueMapConfig,
  venueMapRecoverySourceIsRedacted,
} from '../services/wayfinding/venueWayfindingService';
import {
  applyBackupPayload,
  getRollbackBackup,
  preflightBackupImport,
  snapshotCurrentProjectForRollback,
} from './backupImport';

async function refreshChecksum(bundle: Awaited<ReturnType<typeof buildBackupBundle>>): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(bundle.payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  bundle.checksums.payloadHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

describe('backup import', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('passes preflight for a valid bundle', async () => {
    const bundle = await buildBackupBundle();
    const report = await preflightBackupImport(bundle);

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('keeps legacy version-1 backups compatible while disclosing missing quarantine metadata', async () => {
    const bundle = await buildBackupBundle();
    bundle.manifest.bundleVersion = 1;
    delete bundle.payload.venueMapStructuralRecovery;
    await refreshChecksum(bundle);

    const report = await preflightBackupImport(bundle);

    expect(report.valid).toBe(true);
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/legacy backup predates portable Venue Map recovery metadata/i),
    ]));
  });

  it('rejects version-2 backups that omit required map quarantine metadata', async () => {
    const bundle = await buildBackupBundle();
    delete bundle.payload.venueMapStructuralRecovery;
    await refreshChecksum(bundle);

    const report = await preflightBackupImport(bundle);

    expect(report.valid).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/missing required Venue Map structural recovery metadata/i),
    ]));
  });

  it('fails preflight when checksum is wrong', async () => {
    const bundle = await buildBackupBundle();
    bundle.checksums.payloadHash = 'bad-hash';

    const report = await preflightBackupImport(bundle);

    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.toLowerCase().includes('checksum'))).toBe(
      true,
    );
  });

  it('applies backup payload into supported storage keys', () => {
    const event = vi.fn();
    const off = on('spm_data_changed', event);

    applyBackupPayload(
      {
        venues: [{ id: 'v1', name: 'Venue 1' }],
        templates: [{ id: 't1', name: 'Template 1' }],
      },
      'replace',
    );

    expect(JSON.parse(localStorage.getItem('spm_venues') || '[]')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('spm_templates') || '[]')).toHaveLength(1);
    expect(event).toHaveBeenCalled();

    off();
  });

  it('restores map quarantine after its matching canonical map and rejects mismatches before mutation', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1 }],
    });
    const bundle = await buildBackupBundle();
    const backedUpMap = bundle.payload.venueMapConfigs;

    saveVenueMapConfig(getVenueMapConfig()!);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([]);
    applyBackupPayload(bundle.payload, 'replace');
    expect(getVenueMapConfig()).toEqual(backedUpMap);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toHaveLength(1);

    const mismatched = structuredClone(bundle.payload) as any;
    mismatched.venueMapStructuralRecovery.mapFingerprint = 'map-v1:0:00000000000000000000000000000000';
    const before = getVenueMapConfig();
    expect(() => applyBackupPayload(mismatched, 'replace')).toThrow(/does not match/i);
    expect(getVenueMapConfig()).toEqual(before);
  });

  it('restores an out-of-frame point candidate against its matching wide map', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      width: 500,
      height: 400,
      points: [
        { id: 'outside', label: 'Wrong gate', kind: 'entry', x: 600, y: 450 },
        { id: 'inside', label: 'Ballroom', kind: 'amenity', x: 250, y: 200 },
      ],
      routes: [{ id: 'dependent', name: 'Arrival path', pointIds: ['outside', 'inside'] }],
    });
    const bundle = await buildBackupBundle();

    localStorage.clear();
    applyBackupPayload(bundle.payload, 'replace');

    expect(getVenueMapConfig()).toMatchObject({
      width: 500,
      height: 400,
      points: [expect.objectContaining({ id: 'inside' })],
      routes: [expect.objectContaining({ id: 'dependent', pointIds: ['outside', 'inside'] })],
    });
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([
      expect.objectContaining({
        family: 'point',
        candidate: expect.objectContaining({ id: 'outside', x: 600, y: 450 }),
      }),
    ]);
  });

  it('restores a fingerprint-bound whole-map complexity recovery source after its safe map', async () => {
    const oversizedMap = {
      ...emptyVenueMapConfig(),
      points: Array.from({ length: 501 }, (_, index) => ({
        id: `point-${index}`,
        label: `Point ${index}`,
        kind: 'entry' as const,
        x: index % 100,
        y: index % 80,
      })),
    };
    cacheVenueMapConfigFromServer(oversizedMap);
    const bundle = await buildBackupBundle();

    localStorage.clear();
    applyBackupPayload(bundle.payload, 'replace');

    expect(getVenueMapConfig()?.points).toEqual([]);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([
      expect.objectContaining({ family: 'map', mapComplexityExceeded: true }),
    ]);
    expect(getQuarantinedVenueMapForRecovery()).toEqual(oversizedMap);
  });

  it('restores an importable secret-redacted oversized recovery source', async () => {
    const oversizedMap = {
      ...emptyVenueMapConfig(),
      token: 'do-not-export',
      access_token: 'also-do-not-export',
      points: Array.from({ length: 501 }, (_, index) => ({
        id: `redacted-point-${index}`,
        label: `Point ${index}`,
        kind: 'entry' as const,
        x: index % 100,
        y: index % 80,
      })),
    };
    cacheVenueMapConfigFromServer(oversizedMap);
    const bundle = await buildRedactedExportBundle();

    localStorage.clear();
    applyBackupPayload(bundle.payload, 'replace');

    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([
      expect.objectContaining({ family: 'map', mapComplexityExceeded: true }),
    ]);
    const recovered = getQuarantinedVenueMapForRecovery() as {
      token?: string;
      access_token?: string;
      points: unknown[];
    };
    expect(recovered).not.toHaveProperty('token');
    expect(recovered).not.toHaveProperty('access_token');
    expect(recovered.points).toHaveLength(501);
    expect(venueMapRecoverySourceIsRedacted()).toBe(true);
  });

  it('restores invalid-frame recovery only after its matching normalized map', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      height: '80',
    });
    const bundle = await buildBackupBundle();
    const backedUpMap = bundle.payload.venueMapConfigs;

    saveVenueMapConfig(getVenueMapConfig()!);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([]);
    applyBackupPayload(bundle.payload, 'replace');

    expect(getVenueMapConfig()).toEqual(backedUpMap);
    expect(getVenueMapStructuralRecoveryArtifacts(getVenueMapConfig())).toEqual([
      expect.objectContaining({ family: 'map', mapFrameMalformed: true }),
    ]);
  });

  it('restores previously-dropped design domains on replace', () => {
    applyBackupPayload(
      {
        chairSpecs: [{ id: 'c1', name: 'Chair 1' }],
        wallStyles: [{ id: 'w1', name: 'Wall 1' }],
        spacingSettings: { minTableSpacing: 3 },
        alignmentSettings: { enabled: true },
        indoorFeatureTemplates: [{ id: 'ift1', name: 'Door' }],
        outdoorFeatureTemplates: [{ id: 'oft1', name: 'Tree' }],
      },
      'replace',
    );

    expect(JSON.parse(localStorage.getItem('spm_chair_specs') || '[]')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('spm_wall_styles') || '[]')).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('spm_spacing_settings') || 'null')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('spm_alignment_settings') || 'null')).toBeTruthy();
    expect(
      JSON.parse(localStorage.getItem('spm_indoor_feature_templates') || '[]'),
    ).toHaveLength(1);
    expect(
      JSON.parse(localStorage.getItem('spm_outdoor_feature_templates') || '[]'),
    ).toHaveLength(1);
  });

  it('merge mode de-duplicates arrays by id and preserves existing records', () => {
    // Seed existing venues.
    applyBackupPayload({ venues: [{ id: 'v1', name: 'Existing' }] }, 'replace');

    // Merge in a duplicate v1 + a new v2.
    applyBackupPayload(
      { venues: [{ id: 'v1', name: 'Changed' }, { id: 'v2', name: 'New' }] },
      'merge',
    );

    const venues = JSON.parse(localStorage.getItem('spm_venues') || '[]');
    expect(venues).toHaveLength(2);
    // In merge mode incoming wins for the duplicate.
    expect(venues.find((v: any) => v.id === 'v1').name).toBe('Changed');
    expect(venues.find((v: any) => v.id === 'v2').name).toBe('New');
  });

  it('stores and retrieves a rollback backup snapshot', async () => {
    await snapshotCurrentProjectForRollback({ id: 'u1', name: 'Jane' });

    const rollback = getRollbackBackup();
    expect(rollback).not.toBeNull();
    expect(rollback?.manifest.app).toBe('seven-paths-manor-layout-planner');
  });

  it('every backup domain is covered by the corruption-recovery registry', async () => {
    const { BACKUP_DOMAINS } = await import('./backupDomains');
    const { RECOVERY_DOMAINS } = await import('./recovery');

    const recoveryKeys = new Set(RECOVERY_DOMAINS.map((d) => d.key));
    const uncovered = BACKUP_DOMAINS.filter(
      (d) => d.recovery && !recoveryKeys.has(d.storageKey),
    );

    expect(uncovered).toEqual([]);
    expect(BACKUP_DOMAINS.findIndex((domain) => domain.key === 'venueMapStructuralRecovery'))
      .toBe(BACKUP_DOMAINS.findIndex((domain) => domain.key === 'venueMapConfigs') + 1);
  });

  it('flags dangling cross-references (template -> missing venue)', async () => {
    const bundle = await buildBackupBundle();
    // Point the template at a venue that does not exist in the payload.
    bundle.payload.templates = [
      {
        id: 'tpl-broken',
        name: 'Broken Template',
        venueId: 'missing-venue',
        tables: [],
        fixtures: [],
        category: 'reception',
        createdAt: new Date().toISOString(),
      },
    ];
    // Recompute the payload checksum so the failure is specifically about the
    // dangling reference rather than a checksum mismatch.
    const bytes = new TextEncoder().encode(JSON.stringify(bundle.payload));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    bundle.checksums.payloadHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const report = await preflightBackupImport(bundle);

    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.toLowerCase().includes('missing venue'))).toBe(
      true,
    );
  });
});