import { getPlatformProvider, type PlatformProvider } from '../platform';
import { getSupabaseClient, isSupabaseConfigured } from '../backend/supabaseClient';
import { BACKUP_DOMAINS } from '../../utils/backupDomains';
import { emitDataChanged, type DataChangedType } from '../../utils/appEvents';
import { isManagedVenueMapImageRef } from '../../utils/venueMapImageRef';
import {
  assertVenueMapArrivalRolesResolved,
  assertVenueMapAudiencesResolved,
  assertVenueMapBaseImageResolved,
  assertVenueMapComplexityWithinBudget,
  assertVenueMapDrawingGeometryResolved,
  assertVenueMapFrameValid,
  assertVenueMapIdentifiersValid,
  assertVenueMapPointCoordinatesResolved,
  assertVenueMapPointGpsResolved,
  assertVenueMapPointKindFieldsCanonical,
  assertVenueMapRouteAccessibilityResolved,
  assertVenueMapRouteDeliveryCompatible,
  assertVenueMapRouteGeometryResolved,
  assertVenueMapRoutePrioritiesResolved,
  assertVenueMapSpacePointLinksUnique,
  assertVenueMapStructuralRecoveryResolved,
  assertVenueMapTextFieldsValid,
} from '../wayfinding/venueWayfindingService';

/**
 * Generic org-scoped entity repository.
 *
 * Reads/writes every catalog/design/asset domain (venues, table specs, decor,
 * linens, chairs, wall styles, spacing, alignment, feature templates, templates,
 * guidelines, event questions/answers, staff, vendors/payments, portal data,
 * direct messages, saved layouts) in one uniform way:
 *  - `local`    → the existing localStorage domain store (via the backup-domain
 *    registry, which is the single source of truth for keys/read/write).
 *  - `supabase` → the `org_data` table (RLS-scoped by organization), keyed by
 *    domain. One round-trip reads/writes the whole domain's JSON payload.
 *
 * This generalizes the layout-repository pattern (Feature B) to all entities.
 */

export interface EntitySyncContext {
  organizationId: string;
  userId: string;
}

export type EntityDomain = string;

export interface CapturedEntityDomainPayload {
  found: boolean;
  payload: unknown;
  /** Server revision observed when this local write was enqueued. */
  expectedUpdatedAt?: string | null;
}

export type VenueMapSaveResult =
  | { status: 'saved'; updatedAt: string | null }
  | {
      status: 'conflict';
      currentPayload: unknown;
      currentUpdatedAt: string | null;
    };

const entityDomainRevisions = new Map<string, string | null>();

function canonicalDomain(domain: EntityDomain): EntityDomain {
  return BACKUP_DOMAINS.find(
    (entry) => entry.key === domain || entry.storageKey === domain,
  )?.key || domain;
}

function revisionKey(organizationId: string, domain: EntityDomain): string {
  return `${organizationId}\u0000${canonicalDomain(domain)}`;
}

/** `undefined` means no server snapshot has been observed; `null` means the row was absent. */
export function getEntityDomainRevision(
  organizationId: string,
  domain: EntityDomain,
): string | null | undefined {
  return entityDomainRevisions.get(revisionKey(organizationId, domain));
}

export function acceptEntityDomainRevision(
  organizationId: string,
  domain: EntityDomain,
  updatedAt: string | null,
): void {
  entityDomainRevisions.set(revisionKey(organizationId, domain), updatedAt);
}

export class VenueMapConflictError extends Error {
  readonly currentPayload: unknown;
  readonly currentUpdatedAt: string | null;

