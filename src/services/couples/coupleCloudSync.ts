import type { CoupleEvent, GuestPortalConfig, RSVPSubmission, Venue, VenueMapConfig } from '../../types';
import { getPlatformProvider } from '../platform';
import { getSupabaseClient, isSupabaseConfigured } from '../backend/supabaseClient';
import { BACKUP_DOMAINS } from '../../utils/backupDomains';
import { emitDataChanged } from '../../utils/appEvents';
import { sha256Hex } from '../../utils/hash';
import { findCoupleEventById, getCoupleEvents } from './coupleService';
import { getCouplePortalExpiry } from './accessLifecycle';
import { getCoupleGuests } from './coupleGuestService';
import { projectVenueMap, venueMapExceedsComplexityBudget } from '../../utils/venueMapDesigner';
import {
  getVenueMapStructuralRecoveryArtifacts,
  LEGACY_VENUE_MAP_HEIGHT,
  LEGACY_VENUE_MAP_WIDTH,
  venueMapFrameIssue,
} from '../wayfinding/venueWayfindingService';

export interface CoupleCloudContext {
  organizationId: string;
  userId: string;
}

export type CouplePortalSnapshot = Record<string, unknown>;

export interface CoupleSnapshotBuildOverrides {
  /** Invocation-time map payload, retained even if realtime refreshes local storage. */
  venueMapConfig?: unknown;
}

/**
 * Invitation-scoped cloud state is authoritative. An unhydrated remote value
 * must fail closed to null rather than exposing a global browser cache that may
 * belong to another venue or prior session. Browser fallback is local-mode only.
 */
export function resolveAuthoritativePortalVenueMap(
  remoteMap: VenueMapConfig | null | undefined,
  localMap: VenueMapConfig | null,
  remoteAuthoritative: boolean,
): VenueMapConfig | null {
  if (remoteAuthoritative) return remoteMap ?? null;
  return remoteMap !== undefined ? remoteMap : localMap;
}

const COUPLE_SCOPED_ARRAYS = new Set([
  'coupleAnswers',
  'coupleMessages',
  'coupleGuests',
  'coupleSubmissions',
  'coupleChecklists',
  'coupleVendors',
  'coupleSetupTasks',
  'coupleGuestEvents',
]);

const GLOBAL_DOMAINS = new Set([
  'config',
  'venues',
  'tableSpecs',
  'fixtureTypes',
  'guidelines',
  'templates',
  'linenColors',
  'chairSpecs',
  'wallStyles',
  'spacingSettings',
  'alignmentSettings',
  'indoorFeatureTemplates',
  'outdoorFeatureTemplates',
  'decorItems',
  'decorCategories',
  'decorArrangements',
  'decorPackages',
  'eventQuestions',
  'vendorCategories',
  'vendors',
  'weddingPackages',
  'packageAddOns',
  'venueMapConfigs',
  'venueRules',
  'venueWeather',
]);

/**
 * Whether changing a local domain invalidates the denormalized couple/guest
 * portal snapshots. Accepts either the canonical domain key or its storage key
 * so callers cannot silently miss publication because of an alias.
 */
export function affectsCouplePortalSnapshots(domain: string): boolean {
  if (domain === 'all') return true;
  const canonical = BACKUP_DOMAINS.find(
    (definition) => definition.key === domain || definition.storageKey === domain,
  )?.key as string | undefined;
  const key = canonical || domain;
  return GLOBAL_DOMAINS.has(key)
    || COUPLE_SCOPED_ARRAYS.has(key)
    || key === 'coupleEvents'
    || key === 'couplePortalConfigs';
}

export function isCoupleCloudEnabled(): boolean {
  return getPlatformProvider() === 'supabase' && isSupabaseConfigured();
}

