import {
  VenueMapConfig,
  VenueMapPoint,
  VenueMapPointKind,
  VenueMapRoute,
  VenueMapAudience,
  VenueMapArrivalRole,
  VenueMapRouteAccessibility,
  VenueMapRoutePriority,
  DrawingObject,
  RainContingency,
  VenueRulesConfig,
} from '../../types';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { STORAGE_VERSIONS } from '../../constants/storageVersions';
import { loadVersionedStorage, saveVersionedStorage } from '../../utils/storage';
import {
  canonicalVenueMapIdentifier,
  constrainMapDrawing,
  INVALID_VENUE_MAP_EVENT_SCOPE,
  isSafeVenueMapBackgroundRef,
  INVALID_VENUE_MAP_POINT_REFERENCE,
  INVALID_VENUE_MAP_ROUTE_PRIORITY,
  partitionVenueMapArrivalRoleIntegrity,
  partitionVenueMapBaseImageIntegrity,
  partitionVenueMapDrawingIntegrity,
  partitionVenueMapRainContingencyCollisions,
  partitionVenueMapRouteReferenceIntegrity,
  partitionVenueMapSpacePointLinkCollisions,
  partitionVenueMapTextIntegrity,
  projectVenueMap,
  venueMapComplexityIssues,
  venueMapDrawingIntegrityIssue,
  venueMapDrawingPresentationIssues,
  venueMapPointCoordinateIssue,
  venueMapPointGpsIssue,
  LEGACY_VENUE_MAP_HEIGHT,
  LEGACY_VENUE_MAP_WIDTH,
  VENUE_MAP_FRAME_MAX,
  VENUE_MAP_FRAME_MIN,
  venueMapHasDuplicateIdentities,
  venueMapHasInvalidAudiences,
  venueMapHasInvalidArrivalRoles,
  venueMapHasInvalidBaseImage,
  venueMapHasInvalidDrawingGeometry,
  venueMapHasInvalidRouteAccessibility,
  venueMapHasInvalidRouteGeometry,
  venueMapHasInvalidRoutePriorities,
  venueMapHasRainContingencyCollisions,
  venueMapHasRouteDeliveryIssues,
  venueMapHasSpacePointLinkCollisions,
  venueMapRoutePriorityIssue,
  venueMapRouteReferenceIssues,
  venueMapTextIntegrityIssues,
  VENUE_MAP_MAX_DRAWING_TEXT_LENGTH,
  VENUE_MAP_MAX_GUIDANCE_LENGTH,
  VENUE_MAP_MAX_IDENTIFIER_LENGTH,
  VENUE_MAP_MAX_POINT_LABEL_LENGTH,
  VENUE_MAP_MAX_ROUTE_NAME_LENGTH,
} from '../../utils/venueMapDesigner';

const MAP_KEY = STORAGE_KEYS.VENUE_MAP_CONFIGS;
const MAP_VERSION = STORAGE_VERSIONS.VENUE_MAP_CONFIGS;
const STRUCTURAL_RECOVERY_KEY = STORAGE_KEYS.VENUE_MAP_STRUCTURAL_RECOVERY;
const STRUCTURAL_RECOVERY_VERSION = STORAGE_VERSIONS.VENUE_MAP_STRUCTURAL_RECOVERY;
const RULES_KEY = STORAGE_KEYS.VENUE_RULES;
const RULES_VERSION = STORAGE_VERSIONS.VENUE_RULES;

const POINT_KINDS = new Set<VenueMapPointKind>(['space', 'parking', 'entry', 'amenity', 'path']);
const AUDIENCES = new Set<VenueMapAudience>(['public', 'couple', 'staff']);
const ACCESSIBILITY = new Set<VenueMapRouteAccessibility>(['unknown', 'step-free', 'not-step-free']);
const ROUTE_PRIORITIES = new Set<VenueMapRoutePriority>(['preferred', 'standard', 'secondary', 'emergency-only']);

export {
  LEGACY_VENUE_MAP_HEIGHT,
  LEGACY_VENUE_MAP_WIDTH,
  VENUE_MAP_FRAME_MAX,
  VENUE_MAP_FRAME_MIN,
} from '../../utils/venueMapDesigner';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function explicitMapDimensionIssue(
  source: Record<string, unknown>,
  field: 'width' | 'height',
): string | null {
  if (!Object.prototype.hasOwnProperty.call(source, field)) return null;
  const value = source[field];
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < VENUE_MAP_FRAME_MIN
    || value > VENUE_MAP_FRAME_MAX
  ) {
    return `Saved map ${field} was explicitly present but is not a finite number from ${VENUE_MAP_FRAME_MIN} to ${VENUE_MAP_FRAME_MAX}.`;
  }
  return null;
}

export function venueMapFrameIssues(value: unknown): string[] {
  const source = record(value);
  if (!source) return [];
  return (['width', 'height'] as const).flatMap((field) => {
    const issue = explicitMapDimensionIssue(source, field);
    return issue ? [issue] : [];
  });
}

export function venueMapFrameIssue(value: unknown): string | null {
  const issues = venueMapFrameIssues(value);
  return issues.length > 0 ? issues.join(' ') : null;
}