  constructor(currentPayload: unknown, currentUpdatedAt: string | null) {
    super('The venue map changed in another tab or session.');
    this.name = 'VenueMapConflictError';
    this.currentPayload = currentPayload;
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

/** Capture a domain before it waits behind an in-flight write. */
export function captureEntityDomainPayload(domain: EntityDomain): CapturedEntityDomainPayload {
  if (domain === 'venueMapConfigs' || domain === 'spm_venue_map_configs') {
    assertVenueMapStructuralRecoveryResolved();
  }
  const definition = BACKUP_DOMAINS.find(
    (entry) => entry.key === domain || entry.storageKey === domain,
  );
  if (!definition) return { found: false, payload: undefined };
  const payload = definition.read();
  if (definition.key === 'venueMapConfigs') {
    assertVenueMapComplexityWithinBudget(payload);
    assertVenueMapFrameValid(payload);
    assertVenueMapPointCoordinatesResolved(payload);
    assertVenueMapPointGpsResolved(payload);
    assertVenueMapAudiencesResolved(payload);
    assertVenueMapArrivalRolesResolved(payload);
    assertVenueMapBaseImageResolved(payload);
    assertVenueMapRouteAccessibilityResolved(payload);
    assertVenueMapRouteGeometryResolved(payload);
    assertVenueMapPointKindFieldsCanonical(payload);
    assertVenueMapSpacePointLinksUnique(payload);
    assertVenueMapIdentifiersValid(payload);
    assertVenueMapTextFieldsValid(payload);
    assertVenueMapDrawingGeometryResolved(payload);
    assertVenueMapRoutePrioritiesResolved(payload);
    assertVenueMapRouteDeliveryCompatible(payload);
  }
  return { found: true, payload };
}

/**
 * Domains that remain intentionally local while local authentication and
 * browser-only session state are active. All business data can otherwise be
 * mirrored into the single-venue organization store for cross-device use.
 */
const LOCAL_ONLY_DOMAINS = new Set([
  'users',
  'securitySettings',
  'orgInvites',
  'coupleChatRead',
  'venueMapStructuralRecovery', // Admin-only backup state; never an org_data/portal domain.
  'savedLayouts', // Saved layouts use the dedicated layouts repository.
]);

export function isSyncableDomain(domain: EntityDomain): boolean {
  const definition = BACKUP_DOMAINS.find(
    (entry) => entry.key === domain || entry.storageKey === domain,
  );
  return Boolean(definition && !LOCAL_ONLY_DOMAINS.has(definition.key));
}

export interface EntityRepository {
  provider: PlatformProvider;
  /** Persist all syncable domains for a context (replace-sync). */
  pushAll(context: EntitySyncContext): Promise<void>;
  /**
   * Load all syncable domains for a context from the backend into local store.
   * `shouldApply` is checked after I/O and before shared-browser-cache mutation,
   * so a superseded tenant request cannot overwrite the active tenant's data.
   */
  pullAll(context: EntitySyncContext, shouldApply?: () => boolean): Promise<boolean>;
  /** Persist a single domain for a context, optionally from an invocation-time snapshot. */
  pushDomain(
    context: EntitySyncContext,
    domain: EntityDomain,
    captured?: CapturedEntityDomainPayload,
  ): Promise<void>;
  /** Compare-and-swap the canonical Venue Map against its editor-loaded revision. */
  saveVenueMap(
    context: EntitySyncContext,
    payload: unknown,
    expectedUpdatedAt: string | null | undefined,
    force?: boolean,
  ): Promise<VenueMapSaveResult>;
}

export class LocalEntityRepository implements EntityRepository {
  provider: PlatformProvider = 'local';

  async pushAll(): Promise<void> { /* no-op: localStorage already owns the data */ }
  async pullAll(_context: EntitySyncContext, shouldApply: () => boolean = () => true): Promise<boolean> {
    return shouldApply();
  }
  async pushDomain(): Promise<void> { /* no-op */ }
  async saveVenueMap(): Promise<VenueMapSaveResult> {
    return { status: 'saved', updatedAt: null };
  }
}

export class SupabaseEntityRepository implements EntityRepository {
  provider: PlatformProvider = 'supabase';

  private domains(): {
    key: string;
    defaultValue: unknown;
    read: () => unknown;
    write: (v: unknown) => void;
  }[] {
    return BACKUP_DOMAINS.filter((d) => isSyncableDomain(d.key));
  }

  private async upsertDomain(
    context: EntitySyncContext,
    domain: string,
    payload: unknown,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('org_data').upsert(
      {
        organization_id: context.organizationId,
        domain,
        payload,
      },
      { onConflict: 'organization_id,domain' },
    );
    if (error) throw error;
  }

  async saveVenueMap(
    context: EntitySyncContext,
    payload: unknown,
    expectedUpdatedAt: string | null | undefined,
    force = false,
  ): Promise<VenueMapSaveResult> {
    assertVenueMapComplexityWithinBudget(payload);
    assertVenueMapFrameValid(payload);
    assertVenueMapPointCoordinatesResolved(payload);
    assertVenueMapPointGpsResolved(payload);
    assertVenueMapAudiencesResolved(payload);
    assertVenueMapArrivalRolesResolved(payload);
    assertVenueMapBaseImageResolved(payload);
    assertVenueMapRouteAccessibilityResolved(payload);
    assertVenueMapRouteGeometryResolved(payload);
    assertVenueMapPointKindFieldsCanonical(payload);
    assertVenueMapSpacePointLinksUnique(payload);
    assertVenueMapIdentifiersValid(payload);
    assertVenueMapTextFieldsValid(payload);
    assertVenueMapDrawingGeometryResolved(payload);
    assertVenueMapRoutePrioritiesResolved(payload);
    assertVenueMapRouteDeliveryCompatible(payload);
    const backgroundImageUrl = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as { backgroundImageUrl?: unknown }).backgroundImageUrl
      : undefined;
    if (
      backgroundImageUrl !== undefined
      && !isManagedVenueMapImageRef(backgroundImageUrl, context.organizationId)
    ) {
      throw new Error('Cloud Venue Maps must use an image in this organization’s managed venue-map storage.');
    }
    if (!isSupabaseConfigured()) throw new Error('This service is temporarily unavailable.');
    const { data, error } = await getSupabaseClient().rpc('save_venue_map_config', {
      p_organization_id: context.organizationId,
      p_payload: payload,
      p_expected_updated_at: typeof expectedUpdatedAt === 'string' ? expectedUpdatedAt : null,
      p_expected_missing: expectedUpdatedAt === null,
      p_force: force,
    });
    if (error) throw error;
    if (data?.ok === false && data?.error === 'conflict') {
      return {
        status: 'conflict',
        currentPayload: data.current_payload ?? null,
        currentUpdatedAt: typeof data.current_updated_at === 'string'
          ? data.current_updated_at
          : null,
      };
    }
    if (!data?.ok) throw new Error(String(data?.error || 'venue_map_save_failed'));
    const updatedAt = typeof data.updated_at === 'string' ? data.updated_at : null;
    acceptEntityDomainRevision(context.organizationId, 'venueMapConfigs', updatedAt);
    return { status: 'saved', updatedAt };
  }

  async pushDomain(
    context: EntitySyncContext,
    domain: string,
    captured?: CapturedEntityDomainPayload,
  ): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('This service is temporarily unavailable.');
    const def = BACKUP_DOMAINS.find(
      (d) => d.key === domain || d.storageKey === domain,
    );
    if (!def || captured?.found === false) return;
    const payload = captured?.found ? captured.payload : def.read();
    if (def.key === 'venueMapConfigs') {
      // Defense in depth for direct repository callers that do not use the
      // capture helper. The protected Designer calls saveVenueMap explicitly
      // only after its in-editor recovery state is resolved.
      assertVenueMapStructuralRecoveryResolved();
      const result = await this.saveVenueMap(
        context,
        payload,
        captured && 'expectedUpdatedAt' in captured
          ? captured.expectedUpdatedAt
          : getEntityDomainRevision(context.organizationId, def.key),
      );
      if (result.status === 'conflict') {
        throw new VenueMapConflictError(result.currentPayload, result.currentUpdatedAt);
      }
      return;
    }
    await this.upsertDomain(context, def.key, payload);
  }

