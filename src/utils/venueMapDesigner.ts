import {
  VenueMapConfig,
  VenueMapPoint,
  VenueMapPointKind,
  VenueMapRoute,
  VenueMapAudience,
  VenueMapArrivalRole,
  VenueMapViewer,
  VenueMapRouteAccessibility,
  VenueMapRoutePriority,
  DrawingObject,
  RainContingency,
  Venue,
} from '../types';
import { isManagedVenueMapImageRef } from './venueMapImageRef';
import { createEntityId } from './entityId';

/**
 * Pure helpers for the interactive full-venue map designer. Kept dependency-free
 * so the Design Studio can edit the venue map as an interactive canvas (drag /
 * click-to-place / route-drawing) and print/export the resulting "Venue Map".
 */

/** Minimum/maximum map canvas dimensions (abstract map units). */
export const VENUE_MAP_FRAME_MIN = 20;
export const VENUE_MAP_FRAME_MAX = 500;
export const LEGACY_VENUE_MAP_WIDTH = 100;
export const LEGACY_VENUE_MAP_HEIGHT = 80;

/** Generous operational ceilings that keep SVG, backup, and SQL work bounded. */
export const VENUE_MAP_MAX_POINTS = 500;
export const VENUE_MAP_MAX_ROUTES = 500;
export const VENUE_MAP_MAX_DRAWINGS = 500;
export const VENUE_MAP_MAX_RAIN_CONTINGENCIES = 250;
export const VENUE_MAP_MAX_ROUTE_POINTS = 100;
export const VENUE_MAP_MAX_LINE_VERTICES = 500;
export const VENUE_MAP_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;
/** Canonical identifier ceiling shared by structural recovery and save guards. */
export const VENUE_MAP_MAX_IDENTIFIER_LENGTH = 200;
/** Canonical text limits shared by authoring, normalization, SQL, and portals. */
export const VENUE_MAP_MAX_POINT_LABEL_LENGTH = 200;
export const VENUE_MAP_MAX_ROUTE_NAME_LENGTH = 200;
export const VENUE_MAP_MAX_DRAWING_TEXT_LENGTH = 300;
export const VENUE_MAP_MAX_GUIDANCE_LENGTH = 1000;
export const VENUE_MAP_ROTATION_MIN = -360;
export const VENUE_MAP_ROTATION_MAX = 360;
export const VENUE_MAP_STROKE_WIDTH_MIN = 0.1;
export const VENUE_MAP_STROKE_WIDTH_MAX = 20;
export const VENUE_MAP_OPACITY_MIN = 0;
export const VENUE_MAP_OPACITY_MAX = 1;
export const VENUE_MAP_BACKGROUND_OPACITY_MIN = 0.1;
export const VENUE_MAP_BACKGROUND_OPACITY_MAX = 1;
export const VENUE_MAP_FONT_SIZE_MIN = 1;
export const VENUE_MAP_FONT_SIZE_MAX = 100;
const VENUE_MAP_EXPORT_LONG_SIDE_PX = 2_000;
const VENUE_MAP_EXPORT_SHORT_SIDE_PX = 640;
const VENUE_MAP_EXPORT_MAX_CONTENT_SIDE_PX = 15_000;

/**
 * Venue-map dimensions are abstract coordinates, not CSS pixels. Adapt raster
 * scale so ordinary maps are print-usable and extreme aspect ratios retain a
 * legible short side without exceeding the export renderer's safe dimensions.
 */
export function venueMapArtifactFilenameBase(value: unknown): string {
  if (typeof value !== 'string') return 'venue-map';
  const slug = value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+/, '')
    .toLowerCase()
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug || 'venue-map';
}

export function venueMapArtifactRasterScale(width: number, height: number): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : LEGACY_VENUE_MAP_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : LEGACY_VENUE_MAP_HEIGHT;
  const longSide = Math.max(safeWidth, safeHeight);
  const shortSide = Math.min(safeWidth, safeHeight);
  const desiredScale = Math.max(
    2,
    VENUE_MAP_EXPORT_LONG_SIDE_PX / longSide,
    VENUE_MAP_EXPORT_SHORT_SIDE_PX / shortSide,
  );
  return Math.min(desiredScale, VENUE_MAP_EXPORT_MAX_CONTENT_SIDE_PX / longSide);
}

export const MAP_AUDIENCES: VenueMapAudience[] = ['public', 'couple', 'staff'];
export const MAP_ARRIVAL_ROLES: VenueMapArrivalRole[] = [
  'unknown',
  'guest-arrival',
  'exit-only',
  'both',
];
export const MAP_ROUTE_ACCESSIBILITY: VenueMapRouteAccessibility[] = [
  'unknown',
  'step-free',
  'not-step-free',
];
export const MAP_ROUTE_PRIORITIES: VenueMapRoutePriority[] = [
  'preferred',
  'standard',
  'secondary',
  'emergency-only',
];
/** Internal fail-closed marker produced when untrusted event-scope JSON is malformed. */
export const INVALID_VENUE_MAP_EVENT_SCOPE = '__invalid_event_scope__';
/** Internal recovery marker for a malformed item in a saved route point sequence. */
export const INVALID_VENUE_MAP_POINT_REFERENCE = '__invalid_map_point_reference__';
/** Internal fail-closed marker for an explicitly present malformed route priority. */
export const INVALID_VENUE_MAP_ROUTE_PRIORITY = '__invalid_map_route_priority__' as VenueMapRoutePriority;

const RESERVED_VENUE_MAP_IDENTIFIERS = new Set([
  INVALID_VENUE_MAP_EVENT_SCOPE,
  INVALID_VENUE_MAP_POINT_REFERENCE,
  String(INVALID_VENUE_MAP_ROUTE_PRIORITY),
]);

/** Canonicalize a bounded map identity without ever truncating it. */
export function canonicalVenueMapIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const identifier = value.trim();
  return identifier.length >= 1
    && identifier.length <= VENUE_MAP_MAX_IDENTIFIER_LENGTH
    && !RESERVED_VENUE_MAP_IDENTIFIERS.has(identifier)
    ? identifier
    : null;
}

/**
 * Compact deterministic provenance for the complete unordered wedding-space
 * scope. Readable names can be bounded in artifacts while this full-set code
 * still distinguishes scopes with duplicate names or differences beyond the
 * visible name list. This is an artifact identity aid, not a security hash.
 */
export function venueMapScopeArtifactCode(venueIds: readonly string[]): string {
  const canonicalScope = JSON.stringify([...new Set(venueIds)].sort());
  let h1 = 0x6a09e667 ^ canonicalScope.length;
  let h2 = 0xbb67ae85 ^ canonicalScope.length;
  let h3 = 0x3c6ef372 ^ canonicalScope.length;
  let h4 = 0xa54ff53a ^ canonicalScope.length;
  for (let index = 0; index < canonicalScope.length; index += 1) {
    const code = canonicalScope.charCodeAt(index);
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
  return `v1-${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}`;
}

export function mapAudienceLabel(audience: VenueMapAudience | undefined): string {
  switch (audience === undefined ? 'public' : audience) {
    case 'public': return 'Guests & couples';
    case 'couple': return 'Couples only';
    case 'staff': return 'Staff only';
    default: return 'Invalid saved visibility';
  }
}

export function arrivalRoleLabel(role: VenueMapArrivalRole | undefined): string {
  switch (role === undefined ? 'unknown' : role) {
    case 'unknown': return 'Not yet classified';
    case 'guest-arrival': return 'Guest arrival';
    case 'exit-only': return 'Exit only';
    case 'both': return 'Guest arrival & exit';
    default: return 'Invalid saved arrival role';
  }
}

export function venueMapPointTypeLabel(point: VenueMapPoint): string {
  return point.kind === 'entry'
    ? `${pointKindLabel(point.kind)} · ${arrivalRoleLabel(point.arrivalRole)}`
    : pointKindLabel(point.kind);
}

export function venueMapPointArrivalRoleIssue(point: VenueMapPoint): string | null {
  if (point.kind !== 'entry') {
    return point.arrivalRole === undefined
      ? null
      : 'Only Entry / Exit points may have an arrival role.';
  }
  return point.arrivalRole === undefined || MAP_ARRIVAL_ROLES.includes(point.arrivalRole)
    ? null
    : 'The saved arrival role is invalid and must be selected explicitly.';
}

export function isVenueMapGuestArrivalPoint(point: VenueMapPoint): boolean {
  if (venueMapPointArrivalRoleIssue(point) !== null) return false;
  return point.kind === 'parking'
    || (point.kind === 'entry'
      && (point.arrivalRole === 'guest-arrival' || point.arrivalRole === 'both'));
}

export interface VenueMapArrivalRoleIntegrityIssue {
  occurrenceIndex: number;
  pointId?: string;
  pointLabel: string;
  savedValue: unknown;
  message: string;
}

export function venueMapArrivalRoleIntegrityIssues(
  value: unknown,
): VenueMapArrivalRoleIntegrityIssue[] {
  const source = unknownRecord(value);
  if (!source || !Array.isArray(source.points)) return [];
  return source.points.flatMap((candidate, occurrenceIndex) => {
    const point = unknownRecord(candidate);
    if (!point || point.arrivalRole === undefined) return [];
    if (
      point.kind === 'entry'
      && typeof point.arrivalRole === 'string'
      && MAP_ARRIVAL_ROLES.includes(point.arrivalRole as VenueMapArrivalRole)
    ) return [];
    const pointId = typeof point.id === 'string' ? point.id : undefined;
    const pointLabel = typeof point.label === 'string' && point.label.trim()
      ? point.label.trim().slice(0, 80)
      : pointId || `Point ${occurrenceIndex + 1}`;
    return [{
      occurrenceIndex,
      pointId,
      pointLabel,
      savedValue: point.arrivalRole,
      message: point.kind === 'entry'
        ? 'Arrival role must be Not yet classified, Guest arrival, Exit only, or Guest arrival & exit.'
        : 'Only Entry / Exit points may have an arrival role.',
    }];
  });
}

export function venueMapHasInvalidArrivalRoles(value: unknown): boolean {
  return venueMapArrivalRoleIntegrityIssues(value).length > 0;
}

/** Omit malformed/misplaced arrival-role points and every dependent route. */
export function partitionVenueMapArrivalRoleIntegrity(
  map: VenueMapConfig,
): VenueMapConfig {
  const invalidIds = new Set(
    map.points
      .filter((point) => venueMapPointArrivalRoleIssue(point) !== null)
      .map((point) => point.id),
  );
  if (invalidIds.size === 0) return map;
  return {
    ...map,
    points: map.points.filter((point) => !invalidIds.has(point.id)),
    routes: (map.routes || []).filter((route) =>
      route.pointIds.every((pointId) => !invalidIds.has(pointId)),
    ),
  };
}

export function routeAccessibilityLabel(
  accessibility: VenueMapRouteAccessibility | undefined,
): string {
  switch (accessibility === undefined ? 'unknown' : accessibility) {
    case 'unknown': return 'Mobility not verified';
    case 'step-free': return 'Verified step-free';
    case 'not-step-free': return 'Not step-free';
    default: return 'Invalid saved mobility status';
  }
}

export function venueMapRouteAccessibilityIssue(route: VenueMapRoute): string | null {
  return route.accessibility === undefined
    || MAP_ROUTE_ACCESSIBILITY.includes(route.accessibility)
    ? null
    : 'The saved mobility status is invalid and must be selected explicitly.';
}

export interface VenueMapRouteAccessibilityIntegrityIssue {
  occurrenceIndex: number;
  routeId?: string;
  routeLabel: string;
  savedValue: unknown;
  message: string;
}

export function venueMapRouteAccessibilityIntegrityIssues(
  value: unknown,
): VenueMapRouteAccessibilityIntegrityIssue[] {
  const source = unknownRecord(value);
  if (!source || !Array.isArray(source.routes)) return [];
  return source.routes.flatMap((candidate, occurrenceIndex) => {
    const route = unknownRecord(candidate);
    if (!route || route.accessibility === undefined) return [];
    if (
      typeof route.accessibility === 'string'
      && MAP_ROUTE_ACCESSIBILITY.includes(route.accessibility as VenueMapRouteAccessibility)
    ) return [];
    const routeId = typeof route.id === 'string' ? route.id : undefined;
    const routeLabel = typeof route.name === 'string' && route.name.trim()
      ? route.name.trim().slice(0, 80)
      : routeId || `Walkway ${occurrenceIndex + 1}`;
    return [{
      occurrenceIndex,
      routeId,
      routeLabel,
      savedValue: route.accessibility,
      message: 'Mobility status must be Not verified, Verified step-free, or Not step-free.',
    }];
  });
}

export function venueMapHasInvalidRouteAccessibility(value: unknown): boolean {
  return venueMapRouteAccessibilityIntegrityIssues(value).length > 0;
}

export function routePriorityLabel(priority: VenueMapRoutePriority | undefined): string {
  switch (priority === undefined ? 'standard' : priority) {
    case 'preferred': return 'Preferred';
    case 'standard': return 'Standard';
    case 'secondary': return 'Secondary';
    case 'emergency-only': return 'Emergency only';
    default: return 'Invalid saved priority';
  }
}

/**
 * Omitted priorities are legitimate legacy Standard routes. An explicitly
 * present unsupported value is unsafe because coercing it to Standard could
 * turn a damaged Emergency-only route into routine guest directions.
 */
export function venueMapRoutePriorityIssue(route: VenueMapRoute): string | null {
  return route.priority === undefined || MAP_ROUTE_PRIORITIES.includes(route.priority)
    ? null
    : 'The saved routing priority is invalid and must be selected explicitly.';
}

export function venueMapHasInvalidRoutePriorities(map: VenueMapConfig): boolean {
  return (map.routes || []).some((route) => venueMapRoutePriorityIssue(route) !== null);
}

/** Whether a map object may be rendered or delivered to this viewer. */
export function isMapAudienceVisible(
  audience: VenueMapAudience | undefined,
  viewer: VenueMapViewer,
): boolean {
  if (viewer === 'staff') return true;
  const required = audience === undefined ? 'public' : audience;
  if (!MAP_AUDIENCES.includes(required)) return false;
  if (viewer === 'couple') return required !== 'staff';
  return required === 'public';
}

export type VenueMapAudienceIntegrityFamily = 'point' | 'route' | 'drawing';

export interface VenueMapAudienceIntegrityIssue {
  family: VenueMapAudienceIntegrityFamily;
  occurrenceIndex: number;
  objectId?: string;
  objectLabel: string;
  savedValue: unknown;
  message: string;
}

/** Detect an explicitly present audience that cannot be assigned safely. */
export function venueMapAudienceIntegrityIssues(value: unknown): VenueMapAudienceIntegrityIssue[] {
  const source = unknownRecord(value);
  if (!source) return [];
  const families: Array<{
    family: VenueMapAudienceIntegrityFamily;
    collection: unknown;
    labelField: 'label' | 'name' | 'text';
    fallbackLabel: string;
  }> = [
    { family: 'point', collection: source.points, labelField: 'label', fallbackLabel: 'Map point' },
    { family: 'route', collection: source.routes, labelField: 'name', fallbackLabel: 'Walkway' },
    { family: 'drawing', collection: source.drawings, labelField: 'text', fallbackLabel: 'Map shape' },
  ];
  return families.flatMap(({ family, collection, labelField, fallbackLabel }) => {
    if (!Array.isArray(collection)) return [];
    return collection.flatMap((candidate, occurrenceIndex) => {
      const object = unknownRecord(candidate);
      if (!object || object.audience === undefined) return [];
      if (
        typeof object.audience === 'string'
        && MAP_AUDIENCES.includes(object.audience as VenueMapAudience)
      ) return [];
      const objectId = typeof object.id === 'string' ? object.id : undefined;
      const authoredLabel = object[labelField];
      const objectLabel = typeof authoredLabel === 'string' && authoredLabel.trim()
        ? authoredLabel.trim().slice(0, 80)
        : objectId || `${fallbackLabel} ${occurrenceIndex + 1}`;
      return [{
        family,
        occurrenceIndex,
        objectId,
        objectLabel,
        savedValue: object.audience,
        message: 'Visibility must be Guests & couples, Couples only, or Staff only.',
      }];
    });
  });
}

export function venueMapHasInvalidAudiences(value: unknown): boolean {
  return venueMapAudienceIntegrityIssues(value).length > 0;
}

export type VenueMapBaseImageIntegrityField = 'backgroundImageUrl' | 'backgroundOpacity';

export interface VenueMapBaseImageIntegrityIssue {
  field: VenueMapBaseImageIntegrityField;
  savedValue: unknown;
  message: string;
}

export function isSafeVenueMapBackgroundRef(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 5 * 1024 * 1024
    && (
      /^https:\/\//i.test(value)
      || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)
      || /^sp:\/\/(venue-map-images|venue-images)\/[a-z0-9-]+\//i.test(value)
    );
}