export function assertVenueMapFrameValid(value: unknown): void {
  if (venueMapFrameIssue(value)) {
    throw new Error('Invalid map width or height must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function assertVenueMapComplexityWithinBudget(value: unknown): void {
  const issues = venueMapComplexityIssues(value);
  if (issues.length > 0) {
    throw new Error(`The Venue Map exceeds its operational complexity budget. ${issues[0]}`);
  }
}

export function venueMapHasInvalidPointCoordinates(value: unknown): boolean {
  const source = record(value);
  if (!source || venueMapFrameIssue(source)) return false;
  const width = Object.prototype.hasOwnProperty.call(source, 'width')
    ? source.width as number
    : LEGACY_VENUE_MAP_WIDTH;
  const height = Object.prototype.hasOwnProperty.call(source, 'height')
    ? source.height as number
    : LEGACY_VENUE_MAP_HEIGHT;
  if (!Array.isArray(source.points)) return false;
  return source.points.some((candidate) => {
    const point = record(candidate);
    return !!point && venueMapPointCoordinateIssue(
      { x: point.x as number, y: point.y as number },
      { width, height },
    ) !== null;
  });
}

export function assertVenueMapPointCoordinatesResolved(value: unknown): void {
  if (venueMapHasInvalidPointCoordinates(value)) {
    throw new Error('Invalid or out-of-frame map-point coordinates must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function venueMapHasInvalidPointGps(value: unknown): boolean {
  const source = record(value);
  if (!source || !Array.isArray(source.points)) return false;
  return source.points.some((candidate) => {
    const point = record(candidate);
    return !!point && venueMapPointGpsIssue({
      lat: point.lat as number | undefined,
      lng: point.lng as number | undefined,
    }) !== null;
  });
}

export function assertVenueMapPointGpsResolved(value: unknown): void {
  if (venueMapHasInvalidPointGps(value)) {
    throw new Error('Invalid, partial, or out-of-range GPS coordinates must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function assertVenueMapAudiencesResolved(value: unknown): void {
  if (venueMapHasInvalidAudiences(value)) {
    throw new Error('Invalid point, walkway, or shape visibility must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function assertVenueMapArrivalRolesResolved(value: unknown): void {
  if (venueMapHasInvalidArrivalRoles(value)) {
    throw new Error('Invalid or misplaced Entry / Exit arrival roles must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function assertVenueMapBaseImageResolved(value: unknown): void {
  if (venueMapHasInvalidBaseImage(value)) {
    throw new Error('Invalid base-map source or opacity must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function assertVenueMapRouteAccessibilityResolved(value: unknown): void {
  if (venueMapHasInvalidRouteAccessibility(value)) {
    throw new Error('Invalid walkway mobility status must be explicitly repaired before the Venue Map can be saved.');
  }
}

export function venueMapHasPointKindFieldConflicts(value: unknown): boolean {
  const source = record(value);
  if (!source || !Array.isArray(source.points)) return false;
  return source.points.some((candidate) => {
    const point = record(candidate);
    if (!point || typeof point.kind !== 'string' || !POINT_KINDS.has(point.kind as VenueMapPointKind)) {
      return false;
    }
    if (point.kind === 'space') {
      return point.eventSpaceIds !== undefined || point.arrivalRole !== undefined;
    }
    if (point.kind === 'entry') return point.venueId !== undefined;
    return point.venueId !== undefined || point.arrivalRole !== undefined;
  });
}

export function assertVenueMapPointKindFieldsCanonical(value: unknown): void {
  if (venueMapHasPointKindFieldConflicts(value)) {
    throw new Error('Point venue links and event scopes must match the current point kind before the Venue Map can be published.');
  }
}

function identifierFieldIssue(value: unknown, label: string): string | null {
  if (typeof value !== 'string') return `${label} must be text.`;
  const identifier = value.trim();
  if (identifier.length === 0) return `${label} cannot be blank.`;
  if (identifier.length > VENUE_MAP_MAX_IDENTIFIER_LENGTH) {
    return `${label} is ${identifier.length} characters; the limit is ${VENUE_MAP_MAX_IDENTIFIER_LENGTH}.`;
  }
  if (canonicalVenueMapIdentifier(value) === null) {
    return `${label} uses an internal recovery marker and must be replaced.`;
  }
  return null;
}

function eventScopeIdentifierIssues(
  value: unknown,
  label: string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return [`${label} must be an array of venue IDs.`];
  return value.flatMap((identifier, index) => {
    const issue = identifierFieldIssue(identifier, `${label} entry ${index + 1}`);
    return issue ? [issue] : [];
  });
}

/** Detect identity/reference data that must never be defaulted or truncated. */
export function venueMapIdentifierIntegrityIssues(value: unknown): string[] {
  const source = record(value);
  if (!source) return [];
  const issues: string[] = [];
  const scan = (
    collection: unknown,
    familyLabel: string,
    visit: (item: Record<string, unknown>, occurrenceIndex: number) => void,
  ) => {
    if (!Array.isArray(collection)) return;
    collection.forEach((candidate, occurrenceIndex) => {
      const item = record(candidate);
      if (!item) return;
      const idIssue = identifierFieldIssue(
        item.id,
        `${familyLabel} ${occurrenceIndex + 1} ID`,
      );
      if (idIssue) issues.push(idIssue);
      visit(item, occurrenceIndex);
    });
  };

  scan(source.points, 'Point', (item, occurrenceIndex) => {
    if (item.venueId !== undefined) {
      const issue = identifierFieldIssue(
        item.venueId,
        `Point ${occurrenceIndex + 1} linked venue ID`,
      );
      if (issue) issues.push(issue);
    }
    issues.push(...eventScopeIdentifierIssues(
      item.eventSpaceIds,
      `Point ${occurrenceIndex + 1} event scope`,
    ));
  });
  scan(source.routes, 'Walkway', (item, occurrenceIndex) => {
    if (!Array.isArray(item.pointIds)) {
      issues.push(`Walkway ${occurrenceIndex + 1} point references must be an array of point IDs.`);
    } else {
      item.pointIds.forEach((pointId, pointIndex) => {
        const issue = identifierFieldIssue(
          pointId,
          `Walkway ${occurrenceIndex + 1} stop ${pointIndex + 1} point ID`,
        );
        if (issue) issues.push(issue);
      });
    }
    issues.push(...eventScopeIdentifierIssues(
      item.eventSpaceIds,
      `Walkway ${occurrenceIndex + 1} event scope`,
    ));
  });
  scan(source.drawings, 'Shape', (item, occurrenceIndex) => {
    issues.push(...eventScopeIdentifierIssues(
      item.eventSpaceIds,
      `Shape ${occurrenceIndex + 1} event scope`,
    ));
  });
  scan(source.rainContingencies, 'Rain plan', (item, occurrenceIndex) => {
    const outdoorIssue = identifierFieldIssue(
      item.outdoorVenueId,
      `Rain plan ${occurrenceIndex + 1} outdoor venue ID`,
    );
    const indoorIssue = identifierFieldIssue(
      item.indoorVenueId,
      `Rain plan ${occurrenceIndex + 1} indoor venue ID`,
    );
    if (outdoorIssue) issues.push(outdoorIssue);
    if (indoorIssue) issues.push(indoorIssue);
  });
  return issues;
}

export function assertVenueMapIdentifiersValid(value: unknown): void {
  const issue = venueMapIdentifierIntegrityIssues(value)[0];
  if (issue) {
    throw new Error(`${issue} Venue Map identifiers must be explicitly repaired before publication.`);
  }
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalText(value: unknown, maxLength = VENUE_MAP_MAX_GUIDANCE_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

/** Keep an invalid persisted value intact on admin recovery surfaces. */
function recoveryAwareText(
  value: unknown,
  maxLength: number,
  preserveInvalid: boolean,
  required = false,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (preserveInvalid && (trimmed.length > maxLength || (required && trimmed.length === 0))) {
    return value;
  }
  return trimmed.slice(0, maxLength) || undefined;
}

/** Canonicalize only a structurally valid identifier; never slice identity data. */
function normalizedIdentifier(value: unknown): string | null {
  return canonicalVenueMapIdentifier(value);
}

/** Keep malformed string identity visible in admin recovery controls. */
function recoveryIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function normalizedRoutePointIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [INVALID_VENUE_MAP_POINT_REFERENCE];
  return value.map((item) => {
    if (typeof item !== 'string') return INVALID_VENUE_MAP_POINT_REFERENCE;
    const normalized = normalizedIdentifier(item);
    // Preserve a malformed authored string exactly so route recovery can
    // identify it; valid references still use their canonical trimmed value.
    return normalized ?? item;
  });
}

function normalizedEventSpaceIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [INVALID_VENUE_MAP_EVENT_SCOPE];
  const ids = [...new Set(value.map((item) => {
    if (typeof item !== 'string') return INVALID_VENUE_MAP_EVENT_SCOPE;
    return normalizedIdentifier(item) ?? item;
  }))];
  return ids.length ? ids : undefined;
}

function normalizedAudience(value: unknown, preserveInvalid = false): VenueMapAudience {
  // Audience-less legacy objects were historically public. An explicitly
  // present null, blank, or malformed value is different: admin recovery keeps
  // it exact for repair, while non-recovery normalization fails closed to staff.
  // JSON cannot preserve an explicitly undefined property, so undefined remains
  // the reliable legacy/missing signal here.
  if (value === undefined) return 'public';
  if (typeof value === 'string' && AUDIENCES.has(value as VenueMapAudience)) {
    return value as VenueMapAudience;
  }
  return preserveInvalid ? value as VenueMapAudience : 'staff';
}

function safeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  return color === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(color) ? color : undefined;
}

function safeBackgroundRef(value: unknown): string | undefined {
  return isSafeVenueMapBackgroundRef(value) ? value : undefined;
}

export interface NormalizeVenueMapConfigOptions {
  /** Preserve server-authored portal availability metadata; canonical admin saves omit it. */
  preservePortalStatus?: boolean;
  /** Admin/cache recovery only: retain duplicate object IDs and competing rain plans. */
  preserveDuplicateIds?: boolean;
}

type VenueMapStructuralRecoveryBase = {
  /** Display-only occurrence identity; it is never eligible for publication. */
  key: string;
  occurrenceIndex: number;
  issues: string[];
  collectionMalformed?: boolean;
  /** The saved document explicitly supplied an invalid width or height. */
  mapFrameMalformed?: boolean;
  /** The whole saved document exceeds a bounded rendering/storage/query budget. */
  mapComplexityExceeded?: boolean;
};

export type VenueMapStructuralRecoveryArtifact =
  | (VenueMapStructuralRecoveryBase & {
      family: 'map';
      candidate: { id?: never };
    })
  | (VenueMapStructuralRecoveryBase & {
      family: 'point';
      candidate: Partial<VenueMapPoint>;
    })
  | (VenueMapStructuralRecoveryBase & {
      family: 'route';
      candidate: Partial<VenueMapRoute>;
    })
  | (VenueMapStructuralRecoveryBase & {
      family: 'drawing';
      candidate: Partial<DrawingObject>;
    })
  | (VenueMapStructuralRecoveryBase & {
      family: 'rainContingency';
      candidate: Partial<RainContingency>;
    });

export interface VenueMapNormalizationAnalysis {
  map: VenueMapConfig | null;
  structuralRecoveryArtifacts: VenueMapStructuralRecoveryArtifact[];
  /** Raw over-budget source; admin recovery only and never part of a portal map. */
  quarantinedMap?: unknown;
}

export interface VenueMapStructuralRecoveryBackupEnvelope {
  mapFingerprint: string;
  artifacts: VenueMapStructuralRecoveryArtifact[];
  /** Optional whole-map recovery payload, checksum-covered by backup bundle v2. */
  quarantinedMap?: unknown;
  quarantinedMapFingerprint?: string;
  /** True only for a shareable backup whose recovery source had secrets omitted. */
  quarantinedMapRedacted?: boolean;
}

type StoredVenueMapStructuralRecovery = VenueMapStructuralRecoveryBackupEnvelope;

/**
 * Normalize untrusted local/cloud JSON into the canonical venue-map contract.
 * Objects are rebuilt from an allowlist so unknown/internal fields cannot ride
 * along into couple or guest projections.
 */
function normalizeVenueMapConfigInternal(
  value: unknown,
  options: NormalizeVenueMapConfigOptions,
  structuralRecoveryArtifacts: VenueMapStructuralRecoveryArtifact[],
  precomputedComplexityIssues?: string[],
): VenueMapConfig | null {
  const complexityIssues = precomputedComplexityIssues || venueMapComplexityIssues(value);
  const source = record(value);
  if (!source) {
    if (complexityIssues.length > 0) {
      structuralRecoveryArtifacts.push({
        key: 'map:complexity',
        family: 'map',
        occurrenceIndex: -1,
        issues: complexityIssues,
        mapComplexityExceeded: true,
        candidate: {},
      });
      return emptyVenueMapConfig();
    }
    if (value !== null && value !== undefined) {
      structuralRecoveryArtifacts.push({
        key: 'map:root',
        family: 'map',
        occurrenceIndex: -1,
        collectionMalformed: true,
        issues: ['The saved Venue Map is not an object and cannot be interpreted safely.'],
        candidate: {},
      });
    }
    return null;
  }
  const frameIssues = venueMapFrameIssues(source);
  const width = boundedNumber(
    Object.prototype.hasOwnProperty.call(source, 'width') ? source.width : undefined,
    LEGACY_VENUE_MAP_WIDTH,
    VENUE_MAP_FRAME_MIN,
    VENUE_MAP_FRAME_MAX,
  );
  const height = boundedNumber(
    Object.prototype.hasOwnProperty.call(source, 'height') ? source.height : undefined,
    LEGACY_VENUE_MAP_HEIGHT,
    VENUE_MAP_FRAME_MIN,
    VENUE_MAP_FRAME_MAX,
  );
  if (frameIssues.length > 0) {
    structuralRecoveryArtifacts.push({
      key: 'map:frame',
      family: 'map',
      occurrenceIndex: -1,
      issues: frameIssues,
      mapFrameMalformed: true,
      candidate: {},
    });
  }

  if (complexityIssues.length > 0) {
    structuralRecoveryArtifacts.push({
      key: 'map:complexity',
      family: 'map',
      occurrenceIndex: -1,
      issues: complexityIssues,
      mapComplexityExceeded: true,
      candidate: {},
    });
    // Never pick an arbitrary prefix of an oversized identity graph. A small,
    // non-publishable working surface stays responsive while the exact source
    // remains in the separately fingerprinted admin recovery envelope.
    return {
      width,
      height,
      points: [],
      routes: [],
      drawings: [],
      rainContingencies: [],
      updatedAt: optionalText(source.updatedAt, 100) || new Date().toISOString(),
    };
  }

  const pointCandidates = Array.isArray(source.points) ? source.points : [];
  if (source.points !== undefined && !Array.isArray(source.points)) {
    structuralRecoveryArtifacts.push({
      key: 'point:collection',
      family: 'point',
      occurrenceIndex: -1,
      collectionMalformed: true,
      issues: ['The saved points collection is not an array and cannot be interpreted safely.'],
      candidate: {},
    });
  }
  const points: VenueMapPoint[] = [];
  const pointIds = new Set<string>();
  for (const [occurrenceIndex, candidate] of pointCandidates.entries()) {
    const item = record(candidate);
    if (!item) {
      structuralRecoveryArtifacts.push({
        key: `point:${occurrenceIndex}`,
        family: 'point',
        occurrenceIndex,
        issues: ['This saved point occurrence is not an object.'],
        candidate: {},
      });
      continue;
    }
    const id = normalizedIdentifier(item.id);
    const kind = typeof item.kind === 'string' && POINT_KINDS.has(item.kind as VenueMapPointKind)
      ? item.kind as VenueMapPointKind
      : null;
    const x = finiteNumber(item.x);
    const y = finiteNumber(item.y);
    // Keep finite saved coordinates exact. If they cannot fit the temporary
    // recovery frame, quarantine the point separately until the admin chooses
    // valid dimensions and explicitly reconstructs or moves it.
    const xOutsideFrame = x !== null && (x < 0 || x > width);
    const yOutsideFrame = y !== null && (y < 0 || y > height);
    const latitude = item.lat;
    const longitude = item.lng;
    const hasGpsPair = typeof latitude === 'number' && Number.isFinite(latitude)
      && latitude >= -90 && latitude <= 90
      && typeof longitude === 'number' && Number.isFinite(longitude)
      && longitude >= -180 && longitude <= 180;
    const gpsIssue = venueMapPointGpsIssue({
      lat: latitude as number | undefined,
      lng: longitude as number | undefined,
    });
    const preserveInvalidGps = options.preserveDuplicateIds === true && gpsIssue !== null;
    const safeCandidate: Partial<VenueMapPoint> = {
      id: id || recoveryIdentifier(item.id),
      label: recoveryAwareText(
        item.label,
        VENUE_MAP_MAX_POINT_LABEL_LENGTH,
        options.preserveDuplicateIds === true,
        true,
      ) ?? (kind ? 'Point' : 'Recovered map point'),
      description: recoveryAwareText(
        item.description,
        VENUE_MAP_MAX_GUIDANCE_LENGTH,
        options.preserveDuplicateIds === true,
      ),
      x: x ?? width / 2,
      y: y ?? height / 2,
      kind: kind || undefined,
      audience: normalizedAudience(item.audience, options.preserveDuplicateIds === true),
      eventSpaceIds: kind === 'space' ? undefined : normalizedEventSpaceIds(item.eventSpaceIds),
      // Preserve explicit invalid/stale values for exact admin repair and
      // fail-closed portal projection. Successful publication validates first.
      arrivalRole: item.arrivalRole === undefined
        ? undefined
        : item.arrivalRole as VenueMapArrivalRole,
      venueId: kind && kind !== 'space'
        ? undefined
        : normalizedIdentifier(item.venueId) ?? recoveryIdentifier(item.venueId),
      lat: hasGpsPair
        ? latitude
        : preserveInvalidGps && item.lat !== undefined ? item.lat as number : undefined,
      lng: hasGpsPair
        ? longitude
        : preserveInvalidGps && item.lng !== undefined ? item.lng as number : undefined,
    };
    const issues = [
      ...(!id ? ['The point is missing a valid ID.'] : []),
      ...(!kind ? [`The point kind “${optionalText(item.kind, 50) || 'blank'}” is unsupported.`] : []),
      ...(x === null ? ['The point is missing a finite horizontal coordinate.'] : []),
      ...(y === null ? ['The point is missing a finite vertical coordinate.'] : []),
      ...(xOutsideFrame
        ? [`The point horizontal coordinate falls outside the ${frameIssues.length > 0 ? 'temporary recovery' : 'current'} map frame (0 to ${width}).`]
        : []),
      ...(yOutsideFrame
        ? [`The point vertical coordinate falls outside the ${frameIssues.length > 0 ? 'temporary recovery' : 'current'} map frame (0 to ${height}).`]
        : []),
    ];
    if (issues.length > 0) {
      structuralRecoveryArtifacts.push({
        key: `point:${occurrenceIndex}`,
        family: 'point',
        occurrenceIndex,
        issues,
        candidate: safeCandidate,
      });
      continue;
    }
    if (!options.preserveDuplicateIds && pointIds.has(id!)) continue;
    pointIds.add(id!);
    points.push(safeCandidate as VenueMapPoint);
  }

  const routeCandidates = Array.isArray(source.routes) ? source.routes : [];
  if (source.routes !== undefined && !Array.isArray(source.routes)) {
    structuralRecoveryArtifacts.push({
      key: 'route:collection',
      family: 'route',
      occurrenceIndex: -1,
      collectionMalformed: true,
      issues: ['The saved routes collection is not an array and cannot be interpreted safely.'],
      candidate: {},
    });
  }
  const routes: VenueMapRoute[] = [];
  const routeIds = new Set<string>();
  for (const [occurrenceIndex, candidate] of routeCandidates.entries()) {
    const item = record(candidate);
    if (!item) {
      structuralRecoveryArtifacts.push({
        key: `route:${occurrenceIndex}`,
        family: 'route',
        occurrenceIndex,
        issues: ['This saved route occurrence is not an object.'],
        candidate: {},
      });
      continue;
    }
    const id = normalizedIdentifier(item.id);
    const safeCandidate: Partial<VenueMapRoute> = {
      id: id || recoveryIdentifier(item.id),
      name: recoveryAwareText(
        item.name,
        VENUE_MAP_MAX_ROUTE_NAME_LENGTH,
        options.preserveDuplicateIds === true,
        true,
      ) ?? 'Recovered walkway',
      pointIds: normalizedRoutePointIds(item.pointIds),
      audience: normalizedAudience(item.audience, options.preserveDuplicateIds === true),
      eventSpaceIds: normalizedEventSpaceIds(item.eventSpaceIds),
      accessibility: item.accessibility === undefined
        ? 'unknown'
        : typeof item.accessibility === 'string'
          && ACCESSIBILITY.has(item.accessibility as VenueMapRouteAccessibility)
          ? item.accessibility as VenueMapRouteAccessibility
          : options.preserveDuplicateIds === true
            ? item.accessibility as VenueMapRouteAccessibility
            : 'unknown',
      priority: !Object.prototype.hasOwnProperty.call(item, 'priority')
        ? 'standard'
        : typeof item.priority === 'string'
          && ROUTE_PRIORITIES.has(item.priority as VenueMapRoutePriority)
          ? item.priority as VenueMapRoutePriority
          : INVALID_VENUE_MAP_ROUTE_PRIORITY,
      notes: recoveryAwareText(
        item.notes,
        VENUE_MAP_MAX_GUIDANCE_LENGTH,
        options.preserveDuplicateIds === true,
      ),
    };
    if (!id) {
      structuralRecoveryArtifacts.push({
        key: `route:${occurrenceIndex}`,
        family: 'route',
        occurrenceIndex,
        issues: ['The walkway is missing a valid ID.'],
        candidate: safeCandidate,
      });
      continue;
    }
    if (!options.preserveDuplicateIds && routeIds.has(id)) continue;
    routeIds.add(id);
    routes.push(safeCandidate as VenueMapRoute);
  }

  const drawingCandidates = Array.isArray(source.drawings) ? source.drawings : [];
  if (source.drawings !== undefined && !Array.isArray(source.drawings)) {
    structuralRecoveryArtifacts.push({
      key: 'drawing:collection',
      family: 'drawing',
      occurrenceIndex: -1,
      collectionMalformed: true,
      issues: ['The saved drawings collection is not an array and cannot be interpreted safely.'],
      candidate: {},
    });
  }
  const drawings: DrawingObject[] = [];
  const drawingIds = new Set<string>();
  for (const [occurrenceIndex, candidate] of drawingCandidates.entries()) {
    const item = record(candidate);
    if (!item) {
      structuralRecoveryArtifacts.push({
        key: `drawing:${occurrenceIndex}`,
        family: 'drawing',
        occurrenceIndex,
        issues: ['This saved drawing occurrence is not an object.'],
        candidate: {},
      });
      continue;
    }
    const id = normalizedIdentifier(item.id);
    const type = optionalText(item.type, 50);
    const structurallyValid = Boolean(id && type);
    const preserveRecoveryGeometry = options.preserveDuplicateIds === true;
    const rotationMalformed = item.rotation !== undefined && (
      typeof item.rotation !== 'number'
      || !Number.isFinite(item.rotation)
      || item.rotation < -360
      || item.rotation > 360
    );
    const presentationMalformed = venueMapDrawingPresentationIssues(
      item as unknown as DrawingObject,
    ).length > 0;
    const drawingPoints = Array.isArray(item.points)
      ? item.points.flatMap((candidatePoint) => {
          const point = record(candidatePoint);
          if (
            !point
            || typeof point.x !== 'number'
            || !Number.isFinite(point.x)
            || typeof point.y !== 'number'
            || !Number.isFinite(point.y)
          ) {
            return preserveRecoveryGeometry && structurallyValid
              ? [{ x: Number.NaN, y: Number.NaN }]
              : [];
          }
          return [{
            x: preserveRecoveryGeometry ? point.x : boundedNumber(point.x, 0, 0, width),
            y: preserveRecoveryGeometry ? point.y : boundedNumber(point.y, 0, 0, height),
          }];
        })
      : undefined;
    const safeCandidate: Partial<DrawingObject> = {
      id: id || recoveryIdentifier(item.id),
      type: type || undefined,
      x: typeof item.x === 'number' && Number.isFinite(item.x)
        ? preserveRecoveryGeometry ? item.x : boundedNumber(item.x, 0, 0, width)
        : preserveRecoveryGeometry && structurallyValid ? Number.NaN : 0,
      y: typeof item.y === 'number' && Number.isFinite(item.y)
        ? preserveRecoveryGeometry ? item.y : boundedNumber(item.y, 0, 0, height)
        : preserveRecoveryGeometry && structurallyValid ? Number.NaN : 0,
      width: typeof item.width === 'number' && Number.isFinite(item.width)
        ? preserveRecoveryGeometry ? item.width : boundedNumber(item.width, 1, 1, width)
        : undefined,
      height: typeof item.height === 'number' && Number.isFinite(item.height)
        ? preserveRecoveryGeometry ? item.height : boundedNumber(item.height, 1, 1, height)
        : undefined,
      points: drawingPoints,
      rotation: typeof item.rotation === 'number' && Number.isFinite(item.rotation)
        ? item.rotation
        : preserveRecoveryGeometry && structurallyValid && item.rotation !== undefined
          ? Number.NaN
          : undefined,
      fillColor: preserveRecoveryGeometry && item.fillColor !== undefined
        ? item.fillColor as string
        : safeColor(item.fillColor),
      strokeColor: preserveRecoveryGeometry && item.strokeColor !== undefined
        ? item.strokeColor as string
        : safeColor(item.strokeColor),
      strokeWidth: preserveRecoveryGeometry && item.strokeWidth !== undefined
        ? item.strokeWidth as number
        : typeof item.strokeWidth === 'number'
          ? boundedNumber(item.strokeWidth, 1, 0.1, 20)
          : undefined,
      opacity: preserveRecoveryGeometry && item.opacity !== undefined
        ? item.opacity as number
        : typeof item.opacity === 'number'
          ? boundedNumber(item.opacity, 1, 0, 1)
          : undefined,
      fontSize: preserveRecoveryGeometry && item.fontSize !== undefined
        ? item.fontSize as number
        : typeof item.fontSize === 'number'
          ? boundedNumber(item.fontSize, 12, 1, 100)
          : undefined,
      text: recoveryAwareText(
        item.text,
        VENUE_MAP_MAX_DRAWING_TEXT_LENGTH,
        options.preserveDuplicateIds === true,
      ),
      radius: typeof item.radius === 'number' && Number.isFinite(item.radius)
        ? preserveRecoveryGeometry
          ? item.radius
          : boundedNumber(item.radius, 1, 1, Math.min(width, height) / 2)
        : undefined,
      audience: normalizedAudience(item.audience, options.preserveDuplicateIds === true),
      eventSpaceIds: normalizedEventSpaceIds(item.eventSpaceIds),
    };
    const issues = [
      ...(!id ? ['The map shape is missing a valid ID.'] : []),
      ...(!type ? ['The map shape is missing a drawing type.'] : []),
    ];
    if (issues.length > 0) {
      structuralRecoveryArtifacts.push({
        key: `drawing:${occurrenceIndex}`,
        family: 'drawing',
        occurrenceIndex,
        issues,
        candidate: safeCandidate,
      });
      continue;
    }
    if (!preserveRecoveryGeometry && (rotationMalformed || presentationMalformed)) continue;
    if (!options.preserveDuplicateIds && drawingIds.has(id!)) continue;
    drawingIds.add(id!);
    const drawing = safeCandidate as DrawingObject;
    drawings.push(
      preserveRecoveryGeometry && venueMapDrawingIntegrityIssue(drawing, { width, height })
        ? drawing
        : constrainMapDrawing(drawing, width, height),
    );
  }

  const rainCandidates = Array.isArray(source.rainContingencies) ? source.rainContingencies : [];
  if (source.rainContingencies !== undefined && !Array.isArray(source.rainContingencies)) {
    structuralRecoveryArtifacts.push({
      key: 'rainContingency:collection',
      family: 'rainContingency',
      occurrenceIndex: -1,
      collectionMalformed: true,
      issues: ['The saved rain-plan collection is not an array and cannot be interpreted safely.'],
      candidate: {},
    });
  }
  const rainContingencies: RainContingency[] = [];
  const contingencyIds = new Set<string>();
  const contingencyOutdoorVenueIds = new Set<string>();
  for (const [occurrenceIndex, candidate] of rainCandidates.entries()) {
    const item = record(candidate);
    if (!item) {
      structuralRecoveryArtifacts.push({
        key: `rainContingency:${occurrenceIndex}`,
        family: 'rainContingency',
        occurrenceIndex,
        issues: ['This saved rain-plan occurrence is not an object.'],
        candidate: {},
      });
      continue;
    }
    const id = normalizedIdentifier(item.id);
    const outdoorVenueId = normalizedIdentifier(item.outdoorVenueId);
    const indoorVenueId = normalizedIdentifier(item.indoorVenueId);
    const safeCandidate: Partial<RainContingency> = {
      id: id || recoveryIdentifier(item.id),
      outdoorVenueId: outdoorVenueId || recoveryIdentifier(item.outdoorVenueId),
      indoorVenueId: indoorVenueId || recoveryIdentifier(item.indoorVenueId),
      note: recoveryAwareText(
        item.note,
        VENUE_MAP_MAX_GUIDANCE_LENGTH,
        options.preserveDuplicateIds === true,
      ),
    };
    const issues = [
      ...(!id ? ['The rain plan is missing a valid ID.'] : []),
      ...(!outdoorVenueId ? ['The rain plan is missing an outdoor source ID.'] : []),
      ...(!indoorVenueId ? ['The rain plan is missing an indoor backup ID.'] : []),
    ];
    if (issues.length > 0) {
      structuralRecoveryArtifacts.push({
        key: `rainContingency:${occurrenceIndex}`,
        family: 'rainContingency',
        occurrenceIndex,
        issues,
        candidate: safeCandidate,
      });
      continue;
    }
    if (
      (!options.preserveDuplicateIds && outdoorVenueId === indoorVenueId)
      || (!options.preserveDuplicateIds && contingencyIds.has(id!))
      || (!options.preserveDuplicateIds && contingencyOutdoorVenueIds.has(outdoorVenueId!))
    ) continue;
    contingencyIds.add(id!);
    contingencyOutdoorVenueIds.add(outdoorVenueId!);
    rainContingencies.push(safeCandidate as RainContingency);
  }

  const preserveRecoveryValues = options.preserveDuplicateIds === true;
  const baseImageMalformed = venueMapHasInvalidBaseImage(source);
  const backgroundImageUrl = !preserveRecoveryValues && baseImageMalformed
    ? undefined
    : preserveRecoveryValues && source.backgroundImageUrl !== undefined
      ? source.backgroundImageUrl as string
      : safeBackgroundRef(source.backgroundImageUrl);
  const backgroundOpacity = !preserveRecoveryValues && baseImageMalformed
    ? undefined
    : preserveRecoveryValues && source.backgroundOpacity !== undefined
      ? source.backgroundOpacity as number
      : backgroundImageUrl
        ? boundedNumber(source.backgroundOpacity, 0.85, 0.1, 1)
        : undefined;
  return {
    width,
    height,
    points,
    routes,
    drawings,
    rainContingencies,
    backgroundImageUrl,
    backgroundOpacity,
    backgroundImageUnavailable: options.preservePortalStatus
      && source.backgroundImageUnavailable === true
      ? true
      : undefined,
    updatedAt: optionalText(source.updatedAt, 100) || new Date().toISOString(),
  };
}

export function analyzeVenueMapConfig(
  value: unknown,
  options: NormalizeVenueMapConfigOptions = {},
): VenueMapNormalizationAnalysis {
  const structuralRecoveryArtifacts: VenueMapStructuralRecoveryArtifact[] = [];
  const complexityIssues = venueMapComplexityIssues(value);
  const normalized = normalizeVenueMapConfigInternal(
    value,
    options,
    structuralRecoveryArtifacts,
    complexityIssues,
  );
  return {
    // A malformed persisted document still needs a safe admin working surface
    // so its separate recovery artifact remains visible and removable.
    map: normalized || (structuralRecoveryArtifacts.some((artifact) => artifact.family === 'map')
      ? emptyVenueMapConfig()
      : null),
    structuralRecoveryArtifacts,
    quarantinedMap: complexityIssues.length > 0 ? value : undefined,
  };
}

export function normalizeVenueMapConfig(
  value: unknown,
  options: NormalizeVenueMapConfigOptions = {},
): VenueMapConfig | null {
  return normalizeVenueMapConfigInternal(value, options, []);
}

/** Portal-facing normalization defaults omitted legacy dimensions but never repairs an explicit bad frame. */
export function normalizeVenueMapConfigForPortal(
  value: unknown,
  options: NormalizeVenueMapConfigOptions = {},
): VenueMapConfig | null {
  if (venueMapFrameIssue(value) || venueMapComplexityIssues(value).length > 0) return null;
  const recoverySafe = normalizeVenueMapConfig(value, {
    ...options,
    preserveDuplicateIds: true,
  });
  if (!recoverySafe) return null;
  const uniqueSpaceLinkMap = partitionVenueMapSpacePointLinkCollisions(recoverySafe).map;
  const textSafe = partitionVenueMapTextIntegrity(uniqueSpaceLinkMap);
  const arrivalRoleSafe = partitionVenueMapArrivalRoleIntegrity(textSafe);
  const routeSafe = partitionVenueMapRouteReferenceIntegrity(arrivalRoleSafe).map;
  const drawingSafe = partitionVenueMapDrawingIntegrity(routeSafe).map;
  const baseImageSafe = partitionVenueMapBaseImageIntegrity(drawingSafe);
  return normalizeVenueMapConfig(baseImageSafe, options);
}

let inMemoryStructuralRecovery: StoredVenueMapStructuralRecovery | null = null;
let structuralRecoveryStorageWriteFailed = false;

function compactMapFingerprint(value: string): string {
  // Four independently mixed 32-bit lanes provide a compact deterministic
  // content binding without duplicating a potentially multi-megabyte inline
  // base image inside local recovery/backup envelopes. This is an accidental
  // mismatch guard, not an authentication primitive (the backup has SHA-256).
  let h1 = 0x6a09e667 ^ value.length;
  let h2 = 0xbb67ae85 ^ value.length;
  let h3 = 0x3c6ef372 ^ value.length;
  let h4 = 0xa54ff53a ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x9e3779b1);
    h2 = Math.imul(h2 ^ code, 0x85ebca77);
    h3 = Math.imul(h3 ^ code, 0xc2b2ae3d);
    h4 = Math.imul(h4 ^ code, 0x27d4eb2f);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x85ebca6b) ^ h2;
  h2 = Math.imul(h2 ^ (h2 >>> 13), 0xc2b2ae35) ^ h3;
  h3 = Math.imul(h3 ^ (h3 >>> 16), 0x85ebca6b) ^ h4;
  h4 = Math.imul(h4 ^ (h4 >>> 13), 0xc2b2ae35) ^ h1;
  const hex = (hash: number) => (hash >>> 0).toString(16).padStart(8, '0');
  return `map-v1:${value.length}:${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
}

function structuralRecoveryFingerprint(map: VenueMapConfig | null): string {
  const canonical = JSON.stringify(map === null
    ? null
    : normalizeVenueMapConfig(map, { preserveDuplicateIds: true }));
  return compactMapFingerprint(canonical);
}

function quarantinedVenueMapFingerprint(value: unknown): string | null {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : compactMapFingerprint(serialized);
  } catch {
    return null;
  }
}

function sanitizeStructuralRecoveryCandidate(
  family: VenueMapStructuralRecoveryArtifact['family'],
  value: unknown,
): VenueMapStructuralRecoveryArtifact['candidate'] {
  const candidate = record(value);
  if (!candidate || family === 'map') return {};
  if (family === 'point') {
    const x = finiteNumber(candidate.x);
    const y = finiteNumber(candidate.y);
    return {
      id: normalizedIdentifier(candidate.id) ?? recoveryIdentifier(candidate.id),
      label: recoveryAwareText(
        candidate.label,
        VENUE_MAP_MAX_POINT_LABEL_LENGTH,
        true,
        true,
      ) ?? 'Recovered map point',
      description: recoveryAwareText(
        candidate.description,
        VENUE_MAP_MAX_GUIDANCE_LENGTH,
        true,
      ),
      x: x === null ? undefined : x,
      y: y === null ? undefined : y,
      kind: typeof candidate.kind === 'string'
        && POINT_KINDS.has(candidate.kind as VenueMapPointKind)
        ? candidate.kind as VenueMapPointKind
        : undefined,
      audience: normalizedAudience(candidate.audience, true),
      eventSpaceIds: normalizedEventSpaceIds(candidate.eventSpaceIds),
      arrivalRole: candidate.arrivalRole === undefined
        ? undefined
        : candidate.arrivalRole as VenueMapArrivalRole,
      venueId: normalizedIdentifier(candidate.venueId) ?? recoveryIdentifier(candidate.venueId),
      lat: candidate.lat === undefined ? undefined : candidate.lat as number,
      lng: candidate.lng === undefined ? undefined : candidate.lng as number,
    };
  }
  const recoveryMap = {
    ...emptyVenueMapConfig(),
    updatedAt: 'recovery-candidate',
    points: [],
    routes: family === 'route' ? [candidate] : [],
    drawings: family === 'drawing' ? [candidate] : [],
    rainContingencies: family === 'rainContingency' ? [candidate] : [],
  };
  const analysis = analyzeVenueMapConfig(recoveryMap, { preserveDuplicateIds: true });
  const quarantined = analysis.structuralRecoveryArtifacts.find((artifact) =>
    artifact.family === family && artifact.occurrenceIndex === 0,
  );
  if (quarantined) return quarantined.candidate;
  if (family === 'route') return analysis.map?.routes[0] || {};
  if (family === 'drawing') return (analysis.map?.drawings || [])[0] || {};
  return (analysis.map?.rainContingencies || [])[0] || {};
}

function normalizeStoredStructuralRecovery(value: unknown): StoredVenueMapStructuralRecovery | null {
  const source = record(value);
  if (
    !source
    || typeof source.mapFingerprint !== 'string'
    || source.mapFingerprint.length < 1
    || source.mapFingerprint.length > 200
    || !Array.isArray(source.artifacts)
    || source.artifacts.length > 10_000
  ) {
    return null;
  }
  const seenKeys = new Set<string>();
  const artifacts = source.artifacts.flatMap((candidate) => {
    const item = record(candidate);
    const family = item?.family;
    const recoveryCandidate = record(item?.candidate);
    if (
      !item
      || !['map', 'point', 'route', 'drawing', 'rainContingency'].includes(String(family))
      || typeof item.key !== 'string'
      || item.key.length < 1
      || item.key.length > 200
      || seenKeys.has(item.key)
      || typeof item.occurrenceIndex !== 'number'
      || !Number.isInteger(item.occurrenceIndex)
      || !Array.isArray(item.issues)
      || !recoveryCandidate
    ) return [];
    const issues = item.issues
      .filter((issue): issue is string => typeof issue === 'string')
      .map((issue) => issue.slice(0, 500))
      .slice(0, 10);
    if (issues.length === 0) return [];
    seenKeys.add(item.key);
    return [{
      key: item.key,
      family,
      occurrenceIndex: item.occurrenceIndex,
      collectionMalformed: item.collectionMalformed === true || undefined,
      mapFrameMalformed:
        family === 'map' && item.mapFrameMalformed === true ? true : undefined,
      mapComplexityExceeded:
        family === 'map' && item.mapComplexityExceeded === true ? true : undefined,
      issues,
      candidate: sanitizeStructuralRecoveryCandidate(
        family as VenueMapStructuralRecoveryArtifact['family'],
        recoveryCandidate,
      ),
    } as VenueMapStructuralRecoveryArtifact];
  });
  const hasComplexityQuarantine = artifacts.some(
    (artifact) => artifact.family === 'map' && artifact.mapComplexityExceeded === true,
  );
  const quarantinedFingerprint = quarantinedVenueMapFingerprint(source.quarantinedMap);
  const quarantinedMapRedacted = source.quarantinedMapRedacted === true;
  if (hasComplexityQuarantine) {
    if (
      quarantinedFingerprint === null
      || typeof source.quarantinedMapFingerprint !== 'string'
      || source.quarantinedMapFingerprint !== quarantinedFingerprint
      || (!quarantinedMapRedacted && venueMapComplexityIssues(source.quarantinedMap).length === 0)
    ) return null;
  } else if (
    source.quarantinedMap !== undefined
    || source.quarantinedMapFingerprint !== undefined
    || source.quarantinedMapRedacted !== undefined
  ) {
    return null;
  }
  return {
    mapFingerprint: source.mapFingerprint,
    artifacts,
    quarantinedMap: hasComplexityQuarantine ? source.quarantinedMap : undefined,
    quarantinedMapFingerprint: hasComplexityQuarantine ? quarantinedFingerprint! : undefined,
    quarantinedMapRedacted: hasComplexityQuarantine && quarantinedMapRedacted ? true : undefined,
  };
}

function writeVenueMapStructuralRecovery(
  map: VenueMapConfig | null,
  artifacts: VenueMapStructuralRecoveryArtifact[],
  quarantinedMap?: unknown,
  quarantinedMapRedacted = false,
): void {
  const hasComplexityQuarantine = artifacts.some(
    (artifact) => artifact.family === 'map' && artifact.mapComplexityExceeded === true,
  );
  const quarantinedMapFingerprint = hasComplexityQuarantine
    ? quarantinedVenueMapFingerprint(quarantinedMap)
    : null;
  const stored = {
    mapFingerprint: structuralRecoveryFingerprint(map),
    artifacts,
    quarantinedMap: hasComplexityQuarantine ? quarantinedMap : undefined,
    quarantinedMapFingerprint: quarantinedMapFingerprint || undefined,
    quarantinedMapRedacted: hasComplexityQuarantine && quarantinedMapRedacted ? true : undefined,
  };
  inMemoryStructuralRecovery = stored;
  try {
    saveVersionedStorage(
      STRUCTURAL_RECOVERY_KEY,
      STRUCTURAL_RECOVERY_VERSION,
      stored,
      { emitChange: false },
    );
    structuralRecoveryStorageWriteFailed = false;
  } catch {
    structuralRecoveryStorageWriteFailed = true;
    try {
      localStorage.removeItem(STRUCTURAL_RECOVERY_KEY);
    } catch {
      // Storage is unavailable; the in-memory envelope remains authoritative.
    }
    // The mounted admin session still retains this recovery state in memory.
  }
}

function readVenueMapStructuralRecovery(): StoredVenueMapStructuralRecovery | null {
  try {
    // Always re-read the envelope when storage is available. Another tab may
    // have resolved or discovered recovery artifacts; a process-local cache
    // must never authorize publication against stale cross-tab state.
    if (localStorage.getItem(STRUCTURAL_RECOVERY_KEY) === null) {
      // A quota failure can prevent a large recovery envelope from reaching
      // localStorage. Keep the mounted session fail-closed and recoverable in
      // memory; a subsequent server pull can repopulate it after reload.
      if (structuralRecoveryStorageWriteFailed) return inMemoryStructuralRecovery;
      inMemoryStructuralRecovery = null;
      return null;
    }
    structuralRecoveryStorageWriteFailed = false;
  } catch {
    return inMemoryStructuralRecovery;
  }
  const stored = loadVersionedStorage<StoredVenueMapStructuralRecovery | null>({
    key: STRUCTURAL_RECOVERY_KEY,
    defaultValue: null,
    currentVersion: STRUCTURAL_RECOVERY_VERSION,
    validate: (value): value is StoredVenueMapStructuralRecovery | null =>
      value === null || normalizeStoredStructuralRecovery(value) !== null,
    normalize: normalizeStoredStructuralRecovery,
  });
  inMemoryStructuralRecovery = stored;
  return stored;
}

export function getVenueMapStructuralRecoveryArtifacts(
  map: VenueMapConfig | null = getVenueMapConfig(),
): VenueMapStructuralRecoveryArtifact[] {
  const stored = readVenueMapStructuralRecovery();
  return stored?.mapFingerprint === structuralRecoveryFingerprint(map)
    ? stored.artifacts
    : [];
}

export function assertVenueMapStructuralRecoveryResolved(
  map: VenueMapConfig | null = getVenueMapConfig(),
): void {
  const artifacts = getVenueMapStructuralRecoveryArtifacts(map);
  if (artifacts.some(
    (artifact) => artifact.family === 'map' && artifact.mapComplexityExceeded === true,
  )) {
    throw new Error('The oversized Venue Map must be downloaded for recovery and reset before publication.');
  }
  if (artifacts.some(
    (artifact) => artifact.family === 'map' && artifact.mapFrameMalformed === true,
  )) {
    throw new Error('Invalid map dimensions must be explicitly accepted or reset before publication.');
  }
  if (artifacts.length > 0) {
    throw new Error('Structurally malformed map records must be explicitly reconstructed or removed before publication.');
  }
}

/** Export a checksum-covered, admin-backup-only copy of the quarantine state. */
export function getVenueMapStructuralRecoveryForBackup(): VenueMapStructuralRecoveryBackupEnvelope {
  const map = getVenueMapConfig();
  const stored = readVenueMapStructuralRecovery();
  if (stored?.mapFingerprint === structuralRecoveryFingerprint(map)) return stored;
  return {
    mapFingerprint: structuralRecoveryFingerprint(map),
    artifacts: [],
  };
}

export function getQuarantinedVenueMapForRecovery(
  map: VenueMapConfig | null = getVenueMapConfig(),
): unknown | undefined {
  const stored = readVenueMapStructuralRecovery();
  return stored?.mapFingerprint === structuralRecoveryFingerprint(map)
    ? stored.quarantinedMap
    : undefined;
}

/** Rebind the internal raw-source fingerprint after security redaction. */
export function venueMapRecoverySourceIsRedacted(
  map: VenueMapConfig | null = getVenueMapConfig(),
): boolean {
  const stored = readVenueMapStructuralRecovery();
  return stored?.mapFingerprint === structuralRecoveryFingerprint(map)
    && stored.quarantinedMapRedacted === true;
}

export function rebindVenueMapRecoveryAfterRedaction(value: unknown): unknown {
  const source = record(value);
  if (!source || source.quarantinedMap === undefined) return value;
  const fingerprint = quarantinedVenueMapFingerprint(source.quarantinedMap);
  return fingerprint
    ? { ...source, quarantinedMapFingerprint: fingerprint }
    : value;
}

export function venueMapStructuralRecoveryBackupIssue(
  value: unknown,
  mapValue: unknown,
): string | null {
  const source = record(value);
  const normalized = normalizeStoredStructuralRecovery(value);
  if (
    !source
    || !Array.isArray(source.artifacts)
    || !normalized
    || normalized.artifacts.length !== source.artifacts.length
  ) {
    return 'Venue Map structural recovery metadata is malformed.';
  }
  const mapAnalysis = mapValue === null
    ? { map: null, structuralRecoveryArtifacts: [] }
    : analyzeVenueMapConfig(mapValue, { preserveDuplicateIds: true });
  const map = mapAnalysis.map;
  if (mapValue !== null && !map) {
    return 'Venue Map structural recovery metadata has no valid map target.';
  }
  const retainedArtifacts = new Set(normalized.artifacts.map((artifact) => JSON.stringify(artifact)));
  if (mapAnalysis.structuralRecoveryArtifacts.some((artifact) =>
    !retainedArtifacts.has(JSON.stringify(artifact)),
  )) {
    return 'Venue Map structural recovery metadata omits malformed occurrences found in its map.';
  }
  if (normalized.mapFingerprint !== structuralRecoveryFingerprint(map)) {
    return 'Venue Map structural recovery metadata does not match its canonical map.';
  }
  return null;
}

/** Restore quarantine only when it is bound to the exact canonical map. */
export function restoreVenueMapStructuralRecoveryFromBackup(value: unknown): void {
  const map = getVenueMapConfig();
  const issue = venueMapStructuralRecoveryBackupIssue(value, map);
  if (issue) throw new Error(issue);
  const normalized = normalizeStoredStructuralRecovery(value)!;
  writeVenueMapStructuralRecovery(
    map,
    normalized.artifacts,
    normalized.quarantinedMap,
    normalized.quarantinedMapRedacted === true,
  );
}

export function getVenueMapConfig(): VenueMapConfig | null {
  let latestAnalysis: VenueMapNormalizationAnalysis = {
    map: null,
    structuralRecoveryArtifacts: [],
  };
  const map = loadVersionedStorage<VenueMapConfig | null>({
    key: MAP_KEY,
    defaultValue: null,
    currentVersion: MAP_VERSION,
    validate: (value): value is VenueMapConfig | null =>
      value === null || normalizeVenueMapConfig(value, { preserveDuplicateIds: true }) !== null,
    normalize: (value) => {
      latestAnalysis = value === null
        ? { map: null, structuralRecoveryArtifacts: [] }
        : analyzeVenueMapConfig(value, { preserveDuplicateIds: true });
      return latestAnalysis.map;
    },
  });
  const existingRecovery = readVenueMapStructuralRecovery();
  if (
    latestAnalysis.structuralRecoveryArtifacts.length > 0
    && existingRecovery?.mapFingerprint !== structuralRecoveryFingerprint(map)
  ) {
    // Self-heal only when normalization actually discovered artifacts. Never
    // erase a mismatched marker here: another tab may have written that marker
    // immediately before exposing its matching canonical cache.
    writeVenueMapStructuralRecovery(
      map,
      latestAnalysis.structuralRecoveryArtifacts,
      latestAnalysis.quarantinedMap,
    );
  }
  return map;
}

/**
 * Local/demo portal reads share browser storage with the admin editor. A
 * recovered working frame is admin-only until the explicit frame decision has
 * been made, so those portals must receive no map while that marker is pending.
 */
export function getVenueMapConfigForPortal(): VenueMapConfig | null {
  const map = getVenueMapConfig();
  if (!map || venueMapFrameIssue(map)) return null;
  return getVenueMapStructuralRecoveryArtifacts(map).some(
    (artifact) => artifact.family === 'map'
      && (artifact.mapFrameMalformed === true || artifact.mapComplexityExceeded === true),
  )
    ? null
    : partitionVenueMapBaseImageIntegrity(
        partitionVenueMapDrawingIntegrity(
          partitionVenueMapRouteReferenceIntegrity(partitionVenueMapArrivalRoleIntegrity(
            partitionVenueMapTextIntegrity(
              partitionVenueMapSpacePointLinkCollisions(map).map,
            ),
          )).map,
        ).map,
      );
}

export function assertVenueMapSpacePointLinksUnique(value: unknown): void {
  const normalized = normalizeVenueMapConfig(value, { preserveDuplicateIds: true });
  if (normalized && venueMapHasSpacePointLinkCollisions(normalized)) {
    throw new Error('Each event-space or lodging record may have only one canonical map pin. Duplicate linked space pins must be explicitly relinked, reclassified, or removed before publication.');
  }
}

export function assertVenueMapDrawingGeometryResolved(value: unknown): void {
  const analysis = analyzeVenueMapConfig(value, { preserveDuplicateIds: true });
  if (
    analysis.structuralRecoveryArtifacts.some((artifact) => artifact.family === 'drawing')
    || (analysis.map && venueMapHasInvalidDrawingGeometry(analysis.map))
  ) {
    throw new Error('Unsupported or malformed map shapes, including out-of-frame geometry, rotation, or appearance, must be repaired before the Venue Map can be published.');
  }
}

export function assertVenueMapTextFieldsValid(value: unknown): void {
  const issue = venueMapTextIntegrityIssues(value)[0];
  if (issue) {
    throw new Error(`${issue.objectLabel}: ${issue.message} Venue Map text must be repaired before publication.`);
  }
}

export function assertVenueMapRouteGeometryResolved(value: unknown): void {
  const normalized = normalizeVenueMapConfig(value, { preserveDuplicateIds: true });
  if (normalized && venueMapHasInvalidRouteGeometry(normalized)) {
    throw new Error('Every walkway must span at least two different map positions. Zero-length walkways must be explicitly repaired before the Venue Map can be published.');
  }
}

export function assertVenueMapRoutePrioritiesResolved(value: unknown): void {
  const normalized = normalizeVenueMapConfig(value, { preserveDuplicateIds: true });
  if (normalized && venueMapHasInvalidRoutePriorities(normalized)) {
    throw new Error('Invalid walkway priorities must be repaired before the Venue Map can be published.');
  }
}

export function assertVenueMapRouteDeliveryCompatible(value: unknown): void {
  const normalized = normalizeVenueMapConfig(value, { preserveDuplicateIds: true });
  if (normalized && venueMapHasRouteDeliveryIssues(normalized)) {
    throw new Error('Walkway audience or event scope must be compatible with every referenced point before the Venue Map can be published.');
  }
}

export function saveVenueMapConfig(
  config: VenueMapConfig,
  options: { emitChange?: boolean } = {},
): void {
  assertVenueMapComplexityWithinBudget(config);
  assertVenueMapFrameValid(config);
  assertVenueMapPointCoordinatesResolved(config);
  assertVenueMapPointGpsResolved(config);
  assertVenueMapAudiencesResolved(config);
  assertVenueMapArrivalRolesResolved(config);
  assertVenueMapBaseImageResolved(config);
  assertVenueMapRouteAccessibilityResolved(config);
  assertVenueMapRouteGeometryResolved(config);
  assertVenueMapPointKindFieldsCanonical(config);
  assertVenueMapSpacePointLinksUnique(config);
  assertVenueMapIdentifiersValid(config);
  assertVenueMapTextFieldsValid(config);
  if (venueMapHasInvalidRoutePriorities(config)) {
    throw new Error('Invalid walkway priorities must be repaired before the Venue Map can be saved.');
  }
  if (venueMapHasDuplicateIdentities(config)) {
    throw new Error('Duplicate map identities must be repaired before the Venue Map can be saved.');
  }
  if (venueMapHasRainContingencyCollisions(config)) {
    throw new Error('Duplicate or competing rain plans must be repaired before the Venue Map can be saved.');
  }
  assertVenueMapDrawingGeometryResolved(config);
  if ((config.routes || []).some((route) =>
    route.pointIds.length < 2
      || venueMapRouteReferenceIssues(route, config.points).length > 0,
  )) {
    throw new Error('Unavailable walkway point references must be repaired before the Venue Map can be saved.');
  }
  if (venueMapHasRouteDeliveryIssues(config)) {
    throw new Error('Walkway audience or event scope must be compatible with every referenced point before the Venue Map can be saved.');
  }
  const normalized = normalizeVenueMapConfig(config);
  if (!normalized) throw new Error('Venue map data is invalid and was not saved.');
  saveVersionedStorage(MAP_KEY, MAP_VERSION, normalized, options);
  writeVenueMapStructuralRecovery(normalized, []);
}

/** Replace the browser cache from an authoritative server value without publishing it. */
export function cacheVenueMapConfigFromServer(value: unknown): VenueMapConfig | null {
  const analysis = value === null
    ? { map: null, structuralRecoveryArtifacts: [] }
    : analyzeVenueMapConfig(value, { preserveDuplicateIds: true });
  if (value !== null && !analysis.map) {
    throw new Error('The shared venue map is invalid and could not be loaded.');
  }
  // Publish the fingerprint-bound quarantine marker before exposing the safe
  // canonical cache. Cross-tab readers must never observe a newly normalized
  // malformed map during a window in which its recovery state is still empty.
  writeVenueMapStructuralRecovery(
    analysis.map,
    analysis.structuralRecoveryArtifacts,
    analysis.quarantinedMap,
  );
  saveVersionedStorage(MAP_KEY, MAP_VERSION, analysis.map, { emitChange: false });
  return analysis.map;
}

export function emptyVenueMapConfig(): VenueMapConfig {
  return {
    width: LEGACY_VENUE_MAP_WIDTH,
    height: LEGACY_VENUE_MAP_HEIGHT,
    points: [],
    routes: [],
    drawings: [],
    rainContingencies: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Resolve a route's ordered coordinates from its point ids. */
export function routePolyline(map: VenueMapConfig | null, routeId: string): { x: number; y: number }[] {
  if (!map) return [];
  const route = (map.routes || []).find((r) => r.id === routeId);
  if (
    !route
    || venueMapRoutePriorityIssue(route)
    || route.pointIds.length < 2
    || venueMapRouteReferenceIssues(route, map.points).length > 0
  ) return [];
  const byId = new Map(map.points.map((p) => [p.id, p]));
  return route.pointIds.map((id) => byId.get(id)).filter(Boolean).map((p) => ({ x: p!.x, y: p!.y }));
}

export function normalizeVenueRulesConfig(value: unknown): VenueRulesConfig {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    rules: Array.isArray(source.rules)
      ? source.rules
        .filter((rule): rule is string => typeof rule === 'string')
        .map((rule) => rule.trim())
        .filter(Boolean)
      : [],
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

export function getVenueRules(): VenueRulesConfig {
  return loadVersionedStorage<VenueRulesConfig>({
    key: RULES_KEY,
    defaultValue: normalizeVenueRulesConfig(undefined),
    currentVersion: RULES_VERSION,
    validate: (v): v is VenueRulesConfig => !!v && typeof v === 'object',
    normalize: normalizeVenueRulesConfig,
  });
}

export function saveVenueRules(rules: string[]): void {
  saveVersionedStorage(RULES_KEY, RULES_VERSION, {
    rules: rules.filter((r) => r && r.trim()),
    updatedAt: new Date().toISOString(),
  });
}

/** Resolve the rain-contingency indoor space for a given outdoor venue, if any. */
export function findRainContingency(
  map: VenueMapConfig | null,
  outdoorVenueId: string,
): RainContingency | undefined {
  if (!map) return undefined;
  return partitionVenueMapRainContingencyCollisions(map).map.rainContingencies
    .find((contingency) =>
      contingency.outdoorVenueId === outdoorVenueId
        && contingency.outdoorVenueId !== contingency.indoorVenueId,
    );
}

/**
 * The wayfinding points a couple sees: their selected spaces (+ their rain-contingency
 * backups), plus parking and entry points, from the venue's full-property map.
 */
export function coupleWayfindingPoints(
  map: VenueMapConfig | null,
  selectedVenueIds: string[],
): VenueMapPoint[] {
  if (!map) return [];
  return projectVenueMap(map, 'couple', selectedVenueIds).points.filter(
    (point) => point.kind !== 'path',
  );
}