function scopeDomain(key: string, value: unknown, coupleEventId: string): unknown {
  if (key === 'coupleEvents') {
    return Array.isArray(value) ? value.filter((event) => event?.id === coupleEventId) : [];
  }

  if (key === 'couplePortalConfigs') {
    const configs = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return configs[coupleEventId] ? { [coupleEventId]: configs[coupleEventId] } : {};
  }

  if (COUPLE_SCOPED_ARRAYS.has(key)) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => {
      if (key === 'coupleGuests') {
        return item?.eventName === coupleEventId || item?.eventKey === coupleEventId;
      }
      return item?.coupleEventId === coupleEventId || item?.eventId === coupleEventId || item?.eventKey === coupleEventId;
    });
  }

  return value;
}

/** Build the server snapshot for one couple without including another couple's records. */
export async function buildCouplePortalSnapshot(
  coupleEventId: string,
  overrides: CoupleSnapshotBuildOverrides = {},
): Promise<CouplePortalSnapshot | null> {
  const event = findCoupleEventById(coupleEventId);
  if (!event) return null;

  const snapshot: CouplePortalSnapshot = {};
  for (const domain of BACKUP_DOMAINS) {
    if (!GLOBAL_DOMAINS.has(domain.key) && domain.key !== 'coupleEvents' && domain.key !== 'couplePortalConfigs' && !COUPLE_SCOPED_ARRAYS.has(domain.key)) {
      continue;
    }
    try {
      snapshot[domain.key] = scopeDomain(domain.key, domain.read(), coupleEventId);
    } catch {
      snapshot[domain.key] = domain.defaultValue;
    }
  }

  // Never place staff-only map objects in a portal snapshot. Keep a couple-safe
  // projection for the couple UI and a separately event-scoped guest projection
  // that the guest RPC returns instead of the broader couple map.
  const hasVenueMapOverride = Object.prototype.hasOwnProperty.call(overrides, 'venueMapConfig');
  const sourceMap = (hasVenueMapOverride
    ? overrides.venueMapConfig
    : snapshot.venueMapConfigs) as VenueMapConfig | null | undefined;
  const mapRecoveryPending = !hasVenueMapOverride
    && !!sourceMap
    && getVenueMapStructuralRecoveryArtifacts(sourceMap).some(
      (artifact) => artifact.family === 'map'
        && (artifact.mapFrameMalformed === true || artifact.mapComplexityExceeded === true),
    );
  const sourceFrameInvalid = venueMapFrameIssue(sourceMap) !== null;
  const sourceComplexityExceeded = venueMapExceedsComplexityBudget(sourceMap);
  if (
    sourceMap
    && Array.isArray(sourceMap.points)
    && !mapRecoveryPending
    && !sourceFrameInvalid
    && !sourceComplexityExceeded
  ) {
    const portalSourceMap = {
      ...sourceMap,
      width: Object.prototype.hasOwnProperty.call(sourceMap, 'width')
        ? sourceMap.width
        : LEGACY_VENUE_MAP_WIDTH,
      height: Object.prototype.hasOwnProperty.call(sourceMap, 'height')
        ? sourceMap.height
        : LEGACY_VENUE_MAP_HEIGHT,
    };
    const snapshotVenues = Array.isArray(snapshot.venues) ? snapshot.venues as Venue[] : [];
    snapshot.venueMapConfigs = projectVenueMap(
      portalSourceMap,
      'couple',
      undefined,
      { managedBaseImageOnly: true, venues: snapshotVenues },
    );
    snapshot.guestVenueMap = projectVenueMap(
      portalSourceMap,
      'guest',
      event.selectedSpaces || [],
      { managedBaseImageOnly: true, venues: snapshotVenues },
    );
  } else {
    snapshot.venueMapConfigs = null;
    snapshot.guestVenueMap = null;
  }

  // Store a hash alongside each guest token. The raw token remains in the private
  // snapshot for the couple's link-management UI; public guest RPCs return only
  // the matching guest with its token removed.
  const guests = getCoupleGuests(coupleEventId);
  const inviteExpiresAt = getCouplePortalExpiry(event);
  snapshot.coupleGuests = await Promise.all(
    guests.map(async (guest) => ({
      ...guest,
      tokenHash: guest.token ? await sha256Hex(guest.token) : undefined,
      tokenExpiresAt: inviteExpiresAt || guest.tokenExpiresAt,
    })),
  );
  snapshot.coupleEvents = [{
    ...event,
    inviteExpiresAt,
    collaborators: (event.collaborators || []).map((collaborator) => ({
      ...collaborator,
      inviteExpiresAt: collaborator.inviteExpiresAt || inviteExpiresAt,
    })),
  }];
  return snapshot;
}