  async pushAll(context: EntitySyncContext): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('This service is temporarily unavailable.');
    for (const def of this.domains()) {
      if (def.key === 'venueMapConfigs') {
        assertVenueMapStructuralRecoveryResolved();
        const result = await this.saveVenueMap(
          context,
          def.read(),
          getEntityDomainRevision(context.organizationId, def.key),
        );
        if (result.status === 'conflict') {
          throw new VenueMapConflictError(result.currentPayload, result.currentUpdatedAt);
        }
      } else {
        await this.upsertDomain(context, def.key, def.read());
      }
    }
  }

  async pullAll(
    context: EntitySyncContext,
    shouldApply: () => boolean = () => true,
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) throw new Error('This service is temporarily unavailable.');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('org_data')
      .select('domain,payload,updated_at')
      .eq('organization_id', context.organizationId);
    if (error) throw error;
    if (!shouldApply()) return false;

    // The browser cache is shared across authenticated sessions. Treat the
    // organization-scoped backend result as a complete snapshot: a domain that
    // is absent for the new organization must be reset to its canonical default,
    // rather than inheriting the previous organization's local value.
    const rowsByDomain = new Map(
      (data || []).map((row) => [row.domain, row] as const),
    );
    for (const def of this.domains()) {
      const row = rowsByDomain.get(def.key);
      const value = row ? row.payload : def.defaultValue;
      acceptEntityDomainRevision(
        context.organizationId,
        def.key,
        row && typeof row.updated_at === 'string' ? row.updated_at : null,
      );
      def.write(value);
      emitDataChanged(def.key as DataChangedType, 'backend');
    }
    emitDataChanged('all', 'backend');
    return true;
  }
}

export function getEntityRepository(): EntityRepository {
  return getPlatformProvider() === 'supabase'
    ? new SupabaseEntityRepository()
    : new LocalEntityRepository();
}