/** Detect a base source/opacity pair that cannot be rendered without rewriting it. */
export function venueMapBaseImageIntegrityIssues(value: unknown): VenueMapBaseImageIntegrityIssue[] {
  const source = unknownRecord(value);
  if (!source) return [];
  const backgroundImageUrl = source.backgroundImageUrl;
  const backgroundOpacity = source.backgroundOpacity;
  const hasSource = backgroundImageUrl !== undefined;
  const safeSource = isSafeVenueMapBackgroundRef(backgroundImageUrl);
  const issues: VenueMapBaseImageIntegrityIssue[] = [];
  if (hasSource && !safeSource) {
    issues.push({
      field: 'backgroundImageUrl',
      savedValue: backgroundImageUrl,
      message: 'The saved base-map source is not a supported HTTPS, embedded raster, or managed-storage image reference.',
    });
  }
  if (backgroundOpacity !== undefined) {
    if (!hasSource) {
      issues.push({
        field: 'backgroundOpacity',
        savedValue: backgroundOpacity,
        message: 'Saved base-map opacity has no base-map image source.',
      });
    } else if (
      typeof backgroundOpacity !== 'number'
      || !Number.isFinite(backgroundOpacity)
      || backgroundOpacity < VENUE_MAP_BACKGROUND_OPACITY_MIN
      || backgroundOpacity > VENUE_MAP_BACKGROUND_OPACITY_MAX
    ) {
      issues.push({
        field: 'backgroundOpacity',
        savedValue: backgroundOpacity,
        message: `Base-map opacity must be a finite number from ${VENUE_MAP_BACKGROUND_OPACITY_MIN} to ${VENUE_MAP_BACKGROUND_OPACITY_MAX}.`,
      });
    }
  }
  return issues;
}

export function venueMapHasInvalidBaseImage(value: unknown): boolean {
  return venueMapBaseImageIntegrityIssues(value).length > 0;
}

export function partitionVenueMapBaseImageIntegrity(map: VenueMapConfig): VenueMapConfig {
  if (!venueMapHasInvalidBaseImage(map)) return map;
  return {
    ...map,
    backgroundImageUrl: undefined,
    backgroundOpacity: undefined,
    backgroundImageUnavailable: map.backgroundImageUrl !== undefined || undefined,
  };
}

export interface VenueMapRouteDeliveryCompatibilityIssue {
  route: VenueMapRoute;
  point: VenueMapPoint;
  /** The route claims one or more portal viewers that cannot receive this point. */
  audienceIncompatible: boolean;
  /** The route claims one or more event scopes that cannot receive this point. */
  eventScopeIncompatible: boolean;
  /** True when the route claims all events but the point has an explicit scope. */
  routeTargetsAllEvents: boolean;
  /** Scoped route ids not covered by the point; empty for an all-events mismatch. */
  uncoveredEventSpaceIds: string[];
}

const ROUTE_DELIVERY_VIEWERS: VenueMapViewer[] = ['guest', 'couple', 'staff'];

/**
 * Find point restrictions that make a whole authored walkway disappear from a
 * viewer/event projection. Missing or ambiguous references are intentionally
 * left to the structural-reference validator rather than guessed here.
 */
export function venueMapRoutePointDeliveryIssues(
  route: VenueMapRoute,
  points: VenueMapPoint[],
): VenueMapRouteDeliveryCompatibilityIssue[] {
  const pointCounts = new Map<string, number>();
  const pointById = new Map<string, VenueMapPoint>();
  for (const point of points) {
    pointCounts.set(point.id, (pointCounts.get(point.id) || 0) + 1);
    pointById.set(point.id, point);
  }
  const routeScope = route.eventSpaceIds?.length ? new Set(route.eventSpaceIds) : null;
  const seenPointIds = new Set<string>();

  return route.pointIds.flatMap((pointId) => {
    if (seenPointIds.has(pointId) || pointCounts.get(pointId) !== 1) return [];
    seenPointIds.add(pointId);
    const point = pointById.get(pointId);
    if (!point) return [];

    const audienceIncompatible = ROUTE_DELIVERY_VIEWERS.some((viewer) =>
      isMapAudienceVisible(route.audience, viewer)
        && !isMapAudienceVisible(point.audience, viewer),
    );
    const pointScope = point.eventSpaceIds?.length ? new Set(point.eventSpaceIds) : null;
    const routeTargetsAllEvents = routeScope === null;
    const uncoveredEventSpaceIds = routeScope && pointScope
      ? [...routeScope].filter((eventSpaceId) => !pointScope.has(eventSpaceId))
      : [];
    const eventScopeIncompatible = pointScope !== null
      && (routeTargetsAllEvents || uncoveredEventSpaceIds.length > 0);

    return audienceIncompatible || eventScopeIncompatible
      ? [{
          route,
          point,
          audienceIncompatible,
          eventScopeIncompatible,
          routeTargetsAllEvents,
          uncoveredEventSpaceIds,
        }]
      : [];
  });
}

export function venueMapRouteDeliveryIssues(
  map: VenueMapConfig,
): VenueMapRouteDeliveryCompatibilityIssue[] {
  return (map.routes || []).flatMap((route) =>
    venueMapRoutePointDeliveryIssues(route, map.points),
  );
}

export function venueMapHasRouteDeliveryIssues(map: VenueMapConfig): boolean {
  return venueMapRouteDeliveryIssues(map).length > 0;
}

/** A point's kind-dependent accent color (shared by designer + read-only views). */
export function pointColor(kind: VenueMapPointKind): string {
  switch (kind) {
    case 'space': return '#0d9488'; // teal
    case 'parking': return '#6366f1'; // indigo
    case 'entry': return '#16a34a'; // green
    case 'amenity': return '#f59e0b'; // amber
    case 'path': return '#94a3b8'; // slate
    default: return '#94a3b8';
  }
}

export function pointKindLabel(kind: VenueMapPointKind): string {
  switch (kind) {
    case 'space': return 'Event Space';
    case 'parking': return 'Parking';
    case 'entry': return 'Entry / Exit';
    case 'amenity': return 'Amenity';
    case 'path': return 'Walkway Waypoint';
    default: return 'Point';
  }
}

export function pointKindIcon(kind: VenueMapPointKind): string {
  switch (kind) {
    case 'space': return '🏛️';
    case 'parking': return '🅿️';
    case 'entry': return '🚪';
    case 'amenity': return '⛲';
    case 'path': return '•';
    default: return '📍';
  }
}

/** Explicit environment metadata wins; categories are a legacy fallback. */
export function isRainContingencySource(venue: Venue): boolean {
  if (venue.environment) {
    return venue.environment === 'outdoor' || venue.environment === 'both';
  }
  return venue.category === 'outdoor' || venue.category === 'ceremony';
}

/** Indoor-capable spaces can serve as rain backups, but never for themselves. */
export function isRainContingencyBackup(venue: Venue): boolean {
  if (venue.environment) {
    return venue.environment === 'indoor' || venue.environment === 'both';
  }
  return venue.category !== 'outdoor' && venue.category !== 'ceremony';
}

/**
 * Explain why a canonical rain pair is no longer publishable. Requiring exactly
 * one catalog match also fails closed if corrupt catalog data reuses an id.
 */
export function rainContingencyValidationIssue(
  contingency: RainContingency,
  venues: Venue[],
): string | null {
  if (contingency.outdoorVenueId === contingency.indoorVenueId) {
    return 'The outdoor space and indoor backup must be different.';
  }

  const outdoorMatches = venues.filter((venue) => venue.id === contingency.outdoorVenueId);
  if (outdoorMatches.length === 0) {
    return `Outdoor space “${contingency.outdoorVenueId}” no longer exists.`;
  }
  if (outdoorMatches.length > 1) {
    return `Outdoor space “${contingency.outdoorVenueId}” cannot be matched uniquely.`;
  }
  if (!isRainContingencySource(outdoorMatches[0])) {
    return `“${outdoorMatches[0].name}” is no longer marked outdoor or indoor/outdoor.`;
  }

  const backupMatches = venues.filter((venue) => venue.id === contingency.indoorVenueId);
  if (backupMatches.length === 0) {
    return `Indoor backup “${contingency.indoorVenueId}” no longer exists.`;
  }
  if (backupMatches.length > 1) {
    return `Indoor backup “${contingency.indoorVenueId}” cannot be matched uniquely.`;
  }
  if (!isRainContingencyBackup(backupMatches[0])) {
    return `“${backupMatches[0].name}” is no longer marked indoor or indoor/outdoor.`;
  }

  return null;
}

export interface VenueMapRainContingencyCollisionGroup {
  key: string;
  contingencies: RainContingency[];
  duplicatedIds: string[];
  duplicatedOutdoorVenueIds: string[];
}

export interface VenueMapRainContingencyPartition {
  map: VenueMapConfig;
  quarantinedContingencies: RainContingency[];
  collisionGroups: VenueMapRainContingencyCollisionGroup[];
}

function normalizedRainCollisionValue(value: string): string {
  return value.trim();
}

/** Duplicate plan IDs and competing plans for one outdoor source are ambiguous. */
export function rainContingencyCollisionIssues(
  contingency: RainContingency,
  contingencies: RainContingency[],
): string[] {
  const id = normalizedRainCollisionValue(contingency.id);
  const outdoorVenueId = normalizedRainCollisionValue(contingency.outdoorVenueId);
  const issues: string[] = [];
  if (contingencies.filter((candidate) =>
    normalizedRainCollisionValue(candidate.id) === id).length > 1) {
    issues.push(`Plan ID “${id}” is duplicated.`);
  }
  if (contingencies.filter((candidate) =>
    normalizedRainCollisionValue(candidate.outdoorVenueId) === outdoorVenueId).length > 1) {
    issues.push(`Outdoor space “${outdoorVenueId}” has competing rain plans.`);
  }
  return issues;
}

/**
 * Quarantine every occurrence in a rain-plan collision. A connected component
 * is used because one plan can bridge a duplicated ID and a duplicated source.
 */