export async function syncCouplePortalSnapshotForVenue(
  context: CoupleCloudContext,
  coupleEventId: string,
  overrides: CoupleSnapshotBuildOverrides = {},
): Promise<boolean> {
  if (!isCoupleCloudEnabled()) return false;
  const event = findCoupleEventById(coupleEventId);
  const payload = await buildCouplePortalSnapshot(coupleEventId, overrides);
  if (!event || !payload) return false;

  const collaboratorTokens = (event.collaborators || [])
    .map((collaborator) => collaborator.inviteToken)
    .filter(Boolean);
  const { data, error } = await getSupabaseClient().rpc('upsert_couple_portal_snapshot', {
    p_organization_id: context.organizationId,
    p_couple_id: coupleEventId,
    p_couple_token: event.inviteToken,
    p_collaborator_tokens: collaboratorTokens,
    p_payload: payload,
  });
  if (error || !data?.ok) return false;
  return true;
}

export async function syncAllCouplePortalSnapshots(
  context: CoupleCloudContext,
  overrides: CoupleSnapshotBuildOverrides = {},
): Promise<void> {
  if (!isCoupleCloudEnabled()) return;
  const events = getCoupleEvents();
  for (const event of events) {
    await syncCouplePortalSnapshotForVenue(context, event.id, overrides);
  }

  // Remove cloud snapshots for couple events deleted in the venue workspace so
  // an old invite cannot continue to open a retired event on another device.
  const { data: existing, error: lookupError } = await getSupabaseClient()
    .from('couple_portal_snapshots')
    .select('couple_id')
    .eq('organization_id', context.organizationId);
  if (lookupError) return;
  const activeIds = new Set(events.map((event) => event.id));
  const staleIds = (existing || [])
    .map((row) => row.couple_id as string)
    .filter((id) => !activeIds.has(id));
  if (staleIds.length > 0) {
    await getSupabaseClient()
      .from('couple_portal_snapshots')
      .delete()
      .eq('organization_id', context.organizationId)
      .in('couple_id', staleIds);
  }
}

/** Result of pulling a couple snapshot: the payload plus the row version the
 * server reported, used as the compare-and-swap base for the next save. */
export interface CouplePortalPull {
  payload: CouplePortalSnapshot;
  updatedAt?: string;
}

/** A server-verified invitation/account denial, distinct from a retryable pull failure. */
export class PortalAccessError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('Portal access must be verified again.');
    this.name = 'PortalAccessError';
    this.code = code;
  }
}

export function isPortalAccessError(error: unknown): error is PortalAccessError {
  return error instanceof PortalAccessError;
}

function throwPortalAccessError(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const result = data as { ok?: unknown; error?: unknown };
  if (result.ok !== false) return;
  const code = String(result.error || 'access_denied');
  throw new PortalAccessError(/^[a-z0-9_-]{1,64}$/i.test(code) ? code : 'access_denied');
}

export async function pullCouplePortalSnapshot(token: string, venueSlug?: string): Promise<CouplePortalPull | null> {
  if (!isCoupleCloudEnabled() || !token) return null;
  const { data, error } = await getSupabaseClient().rpc(
    venueSlug ? 'get_couple_portal_snapshot_for_venue' : 'get_couple_portal_snapshot',
    venueSlug ? { p_venue_slug: venueSlug, p_token: token } : { p_token: token },
  );
  if (error) return null;
  throwPortalAccessError(data);
  if (!data?.ok || !data.payload) return null;
  return { payload: data.payload as CouplePortalSnapshot, updatedAt: data.updated_at as string | undefined };
}

export type CouplePortalSaveResult = 'saved' | 'conflict' | 'error';

