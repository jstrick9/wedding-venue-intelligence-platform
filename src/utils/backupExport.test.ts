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
  getVenues: () => [{ id: 'v1', name: 'Venue 1' }],
  getTableSpecs: () => [{ id: 't1', name: 'Table 1' }],
  getFixtureTypes: () => [{ id: 'f1', name: 'Fixture 1' }],
  getGuidelines: () => [{ id: 'g1', title: 'Guideline 1' }],
  getTemplates: () => [{ id: 'tpl1', name: 'Template 1' }],
  getUsers: () => [{ id: 'u1', username: 'admin' }],
  getSavedLayouts: () => [{ id: 'l1', name: 'Layout 1' }],
  getDecorItems: () => [{ id: 'd1', name: 'Decor Item 1' }],
  getDecorCategories: () => [{ id: 'dc1', name: 'Decor Category 1' }],
  getDecorArrangements: () => [{ id: 'da1', name: 'Decor Arrangement 1' }],
  getDecorPackages: () => [{ id: 'dp1', name: 'Decor Package 1' }],
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
  getStoredDirectMessages: () => [{ id: 'm1', message: 'hi' }],
}));

vi.mock('./guestPortal', () => ({
  getGuestPortalConfig: () => ({ eventTitle: 'RSVP' }),
  getPortalGuests: () => [{ id: 'g1', name: 'Guest' }],
  getPortalRSVPSubmissions: () => [{ id: 'r1' }],
}));

import { buildBackupBundle, buildRedactedExportBundle } from './backupExport';
import {
  cacheVenueMapConfigFromServer,
  emptyVenueMapConfig,
  venueMapStructuralRecoveryBackupIssue,
} from '../services/wayfinding/venueWayfindingService';