export function partitionVenueMapRainContingencyCollisions(
  map: VenueMapConfig,
): VenueMapRainContingencyPartition {
  const contingencies = map.rainContingencies || [];
  const idCounts = new Map<string, number>();
  const outdoorCounts = new Map<string, number>();
  for (const contingency of contingencies) {
    const id = normalizedRainCollisionValue(contingency.id);
    const outdoorId = normalizedRainCollisionValue(contingency.outdoorVenueId);
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
    outdoorCounts.set(outdoorId, (outdoorCounts.get(outdoorId) || 0) + 1);
  }
  const conflictedIndexes = contingencies.flatMap((contingency, index) => {
    const id = normalizedRainCollisionValue(contingency.id);
    const outdoorId = normalizedRainCollisionValue(contingency.outdoorVenueId);
    return (idCounts.get(id) || 0) > 1 || (outdoorCounts.get(outdoorId) || 0) > 1
      ? [index]
      : [];
  });
  const conflictedSet = new Set(conflictedIndexes);
  const collisionGroups: VenueMapRainContingencyCollisionGroup[] = [];
  const visited = new Set<number>();
  for (const start of conflictedIndexes) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const index = queue.shift()!;
      component.push(index);
      const current = contingencies[index];
      for (const candidateIndex of conflictedIndexes) {
        if (visited.has(candidateIndex)) continue;
        const candidate = contingencies[candidateIndex];
        if (
          normalizedRainCollisionValue(candidate.id) === normalizedRainCollisionValue(current.id)
          || normalizedRainCollisionValue(candidate.outdoorVenueId)
            === normalizedRainCollisionValue(current.outdoorVenueId)
        ) {
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      }
    }
    const groupContingencies = component.map((index) => contingencies[index]);
    collisionGroups.push({
      key: `rain-collision-${Math.min(...component)}`,
      contingencies: groupContingencies,
      duplicatedIds: [...new Set(groupContingencies
        .map((contingency) => normalizedRainCollisionValue(contingency.id))
        .filter((id) => (idCounts.get(id) || 0) > 1))],
      duplicatedOutdoorVenueIds: [...new Set(groupContingencies
        .map((contingency) => normalizedRainCollisionValue(contingency.outdoorVenueId))
        .filter((id) => (outdoorCounts.get(id) || 0) > 1))],
    });
  }
  return {
    map: {
      ...map,
      rainContingencies: contingencies.filter((_, index) => !conflictedSet.has(index)),
    },
    quarantinedContingencies: contingencies.filter((_, index) => conflictedSet.has(index)),
    collisionGroups,
  };
}

export function venueMapHasRainContingencyCollisions(map: VenueMapConfig): boolean {
  return partitionVenueMapRainContingencyCollisions(map).quarantinedContingencies.length > 0;
}

/** Scope ids that no longer resolve uniquely to the current venue catalog. */
export function unavailableVenueMapEventScopeIds(
  eventSpaceIds: string[] | undefined,
  venues: Venue[],
): string[] {
  return (eventSpaceIds || []).filter((id) => {
    const normalizedId = id.trim();
    return normalizedId === INVALID_VENUE_MAP_EVENT_SCOPE
      || normalizedId.length < 1
      || normalizedId.length > VENUE_MAP_MAX_IDENTIFIER_LENGTH
      || venues.filter((venue) => (
        typeof venue.id === 'string'
        && venue.id.trim().length >= 1
        && venue.id.trim().length <= VENUE_MAP_MAX_IDENTIFIER_LENGTH
        && venue.id.trim() === normalizedId
      )).length !== 1;
  });
}

/** Human-readable recovery label without surfacing the reserved sentinel. */
export function venueMapEventScopeRecoveryLabel(id: string): string {
  return id === INVALID_VENUE_MAP_EVENT_SCOPE ? 'Malformed saved scope' : id;
}

/** A space pin must resolve to one current event-space or lodging record. */
export function venueMapSpacePointLinkIssue(
  point: VenueMapPoint,
  venues: Venue[],
): string | null {
  if (point.kind !== 'space') return null;
  const venueId = point.venueId?.trim();
  if (!venueId) return 'This space pin is not linked to a current venue record.';
  const matches = venues.filter((venue) => {
    const candidateId = venue.id.trim();
    return candidateId.length <= VENUE_MAP_MAX_IDENTIFIER_LENGTH
      && venueId.length <= VENUE_MAP_MAX_IDENTIFIER_LENGTH
      && candidateId === venueId;
  });
  if (matches.length === 0) return `Linked venue ID “${point.venueId}” no longer exists.`;
  if (matches.length > 1) return `Linked venue ID “${point.venueId}” is not unique in the current catalog.`;
  return null;
}

export interface VenueMapSpacePointLinkCollisionGroup {
  venueId: string;
  points: VenueMapPoint[];
}

export interface VenueMapSpacePointLinkCollisionPartition {
  map: VenueMapConfig;
  collisionGroups: VenueMapSpacePointLinkCollisionGroup[];
  quarantinedPoints: VenueMapPoint[];
  dependentRoutes: VenueMapRoute[];
}

/** One venue record has exactly one canonical destination pin. */
export function venueMapSpacePointLinkCollisionGroups(
  map: VenueMapConfig,
): VenueMapSpacePointLinkCollisionGroup[] {
  const byVenue = new Map<string, VenueMapPoint[]>();
  for (const point of map.points || []) {
    if (point.kind !== 'space') continue;
    const venueId = canonicalVenueMapIdentifier(point.venueId);
    if (!venueId) continue;
    byVenue.set(venueId, [...(byVenue.get(venueId) || []), point]);
  }
  return [...byVenue.entries()]
    .filter(([, points]) => points.length > 1)
    .map(([venueId, points]) => ({ venueId, points }));
}

/**
 * Omit every ambiguous destination occurrence and every route that depends on
 * one. Admin callers retain the original map separately for explicit repair.
 */
export function partitionVenueMapSpacePointLinkCollisions(
  map: VenueMapConfig,
): VenueMapSpacePointLinkCollisionPartition {
  const collisionGroups = venueMapSpacePointLinkCollisionGroups(map);
  const quarantinedPointObjects = new Set(
    collisionGroups.flatMap((group) => group.points),
  );
  const quarantinedPointIds = new Set(
    collisionGroups.flatMap((group) => group.points.map((point) => point.id)),
  );
  const dependentRoutes = (map.routes || []).filter((route) =>
    route.pointIds.some((pointId) => quarantinedPointIds.has(pointId)),
  );
  return {
    map: {
      ...map,
      points: (map.points || []).filter((point) => !quarantinedPointObjects.has(point)),
      routes: (map.routes || []).filter((route) => !dependentRoutes.includes(route)),
    },
    collisionGroups,
    quarantinedPoints: collisionGroups.flatMap((group) => group.points),
    dependentRoutes,
  };
}

export function venueMapHasSpacePointLinkCollisions(map: VenueMapConfig): boolean {
  return venueMapSpacePointLinkCollisionGroups(map).length > 0;
}

/** Remove metadata that cannot apply to the point's current kind. */
export function canonicalizeMapPointKindFields(point: VenueMapPoint): VenueMapPoint {
  if (point.kind === 'space') {
    return { ...point, eventSpaceIds: undefined, arrivalRole: undefined };
  }
  if (point.kind === 'entry') return { ...point, venueId: undefined };
  return { ...point, venueId: undefined, arrivalRole: undefined };
}