/**
 * Save the couple snapshot. When `baseUpdatedAt` (the updated_at from the last
 * pull) is provided, the server refuses the write with 'conflict' if the
 * snapshot moved in between — e.g. a guest submitted after our pull — so the
 * caller can re-pull and merge instead of silently dropping that write
 * (Review #258, F-258-2).
 */
export async function saveCouplePortalSnapshot(
  token: string,
  payload: CouplePortalSnapshot,
  venueSlug?: string,
  baseUpdatedAt?: string,
): Promise<CouplePortalSaveResult> {
  if (!isCoupleCloudEnabled() || !token) return 'error';
  const args: Record<string, unknown> = venueSlug
    ? { p_venue_slug: venueSlug, p_token: token, p_payload: payload }
    : { p_token: token, p_payload: payload };
  if (baseUpdatedAt) args.p_base_updated_at = baseUpdatedAt;
  const { data, error } = await getSupabaseClient().rpc(
    venueSlug ? 'save_couple_portal_snapshot_for_venue' : 'save_couple_portal_snapshot',
    args,
  );
  if (error) return 'error';
  if (data && data.ok === false && data.error === 'conflict') return 'conflict';
  return data?.ok ? 'saved' : 'error';
}

export interface HydrateCouplePortalSnapshotOptions {
  notify?: boolean;
  /**
   * Couple-token hydration needs the snapshot's scoped presentation domains.
   * Venue-member bulk hydration must leave those global domains authoritative
   * from org_data, or a stale/couple-filtered snapshot can overwrite the venue's
   * canonical catalog and staff-only map layers.
   */
  includeGlobalDomains?: boolean;
}

export interface CouplePortalHydrationReport {
  /** Domains whose optional browser-cache write was rejected. */
  failedDomains: string[];
}

/** Merge one event's remote data into the local one-venue browser cache. */
export function hydrateCouplePortalSnapshot(
  snapshot: CouplePortalSnapshot,
  {
    notify = true,
    includeGlobalDomains = true,
  }: HydrateCouplePortalSnapshotOptions = {},
): CouplePortalHydrationReport {
  const failedDomains: string[] = [];
  const snapshotCoupleEvent = Array.isArray(snapshot.coupleEvents)
    ? (snapshot.coupleEvents as Array<{ id?: unknown }>).find((item) => typeof item?.id === 'string')
    : undefined;
  const snapshotCoupleId = typeof snapshotCoupleEvent?.id === 'string'
    ? snapshotCoupleEvent.id
    : undefined;

  for (const domain of BACKUP_DOMAINS) {
    // Structural recovery is admin-only backup metadata, never a portal
    // snapshot input—even if an untrusted/stale snapshot injects the key.
    if (domain.key === 'venueMapStructuralRecovery') continue;
    if (!(domain.key in snapshot)) continue;
    const incoming = snapshot[domain.key];
    try {
      if (domain.key === 'coupleEvents') {
        const stored = domain.read();
        const current = Array.isArray(stored) ? stored as Array<{ id?: string }> : [];
        const remote = Array.isArray(incoming) ? incoming as Array<{ id?: string }> : [];
        domain.write([...current.filter((item) => !remote.some((next) => next.id === item.id)), ...remote]);
        continue;
      }
      if (domain.key === 'couplePortalConfigs') {
        const stored = domain.read();
        const current = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
        const remote = incoming && typeof incoming === 'object' ? incoming as Record<string, unknown> : {};
        domain.write({ ...current, ...remote });
        continue;
      }
      if (COUPLE_SCOPED_ARRAYS.has(domain.key)) {
        const stored = domain.read();
        const current = Array.isArray(stored) ? stored as Array<Record<string, unknown>> : [];
        const remote = Array.isArray(incoming) ? incoming as Array<Record<string, unknown>> : [];
        const coupleId = remote[0]?.coupleEventId
          || remote[0]?.eventId
          || remote[0]?.eventKey
          || remote[0]?.eventName
          || snapshotCoupleId;
        if (!coupleId) continue;
        const belongs = (item: Record<string, unknown>) =>
          domain.key === 'coupleGuests'
            ? item.eventName === coupleId || item.eventKey === coupleId
            : item.coupleEventId === coupleId || item.eventId === coupleId || item.eventKey === coupleId;
        domain.write([...current.filter((item) => !belongs(item)), ...remote]);
        continue;
      }
      if (includeGlobalDomains && GLOBAL_DOMAINS.has(domain.key)) {
        domain.write(incoming);
      }
    } catch {
      // The authenticated snapshot remains available in memory. Record every
      // rejected compatibility-cache domain so the portal can enter an explicit
      // read-only fallback instead of silently mixing old data with new edits.
      failedDomains.push(String(domain.key));
    }
  }
  if (notify) emitDataChanged('all', 'backend');
  return { failedDomains };
}