describe('backup export', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('builds a backup bundle with manifest, summary, and checksum', async () => {
    localStorage.setItem('spm_rsvp_submissions', JSON.stringify([{ id: 'r1' }]));

    const bundle = await buildBackupBundle({ id: 'u1', name: 'Jane' });

    expect(bundle.manifest.app).toBe('seven-paths-manor-layout-planner');
    expect(bundle.manifest.exportedBy?.name).toBe('Jane');
    expect(bundle.manifest.bundleVersion).toBe(2);
    expect(bundle.summary.venueCount).toBe(1);
    expect(bundle.summary.templateCount).toBe(1);
    expect(bundle.summary.userCount).toBe(1);
    expect(bundle.summary.savedLayoutCount).toBe(1);
    expect(bundle.summary.decorItemCount).toBe(1);
    expect(bundle.summary.decorArrangementCount).toBe(1);
    expect(bundle.summary.guestPortalSubmissionCount).toBe(1);
    expect(bundle.checksums.payloadHash).toBeTruthy();
  });

  it('exports versioned domains as unwrapped data (not envelopes)', async () => {
    const bundle = await buildBackupBundle();

    expect(bundle.payload.directMessages).toEqual([{ id: 'm1', message: 'hi' }]);
    expect(bundle.payload.portalConfig).toEqual({ eventTitle: 'RSVP' });
    expect(bundle.payload.portalGuests).toEqual([{ id: 'g1', name: 'Guest' }]);
    expect(bundle.payload.rsvpSubmissions).toEqual([{ id: 'r1' }]);
  });

  it('exports map quarantine metadata separately from the canonical map', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [{ label: 'Missing identity', kind: 'entry', x: 1, y: 1 }],
    });

    const bundle = await buildBackupBundle();

    expect(bundle.payload.venueMapConfigs).toEqual(expect.objectContaining({ points: [] }));
    expect(bundle.payload.venueMapStructuralRecovery).toEqual(expect.objectContaining({
      mapFingerprint: expect.stringMatching(/^map-v1:/),
      artifacts: [expect.objectContaining({ family: 'point' })],
    }));
  });

  it('exports out-of-frame point recovery separately from its safe canonical map', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      points: [
        { id: 'outside', label: 'Wrong gate', kind: 'entry', x: 120, y: 20 },
        { id: 'inside', label: 'Ballroom', kind: 'amenity', x: 60, y: 20 },
      ],
      routes: [{ id: 'dependent', name: 'Arrival path', pointIds: ['outside', 'inside'] }],
    });

    const bundle = await buildBackupBundle();
    expect(bundle.payload.venueMapConfigs).toEqual(expect.objectContaining({
      points: [expect.objectContaining({ id: 'inside' })],
      routes: [expect.objectContaining({ id: 'dependent', pointIds: ['outside', 'inside'] })],
    }));
    expect(bundle.payload.venueMapStructuralRecovery).toEqual(expect.objectContaining({
      artifacts: [expect.objectContaining({
        family: 'point',
        candidate: expect.objectContaining({ id: 'outside', x: 120, y: 20 }),
      })],
    }));
  });

  it('checksum-covers the exact source of a whole-map complexity quarantine', async () => {
    const oversizedMap = {
      ...emptyVenueMapConfig(),
      token: 'admin-only-recovery-secret',
      access_token: 'snake-case-recovery-secret',
      nested: { 'refresh-token': 'hyphenated-recovery-secret', safeLabel: 'retain me' },
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
    expect(bundle.payload.venueMapConfigs).toEqual(expect.objectContaining({ points: [] }));
    expect(bundle.payload.venueMapStructuralRecovery).toEqual(expect.objectContaining({
      artifacts: [expect.objectContaining({ mapComplexityExceeded: true })],
      quarantinedMap: oversizedMap,
      quarantinedMapFingerprint: expect.stringMatching(/^map-v1:/),
    }));
    expect(bundle.checksums.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    const redacted = await buildRedactedExportBundle();
    const recovery = redacted.payload.venueMapStructuralRecovery as {
      quarantinedMap: {
        token?: string;
        access_token?: string;
        nested?: { 'refresh-token'?: string; safeLabel?: string };
      };
      quarantinedMapRedacted?: boolean;
    };
    expect(recovery.quarantinedMap.token).toBeUndefined();
    expect(recovery.quarantinedMap.access_token).toBeUndefined();
    expect(recovery.quarantinedMap.nested).toEqual({ safeLabel: 'retain me' });
    expect(recovery.quarantinedMapRedacted).toBe(true);
    expect(venueMapStructuralRecoveryBackupIssue(
      redacted.payload.venueMapStructuralRecovery,
      redacted.payload.venueMapConfigs,
    )).toBeNull();
  });

  it('exports an invalid-frame quarantine marker with its normalized recovery map', async () => {
    cacheVenueMapConfigFromServer({
      ...emptyVenueMapConfig(),
      width: 900,
    });

    const bundle = await buildBackupBundle();
    expect(bundle.payload.venueMapConfigs).toEqual(expect.objectContaining({ width: 500 }));
    expect(bundle.payload.venueMapStructuralRecovery).toEqual(expect.objectContaining({
      artifacts: [expect.objectContaining({
        family: 'map',
        mapFrameMalformed: true,
      })],
    }));
  });

  it('exports the full set of design domains', async () => {
    const bundle = await buildBackupBundle();

    expect(bundle.payload.chairSpecs).toEqual([{ id: 'c1', name: 'Chair 1' }]);
    expect(bundle.payload.wallStyles).toEqual([{ id: 'w1', name: 'Wall 1' }]);
    expect(bundle.payload.spacingSettings).toBeTruthy();
    expect(bundle.payload.alignmentSettings).toEqual({
      enabled: true,
      snapToGrid: true,
    });
    expect(bundle.payload.indoorFeatureTemplates).toEqual([{ id: 'ift1', name: 'Door' }]);
    expect(bundle.payload.outdoorFeatureTemplates).toEqual([{ id: 'oft1', name: 'Tree' }]);
  });

  it('includes named payload domains', async () => {
    localStorage.setItem('spm_event_roles', JSON.stringify(['Bride', 'Groom']));

    const bundle = await buildBackupBundle();

    expect(bundle.payload.config).toBeTruthy();
    expect(Array.isArray(bundle.payload.venues)).toBe(true);
    expect(Array.isArray(bundle.payload.tableSpecs)).toBe(true);
    expect(Array.isArray(bundle.payload.fixtureTypes)).toBe(true);
    expect(Array.isArray(bundle.payload.templates)).toBe(true);
    expect(Array.isArray(bundle.payload.users)).toBe(true);
    expect(bundle.payload.eventRoles).toEqual(['Bride', 'Groom']);
  });

  it('falls back safely when optional raw localStorage domains are malformed', async () => {
    localStorage.setItem('spm_event_questions', '{bad-json');

    const bundle = await buildBackupBundle();

    expect(bundle.payload.eventQuestions).toEqual([]);
  });
});