/** Add a new point to the map. Coordinates are clamped to the map bounds. */
export function addMapPoint(
  map: VenueMapConfig,
  input: Omit<VenueMapPoint, 'id'>,
): VenueMapConfig {
  if (map.points.length >= VENUE_MAP_MAX_POINTS) return map;
  const x = clampCoord(input.x, map.width);
  const y = clampCoord(input.y, map.height);
  return {
    ...map,
    points: [
      ...map.points,
      canonicalizeMapPointKindFields({ ...input, id: createEntityId('pt', map.points.map((point) => point.id)), x, y }),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function clampCoord(v: number, max: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(Math.round(v * 10) / 10, max));
}

function clampSize(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(VENUE_MAP_FRAME_MIN, Math.min(Math.round(v), VENUE_MAP_FRAME_MAX));
}

function unknownRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export type VenueMapTextIntegrityFamily = 'point' | 'route' | 'drawing' | 'rainContingency';

export interface VenueMapTextIntegrityIssue {
  family: VenueMapTextIntegrityFamily;
  occurrenceIndex: number;
  objectId?: string;
  objectLabel: string;
  field: string;
  limit: number;
  reason: 'missing' | 'malformed' | 'blank' | 'too-long';
  message: string;
}

function textFieldIntegrityIssue(
  object: Record<string, unknown>,
  field: string,
  fieldLabel: string,
  limit: number,
  required: boolean,
): Pick<VenueMapTextIntegrityIssue, 'field' | 'limit' | 'reason' | 'message'> | null {
  const present = Object.prototype.hasOwnProperty.call(object, field);
  const value = object[field];
  // Typed in-memory objects may carry optional properties with `undefined`;
  // JSON persistence omits them, so treat that representation as absent.
  if (!present || value === undefined) {
    return required
      ? { field, limit, reason: 'missing', message: `${fieldLabel} is required.` }
      : null;
  }
  if (typeof value !== 'string') {
    return {
      field,
      limit,
      reason: 'malformed',
      message: `${fieldLabel} must be text.`,
    };
  }
  const length = value.trim().length;
  if (required && length === 0) {
    return {
      field,
      limit,
      reason: 'blank',
      message: `${fieldLabel} cannot be blank.`,
    };
  }
  if (length > limit) {
    return {
      field,
      limit,
      reason: 'too-long',
      message: `${fieldLabel} is ${length} characters; the limit is ${limit}.`,
    };
  }
  return null;
}

/** Detect any text that normalization would otherwise replace, drop, or truncate. */
export function venueMapTextIntegrityIssues(value: unknown): VenueMapTextIntegrityIssue[] {
  const source = unknownRecord(value);
  if (!source) return [];
  const families: Array<{
    family: VenueMapTextIntegrityFamily;
    collection: unknown;
    fields: Array<[string, string, number, boolean]>;
    fallbackLabel: string;
  }> = [
    {
      family: 'point',
      collection: source.points,
      fields: [
        ['label', 'Point label', VENUE_MAP_MAX_POINT_LABEL_LENGTH, true],
        ['description', 'Point guest guidance', VENUE_MAP_MAX_GUIDANCE_LENGTH, false],
      ],
      fallbackLabel: 'Map point',
    },
    {
      family: 'route',
      collection: source.routes,
      fields: [
        ['name', 'Walkway name', VENUE_MAP_MAX_ROUTE_NAME_LENGTH, true],
        ['notes', 'Walkway guidance', VENUE_MAP_MAX_GUIDANCE_LENGTH, false],
      ],
      fallbackLabel: 'Walkway',
    },
    {
      family: 'drawing',
      collection: source.drawings,
      fields: [
        ['text', 'Shape label', VENUE_MAP_MAX_DRAWING_TEXT_LENGTH, false],
      ],
      fallbackLabel: 'Map shape',
    },
    {
      family: 'rainContingency',
      collection: source.rainContingencies,
      fields: [
        ['note', 'Rain-plan guidance', VENUE_MAP_MAX_GUIDANCE_LENGTH, false],
      ],
      fallbackLabel: 'Rain plan',
    },
  ];

  return families.flatMap(({ family, collection, fields, fallbackLabel }) => {
    if (!Array.isArray(collection)) return [];
    return collection.flatMap((candidate, occurrenceIndex) => {
      const object = unknownRecord(candidate);
      if (!object) return [];
      const objectId = typeof object.id === 'string' ? object.id : undefined;
      const authoredLabel = family === 'point'
        ? object.label
        : family === 'route'
          ? object.name
          : family === 'drawing'
            ? object.text
            : undefined;
      const objectLabel = typeof authoredLabel === 'string' && authoredLabel.trim()
        ? authoredLabel.trim().slice(0, 80)
        : objectId || `${fallbackLabel} ${occurrenceIndex + 1}`;
      return fields.flatMap(([field, fieldLabel, limit, required]) => {
        const issue = textFieldIntegrityIssue(object, field, fieldLabel, limit, required);
        return issue ? [{
          family,
          occurrenceIndex,
          objectId,
          objectLabel,
          ...issue,
        }] : [];
      });
    });
  });
}

export function venueMapHasInvalidTextFields(value: unknown): boolean {
  return venueMapTextIntegrityIssues(value).length > 0;
}

/** Omit malformed-text objects and every route that depends on an omitted point. */
export function partitionVenueMapTextIntegrity(map: VenueMapConfig): VenueMapConfig {
  const issues = venueMapTextIntegrityIssues(map);
  if (issues.length === 0) return map;
  const invalidPointIndexes = new Set(
    issues.filter((issue) => issue.family === 'point').map((issue) => issue.occurrenceIndex),
  );
  const invalidRouteIndexes = new Set(
    issues.filter((issue) => issue.family === 'route').map((issue) => issue.occurrenceIndex),
  );
  const invalidDrawingIndexes = new Set(
    issues.filter((issue) => issue.family === 'drawing').map((issue) => issue.occurrenceIndex),
  );
  const invalidRainIndexes = new Set(
    issues.filter((issue) => issue.family === 'rainContingency').map((issue) => issue.occurrenceIndex),
  );
  const points = map.points.filter((_, index) => !invalidPointIndexes.has(index));
  const pointIds = new Set(points.map((point) => point.id));
  return {
    ...map,
    points,
    routes: (map.routes || []).filter((route, index) =>
      !invalidRouteIndexes.has(index)
        && route.pointIds.every((pointId) => pointIds.has(pointId)),
    ),
    drawings: (map.drawings || []).filter((_, index) => !invalidDrawingIndexes.has(index)),
    rainContingencies: (map.rainContingencies || []).filter(
      (_, index) => !invalidRainIndexes.has(index),
    ),
  };
}

function serializedVenueMapBytes(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? Number.POSITIVE_INFINITY
      : new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Validate the whole canonical complexity budget before any identity or route
 * scan. Over-budget documents are handled as one admin-only quarantine so no
 * arbitrary prefix can become an apparently authoritative map.
 */
export function venueMapComplexityIssues(value: unknown): string[] {
  const source = unknownRecord(value);
  if (!source) {
    if (value === null || value === undefined) return [];
    return serializedVenueMapBytes(value) > VENUE_MAP_MAX_SERIALIZED_BYTES
      ? [`The saved Venue Map is larger than the ${VENUE_MAP_MAX_SERIALIZED_BYTES / (1024 * 1024)} MiB canonical payload limit.`]
      : [];
  }
  const points = Array.isArray(source.points) ? source.points : [];
  const routes = Array.isArray(source.routes) ? source.routes : [];
  const drawings = Array.isArray(source.drawings) ? source.drawings : [];
  const rainContingencies = Array.isArray(source.rainContingencies)
    ? source.rainContingencies
    : [];
  const issues: string[] = [];

  if (points.length > VENUE_MAP_MAX_POINTS) {
    issues.push(`The saved Venue Map contains ${points.length} points; the operational limit is ${VENUE_MAP_MAX_POINTS}.`);
  }
  if (routes.length > VENUE_MAP_MAX_ROUTES) {
    issues.push(`The saved Venue Map contains ${routes.length} walkways; the operational limit is ${VENUE_MAP_MAX_ROUTES}.`);
  }
  if (drawings.length > VENUE_MAP_MAX_DRAWINGS) {
    issues.push(`The saved Venue Map contains ${drawings.length} shapes; the operational limit is ${VENUE_MAP_MAX_DRAWINGS}.`);
  }
  if (rainContingencies.length > VENUE_MAP_MAX_RAIN_CONTINGENCIES) {
    issues.push(`The saved Venue Map contains ${rainContingencies.length} rain plans; the operational limit is ${VENUE_MAP_MAX_RAIN_CONTINGENCIES}.`);
  }

  if (routes.length <= VENUE_MAP_MAX_ROUTES) {
    const overlongRoute = routes.find((candidate) => {
      const route = unknownRecord(candidate);
      return route && Array.isArray(route.pointIds)
        && route.pointIds.length > VENUE_MAP_MAX_ROUTE_POINTS;
    });
    const route = unknownRecord(overlongRoute);
    if (route && Array.isArray(route.pointIds)) {
      issues.push(`A saved walkway contains ${route.pointIds.length} ordered points; the per-walkway limit is ${VENUE_MAP_MAX_ROUTE_POINTS}.`);
    }
  }

  if (drawings.length <= VENUE_MAP_MAX_DRAWINGS) {
    const overlongLine = drawings.find((candidate) => {
      const drawing = unknownRecord(candidate);
      return drawing?.type === 'line'
        && Array.isArray(drawing.points)
        && drawing.points.length > VENUE_MAP_MAX_LINE_VERTICES;
    });
    const drawing = unknownRecord(overlongLine);
    if (drawing && Array.isArray(drawing.points)) {
      issues.push(`A saved line contains ${drawing.points.length} vertices; the per-line limit is ${VENUE_MAP_MAX_LINE_VERTICES}.`);
    }
  }

  // Collection-length failures already establish a quarantine. Avoid copying a
  // potentially hostile oversized document through TextEncoder merely to add a
  // redundant byte-size diagnostic.
  if (issues.length === 0) {
    const bytes = serializedVenueMapBytes(value);
    if (bytes > VENUE_MAP_MAX_SERIALIZED_BYTES) {
      issues.push(`The saved Venue Map is larger than the ${VENUE_MAP_MAX_SERIALIZED_BYTES / (1024 * 1024)} MiB canonical payload limit.`);
    }
  }
  return issues;
}

export function venueMapExceedsComplexityBudget(value: unknown): boolean {
  return venueMapComplexityIssues(value).length > 0;
}

function pointCoordinateFrameDimension(
  map: Pick<VenueMapConfig, 'width' | 'height'>,
  field: 'width' | 'height',
  legacyDefault: number,
): number | null {
  if (!Object.prototype.hasOwnProperty.call(map, field)) return legacyDefault;
  const value = map[field];
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= VENUE_MAP_FRAME_MIN
    && value <= VENUE_MAP_FRAME_MAX
    ? value
    : null;
}

/** Explain why optional real-world coordinates cannot be used as one safe pair. */
export function venueMapPointGpsIssue(
  point: Pick<VenueMapPoint, 'lat' | 'lng'>,
): string | null {
  const latitude = point.lat as unknown;
  const longitude = point.lng as unknown;
  const hasLatitude = latitude !== undefined;
  const hasLongitude = longitude !== undefined;
  if (!hasLatitude && !hasLongitude) return null;
  if (hasLatitude !== hasLongitude) {
    return 'Latitude and longitude must be provided together, or both left blank.';
  }
  if (
    typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || typeof longitude !== 'number'
    || !Number.isFinite(longitude)
  ) {
    return 'Latitude and longitude must both be finite numbers.';
  }
  if (latitude < -90 || latitude > 90) return 'Latitude must be from -90 to 90.';
  if (longitude < -180 || longitude > 180) return 'Longitude must be from -180 to 180.';
  return null;
}

/** Explain why a point cannot be located faithfully within its declared map frame. */
export function venueMapPointCoordinateIssue(
  point: Pick<VenueMapPoint, 'x' | 'y'>,
  map: Pick<VenueMapConfig, 'width' | 'height'>,
): string | null {
  const width = pointCoordinateFrameDimension(map, 'width', LEGACY_VENUE_MAP_WIDTH);
  const height = pointCoordinateFrameDimension(map, 'height', LEGACY_VENUE_MAP_HEIGHT);
  if (width === null || height === null) return 'The Venue Map frame is invalid.';
  if (typeof point.x !== 'number' || !Number.isFinite(point.x)) {
    return 'The point horizontal coordinate must be finite.';
  }
  if (typeof point.y !== 'number' || !Number.isFinite(point.y)) {
    return 'The point vertical coordinate must be finite.';
  }
  if (point.x < 0 || point.x > width) {
    return `The point horizontal coordinate must be from 0 to ${width}.`;
  }
  if (point.y < 0 || point.y > height) {
    return `The point vertical coordinate must be from 0 to ${height}.`;
  }
  return null;
}

const SUPPORTED_VENUE_MAP_DRAWING_TYPES = new Set([
  'zone',
  'rectangle',
  'circle',
  'line',
]);

export interface VenueMapDrawingBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Rendered geometry bounds, including rotation around a rectangle's center. */
export function venueMapDrawingBounds(drawing: DrawingObject): VenueMapDrawingBounds {
  if (drawing.type === 'circle') {
    const radius = drawing.radius ?? 0;
    return {
      minX: drawing.x - radius,
      maxX: drawing.x + radius,
      minY: drawing.y - radius,
      maxY: drawing.y + radius,
    };
  }
  if (drawing.type === 'line' && drawing.points?.length) {
    return {
      minX: Math.min(...drawing.points.map((point) => point.x)),
      maxX: Math.max(...drawing.points.map((point) => point.x)),
      minY: Math.min(...drawing.points.map((point) => point.y)),
      maxY: Math.max(...drawing.points.map((point) => point.y)),
    };
  }

  const width = drawing.width ?? 0;
  const height = drawing.height ?? 0;
  const rotation = Number.isFinite(drawing.rotation) ? drawing.rotation! : 0;
  const radians = (rotation * Math.PI) / 180;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const renderedHalfWidth = Math.abs(Math.cos(radians)) * halfWidth
    + Math.abs(Math.sin(radians)) * halfHeight;
  const renderedHalfHeight = Math.abs(Math.sin(radians)) * halfWidth
    + Math.abs(Math.cos(radians)) * halfHeight;
  const centerX = drawing.x + halfWidth;
  const centerY = drawing.y + halfHeight;
  return {
    minX: centerX - renderedHalfWidth,
    maxX: centerX + renderedHalfWidth,
    minY: centerY - renderedHalfHeight,
    maxY: centerY + renderedHalfHeight,
  };
}

export function venueMapDrawingRotationIssue(drawing: DrawingObject): string | null {
  if (drawing.rotation === undefined) return null;
  if (!Number.isFinite(drawing.rotation)) return 'The shape rotation must be a finite number.';
  if (drawing.rotation < VENUE_MAP_ROTATION_MIN || drawing.rotation > VENUE_MAP_ROTATION_MAX) {
    return `The shape rotation must be from ${VENUE_MAP_ROTATION_MIN}° to ${VENUE_MAP_ROTATION_MAX}°.`;
  }
  return null;
}

export type VenueMapDrawingPresentationField =
  | 'fillColor'
  | 'strokeColor'
  | 'strokeWidth'
  | 'opacity'
  | 'fontSize';

export interface VenueMapDrawingPresentationIssue {
  field: VenueMapDrawingPresentationField;
  savedValue: unknown;
  message: string;
}

/** Detect appearance data that an SVG renderer cannot reproduce safely and exactly. */
export function venueMapDrawingPresentationIssues(
  drawing: DrawingObject,
): VenueMapDrawingPresentationIssue[] {
  const source = drawing as unknown as Record<string, unknown>;
  const issues: VenueMapDrawingPresentationIssue[] = [];
  for (const field of ['fillColor', 'strokeColor'] as const) {
    const value = source[field];
    if (value === undefined) continue;
    if (
      typeof value !== 'string'
      || !(value.trim() === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(value.trim()))
    ) {
      issues.push({
        field,
        savedValue: value,
        message: `${field === 'fillColor' ? 'Fill' : 'Border'} color must be “transparent” or a hexadecimal color.`,
      });
    }
  }
  const numericFields: Array<{
    field: 'strokeWidth' | 'opacity' | 'fontSize';
    label: string;
    min: number;
    max: number;
  }> = [
    { field: 'strokeWidth', label: 'Border width', min: VENUE_MAP_STROKE_WIDTH_MIN, max: VENUE_MAP_STROKE_WIDTH_MAX },
    { field: 'opacity', label: 'Opacity', min: VENUE_MAP_OPACITY_MIN, max: VENUE_MAP_OPACITY_MAX },
    { field: 'fontSize', label: 'Label size', min: VENUE_MAP_FONT_SIZE_MIN, max: VENUE_MAP_FONT_SIZE_MAX },
  ];
  for (const { field, label, min, max } of numericFields) {
    const value = source[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      issues.push({
        field,
        savedValue: value,
        message: `${label} must be a finite number from ${min} to ${max}.`,
      });
    }
  }
  return issues;
}

/** Explain why a shape cannot be rendered faithfully inside its Venue Map. */
export function venueMapDrawingIntegrityIssue(
  drawing: DrawingObject,
  frame?: Pick<VenueMapConfig, 'width' | 'height'>,
): string | null {
  if (!SUPPORTED_VENUE_MAP_DRAWING_TYPES.has(drawing.type)) {
    return `Drawing type “${drawing.type || 'blank'}” is not supported by the Venue Map.`;
  }
  const rotationIssue = venueMapDrawingRotationIssue(drawing);
  if (rotationIssue) return rotationIssue;
  const presentationIssue = venueMapDrawingPresentationIssues(drawing)[0];
  if (presentationIssue) return presentationIssue.message;
  if (drawing.type === 'zone' || drawing.type === 'rectangle') {
    if (!Number.isFinite(drawing.x) || !Number.isFinite(drawing.y)) {
      return 'The rectangular shape does not have valid X and Y coordinates.';
    }
    if (
      !Number.isFinite(drawing.width)
      || !Number.isFinite(drawing.height)
      || drawing.width! <= 0
      || drawing.height! <= 0
    ) {
      return 'The rectangular shape needs a positive width and height.';
    }
  } else if (drawing.type === 'circle') {
    if (!Number.isFinite(drawing.x) || !Number.isFinite(drawing.y)) {
      return 'The circle does not have valid center coordinates.';
    }
    if (!Number.isFinite(drawing.radius) || drawing.radius! <= 0) {
      return 'The circle needs a positive radius.';
    }
  } else {
    if (!Array.isArray(drawing.points) || drawing.points.length < 2) {
      return 'The line needs at least two valid vertices.';
    }
    if (drawing.points.some((point) =>
      !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) {
      return 'Every line vertex needs valid X and Y coordinates.';
    }
    const distinctVertices = new Set(
      drawing.points.map((point) => `${Object.is(point.x, -0) ? 0 : point.x}:${Object.is(point.y, -0) ? 0 : point.y}`),
    );
    if (distinctVertices.size < 2) return 'The line needs at least two different vertex positions.';
  }

  if (
    !frame
    || !Number.isFinite(frame.width)
    || !Number.isFinite(frame.height)
    || frame.width <= 0
    || frame.height <= 0
  ) return null;
  const bounds = venueMapDrawingBounds(drawing);
  const tolerance = 1e-7;
  if (
    bounds.minX < -tolerance
    || bounds.minY < -tolerance
    || bounds.maxX > frame.width + tolerance
    || bounds.maxY > frame.height + tolerance
  ) {
    return `The ${drawing.type === 'line' ? 'line' : 'shape'} extends outside the current map frame (0 to ${frame.width} by 0 to ${frame.height}).`;
  }
  return null;
}

export interface VenueMapDrawingIntegrityPartition {
  map: VenueMapConfig;
  quarantinedDrawings: DrawingObject[];
}

/** Keep unsupported, malformed, or out-of-frame shapes recoverable and off portals. */
export function partitionVenueMapDrawingIntegrity(
  map: VenueMapConfig,
): VenueMapDrawingIntegrityPartition {
  const quarantinedIndexes = new Set((map.drawings || []).flatMap((drawing, index) =>
    venueMapDrawingIntegrityIssue(drawing, map) ? [index] : [],
  ));
  return {
    map: {
      ...map,
      drawings: (map.drawings || []).filter((_, index) => !quarantinedIndexes.has(index)),
    },
    quarantinedDrawings: (map.drawings || []).filter((_, index) => quarantinedIndexes.has(index)),
  };
}

export function venueMapHasInvalidDrawingGeometry(map: VenueMapConfig): boolean {
  return (map.drawings || []).some(
    (drawing) => venueMapDrawingIntegrityIssue(drawing, map) !== null,
  );
}

/** Keep every supported drawing geometry wholly inside the authored map. */
export function constrainMapDrawing(
  drawing: DrawingObject,
  mapWidth: number,
  mapHeight: number,
): DrawingObject {
  const widthLimit = Math.max(1, Number.isFinite(mapWidth) ? mapWidth : 1);
  const heightLimit = Math.max(1, Number.isFinite(mapHeight) ? mapHeight : 1);
  let width = drawing.width == null
    ? undefined
    : Math.max(1, Math.min(Number.isFinite(drawing.width) ? drawing.width : 1, widthLimit));
  let height = drawing.height == null
    ? undefined
    : Math.max(1, Math.min(Number.isFinite(drawing.height) ? drawing.height : 1, heightLimit));
  const radius = drawing.radius == null
    ? undefined
    : Math.max(1, Math.min(
        Number.isFinite(drawing.radius) ? drawing.radius : 1,
        Math.min(widthLimit, heightLimit) / 2,
      ));
  const rectangleLike = drawing.type === 'zone' || drawing.type === 'rectangle';
  const clampBetween = (value: number, minimum: number, maximum: number) => {
    const finite = Number.isFinite(value) ? value : minimum;
    return Math.round(Math.max(minimum, Math.min(finite, maximum)) * 10) / 10;
  };

  let x: number;
  let y: number;
  if (rectangleLike && width !== undefined && height !== undefined) {
    const rotation = Number.isFinite(drawing.rotation) ? drawing.rotation! : 0;
    const radians = (rotation * Math.PI) / 180;
    const cosine = Math.abs(Math.cos(radians));
    const sine = Math.abs(Math.sin(radians));
    const initialRenderedWidth = cosine * width + sine * height;
    const initialRenderedHeight = sine * width + cosine * height;
    const scale = Math.min(
      1,
      widthLimit / Math.max(initialRenderedWidth, Number.EPSILON),
      heightLimit / Math.max(initialRenderedHeight, Number.EPSILON),
    );
    width *= scale;
    height *= scale;
    const renderedHalfWidth = (cosine * width + sine * height) / 2;
    const renderedHalfHeight = (sine * width + cosine * height) / 2;
    const requestedCenterX = (Number.isFinite(drawing.x) ? drawing.x : 0) + width / 2;
    const requestedCenterY = (Number.isFinite(drawing.y) ? drawing.y : 0) + height / 2;
    const centerX = Math.max(
      renderedHalfWidth,
      Math.min(requestedCenterX, widthLimit - renderedHalfWidth),
    );
    const centerY = Math.max(
      renderedHalfHeight,
      Math.min(requestedCenterY, heightLimit - renderedHalfHeight),
    );
    x = centerX - width / 2;
    y = centerY - height / 2;
  } else if (drawing.type === 'circle' && radius !== undefined) {
    x = clampBetween(drawing.x, radius, Math.max(radius, widthLimit - radius));
    y = clampBetween(drawing.y, radius, Math.max(radius, heightLimit - radius));
  } else {
    x = clampBetween(drawing.x, 0, widthLimit);
    y = clampBetween(drawing.y, 0, heightLimit);
  }

  return {
    ...drawing,
    x,
    y,
    width,
    height,
    radius,
    rotation: Number.isFinite(drawing.rotation) ? drawing.rotation : undefined,
    points: drawing.points?.map((point) => ({
      x: clampCoord(point.x, widthLimit),
      y: clampCoord(point.y, heightLimit),
    })),
  };
}

/** Resize the map canvas, clamping every point and drawing back into bounds. */
export function updateMapSize(
  map: VenueMapConfig,
  width: number,
  height: number,
): VenueMapConfig {
  const w = clampSize(width, map.width);
  const h = clampSize(height, map.height);
  const clampPoint = (p: VenueMapPoint) => ({
    ...p,
    x: clampCoord(p.x, w),
    y: clampCoord(p.y, h),
  });
  return {
    ...map,
    width: w,
    height: h,
    points: map.points.map(clampPoint),
    drawings: map.drawings?.map((drawing) => constrainMapDrawing(drawing, w, h)),
    updatedAt: new Date().toISOString(),
  };
}

/** Move an existing point to a new position (clamped). */
export function moveMapPoint(
  map: VenueMapConfig,
  pointId: string,
  x: number,
  y: number,
): VenueMapConfig {
  return {
    ...map,
    points: map.points.map((p) =>
      p.id === pointId
        ? { ...p, x: clampCoord(x, map.width), y: clampCoord(y, map.height) }
        : p,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Update a point's metadata (label, kind, venue linkage, GPS, description). */
export function updateMapPoint(
  map: VenueMapConfig,
  pointId: string,
  patch: Partial<Omit<VenueMapPoint, 'id' | 'x' | 'y'>>,
): VenueMapConfig {
  return {
    ...map,
    points: map.points.map((p) => (
      p.id === pointId ? canonicalizeMapPointKindFields({ ...p, ...patch }) : p
    )),
    updatedAt: new Date().toISOString(),
  };
}

/** Remove a point and prune it from any routes that referenced it. */
export function removeMapPoint(
  map: VenueMapConfig,
  pointId: string,
): VenueMapConfig {
  return {
    ...map,
    points: map.points.filter((p) => p.id !== pointId),
    // Preserve ordered route references. The designer quarantines affected
    // routes for explicit replacement/rebuild rather than inventing a direct
    // segment between the deleted point's former neighbors.
    routes: map.routes || [],
    updatedAt: new Date().toISOString(),
  };
}

/** Add a named walkway route connecting valid, unique ordered map points. */
export function addMapRoute(
  map: VenueMapConfig,
  name: string,
  pointIds: string[],
  options: {
    audience?: VenueMapAudience;
    accessibility?: VenueMapRouteAccessibility;
    priority?: VenueMapRoutePriority;
    notes?: string;
    eventSpaceIds?: string[];
  } = {},
): VenueMapConfig {
  if ((map.routes || []).length >= VENUE_MAP_MAX_ROUTES) return map;
  const existing = new Set(map.points.map((point) => point.id));
  const validPointIds = pointIds.filter(
    (id, index) => existing.has(id) && pointIds.indexOf(id) === index,
  );
  if (validPointIds.length < 2 || validPointIds.length > VENUE_MAP_MAX_ROUTE_POINTS) return map;
  const route: VenueMapRoute = {
    id: createEntityId('route', (map.routes || []).map((route) => route.id)),
    name: name.trim() || 'Path',
    pointIds: validPointIds,
    audience: options.audience || 'public',
    accessibility: options.accessibility || 'unknown',
    priority: options.priority || 'standard',
    notes: options.notes?.trim() || undefined,
    eventSpaceIds: options.eventSpaceIds?.length ? [...new Set(options.eventSpaceIds)] : undefined,
  };
  if (venueMapRouteGeometryIssue(route, map.points)) return map;
  return {
    ...map,
    routes: [...(map.routes || []), route],
    updatedAt: new Date().toISOString(),
  };
}

/** Remove a walkway route. */
export function removeMapRoute(
  map: VenueMapConfig,
  routeId: string,
): VenueMapConfig {
  return {
    ...map,
    routes: (map.routes || []).filter((r) => r.id !== routeId),
    updatedAt: new Date().toISOString(),
  };
}

/** Rename a walkway route (blank input keeps the existing name). */
export function renameMapRoute(
  map: VenueMapConfig,
  routeId: string,
  name: string,
): VenueMapConfig {
  const trimmed = (name || '').trim();
  return {
    ...map,
    routes: (map.routes || []).map((r) =>
      r.id === routeId ? { ...r, name: trimmed || r.name } : r,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function updateMapRoute(
  map: VenueMapConfig,
  routeId: string,
  patch: Partial<Pick<VenueMapRoute, 'name' | 'audience' | 'accessibility' | 'priority' | 'notes' | 'pointIds' | 'eventSpaceIds'>>,
): VenueMapConfig {
  const existingPointIds = new Set(map.points.map((point) => point.id));
  return {
    ...map,
    routes: (map.routes || []).map((route) => {
      if (route.id !== routeId) return route;
      const requestedIds = patch.pointIds
        ?.filter((id, index, ids) => existingPointIds.has(id) && ids.indexOf(id) === index);
      return {
        ...route,
        ...patch,
        name: patch.name == null ? route.name : patch.name.trim() || route.name,
        notes: patch.notes == null ? route.notes : patch.notes.trim() || undefined,
        eventSpaceIds: Object.prototype.hasOwnProperty.call(patch, 'eventSpaceIds')
          ? patch.eventSpaceIds?.length ? [...new Set(patch.eventSpaceIds)] : undefined
          : route.eventSpaceIds,
        pointIds: requestedIds && requestedIds.length >= 2 ? requestedIds : route.pointIds,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Duplicate a non-space point at a small offset (clamped to bounds). Space
 * destinations remain one-to-one with venue records and must be added through
 * coverage. The copy does not join any existing walkway routes.
 */
export function duplicateMapPoint(
  map: VenueMapConfig,
  pointId: string,
  offset = 8,
): VenueMapConfig {
  if (map.points.length >= VENUE_MAP_MAX_POINTS) return map;
  const src = map.points.find((p) => p.id === pointId);
  if (!src || src.kind === 'space') return map;
  const x = clampCoord(src.x + offset, map.width);
  const y = clampCoord(src.y + offset, map.height);
  const copy = canonicalizeMapPointKindFields({
    ...src,
    id: createEntityId('pt', map.points.map((point) => point.id)),
    x,
    y,
    label: `${src.label} (copy)`,
  });
  return {
    ...map,
    points: [...map.points, copy],
    updatedAt: new Date().toISOString(),
  };
}

/** Ordered coordinates for a route (for SVG polyline). */
export function routePoints(
  map: VenueMapConfig | null,
  route: VenueMapRoute,
): { x: number; y: number }[] {
  if (
    !map
    || venueMapRoutePriorityIssue(route)
    || route.pointIds.length < 2
    || venueMapRouteReferenceIssues(route, map.points).length > 0
  ) return [];
  const byId = new Map(map.points.map((p) => [p.id, p]));
  return route.pointIds
    .map((id) => byId.get(id))
    .filter((p): p is VenueMapPoint => !!p)
    .map((p) => ({ x: p.x, y: p.y }));
}

/** All point ids currently on the map (for building routes). */
export function mapPointIds(map: VenueMapConfig): string[] {
  return map.points.map((p) => p.id);
}

export function updateMapBackground(
  map: VenueMapConfig,
  backgroundImageUrl?: string,
  backgroundOpacity?: number,
): VenueMapConfig {
  return {
    ...map,
    backgroundImageUrl,
    backgroundOpacity,
    updatedAt: new Date().toISOString(),
  };
}

export function addMapDrawing(
  map: VenueMapConfig,
  drawing: DrawingObject,
): VenueMapConfig {
  if ((map.drawings || []).length >= VENUE_MAP_MAX_DRAWINGS) return map;
  if (drawing.type === 'line' && (drawing.points?.length || 0) > VENUE_MAP_MAX_LINE_VERTICES) return map;
  return {
    ...map,
    drawings: [
      ...(map.drawings || []),
      constrainMapDrawing(drawing, map.width, map.height),
    ],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Append one in-frame line vertex without duplicating an existing coordinate.
 * Returning the original array at the vertex ceiling lets authoring controls
 * refuse an over-budget edit without creating a transient invalid document.
 */
export function appendMapLineVertex(
  points: Array<{ x: number; y: number }>,
  mapWidth: number,
  mapHeight: number,
): Array<{ x: number; y: number }> {
  if (points.length >= VENUE_MAP_MAX_LINE_VERTICES) return points;
  const width = Math.max(1, Number.isFinite(mapWidth) ? mapWidth : 1);
  const height = Math.max(1, Number.isFinite(mapHeight) ? mapHeight : 1);
  const last = points[points.length - 1] || { x: 0, y: 0 };
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  const coordinateKey = (point: { x: number; y: number }) =>
    `${Object.is(point.x, -0) ? 0 : point.x}:${Object.is(point.y, -0) ? 0 : point.y}`;
  const occupied = new Set(points.map(coordinateKey));
  const nearbyCandidates = [
    { x: clamp(last.x + 5, width), y: clamp(last.y, height) },
    { x: clamp(last.x - 5, width), y: clamp(last.y, height) },
    { x: clamp(last.x, width), y: clamp(last.y + 5, height) },
    { x: clamp(last.x, width), y: clamp(last.y - 5, height) },
  ];
  let candidate = nearbyCandidates.find((point) => !occupied.has(coordinateKey(point)));

  // At most 500 coordinates are occupied. These 501 distinct in-frame X
  // positions therefore guarantee one free fallback coordinate.
  if (!candidate) {
    for (let index = 1; index <= VENUE_MAP_MAX_LINE_VERTICES + 1; index += 1) {
      const fallback = {
        x: width * index / (VENUE_MAP_MAX_LINE_VERTICES + 2),
        y: height / 2,
      };
      if (!occupied.has(coordinateKey(fallback))) {
        candidate = fallback;
        break;
      }
    }
  }
  return candidate ? [...points, candidate] : points;
}

export function updateMapDrawing(
  map: VenueMapConfig,
  id: string,
  patch: Partial<Omit<DrawingObject, 'id'>>,
): VenueMapConfig {
  return {
    ...map,
    drawings: (map.drawings || []).map((drawing) =>
      drawing.id === id
        ? constrainMapDrawing({ ...drawing, ...patch }, map.width, map.height)
        : drawing,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Translate one whole map shape without distorting it or crossing the map frame. */
export function moveMapDrawing(
  map: VenueMapConfig,
  id: string,
  deltaX: number,
  deltaY: number,
): VenueMapConfig {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return map;
  const drawing = (map.drawings || []).find((candidate) => candidate.id === id);
  if (!drawing) return map;

  if (drawing.type === 'line' && !drawing.points?.length) return map;
  const bounds = venueMapDrawingBounds(drawing);
  const minTranslateX = -bounds.minX;
  const maxTranslateX = map.width - bounds.maxX;
  const minTranslateY = -bounds.minY;
  const maxTranslateY = map.height - bounds.maxY;
  const boundedTranslateX = Math.max(minTranslateX, Math.min(deltaX, maxTranslateX));
  const boundedTranslateY = Math.max(minTranslateY, Math.min(deltaY, maxTranslateY));
  const translateX = Math.max(
    minTranslateX,
    Math.min(Math.round(boundedTranslateX * 10) / 10, maxTranslateX),
  );
  const translateY = Math.max(
    minTranslateY,
    Math.min(Math.round(boundedTranslateY * 10) / 10, maxTranslateY),
  );
  if (translateX === 0 && translateY === 0) return map;

  return {
    ...map,
    drawings: (map.drawings || []).map((candidate) => {
      if (candidate.id !== id) return candidate;
      if (candidate.type === 'line') {
        return {
          ...candidate,
          points: candidate.points?.map((point) => ({
            x: Math.round((point.x + translateX) * 10) / 10,
            y: Math.round((point.y + translateY) * 10) / 10,
          })),
        };
      }
      return {
        ...candidate,
        x: Math.round((candidate.x + translateX) * 10) / 10,
        y: Math.round((candidate.y + translateY) * 10) / 10,
      };
    }),
    updatedAt: new Date().toISOString(),
  };
}

export function removeMapDrawing(
  map: VenueMapConfig,
  id: string,
): VenueMapConfig {
  return {
    ...map,
    drawings: (map.drawings || []).filter((d) => d.id !== id),
    updatedAt: new Date().toISOString(),
  };
}

export function clearMapDrawings(map: VenueMapConfig): VenueMapConfig {
  return {
    ...map,
    drawings: [],
    updatedAt: new Date().toISOString(),
  };
}

export function addPresetMapZones(map: VenueMapConfig): VenueMapConfig {
  const occupiedIds = (map.drawings || []).map((drawing) => drawing.id);
  const nextZoneId = (prefix: string) => {
    const id = createEntityId(prefix, occupiedIds);
    occupiedIds.push(id);
    return id;
  };
  const presets: DrawingObject[] = [
    {
      id: nextZoneId('zone-ceremony'),
      type: 'zone',
      x: 10,
      y: 15,
      width: 28,
      height: 18,
      fillColor: '#10b981',
      strokeColor: '#059669',
      strokeWidth: 1.2,
      opacity: 0.22,
      text: '🌳 Ceremony Lawn Zone',
    },
    {
      id: nextZoneId('zone-parking'),
      type: 'zone',
      x: 65,
      y: 55,
      width: 26,
      height: 18,
      fillColor: '#6366f1',
      strokeColor: '#4f46e5',
      strokeWidth: 1.2,
      opacity: 0.22,
      text: '🅿️ Main Parking Lot',
    },
    {
      id: nextZoneId('zone-manor'),
      type: 'zone',
      x: 42,
      y: 20,
      width: 25,
      height: 22,
      fillColor: '#4A1942',
      strokeColor: '#3b1435',
      strokeWidth: 1.5,
      opacity: 0.25,
      text: '🏛️ Main Manor Building',
    },
    {
      id: nextZoneId('zone-gardens'),
      type: 'zone',
      x: 15,
      y: 45,
      width: 22,
      height: 22,
      fillColor: '#0d9488',
      strokeColor: '#0f766e',
      strokeWidth: 1.2,
      opacity: 0.22,
      text: '🌿 Gardens Boundary',
    },
  ];
  return {
    ...map,
    drawings: [
      ...(map.drawings || []),
      ...presets.map((drawing) => constrainMapDrawing(drawing, map.width, map.height)),
    ],
    updatedAt: new Date().toISOString(),
  };
}

function projectedPoint(point: VenueMapPoint): VenueMapPoint {
  const gpsValid = venueMapPointGpsIssue(point) === null
    && point.lat !== undefined
    && point.lng !== undefined;
  return canonicalizeMapPointKindFields({
    id: point.id,
    label: point.label?.trim() || 'Point',
    description: point.description,
    x: point.x,
    y: point.y,
    kind: point.kind,
    arrivalRole: point.kind === 'entry' ? point.arrivalRole || 'unknown' : undefined,
    audience: point.audience,
    eventSpaceIds: point.eventSpaceIds ? [...point.eventSpaceIds] : undefined,
    venueId: point.venueId,
    lat: gpsValid ? point.lat : undefined,
    lng: gpsValid ? point.lng : undefined,
  });
}

function projectedRoute(route: VenueMapRoute): VenueMapRoute {
  return {
    id: route.id,
    name: route.name,
    audience: route.audience,
    eventSpaceIds: route.eventSpaceIds ? [...route.eventSpaceIds] : undefined,
    accessibility: venueMapRouteAccessibilityIssue(route) === null
      ? route.accessibility || 'unknown'
      : 'unknown',
    priority: normalizedRoutePriority(route.priority),
    notes: route.notes,
    pointIds: [...route.pointIds],
  };
}

function projectedDrawing(drawing: DrawingObject): DrawingObject {
  return {
    id: drawing.id,
    type: drawing.type,
    x: drawing.x,
    y: drawing.y,
    width: drawing.width,
    height: drawing.height,
    points: drawing.points?.map((point) => ({ x: point.x, y: point.y })),
    rotation: drawing.rotation,
    fillColor: drawing.fillColor,
    strokeColor: drawing.strokeColor,
    strokeWidth: drawing.strokeWidth,
    opacity: drawing.opacity,
    fontSize: drawing.fontSize,
    text: drawing.text,
    radius: drawing.radius,
    audience: drawing.audience,
    eventSpaceIds: drawing.eventSpaceIds ? [...drawing.eventSpaceIds] : undefined,
  };
}

function projectedContingency(contingency: VenueMapConfig['rainContingencies'][number]) {
  return {
    id: contingency.id,
    outdoorVenueId: contingency.outdoorVenueId,
    indoorVenueId: contingency.indoorVenueId,
    note: contingency.note,
  };
}

function projectedMap(
  source: VenueMapConfig,
  points: VenueMapPoint[],
  routes: VenueMapRoute[],
  drawings: DrawingObject[],
  rainContingencies: VenueMapConfig['rainContingencies'],
): VenueMapConfig {
  const baseImageSafeSource = partitionVenueMapBaseImageIntegrity(source);
  return {
    width: baseImageSafeSource.width,
    height: baseImageSafeSource.height,
    points: points.map(projectedPoint),
    routes: routes.map(projectedRoute),
    drawings: drawings.map(projectedDrawing),
    rainContingencies: rainContingencies.map(projectedContingency),
    backgroundImageUrl: baseImageSafeSource.backgroundImageUrl,
    backgroundOpacity: baseImageSafeSource.backgroundOpacity,
    backgroundImageUnavailable: baseImageSafeSource.backgroundImageUnavailable,
    updatedAt: baseImageSafeSource.updatedAt,
  };
}

/**
 * A safe, audience- and event-scoped projection for a map consumer. Projection
 * also rebuilds every object from an allowlist so undeclared/internal JSON fields
 * cannot leak merely because persisted input was structurally wider than its type.
 */
function canonicalEventScopeIds(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const identifiers = value.map(canonicalVenueMapIdentifier);
  return identifiers.some((identifier) => identifier === null)
    ? null
    : [...new Set(identifiers as string[])];
}

/**
 * Fail closed at the pure projection boundary too. Callers normally provide a
 * normalized map, but malformed legacy/direct inputs must not gain a rewritten
 * identity merely because this helper was invoked without the service layer.
 */
export function partitionVenueMapIdentifierIntegrity(map: VenueMapConfig): VenueMapConfig {
  const points = map.points.flatMap((point) => {
    const id = canonicalVenueMapIdentifier(point.id);
    const venueId = point.venueId === undefined
      ? undefined
      : canonicalVenueMapIdentifier(point.venueId);
    const eventSpaceIds = canonicalEventScopeIds(point.eventSpaceIds);
    if (
      !id
      || (point.kind === 'space' && point.venueId !== undefined && !venueId)
      || (point.kind !== 'space' && eventSpaceIds === null)
    ) return [];
    return [{
      ...point,
      id,
      venueId: point.kind === 'space' ? venueId || undefined : undefined,
      eventSpaceIds: point.kind === 'space' ? undefined : eventSpaceIds || undefined,
    }];
  });
  const routes = (map.routes || []).flatMap((route) => {
    const id = canonicalVenueMapIdentifier(route.id);
    const pointIds = Array.isArray(route.pointIds)
      ? route.pointIds.map(canonicalVenueMapIdentifier)
      : [];
    const eventSpaceIds = canonicalEventScopeIds(route.eventSpaceIds);
    if (
      !id
      || !Array.isArray(route.pointIds)
      || pointIds.some((pointId) => pointId === null)
      || eventSpaceIds === null
    ) return [];
    return [{
      ...route,
      id,
      pointIds: pointIds as string[],
      eventSpaceIds: eventSpaceIds || undefined,
    }];
  });
  const drawings = (map.drawings || []).flatMap((drawing) => {
    const id = canonicalVenueMapIdentifier(drawing.id);
    const eventSpaceIds = canonicalEventScopeIds(drawing.eventSpaceIds);
    return !id || eventSpaceIds === null
      ? []
      : [{ ...drawing, id, eventSpaceIds: eventSpaceIds || undefined }];
  });
  const rainContingencies = (map.rainContingencies || []).flatMap((contingency) => {
    const id = canonicalVenueMapIdentifier(contingency.id);
    const outdoorVenueId = canonicalVenueMapIdentifier(contingency.outdoorVenueId);
    const indoorVenueId = canonicalVenueMapIdentifier(contingency.indoorVenueId);
    return !id || !outdoorVenueId || !indoorVenueId
      ? []
      : [{ ...contingency, id, outdoorVenueId, indoorVenueId }];
  });
  return { ...map, points, routes, drawings, rainContingencies };
}

export type VenueMapIdentityFamily = 'point' | 'route' | 'drawing';
export type VenueMapIdentityObject = VenueMapPoint | VenueMapRoute | DrawingObject;

export interface VenueMapDuplicateIdentityGroup {
  family: VenueMapIdentityFamily;
  id: string;
  objects: VenueMapIdentityObject[];
}

export interface VenueMapIdentityPartition {
  /** Objects safe to render/edit while duplicated identities remain quarantined. */
  map: VenueMapConfig;
  duplicateGroups: VenueMapDuplicateIdentityGroup[];
  /** Unique routes hidden only because a referenced point identity is duplicated. */
  dependentRoutes: VenueMapRoute[];
}

function identityCounts(objects: readonly { id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const object of objects) counts.set(object.id, (counts.get(object.id) || 0) + 1);
  return counts;
}

/**
 * Quarantine every occurrence of an ambiguous identity. Routes that reference a
 * duplicated point are also withheld until an admin explicitly chooses which
 * point keeps the original route anchor.
 */
export function partitionVenueMapDuplicateIdentities(
  map: VenueMapConfig,
): VenueMapIdentityPartition {
  const pointCounts = identityCounts(map.points);
  const routeCounts = identityCounts(map.routes || []);
  const drawingCounts = identityCounts(map.drawings || []);
  const duplicatePointIds = new Set(
    [...pointCounts].filter(([, count]) => count > 1).map(([id]) => id),
  );
  const duplicateRouteIds = new Set(
    [...routeCounts].filter(([, count]) => count > 1).map(([id]) => id),
  );
  const duplicateDrawingIds = new Set(
    [...drawingCounts].filter(([, count]) => count > 1).map(([id]) => id),
  );
  const dependentRoutes = (map.routes || []).filter((route) =>
    !duplicateRouteIds.has(route.id)
      && route.pointIds.some((pointId) => duplicatePointIds.has(pointId)),
  );

  const duplicateGroups: VenueMapDuplicateIdentityGroup[] = [
    ...[...duplicatePointIds].map((id) => ({
      family: 'point' as const,
      id,
      objects: map.points.filter((point) => point.id === id),
    })),
    ...[...duplicateRouteIds].map((id) => ({
      family: 'route' as const,
      id,
      objects: (map.routes || []).filter((route) => route.id === id),
    })),
    ...[...duplicateDrawingIds].map((id) => ({
      family: 'drawing' as const,
      id,
      objects: (map.drawings || []).filter((drawing) => drawing.id === id),
    })),
  ];

  return {
    map: {
      ...map,
      points: map.points.filter((point) => !duplicatePointIds.has(point.id)),
      routes: (map.routes || []).filter((route) =>
        !duplicateRouteIds.has(route.id)
          && !route.pointIds.some((pointId) => duplicatePointIds.has(pointId)),
      ),
      drawings: (map.drawings || []).filter((drawing) =>
        !duplicateDrawingIds.has(drawing.id),
      ),
    },
    duplicateGroups,
    dependentRoutes,
  };
}

export function venueMapHasDuplicateIdentities(map: VenueMapConfig): boolean {
  return partitionVenueMapDuplicateIdentities(map).duplicateGroups.length > 0;
}

export type VenueMapRouteReferenceIssueReason =
  | 'malformed'
  | 'unavailable'
  | 'ambiguous'
  | 'duplicate'
  | 'coincident';

export interface VenueMapRouteReferenceIssue {
  index: number;
  pointId: string;
  reason: VenueMapRouteReferenceIssueReason;
}

function venueMapRouteGeometryIssueFromLookup(
  route: VenueMapRoute,
  pointCounts: Map<string, number>,
  pointsById: Map<string, VenueMapPoint>,
): string | null {
  if (!Array.isArray(route.pointIds) || route.pointIds.length < 2) return null;
  const resolvedPoints: VenueMapPoint[] = [];
  for (const pointId of route.pointIds) {
    if (
      typeof pointId !== 'string'
      || (pointCounts.get(pointId) || 0) !== 1
    ) return null;
    const point = pointsById.get(pointId);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    resolvedPoints.push(point);
  }
  const first = resolvedPoints[0];
  return resolvedPoints.some((point) => point.x !== first.x || point.y !== first.y)
    ? null
    : 'Every walkway stop shares the same map position. A walkway must span at least two different positions so its route is visible and usable.';
}

export function venueMapRouteGeometryIssue(
  route: VenueMapRoute,
  points: VenueMapPoint[],
): string | null {
  return venueMapRouteGeometryIssueFromLookup(
    route,
    identityCounts(points),
    new Map(points.map((point) => [point.id, point])),
  );
}

export function venueMapHasInvalidRouteGeometry(map: VenueMapConfig): boolean {
  return (map.routes || []).some((route) =>
    venueMapRouteGeometryIssue(route, map.points) !== null,
  );
}

export function venueMapRouteReferenceIssues(
  route: VenueMapRoute,
  points: VenueMapPoint[],
): VenueMapRouteReferenceIssue[] {
  const pointCounts = identityCounts(points);
  const pointsById = new Map(points.map((point) => [point.id, point]));
  const routeReferenceCounts = new Map<string, number>();
  for (const pointId of route.pointIds) {
    routeReferenceCounts.set(pointId, (routeReferenceCounts.get(pointId) || 0) + 1);
  }

  const referenceIssues = route.pointIds.flatMap<VenueMapRouteReferenceIssue>((pointId, index) => {
    if (
      pointId === INVALID_VENUE_MAP_POINT_REFERENCE
      || typeof pointId !== 'string'
      || pointId.trim().length < 1
      || pointId.trim().length > VENUE_MAP_MAX_IDENTIFIER_LENGTH
    ) {
      return [{ index, pointId, reason: 'malformed' as const }];
    }
    const matches = pointCounts.get(pointId) || 0;
    if (matches === 0) return [{ index, pointId, reason: 'unavailable' as const }];
    if (matches > 1) return [{ index, pointId, reason: 'ambiguous' as const }];
    if ((routeReferenceCounts.get(pointId) || 0) > 1) {
      return [{ index, pointId, reason: 'duplicate' as const }];
    }
    return [];
  });
  if (
    referenceIssues.length > 0
    || venueMapRouteGeometryIssueFromLookup(route, pointCounts, pointsById) === null
  ) {
    return referenceIssues;
  }
  return [{
    index: Math.min(1, route.pointIds.length - 1),
    pointId: route.pointIds[Math.min(1, route.pointIds.length - 1)],
    reason: 'coincident',
  }];
}

export interface VenueMapRouteReferencePartition {
  map: VenueMapConfig;
  quarantinedRoutes: VenueMapRoute[];
}

/**
 * Withhold a whole route rather than connecting across a missing sequence item,
 * allowing an invalid priority to fail open, or treating same-position stops as
 * a visible route.
 */
export function partitionVenueMapRouteReferenceIntegrity(
  map: VenueMapConfig,
): VenueMapRouteReferencePartition {
  const quarantinedRoutes = (map.routes || []).filter((route) =>
    venueMapRoutePriorityIssue(route) !== null
      || route.pointIds.length < 2
      || venueMapRouteReferenceIssues(route, map.points).length > 0,
  );
  const quarantinedIds = new Set(quarantinedRoutes.map((route) => route.id));
  return {
    map: {
      ...map,
      routes: (map.routes || []).filter((route) => !quarantinedIds.has(route.id)),
    },
    quarantinedRoutes,
  };
}

/** Portal-only catalog projection; canonical invalid pins remain admin-recoverable. */
export function projectVenueMapCurrentSpaceLinks(
  map: VenueMapConfig,
  venues: Venue[],
): VenueMapConfig {
  const pointCounts = identityCounts(map.points);
  const invalidPointIds = new Set(
    map.points
      .filter((point) =>
        pointCounts.get(point.id) === 1
          && venueMapSpacePointLinkIssue(point, venues) !== null,
      )
      .map((point) => point.id),
  );
  return partitionVenueMapSpacePointLinkCollisions({
    ...map,
    points: map.points
      .filter((point) => !invalidPointIds.has(point.id))
      .map(canonicalizeMapPointKindFields),
    routes: (map.routes || []).filter((route) =>
      route.pointIds.every((pointId) => !invalidPointIds.has(pointId)),
    ),
  }).map;
}

/** True when an audience projection has map content worth mounting. */
export function hasRenderableVenueMapContent(
  map: VenueMapConfig | null | undefined,
): boolean {
  if (!map) return false;
  const baseImageSafeMap = partitionVenueMapBaseImageIntegrity(map);
  return baseImageSafeMap.points.length > 0
    || (baseImageSafeMap.routes || []).length > 0
    || (baseImageSafeMap.drawings || []).length > 0
    || Boolean(baseImageSafeMap.backgroundImageUrl)
    || baseImageSafeMap.backgroundImageUnavailable === true;
}

export function projectVenueMap(
  map: VenueMapConfig,
  viewer: VenueMapViewer,
  selectedVenueIds?: string[],
  options: { managedBaseImageOnly?: boolean; venues?: Venue[] } = {},
): VenueMapConfig {
  if (venueMapExceedsComplexityBudget(map)) {
    return projectedMap(
      {
        ...map,
        backgroundImageUrl: undefined,
        backgroundOpacity: undefined,
        backgroundImageUnavailable: Boolean(map.backgroundImageUrl) || undefined,
      },
      [],
      [],
      [],
      [],
    );
  }
  const identifierSafeMap = partitionVenueMapIdentifierIntegrity(map);
  const duplicateIdentitySafeMap = partitionVenueMapDuplicateIdentities(identifierSafeMap).map;
  const uniqueSpaceLinkMap = partitionVenueMapSpacePointLinkCollisions(
    duplicateIdentitySafeMap,
  ).map;
  const textSafeMap = partitionVenueMapTextIntegrity(uniqueSpaceLinkMap);
  const arrivalRoleSafeMap = partitionVenueMapArrivalRoleIntegrity(textSafeMap);
  const coordinateSafePointIds = new Set(
    arrivalRoleSafeMap.points
      .filter((point) => venueMapPointCoordinateIssue(point, arrivalRoleSafeMap) === null)
      .map((point) => point.id),
  );
  const coordinateSafeMap = {
    ...arrivalRoleSafeMap,
    points: arrivalRoleSafeMap.points
      .filter((point) => coordinateSafePointIds.has(point.id))
      .map(canonicalizeMapPointKindFields),
    routes: (textSafeMap.routes || []).filter((route) =>
      route.pointIds.every((pointId) => coordinateSafePointIds.has(pointId)),
    ),
  };
  const structurallySafeMap = partitionVenueMapRouteReferenceIntegrity(
    partitionVenueMapDrawingIntegrity(coordinateSafeMap).map,
  ).map;
  const catalogSafeMap = options.venues
    ? projectVenueMapCurrentSpaceLinks(structurallySafeMap, options.venues)
    : structurallySafeMap;
  const identitySafeMap = partitionVenueMapRainContingencyCollisions(catalogSafeMap).map;
  const managedImageUnavailable = options.managedBaseImageOnly
    && Boolean(identitySafeMap.backgroundImageUrl)
    && !isManagedVenueMapImageRef(identitySafeMap.backgroundImageUrl);
  const projectionSource = managedImageUnavailable
    ? {
        ...identitySafeMap,
        backgroundImageUrl: undefined,
        backgroundOpacity: undefined,
        backgroundImageUnavailable: true,
      }
    : identitySafeMap;
  const structurallyValidPortalContingencies = (identitySafeMap.rainContingencies || [])
    .filter((contingency) => contingency.outdoorVenueId !== contingency.indoorVenueId);
  const portalContingencies = options.venues
    ? structurallyValidPortalContingencies.filter(
        (contingency) => rainContingencyValidationIssue(contingency, options.venues!) === null,
      )
    : structurallyValidPortalContingencies;
  const audiencePoints = identitySafeMap.points.filter((point) =>
    isMapAudienceVisible(point.audience, viewer),
  );
  const audiencePointIds = new Set(audiencePoints.map((point) => point.id));
  const audienceRoutes = (identitySafeMap.routes || []).filter((route) =>
    isMapAudienceVisible(route.audience, viewer)
      && route.pointIds.length >= 2
      && route.pointIds.every((id) => audiencePointIds.has(id)),
  );

  if (selectedVenueIds === undefined && viewer !== 'guest') {
    return projectedMap(
      projectionSource,
      audiencePoints,
      audienceRoutes,
      (identitySafeMap.drawings || []).filter((drawing) =>
        isMapAudienceVisible(drawing.audience, viewer),
      ),
      portalContingencies,
    );
  }

  // A guest projection without an event context is not permission to expose
  // every event-scoped property layer. It receives only globally scoped,
  // non-space destinations until explicit event-space ids are supplied.
  const scopedVenueIds = selectedVenueIds || [];
  const backupIds = portalContingencies
    .filter((contingency) => scopedVenueIds.includes(contingency.outdoorVenueId))
    .map((contingency) => contingency.indoorVenueId);
  const relevantVenueIds = new Set([...scopedVenueIds, ...backupIds]);
  const appliesToEvent = (eventSpaceIds?: string[]) => {
    if (eventSpaceIds === undefined) return true;
    if (!Array.isArray(eventSpaceIds)) return false;
    if (eventSpaceIds.length === 0) return true;
    if (
      eventSpaceIds.includes(INVALID_VENUE_MAP_EVENT_SCOPE)
      || eventSpaceIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) return false;
    return eventSpaceIds.some((id) => relevantVenueIds.has(id));
  };
  const scopedAudiencePoints = audiencePoints.filter((point) =>
    appliesToEvent(point.eventSpaceIds)
      && (point.kind !== 'space' || (!!point.venueId && relevantVenueIds.has(point.venueId))),
  );
  const destinationIds = new Set(
    scopedAudiencePoints
      .filter((point) => point.kind !== 'path')
      .map((point) => point.id),
  );
  const selectedSpacePointIds = new Set(
    scopedAudiencePoints
      .filter((point) => point.kind === 'space')
      .map((point) => point.id),
  );
  const allowedIds = new Set(scopedAudiencePoints.map((point) => point.id));
  const candidateRoutes = audienceRoutes.filter((route) =>
    appliesToEvent(route.eventSpaceIds)
      && route.pointIds.every((id) => allowedIds.has(id)),
  );

  // Keep only connected path components that link at least two publishable
  // destinations. This retains intermediate path nodes without exposing a
  // dangling route toward an event-unrelated space.
  const adjacency = new Map<string, Set<string>>();
  for (const route of candidateRoutes) {
    route.pointIds.forEach((id) => {
      if (!adjacency.has(id)) adjacency.set(id, new Set());
    });
    for (let index = 1; index < route.pointIds.length; index += 1) {
      const from = route.pointIds[index - 1];
      const to = route.pointIds[index];
      adjacency.get(from)?.add(to);
      adjacency.get(to)?.add(from);
    }
  }
  const eligibleComponentIds = new Set<string>();
  const visited = new Set<string>();
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const component: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const id = queue.shift()!;
      component.push(id);
      for (const next of adjacency.get(id) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    const destinationCount = component.filter((id) => destinationIds.has(id)).length;
    const reachesSelectedSpace = component.some((id) => selectedSpacePointIds.has(id));
    if (destinationCount >= 2 && (relevantVenueIds.size === 0 || reachesSelectedSpace)) {
      component.forEach((id) => eligibleComponentIds.add(id));
    }
  }

  const routes = candidateRoutes.filter((route) =>
    route.pointIds.every((id) => eligibleComponentIds.has(id)),
  );
  const routePointIds = new Set(routes.flatMap((route) => route.pointIds));
  const points = scopedAudiencePoints.filter((point) =>
    destinationIds.has(point.id) || routePointIds.has(point.id),
  );

  return projectedMap(
    projectionSource,
    points,
    routes,
    (identitySafeMap.drawings || []).filter((drawing) =>
      isMapAudienceVisible(drawing.audience, viewer)
        && appliesToEvent(drawing.eventSpaceIds),
    ),
    portalContingencies.filter((contingency) =>
      scopedVenueIds.includes(contingency.outdoorVenueId),
    ),
  );
}

export function venueMapDirectionsContextKey(
  map: VenueMapConfig | null | undefined,
  selectedVenueIds: readonly string[],
  venues: readonly Venue[],
  managedBaseImageOnly: boolean,
): string {
  const normalizedScope = [...new Set(selectedVenueIds)].sort();
  const routingCatalog = venues
    .map((venue) => ({
      id: venue.id,
      category: venue.category,
      environment: venue.environment,
    }))
    .sort((left, right) =>
      `${left.id}\u0000${left.category}\u0000${left.environment || ''}`
        .localeCompare(`${right.id}\u0000${right.category}\u0000${right.environment || ''}`),
    );
  return JSON.stringify({
    map: map || null,
    selectedVenueIds: normalizedScope,
    routingCatalog,
    managedBaseImageOnly,
  });
}

export interface VenueMapRoutePathSegment {
  fromPointId: string;
  toPointId: string;
  route: VenueMapRoute;
}

export interface VenueMapRoutePath {
  pointIds: string[];
  /** Exact chosen route for each consecutive point pair, in travel order. */
  segments: VenueMapRoutePathSegment[];
  /** Consecutive route runs, retained for summary callers. */
  routes: VenueMapRoute[];
  /** Best venue-authored tier needed to connect the selected points. */
  priority: Exclude<VenueMapRoutePriority, 'emergency-only'> | 'emergency-only';
  /** Geometric length in authored map units (not a calibrated real-world distance). */
  distance: number;
}

const ROUTE_PRIORITY_RANK: Record<VenueMapRoutePriority, number> = {
  preferred: 0,
  standard: 1,
  secondary: 2,
  'emergency-only': 3,
};

function normalizedRoutePriority(priority: VenueMapRoutePriority | undefined): VenueMapRoutePriority {
  return priority && MAP_ROUTE_PRIORITIES.includes(priority) ? priority : 'standard';
}

/**
 * Find an authored path using the venue's priority before displayed distance.
 * We first try preferred routes only, then admit standard and secondary tiers in
 * order. Within the first tier that connects the destinations, Dijkstra first
 * minimizes distance traveled on lower-priority admitted routes, then geometric
 * distance. Emergency-only routes are excluded unless a caller explicitly
 * requests them; routine guest directions never do.
 */
export function findVenueMapRoute(
  map: VenueMapConfig,
  fromPointId: string,
  toPointId: string,
  options: { stepFreeOnly?: boolean; includeEmergencyOnly?: boolean } = {},
): VenueMapRoutePath | null {
  const pointsById = new Map(map.points.map((point) => [point.id, point]));
  const pointCounts = identityCounts(map.points);
  if (
    pointCounts.get(fromPointId) !== 1
    || pointCounts.get(toPointId) !== 1
    || !pointsById.has(fromPointId)
    || !pointsById.has(toPointId)
  ) return null;
  if (fromPointId === toPointId) {
    return {
      pointIds: [fromPointId],
      segments: [],
      routes: [],
      priority: 'standard',
      distance: 0,
    };
  }

  const tiers: VenueMapRoutePriority[] = options.includeEmergencyOnly
    ? ['preferred', 'standard', 'secondary', 'emergency-only']
    : ['preferred', 'standard', 'secondary'];
  const candidateRoutes = (map.routes || []).filter((route) => {
    const routePointIds = route.pointIds;
    return venueMapRoutePriorityIssue(route) === null
      && (!options.stepFreeOnly || route.accessibility === 'step-free')
      && (options.includeEmergencyOnly || normalizedRoutePriority(route.priority) !== 'emergency-only')
      && routePointIds.length >= 2
      && new Set(routePointIds).size === routePointIds.length
      && routePointIds.every((id) =>
        typeof id === 'string'
          && id !== INVALID_VENUE_MAP_POINT_REFERENCE
          && id.trim().length >= 1
          && id.trim().length <= VENUE_MAP_MAX_IDENTIFIER_LENGTH
          && pointCounts.get(id) === 1
          && Number.isFinite(pointsById.get(id)?.x)
          && Number.isFinite(pointsById.get(id)?.y),
      )
      && venueMapRouteGeometryIssueFromLookup(route, pointCounts, pointsById) === null;
  });

  for (const tier of tiers) {
    const maximumRank = ROUTE_PRIORITY_RANK[tier];
    const adjacency = new Map<string, Array<{
      pointId: string;
      route: VenueMapRoute;
      distance: number;
    }>>();
    for (const route of candidateRoutes) {
      if (ROUTE_PRIORITY_RANK[normalizedRoutePriority(route.priority)] > maximumRank) continue;
      for (let index = 1; index < route.pointIds.length; index += 1) {
        const from = route.pointIds[index - 1];
        const to = route.pointIds[index];
        const fromPoint = pointsById.get(from)!;
        const toPoint = pointsById.get(to)!;
        const distance = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
        if (!Number.isFinite(distance)) continue;
        adjacency.set(from, [...(adjacency.get(from) || []), { pointId: to, route, distance }]);
        adjacency.set(to, [...(adjacency.get(to) || []), { pointId: from, route, distance }]);
      }
    }
    adjacency.forEach((edges) => edges.sort((left, right) =>
      left.route.id.localeCompare(right.route.id) || left.pointId.localeCompare(right.pointId),
    ));

    // Cost is lexicographic, not a single weighted number. For a Standard-tier
    // search it is [distance on Standard, total distance]; for Secondary it is
    // [distance on Secondary, distance on Standard, total distance]. This keeps
    // arbitrary map scale from overpowering an explicit venue route priority.
    const costLength = maximumRank + 1;
    const zeroCost = Array.from({ length: costLength }, () => 0);
    const costs = new Map<string, number[]>([[fromPointId, zeroCost]]);
    const signatures = new Map<string, string>([[fromPointId, fromPointId]]);
    const previous = new Map<string, { pointId: string; route: VenueMapRoute }>();
    const unvisited = new Set(pointsById.keys());
    const epsilon = 1e-9;
    const compareCosts = (left: readonly number[], right: readonly number[]) => {
      for (let index = 0; index < costLength; index += 1) {
        if (left[index] < right[index] - epsilon) return -1;
        if (left[index] > right[index] + epsilon) return 1;
      }
      return 0;
    };

    while (unvisited.size > 0) {
      let current: string | null = null;
      for (const pointId of unvisited) {
        const candidateCost = costs.get(pointId);
        if (!candidateCost) continue;
        const currentCost = current == null ? undefined : costs.get(current);
        const candidateSignature = signatures.get(pointId) || pointId;
        const currentSignature = current == null ? '' : signatures.get(current) || current;
        const comparison = currentCost ? compareCosts(candidateCost, currentCost) : -1;
        if (
          comparison < 0
          || (comparison === 0 && (current == null || candidateSignature < currentSignature))
        ) current = pointId;
      }
      if (current == null) break;
      unvisited.delete(current);
      if (current === toPointId) break;

      for (const edge of adjacency.get(current) || []) {
        if (!unvisited.has(edge.pointId)) continue;
        const edgeCost = Array.from({ length: costLength }, () => 0);
        const edgeRank = ROUTE_PRIORITY_RANK[normalizedRoutePriority(edge.route.priority)];
        if (edgeRank > 0) edgeCost[maximumRank - edgeRank] = edge.distance;
        edgeCost[costLength - 1] = edge.distance;
        const nextCost = costs.get(current)!.map((value, index) => value + edgeCost[index]);
        const nextSignature = `${signatures.get(current) || current}>${edge.route.id}:${edge.pointId}`;
        const knownCost = costs.get(edge.pointId);
        const knownSignature = signatures.get(edge.pointId) || '';
        const comparison = knownCost ? compareCosts(nextCost, knownCost) : -1;
        if (
          comparison < 0
          || (comparison === 0 && (!knownSignature || nextSignature < knownSignature))
        ) {
          costs.set(edge.pointId, nextCost);
          signatures.set(edge.pointId, nextSignature);
          previous.set(edge.pointId, { pointId: current, route: edge.route });
        }
      }
    }

    const selectedCost = costs.get(toPointId);
    if (!selectedCost) continue;
    const distance = selectedCost[costLength - 1];
    const path = [toPointId];
    const pathRoutes: VenueMapRoute[] = [];
    let cursor = toPointId;
    while (cursor !== fromPointId) {
      const step = previous.get(cursor);
      if (!step) return null;
      path.push(step.pointId);
      pathRoutes.push(step.route);
      cursor = step.pointId;
    }
    path.reverse();
    pathRoutes.reverse();
    return {
      pointIds: path,
      segments: pathRoutes.map((route, index) => ({
        fromPointId: path[index],
        toPointId: path[index + 1],
        route,
      })),
      routes: pathRoutes.filter((route, index) => index === 0 || route.id !== pathRoutes[index - 1].id),
      priority: tier,
      distance: distance!,
    };
  }

  return null;
}

/** Build guest directions in exact path order, including intermediate guidance. */
export function buildVenueMapDirectionSteps(
  map: VenueMapConfig,
  path: VenueMapRoutePath,
): string[] {
  const pointsById = new Map(map.points.map((point) => [point.id, point]));
  const start = pointsById.get(path.pointIds[0]);
  const destination = pointsById.get(path.pointIds[path.pointIds.length - 1]);
  if (!start || !destination) return [];

  const steps = [`Start at ${start.label}.`];
  if (start.description) steps.push(start.description);
  let activeRouteId: string | null = null;

  path.segments.forEach((segment, index) => {
    if (segment.route.id !== activeRouteId) {
      const priority = routePriorityLabel(segment.route.priority).toLowerCase();
      steps.push(
        `Follow ${priority === 'standard' ? '' : `${priority} `}route “${segment.route.name}”. `
        + `Mobility: ${routeAccessibilityLabel(segment.route.accessibility)}.`,
      );
      if (segment.route.notes) steps.push(segment.route.notes);
      activeRouteId = segment.route.id;
    }
    const reachedPoint = pointsById.get(segment.toPointId);
    const isDestination = index === path.segments.length - 1;
    if (reachedPoint?.description && !isDestination) {
      steps.push(`At ${reachedPoint.label}: ${reachedPoint.description}`);
    }
  });

  steps.push(`Arrive at ${destination.label}.`);
  if (destination.description) steps.push(destination.description);
  return steps;
}

export type VenueMapGuestRouteCoverageIssueKind =
  | 'missing-destination-pin'
  | 'no-arrival-point'
  | 'no-routine-route'
  | 'no-step-free-route';

export interface VenueMapGuestRouteCoverageIssue {
  kind: VenueMapGuestRouteCoverageIssueKind;
  /** Absent when the gap is the missing destination point itself. */
  pointId?: string;
  pointLabel: string;
  venueId: string;
  venueName: string;
  message: string;
}

/**
 * Prefer an authored, routable arrival over collection order. Callers may omit
 * route context before a guest has selected a destination.
 */
export function preferredVenueMapDirectionsStart(
  points: readonly VenueMapPoint[],
  options: {
    map?: VenueMapConfig;
    destinationPointId?: string;
    stepFreeOnly?: boolean;
  } = {},
): VenueMapPoint | undefined {
  const arrivals = [
    ...points.filter((point) => point.kind === 'entry' && isVenueMapGuestArrivalPoint(point)),
    ...points.filter((point) => point.kind === 'parking' && isVenueMapGuestArrivalPoint(point)),
  ];
  // An automatic start must represent somewhere the visitor can travel from.
  // Keep an explicit same-point choice available in the portal, but never make
  // the selected destination its own silent fallback.
  const fallbackArrivals = options.destinationPointId
    ? arrivals.filter((point) => point.id !== options.destinationPointId)
    : arrivals;
  if (options.map && options.destinationPointId) {
    const routable = fallbackArrivals.find((point) =>
      findVenueMapRoute(options.map!, point.id, options.destinationPointId!, {
        stepFreeOnly: options.stepFreeOnly,
      }) !== null,
    );
    if (routable) return routable;
  }
  return fallbackArrivals[0];
}

/**
 * Review whether every uniquely identifiable, non-lodging venue has a map
 * destination, then review each guest-visible destination in its own wedding
 * scope. This is advisory: an informational map can be valid after the admin
 * explicitly acknowledges incomplete destination or walking-route coverage.
 */
export function venueMapGuestRouteCoverageIssues(
  map: VenueMapConfig,
  venues: readonly Venue[],
): VenueMapGuestRouteCoverageIssue[] {
  const venueIdCounts = identityCounts(venues);
  const uniquelyIdentifiableVenues = venues.filter(
    (venue) => venueIdCounts.get(venue.id) === 1,
  );
  const venuesById = new Map(
    uniquelyIdentifiableVenues.map((venue) => [venue.id, venue]),
  );
  const linkedVenueIds = new Set(
    map.points
      .filter((point) => point.kind === 'space' && typeof point.venueId === 'string')
      .map((point) => point.venueId!),
  );
  const missingDestinationIssues = uniquelyIdentifiableVenues
    .filter((venue) => venue.category !== 'lodging' && !linkedVenueIds.has(venue.id))
    .map<VenueMapGuestRouteCoverageIssue>((venue) => ({
      kind: 'missing-destination-pin',
      pointLabel: 'Missing map pin',
      venueId: venue.id,
      venueName: venue.name,
      message: `${venue.name} has no canonical map pin, so it will not appear as a destination in Couple or Guest maps.`,
    }));
  const destinations = map.points.filter((point) => {
    if (point.kind !== 'space' || !point.venueId) return false;
    if ((point.audience || 'public') !== 'public') return false;
    const venue = venuesById.get(point.venueId);
    return Boolean(venue && venue.category !== 'lodging');
  });

  const routeIssues = destinations.flatMap<VenueMapGuestRouteCoverageIssue>((destination) => {
    const venue = venuesById.get(destination.venueId!);
    if (!venue) return [];
    const scopedMap = projectVenueMap(
      map,
      'guest',
      [destination.venueId!],
      { venues: [...venues] },
    );
    if (!scopedMap.points.some((point) => point.id === destination.id)) return [];
    const arrivals = scopedMap.points.filter(isVenueMapGuestArrivalPoint);
    const base = {
      pointId: destination.id,
      pointLabel: destination.label,
      venueId: destination.venueId!,
      venueName: venue.name,
    };
    if (arrivals.length === 0) {
      return [{
        ...base,
        kind: 'no-arrival-point' as const,
        message: `No guest-visible point classified as Guest arrival (or Parking) is available in the ${venue.name} wedding scope.`,
      }];
    }
    const hasRoutineRoute = arrivals.some((arrival) =>
      findVenueMapRoute(scopedMap, arrival.id, destination.id) !== null,
    );
    if (!hasRoutineRoute) {
      return [{
        ...base,
        kind: 'no-routine-route' as const,
        message: `No routine authored walkway connects a guest arrival point to ${destination.label}.`,
      }];
    }
    const hasStepFreeRoute = arrivals.some((arrival) =>
      findVenueMapRoute(scopedMap, arrival.id, destination.id, { stepFreeOnly: true }) !== null,
    );
    return hasStepFreeRoute
      ? []
      : [{
          ...base,
          kind: 'no-step-free-route' as const,
          message: `A routine route reaches ${destination.label}, but no verified step-free route is published.`,
        }];
  });

  return [...missingDestinationIssues, ...routeIssues];
}