/** Hydrate all couple snapshots visible to an authenticated venue member. */
export async function pullAllCouplePortalSnapshotsForVenue(
  context: CoupleCloudContext,
  shouldApply: () => boolean = () => true,
): Promise<boolean> {
  if (!isCoupleCloudEnabled()) return shouldApply();
  const { data, error } = await getSupabaseClient()
    .from('couple_portal_snapshots')
    .select('couple_id,payload')
    .eq('organization_id', context.organizationId);
  if (error) throw error;
  if (!shouldApply()) return false;
  for (const row of data || []) {
    if (row.payload) {
      hydrateCouplePortalSnapshot(row.payload as CouplePortalSnapshot, {
        notify: false,
        includeGlobalDomains: false,
      });
    }
  }
  return true;
}

export interface GuestPortalCloudSnapshot {
  coupleId: string;
  event?: CoupleEvent[];
  venues?: unknown;
  tableSpecs?: unknown;
  fixtureTypes?: unknown;
  portalConfig?: Record<string, GuestPortalConfig>;
  venueMap?: unknown;
  venueRules?: unknown;
  venueWeather?: unknown;
  guestEvents?: unknown;
  guest?: Record<string, unknown>;
  rsvp?: RSVPSubmission | null;
  updatedAt?: string;
}

export async function pullGuestPortalSnapshot(
  coupleEventId: string,
  guestToken: string,
  venueSlug?: string,
): Promise<GuestPortalCloudSnapshot | null> {
  if (!isCoupleCloudEnabled() || !coupleEventId || !guestToken) return null;
  const { data, error } = await getSupabaseClient().rpc(
    venueSlug ? 'get_guest_couple_portal_snapshot_for_venue' : 'get_guest_couple_portal_snapshot',
    venueSlug
      ? { p_venue_slug: venueSlug, p_couple_id: coupleEventId, p_guest_token: guestToken }
      : { p_couple_id: coupleEventId, p_guest_token: guestToken },
  );
  if (error) return null;
  throwPortalAccessError(data);
  if (!data?.ok) return null;
  return {
    coupleId: coupleEventId,
    event: Array.isArray(data.event) ? data.event as CoupleEvent[] : [],
    venues: data.venues,
    tableSpecs: data.table_specs,
    fixtureTypes: data.fixture_types,
    portalConfig: data.portal_config,
    venueMap: data.venue_map,
    venueRules: data.venue_rules,
    venueWeather: data.venue_weather,
    guestEvents: data.guest_events,
    guest: data.guest,
    rsvp: data.rsvp && data.rsvp !== null ? data.rsvp as RSVPSubmission : null,
    updatedAt: data.updated_at,
  };
}

export async function submitGuestPortalRsvp(
  coupleEventId: string,
  guestToken: string,
  submission: RSVPSubmission,
  venueSlug?: string,
): Promise<boolean> {
  if (!isCoupleCloudEnabled()) return false;
  const { data, error } = await getSupabaseClient().rpc(
    venueSlug ? 'submit_guest_couple_rsvp_for_venue' : 'submit_guest_couple_rsvp',
    venueSlug
      ? { p_venue_slug: venueSlug, p_couple_id: coupleEventId, p_guest_token: guestToken, p_submission: submission }
      : { p_couple_id: coupleEventId, p_guest_token: guestToken, p_submission: submission },
  );
  return !error && Boolean(data?.ok);
}

