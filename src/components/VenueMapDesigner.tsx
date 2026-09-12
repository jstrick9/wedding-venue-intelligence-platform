import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DrawingObject,
  RainContingency,
  Venue,
  VenueMapAudience,
  VenueMapArrivalRole,
  VenueMapConfig,
  VenueMapPoint,
  VenueMapPointKind,
  VenueMapRoute,
  VenueMapRouteAccessibility,
  VenueMapRoutePriority,
  VenueMapViewer,
} from '../types';
import {
  VenueMapCanvas,
  type VenueMapBackgroundLoadSnapshot,
  type VenueMapCanvasInteractionMode,
} from './VenueMapCanvas';
import { ConfirmDialog } from './ConfirmDialog';
import {
  buildVenueMapRainPlanGuidanceItems,
  VenueMapRainPlanGuidance,
} from './VenueMapRainPlanGuidance';
import {
  buildVenueMapDrawingGuidanceItems,
  venueMapDrawingTypeLabel,
} from './VenueMapDrawingGuidance';
import { buildVenueMapPointGuidanceItems } from './VenueMapPointGuidance';
import { buildVenueMapRouteGuidanceItems } from './VenueMapRouteGuidance';
import {
  addMapDrawing,
  addMapPoint,
  addMapRoute,
  appendMapLineVertex,
  clearMapDrawings,
  constrainMapDrawing,
  canonicalizeMapPointKindFields,
  duplicateMapPoint,
  isRainContingencyBackup,
  isRainContingencySource,
  arrivalRoleLabel,
  mapAudienceLabel,
  MAP_AUDIENCES,
  MAP_ARRIVAL_ROLES,
  MAP_ROUTE_ACCESSIBILITY,
  MAP_ROUTE_PRIORITIES,
  VENUE_MAP_BACKGROUND_OPACITY_MAX,
  VENUE_MAP_BACKGROUND_OPACITY_MIN,
  VENUE_MAP_MAX_DRAWINGS,
  VENUE_MAP_MAX_DRAWING_TEXT_LENGTH,
  VENUE_MAP_MAX_GUIDANCE_LENGTH,
  VENUE_MAP_MAX_IDENTIFIER_LENGTH,
  VENUE_MAP_MAX_LINE_VERTICES,
  VENUE_MAP_MAX_POINT_LABEL_LENGTH,
  VENUE_MAP_MAX_POINTS,
  VENUE_MAP_MAX_RAIN_CONTINGENCIES,
  VENUE_MAP_MAX_ROUTES,
  VENUE_MAP_MAX_ROUTE_NAME_LENGTH,
  VENUE_MAP_MAX_ROUTE_POINTS,
  VENUE_MAP_OPACITY_MAX,
  VENUE_MAP_OPACITY_MIN,
  VENUE_MAP_ROTATION_MAX,
  VENUE_MAP_ROTATION_MIN,
  VENUE_MAP_STROKE_WIDTH_MAX,
  VENUE_MAP_STROKE_WIDTH_MIN,
  VENUE_MAP_FONT_SIZE_MAX,
  VENUE_MAP_FONT_SIZE_MIN,
  moveMapDrawing,
  moveMapPoint,
  pointColor,
  pointKindIcon,
  pointKindLabel,
  partitionVenueMapDrawingIntegrity,
  partitionVenueMapDuplicateIdentities,
  partitionVenueMapRainContingencyCollisions,
  partitionVenueMapRouteReferenceIntegrity,
  partitionVenueMapSpacePointLinkCollisions,
  projectVenueMap,
  venueMapSpacePointLinkCollisionGroups,
  rainContingencyCollisionIssues,
  rainContingencyValidationIssue,
  routeAccessibilityLabel,
  routePriorityLabel,
  removeMapDrawing,
  removeMapPoint,
  removeMapRoute,
  updateMapBackground,
  updateMapDrawing,
  updateMapPoint,
  updateMapRoute,
  unavailableVenueMapEventScopeIds,
  updateMapSize,
  venueMapArtifactFilenameBase,
  venueMapArtifactRasterScale,
  venueMapArrivalRoleIntegrityIssues,
  venueMapAudienceIntegrityIssues,
  venueMapBaseImageIntegrityIssues,
  venueMapComplexityIssues,
  venueMapDrawingIntegrityIssue,
  venueMapDrawingPresentationIssues,
  venueMapDrawingRotationIssue,
  venueMapEventScopeRecoveryLabel,
  venueMapGuestRouteCoverageIssues,
  venueMapPointCoordinateIssue,
  venueMapPointGpsIssue,
  venueMapRouteAccessibilityIntegrityIssues,
  venueMapRouteAccessibilityIssue,
  venueMapRouteDeliveryIssues,
  venueMapRouteGeometryIssue,
  venueMapRoutePointDeliveryIssues,
  venueMapRoutePriorityIssue,
  venueMapRouteReferenceIssues,
  venueMapScopeArtifactCode,
  venueMapSpacePointLinkIssue,
  venueMapTextIntegrityIssues,
  type VenueMapAudienceIntegrityIssue,
  type VenueMapDuplicateIdentityGroup,
  type VenueMapIdentityObject,
  type VenueMapRouteDeliveryCompatibilityIssue,
} from '../utils/venueMapDesigner';
import {
  downloadAccessibleHtmlArtifact,
  downloadLayoutPdf,
  downloadLayoutPng,
  type AccessibleHtmlArtifactSection,
  type ExportOptions,
} from '../utils/layoutExport';
import { showToast } from './Toast';
import { createEntityId } from '../utils/entityId';
import { describeUnknownError } from '../utils/unknownError';
import { uploadImage } from '../services/storage/imageStorage';
import { getPlatformProvider } from '../services/platform';
import {
  analyzeVenueMapConfig,
  assertVenueMapArrivalRolesResolved,
  assertVenueMapAudiencesResolved,
  assertVenueMapBaseImageResolved,
  assertVenueMapIdentifiersValid,
  assertVenueMapPointGpsResolved,
  assertVenueMapRouteAccessibilityResolved,
  assertVenueMapRouteGeometryResolved,
  assertVenueMapSpacePointLinksUnique,
  emptyVenueMapConfig,
  getQuarantinedVenueMapForRecovery,
  getVenueMapStructuralRecoveryArtifacts,
  normalizeVenueMapConfig,
  venueMapRecoverySourceIsRedacted,
  VENUE_MAP_FRAME_MAX,
  VENUE_MAP_FRAME_MIN,
  type VenueMapStructuralRecoveryArtifact,
} from '../services/wayfinding/venueWayfindingService';
import { isManagedVenueMapImageRef } from '../utils/venueMapImageRef';
import { isConfirmDialogOpen } from '../utils/modalEscape';

export type VenueMapDesignerSaveResult =
  | { status: 'saved'; updatedAt?: string | null }
  | { status: 'conflict' }
  | { status: 'error' };

export interface VenueMapDesignerProps {
  map: VenueMapConfig;
  venues: Venue[];
  onSave: (
    map: VenueMapConfig,
    expectedUpdatedAt: string | null | undefined,
  ) => void | VenueMapDesignerSaveResult | Promise<void | VenueMapDesignerSaveResult>;
  onClose?: () => void;
  /** Optional title drawn on the map (e.g. the venue name) and included in exports. */
  mapTitle?: string;
  /** Fired whenever there are unsaved edits (so the shell can guard navigation). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Active tenant used to place cloud-hosted base-map assets in tenant storage. */
  organizationId?: string;
  /** org_data.updated_at observed when this editor instance loaded (`null` = absent row). */
  baseUpdatedAt?: string | null;
  /** Replaces the shell's conflict snapshot and reports complete publication readiness. */
  onConflictDraftChange?: (map: VenueMapConfig, publicationBlocked: boolean) => void;
  /** Admin-only rejected canonical occurrences; never included in a published map. */
  structuralRecoveryArtifacts?: VenueMapStructuralRecoveryArtifact[];
}

const KINDS: VenueMapPointKind[] = ['space', 'parking', 'entry', 'amenity', 'path'];
const PLACEABLE_POINT_KINDS: VenueMapPointKind[] = ['space', 'parking', 'entry', 'amenity'];
const isValidLatitude = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= -180 && value <= 180;
const gpsInputValue = (value: unknown): number | '' =>
  typeof value === 'number' && Number.isFinite(value) ? value : '';
const audienceSelectValue = (value: unknown): VenueMapAudience | '' =>
  typeof value === 'string' && MAP_AUDIENCES.includes(value as VenueMapAudience)
    ? value as VenueMapAudience
    : '';
const arrivalRoleSelectValue = (value: unknown): VenueMapArrivalRole | '' =>
  value === undefined
    ? 'unknown'
    : typeof value === 'string' && MAP_ARRIVAL_ROLES.includes(value as VenueMapArrivalRole)
      ? value as VenueMapArrivalRole
      : '';
const accessibilitySelectValue = (value: unknown): VenueMapRouteAccessibility | '' =>
  typeof value === 'string'
    && MAP_ROUTE_ACCESSIBILITY.includes(value as VenueMapRouteAccessibility)
    ? value as VenueMapRouteAccessibility
    : '';
const drawingColorPickerValue = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/i.test(color)) {
    return `#${color.slice(1, 4).split('').map((digit) => `${digit}${digit}`).join('')}`;
  }
  return fallback;
};
const drawingPresentationRepairPatch = (
  drawing: DrawingObject,
): Partial<Omit<DrawingObject, 'id'>> => {
  const fields = new Set(venueMapDrawingPresentationIssues(drawing).map((issue) => issue.field));
  return {
    ...(fields.has('fillColor') ? { fillColor: '#0d9488' } : {}),
    ...(fields.has('strokeColor') ? { strokeColor: '#0f766e' } : {}),
    ...(fields.has('strokeWidth') ? { strokeWidth: drawing.type === 'line' ? 1.5 : 1 } : {}),
    ...(fields.has('opacity') ? { opacity: drawing.type === 'line' ? 1 : 0.25 } : {}),
    ...(fields.has('fontSize') ? { fontSize: 12 } : {}),
  };
};
const recoveryValueLabel = (value: unknown): string => {
  if (value === undefined) return 'blank';
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    const preview = value.length > 80 ? `${value.slice(0, 77)}…` : value;
    return `“${preview}”${value.length > 80 ? ` (${value.length} characters)` : ''}`;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized.length > 80
      ? `${serialized.slice(0, 77)}… (${serialized.length} characters)`
      : serialized || String(value);
  } catch {
    return String(value);
  }
};

interface VenueMapInitialRecoveryPartition {
  map: VenueMapConfig;
  duplicateGroups: VenueMapDuplicateIdentityGroup[];
  duplicateDependentRoutes: VenueMapRoute[];
  routeReferenceQuarantine: VenueMapRoute[];
  rainContingencyQuarantine: RainContingency[];
  drawingIntegrityQuarantine: DrawingObject[];
}

interface PendingVenueMapVisualArtifact {
  id: number;
  kind: 'png' | 'pdf' | 'print';
  map: VenueMapConfig;
  filename: string;
  options: ExportOptions;
  sourceLabel: string;
  audienceLabel: string;
  preparedAt: string;
  venues: Venue[];
}

interface EventScopeEditorProps {
  eventSpaceIds?: string[];
  venues: Venue[];
  subjectLabel: string;
  onChange: (ids: string[] | undefined) => void;
  compact?: boolean;
}

function EventScopeEditor({
  eventSpaceIds,
  venues,
  subjectLabel,
  onChange,
  compact = false,
}: EventScopeEditorProps) {
  const [scopeRemovalBlocked, setScopeRemovalBlocked] = useState(false);
  const ids = eventSpaceIds || [];
  const unavailableIds = unavailableVenueMapEventScopeIds(ids, venues);
  useEffect(() => setScopeRemovalBlocked(false), [subjectLabel]);
  if (venues.length === 0 && ids.length === 0) return null;

  const unavailableSet = new Set(unavailableIds);
  const updateVenue = (venueId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...ids, venueId])]
      : ids.filter((id) => id !== venueId);
    if (!checked && ids.length > 0 && next.length === 0) {
      setScopeRemovalBlocked(true);
      return;
    }
    setScopeRemovalBlocked(false);
    onChange(next.length ? next : undefined);
  };

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
      <summary className={`cursor-pointer font-medium text-gray-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        Event-space scope: {ids.length === 0
          ? 'All wedding events'
          : `${ids.length} selected space${ids.length === 1 ? '' : 's'}`}
      </summary>
      <div className="mt-2 space-y-1">
        {venues.map((venue) => (
          <label key={venue.id} className={`flex min-h-8 items-center gap-2 text-gray-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            <input
              type="checkbox"
              checked={ids.includes(venue.id)}
              onChange={(event) => updateVenue(venue.id, event.target.checked)}
            />
            <span className="truncate">{venue.name}</span>
          </label>
        ))}
        {venues.length === 0 && (
          <p className="text-[11px] text-gray-500">No current venue spaces are available for this scope.</p>
        )}
      </div>
      {unavailableIds.length > 0 && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-800" role="alert">
          <p className="font-semibold">Unavailable saved scope:</p>
          <ul className="mt-1 list-disc pl-4">
            {unavailableIds.map((id) => (
              <li key={id}>{venueMapEventScopeRecoveryLabel(id)}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              const next = ids.filter((id) => !unavailableSet.has(id));
              if (ids.length > 0 && next.length === 0) {
                setScopeRemovalBlocked(true);
                return;
              }
              setScopeRemovalBlocked(false);
              onChange(next.length ? next : undefined);
            }}
            aria-label={`Remove unavailable scopes from ${subjectLabel}`}
            className="mt-2 min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
          >
            Remove unavailable scopes
          </button>
        </div>
      )}
      {scopeRemovalBlocked && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] font-medium text-amber-900" role="alert">
          Scope unchanged. Removing the last selected space would broaden this item to every wedding. Select a replacement space first, or explicitly choose “Use for all wedding events.”
        </p>
      )}
      {ids.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setScopeRemovalBlocked(false);
            onChange(undefined);
          }}
          aria-label={`Use ${subjectLabel} for all wedding events`}
          className="mt-2 min-h-8 rounded px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 hover:underline"
        >
          Use for all wedding events
        </button>
      )}
    </details>
  );
}

function routeDeliveryIssueDescription(
  issue: VenueMapRouteDeliveryCompatibilityIssue,
  venues: Venue[],
): string {
  const details: string[] = [];
  if (issue.audienceIncompatible) {
    details.push(
      `point is ${mapAudienceLabel(issue.point.audience)}, but the walkway is ${mapAudienceLabel(issue.route.audience)}`,
    );
  }
  if (issue.eventScopeIncompatible) {
    if (issue.routeTargetsAllEvents) {
      const pointScope = (issue.point.eventSpaceIds || []).map((eventSpaceId) =>
        venues.find((venue) => venue.id === eventSpaceId)?.name
          || venueMapEventScopeRecoveryLabel(eventSpaceId),
      );
      details.push(`point is limited to ${pointScope.join(', ')}, but the walkway says All wedding events`);
    } else {
      const missingScopes = issue.uncoveredEventSpaceIds.map((eventSpaceId) =>
        venues.find((venue) => venue.id === eventSpaceId)?.name
          || venueMapEventScopeRecoveryLabel(eventSpaceId),
      );
      details.push(`point does not cover ${missingScopes.join(', ')}`);
    }
  }
  return details.join('; ');
}

function structuralRecoveryFamilyLabel(
  family: VenueMapStructuralRecoveryArtifact['family'],
): string {
  if (family === 'map') return 'Venue Map document';
  if (family === 'point') return 'map point';
  if (family === 'route') return 'walkway';
  if (family === 'drawing') return 'map shape';
  return 'rain plan';
}

function duplicateIdentityFamilyLabel(family: VenueMapDuplicateIdentityGroup['family']): string {
  if (family === 'point') return 'map point';
  if (family === 'route') return 'walkway';
  return 'map shape';
}

function duplicateIdentityObjectLabel(
  family: VenueMapDuplicateIdentityGroup['family'],
  object: VenueMapIdentityObject,
  index: number,
): string {
  if (family === 'point') {
    const point = object as VenueMapPoint;
    return `${point.label} at ${Math.round(point.x)}, ${Math.round(point.y)}`;
  }
  if (family === 'route') {
    const route = object as VenueMapRoute;
    return `${route.name} (${route.pointIds.length} points)`;
  }
  const drawing = object as DrawingObject;
  return drawing.text || `Shape occurrence ${index + 1}`;
}

function recoveredIdentityId(originalId: string, usedIds: Set<string>): string {
  const base = originalId.slice(0, 150) || 'map-object';
  let sequence = 1;
  let candidate = `${base}-recovered-${sequence}`;
  while (usedIds.has(candidate)) {
    sequence += 1;
    candidate = `${base}-recovered-${sequence}`;
  }
  return candidate;
}

/**
 * The interactive full-venue map designer. Hybrid: a drag + click-to-place canvas
 * for spatial layout, plus a side panel for precise numeric entry, point metadata,
 * linking space points to venue/lodging, and drawing walkway routes. Supports
 * printing/exporting the resulting "Venue Map" (PNG/PDF).
 */
export function VenueMapDesigner({
  map: initialMap,
  venues,
  onSave,
  onClose,
  mapTitle,
  onDirtyChange,
  organizationId,
  baseUpdatedAt,
  onConflictDraftChange,
  structuralRecoveryArtifacts: suppliedStructuralRecoveryArtifacts,
}: VenueMapDesignerProps) {
  const initialStructuralAnalysisRef = useRef<{
    map: VenueMapConfig;
    artifacts: VenueMapStructuralRecoveryArtifact[];
    quarantinedMap?: unknown;
    quarantinedMapRedacted: boolean;
  } | null>(null);
  if (initialStructuralAnalysisRef.current === null) {
    const analysis = analyzeVenueMapConfig(initialMap, { preserveDuplicateIds: true });
    const normalizedMap = analysis.map || initialMap;
    const suppliedArtifacts = suppliedStructuralRecoveryArtifacts
      || getVenueMapStructuralRecoveryArtifacts(normalizedMap);
    const artifacts = [...analysis.structuralRecoveryArtifacts];
    for (const artifact of suppliedArtifacts) {
      if (!artifacts.some((candidate) => candidate.key === artifact.key)) artifacts.push(artifact);
    }
    initialStructuralAnalysisRef.current = {
      map: normalizedMap,
      artifacts,
      quarantinedMap: analysis.quarantinedMap
        ?? getQuarantinedVenueMapForRecovery(normalizedMap),
      quarantinedMapRedacted: analysis.quarantinedMap === undefined
        && venueMapRecoverySourceIsRedacted(normalizedMap),
    };
  }
  const initialStructuralAnalysis = initialStructuralAnalysisRef.current;
  const recoverySourceMap = initialStructuralAnalysis.map;
  const initialRecoveryPartitionRef = useRef<VenueMapInitialRecoveryPartition | null>(null);
  if (initialRecoveryPartitionRef.current === null) {
    const identityPartition = partitionVenueMapDuplicateIdentities(recoverySourceMap);
    const routeReferencePartition = partitionVenueMapRouteReferenceIntegrity(identityPartition.map);
    const rainContingencyPartition = partitionVenueMapRainContingencyCollisions(
      routeReferencePartition.map,
    );
    const drawingIntegrityPartition = partitionVenueMapDrawingIntegrity(
      rainContingencyPartition.map,
    );
    initialRecoveryPartitionRef.current = {
      map: drawingIntegrityPartition.map,
      duplicateGroups: identityPartition.duplicateGroups,
      duplicateDependentRoutes: identityPartition.dependentRoutes,
      routeReferenceQuarantine: routeReferencePartition.quarantinedRoutes,
      rainContingencyQuarantine: rainContingencyPartition.quarantinedContingencies,
      drawingIntegrityQuarantine: drawingIntegrityPartition.quarantinedDrawings,
    };
  }
  const initialRecoveryPartition = initialRecoveryPartitionRef.current;
  const [map, setMap] = useState<VenueMapConfig>(initialRecoveryPartition.map);
  const [duplicateIdentityGroups, setDuplicateIdentityGroups] = useState<
    VenueMapDuplicateIdentityGroup[]
  >(initialRecoveryPartition.duplicateGroups);
  const [duplicateDependentRoutes, setDuplicateDependentRoutes] = useState<VenueMapRoute[]>(
    initialRecoveryPartition.duplicateDependentRoutes,
  );
  const [routeReferenceQuarantine, setRouteReferenceQuarantine] = useState<VenueMapRoute[]>(
    initialRecoveryPartition.routeReferenceQuarantine,
  );
  const [rainContingencyQuarantine, setRainContingencyQuarantine] = useState<
    RainContingency[]
  >(initialRecoveryPartition.rainContingencyQuarantine);
  const [drawingIntegrityQuarantine, setDrawingIntegrityQuarantine] = useState<
    DrawingObject[]
  >(initialRecoveryPartition.drawingIntegrityQuarantine);
  const [structuralRecoveryArtifacts, setStructuralRecoveryArtifacts] = useState<
    VenueMapStructuralRecoveryArtifact[]
  >(initialStructuralAnalysis.artifacts);
  const quarantinedMapRecoveryRef = useRef<unknown>(initialStructuralAnalysis.quarantinedMap);
  const quarantinedMapRecoveryRedactedRef = useRef(initialStructuralAnalysis.quarantinedMapRedacted);
  const [routeRecoveryAddPoint, setRouteRecoveryAddPoint] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<VenueMapCanvasInteractionMode>('select');
  const [activeKind, setActiveKind] = useState<VenueMapPointKind>('space');
  const [keepAddingPoints, setKeepAddingPoints] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routePointIds, setRoutePointIds] = useState<string[]>([]);
  const [routeDraftWaypoints, setRouteDraftWaypoints] = useState<VenueMapPoint[]>([]);
  const [routeAudience, setRouteAudience] = useState<VenueMapAudience>('public');
  const [routeAccessibility, setRouteAccessibility] = useState<VenueMapRouteAccessibility>('unknown');
  const [routePriority, setRoutePriority] = useState<VenueMapRoutePriority>('standard');
  const [routeNotes, setRouteNotes] = useState('');
  const [routeEventSpaceIds, setRouteEventSpaceIds] = useState<string[]>([]);
  const [renamingRoute, setRenamingRoute] = useState<string | null>(null);
  const [pendingRouteSwitch, setPendingRouteSwitch] = useState<{
    routeId: string;
    routeName: string;
  } | null>(null);
  const [routeRename, setRouteRename] = useState('');
  const [routeEditAudience, setRouteEditAudience] = useState<VenueMapAudience>('public');
  const [routeEditAccessibility, setRouteEditAccessibility] = useState<VenueMapRouteAccessibility>('unknown');
  const [routeEditPriority, setRouteEditPriority] = useState<VenueMapRoutePriority>('standard');
  const [routeEditNotes, setRouteEditNotes] = useState('');
  const [routeEditEventSpaceIds, setRouteEditEventSpaceIds] = useState<string[]>([]);
  const [routeEditPointIds, setRouteEditPointIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [sizeW, setSizeW] = useState(String(recoverySourceMap.width || 100));
  const [sizeH, setSizeH] = useState(String(recoverySourceMap.height || 80));
  const [undoStack, setUndoStack] = useState<VenueMapConfig[]>([]);
  const [redoStack, setRedoStack] = useState<VenueMapConfig[]>([]);
  const [previewAudience, setPreviewAudience] = useState<VenueMapViewer | null>(null);
  const [previewVenueIds, setPreviewVenueIds] = useState<string[]>([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [showAllMissingVenues, setShowAllMissingVenues] = useState(false);
  const [confirmClearZones, setConfirmClearZones] = useState(false);
  const [pendingPointDeletion, setPendingPointDeletion] = useState<{
    pointId: string;
    pointLabel: string;
    affectedRoutes: Array<{ id: string; name: string }>;
  } | null>(null);
  const [confirmResetMalformedMap, setConfirmResetMalformedMap] = useState(false);
  const [confirmPublishWithRouteGaps, setConfirmPublishWithRouteGaps] = useState(false);
  const routeCoverageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [complexityRecoveryDownloaded, setComplexityRecoveryDownloaded] = useState(false);
  const recoveryBackgroundImageUrl = (recoverySourceMap as unknown as { backgroundImageUrl?: unknown }).backgroundImageUrl;
  const [bgUrlInput, setBgUrlInput] = useState(
    typeof recoveryBackgroundImageUrl === 'string' ? recoveryBackgroundImageUrl : '',
  );
  const [baseMapUploading, setBaseMapUploading] = useState(false);
  const [baseMapLoadSnapshot, setBaseMapLoadSnapshot] = useState<VenueMapBackgroundLoadSnapshot>({
    state: 'none',
  });
  const [saving, setSaving] = useState(false);
  const savedMapRef = useRef(JSON.stringify(recoverySourceMap));
  // Deliberately retain the revision from this editor instance. A realtime pull
  // may update the prop while this draft remains open; adopting that newer
  // revision would let a stale draft silently pass the server CAS.
  const baseUpdatedAtRef = useRef<string | null | undefined>(baseUpdatedAt);
  // Async image uploads must merge onto the newest in-memory draft rather than
  // the render snapshot from which the upload began. Keep this ref synchronized
  // at every state transition so edits made while I/O is pending cannot be lost.
  const mapRef = useRef(initialRecoveryPartition.map);
  const conflictOverwriteBlockedRef = useRef(true);
  const mountedRef = useRef(true);
  const pointDraftBaselineRef = useRef<VenueMapPoint | null>(null);
  const pointDraftBaselineUpdatedAtRef = useRef(recoverySourceMap.updatedAt);
  const newPointDraftRef = useRef(false);
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const cloudMode = getPlatformProvider() === 'supabase';

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const processBaseMapFile = async (file: File) => {
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    const maxBytes = (cloudMode ? 3 : 1) * 1024 * 1024;
    if (!allowedTypes.has(file.type)) {
      showToast('Choose a PNG, JPEG, WebP, or GIF image. SVG and HTML files are not accepted.', 'warning');
      return;
    }
    if (file.size <= 0 || file.size > maxBytes) {
      showToast(`Base-map images must be smaller than ${cloudMode ? '3 MB' : '1 MB in offline mode'}. Compress the image and try again.`, 'warning');
      return;
    }
    if (cloudMode && !organizationId) {
      showToast('The active venue could not be identified, so the base map was not uploaded.', 'warning');
      return;
    }

    setBaseMapUploading(true);
    try {
      const imageRef = await uploadImage(file, {
        bucket: 'venue-map-images',
        organizationId,
      });
      if (!imageRef) throw new Error('The image upload returned no file reference.');
      if (cloudMode && !isManagedVenueMapImageRef(imageRef, organizationId)) {
        throw new Error('The uploaded image was not stored in this venue’s private map folder.');
      }
      if (!mountedRef.current) return;
      const latestMap = mapRef.current;
      backgroundOpacityUndoCapturedRef.current = false;
      pushUndo(latestMap);
      update(updateMapBackground(
        latestMap,
        imageRef,
        latestMap.backgroundOpacity ?? 0.85,
      ));
      setBgUrlInput(imageRef);
      showToast('Base map uploaded. Save the venue map to publish it.', 'success');
    } catch (error) {
      if (mountedRef.current) {
        showToast(describeUnknownError(error, 'Could not upload the base map. No map changes were made.'), 'warning');
      }
    } finally {
      if (mountedRef.current) setBaseMapUploading(false);
    }
  };

  const handleBaseMapUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void processBaseMapFile(file);
  };

  const artifactSvgRef = useRef<SVGSVGElement | null>(null);
  const artifactRequestSequenceRef = useRef(0);
  const artifactExecutionRef = useRef<number | null>(null);
  const [pendingVisualArtifact, setPendingVisualArtifact] = useState<
    PendingVenueMapVisualArtifact | null
  >(null);
  const [artifactBaseMapLoadSnapshot, setArtifactBaseMapLoadSnapshot] = useState<
    VenueMapBackgroundLoadSnapshot
  >({ state: 'none' });
  // Captures pre-drag snapshots so one spatial gesture creates one Undo step.
  const pendingDragRef = useRef<VenueMapConfig | null>(null);
  const pendingDrawingDragRef = useRef<VenueMapConfig | null>(null);
  // Coalesces field-by-field edits (label/kind/GPS/X/Y/venue) into a single undo
  // step per "edit session" of the selected point (cleared on reselect/save).
  const fieldUndoCapturedRef = useRef(false);
  const drawingUndoCapturedRef = useRef(false);
  const backgroundOpacityUndoCapturedRef = useRef(false);

  const baseImageIntegrityIssues = venueMapBaseImageIntegrityIssues(map);
  const rawBackgroundImageUrl = (map as unknown as { backgroundImageUrl?: unknown }).backgroundImageUrl;
  const hasSavedBackgroundImage = rawBackgroundImageUrl !== undefined;
  const baseMapLoadState = !hasSavedBackgroundImage
    ? 'none'
    : typeof rawBackgroundImageUrl === 'string'
      && baseMapLoadSnapshot.source === rawBackgroundImageUrl
      ? baseMapLoadSnapshot.state
      : 'loading';
  const baseMapLoadBlocksPublication = hasSavedBackgroundImage
    && baseImageIntegrityIssues.length === 0
    && baseMapLoadState !== 'ready';
  const rawBackgroundOpacity = (map as unknown as { backgroundOpacity?: unknown }).backgroundOpacity;
  const editableBackgroundOpacity = typeof rawBackgroundOpacity === 'number'
    && Number.isFinite(rawBackgroundOpacity)
    && rawBackgroundOpacity >= VENUE_MAP_BACKGROUND_OPACITY_MIN
    && rawBackgroundOpacity <= VENUE_MAP_BACKGROUND_OPACITY_MAX
    ? rawBackgroundOpacity
    : 0.85;
  const unmanagedCloudBaseMap = cloudMode
    && hasSavedBackgroundImage
    && (!organizationId || !isManagedVenueMapImageRef(rawBackgroundImageUrl, organizationId));
  const canvasBaseImageSafeMap = baseImageIntegrityIssues.length > 0
    ? { ...map, backgroundImageUrl: undefined, backgroundOpacity: undefined }
    : map;
  const workingMapWithRouteDraft = routeDraftWaypoints.length > 0
    ? { ...canvasBaseImageSafeMap, points: [...map.points, ...routeDraftWaypoints] }
    : canvasBaseImageSafeMap;
  // Duplicate-linked venue destinations remain exact in the admin recovery
  // model, but every ambiguous occurrence and dependent route stays off canvas,
  // previews, print, and export until an explicit repair leaves one canonical pin.
  const canvasMap = partitionVenueMapSpacePointLinkCollisions(
    workingMapWithRouteDraft,
  ).map;
  const selected: VenueMapPoint | undefined = map.points.find((p) => p.id === selectedId);
  const selectedGpsIssue = selected ? venueMapPointGpsIssue(selected) : null;
  const selectedDrawing: DrawingObject | undefined = (map.drawings || []).find(
    (drawing) => drawing.id === selectedDrawingId,
  );
  const selectedDrawingIssue = selectedDrawing
    ? venueMapDrawingIntegrityIssue(selectedDrawing, map)
    : null;
  const selectedDrawingRotationIssue = selectedDrawing
    ? venueMapDrawingRotationIssue(selectedDrawing)
    : null;
  const selectedDrawingPresentationIssues = selectedDrawing
    ? venueMapDrawingPresentationIssues(selectedDrawing)
    : [];
  const selectedSpaceLinkIssue = selected
    ? venueMapSpacePointLinkIssue(selected, venues)
    : null;
  const routeBeingEdited = renamingRoute
    ? (map.routes || []).find((route) => route.id === renamingRoute)
    : undefined;
  const sizeDraftValid = (() => {
    const width = Number(sizeW);
    const height = Number(sizeH);
    return sizeW.trim().length > 0
      && sizeH.trim().length > 0
      && Number.isFinite(width)
      && Number.isFinite(height)
      && width >= VENUE_MAP_FRAME_MIN
      && width <= VENUE_MAP_FRAME_MAX
      && height >= VENUE_MAP_FRAME_MIN
      && height <= VENUE_MAP_FRAME_MAX;
  })();
  const sizeDraftDirty = (() => {
    const width = Number(sizeW);
    const height = Number(sizeH);
    return !sizeW.trim()
      || !sizeH.trim()
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || width !== map.width
      || height !== map.height;
  })();
  const backgroundUrlDraftDirty = bgUrlInput.trim() !== (
    typeof rawBackgroundImageUrl === 'string' ? rawBackgroundImageUrl : ''
  );
  const newRouteDraftDirty = routeName.trim().length > 0
    || routePointIds.length > 0
    || routeAudience !== 'public'
    || routeAccessibility !== 'unknown'
    || routePriority !== 'standard'
    || routeNotes.trim().length > 0
    || routeEventSpaceIds.length > 0;
  const routeEditDraftDirty = Boolean(renamingRoute && (
    !routeBeingEdited
    || routeRename !== routeBeingEdited.name
    || routeEditAudience !== (routeBeingEdited.audience === undefined ? 'public' : routeBeingEdited.audience)
    || routeEditAccessibility !== (routeBeingEdited.accessibility === undefined ? 'unknown' : routeBeingEdited.accessibility)
    || routeEditPriority !== (routeBeingEdited.priority || 'standard')
    || routeEditNotes !== (routeBeingEdited.notes || '')
    || JSON.stringify(routeEditEventSpaceIds) !== JSON.stringify(routeBeingEdited.eventSpaceIds || [])
    || JSON.stringify(routeEditPointIds) !== JSON.stringify(routeBeingEdited.pointIds)
  ));
  const routeDraftWaypointIds = new Set(routeDraftWaypoints.map((point) => point.id));
  const routeDraftPointsForDelivery = canvasMap.points.map((point) =>
    routeDraftWaypointIds.has(point.id)
      ? {
          ...point,
          audience: routeAudience,
          eventSpaceIds: routeEventSpaceIds.length ? routeEventSpaceIds : undefined,
        }
      : point,
  );
  const routeDraft: VenueMapRoute = {
    id: '__route_draft__',
    name: routeName.trim() || 'New walkway',
    audience: routeAudience,
    eventSpaceIds: routeEventSpaceIds.length ? routeEventSpaceIds : undefined,
    accessibility: routeAccessibility,
    priority: routePriority,
    notes: routeNotes,
    pointIds: routePointIds,
  };
  const routeDraftDeliveryIssues = routePointIds.length > 0
    ? venueMapRoutePointDeliveryIssues(routeDraft, routeDraftPointsForDelivery)
    : [];
  const routeDraftReferenceIssues = routePointIds.length > 0
    ? venueMapRouteReferenceIssues(routeDraft, routeDraftPointsForDelivery)
    : [];
  const routeEditReferenceIssues = routeBeingEdited
    ? venueMapRouteReferenceIssues({
        ...routeBeingEdited,
        pointIds: routeEditPointIds,
      }, map.points)
    : [];
  const routeEditDeliveryIssues = routeBeingEdited
    ? venueMapRoutePointDeliveryIssues({
        ...routeBeingEdited,
        name: routeRename,
        audience: routeEditAudience,
        eventSpaceIds: routeEditEventSpaceIds.length ? routeEditEventSpaceIds : undefined,
        accessibility: routeEditAccessibility,
        priority: routeEditPriority,
        notes: routeEditNotes,
        pointIds: routeEditPointIds,
      }, map.points)
    : [];
  const allRouteDeliveryIssues = venueMapRouteDeliveryIssues(map);
  const guestRouteCoverageIssues = useMemo(
    () => venueMapGuestRouteCoverageIssues(map, venues),
    [map, venues],
  );
  const stagedDraftDirty = sizeDraftDirty
    || backgroundUrlDraftDirty
    || newRouteDraftDirty
    || routeEditDraftDirty;
  const update = (next: VenueMapConfig) => {
    mapRef.current = next;
    setMap(next);
    setDirty(JSON.stringify(next) !== savedMapRef.current);
  };

  const updateStructuralRecoveryCandidate = (
    key: string,
    patch: Record<string, unknown>,
  ) => {
    setStructuralRecoveryArtifacts((artifacts) => artifacts.map((artifact) =>
      artifact.key === key
        ? {
            ...artifact,
            candidate: { ...artifact.candidate, ...patch },
          } as VenueMapStructuralRecoveryArtifact
        : artifact,
    ));
    setDirty(true);
  };

  const usedStructuralFamilyIds = (
    family: VenueMapStructuralRecoveryArtifact['family'],
  ): Set<string> => new Set([
    ...(family === 'map'
      ? []
      : family === 'point'
        ? map.points.map((point) => point.id)
      : family === 'route'
        ? (map.routes || []).map((route) => route.id)
        : family === 'drawing'
          ? (map.drawings || []).map((drawing) => drawing.id)
          : (map.rainContingencies || []).map((contingency) => contingency.id)),
    ...structuralRecoveryArtifacts
      .filter((artifact) => artifact.family === family)
      .flatMap((artifact) => typeof artifact.candidate.id === 'string'
        ? [artifact.candidate.id.trim()]
        : []),
  ]);

  const generateStructuralRecoveryId = (artifact: VenueMapStructuralRecoveryArtifact) => {
    const usedIds = usedStructuralFamilyIds(artifact.family);
    const base = artifact.family === 'rainContingency'
      ? 'rain-plan'
      : artifact.family === 'drawing'
        ? 'map-shape'
        : artifact.family === 'route' ? 'walkway' : 'map-point';
    updateStructuralRecoveryCandidate(artifact.key, {
      id: recoveredIdentityId(base, usedIds),
    });
  };

  const removeStructuralRecoveryArtifact = (key: string) => {
    setStructuralRecoveryArtifacts((artifacts) => artifacts.filter((artifact) => artifact.key !== key));
    setUndoStack([]);
    setRedoStack([]);
    update({ ...map, updatedAt: new Date().toISOString() });
    showToast('Malformed saved occurrence explicitly removed from the working draft.', 'info');
  };

  const acceptRecoveredMapFrame = (key: string) => {
    if (
      !Number.isFinite(map.width)
      || !Number.isFinite(map.height)
      || map.width < VENUE_MAP_FRAME_MIN
      || map.width > VENUE_MAP_FRAME_MAX
      || map.height < VENUE_MAP_FRAME_MIN
      || map.height > VENUE_MAP_FRAME_MAX
    ) {
      showToast(
        `Set both map dimensions from ${VENUE_MAP_FRAME_MIN} to ${VENUE_MAP_FRAME_MAX} before accepting this frame.`,
        'warning',
      );
      return;
    }
    setStructuralRecoveryArtifacts((artifacts) =>
      artifacts.filter((artifact) => artifact.key !== key),
    );
    setUndoStack([]);
    setRedoStack([]);
    update({ ...map, updatedAt: new Date().toISOString() });
    showToast(
      `Accepted the ${map.width} × ${map.height} map frame. Save and publish to share it.`,
      'success',
    );
  };

  const downloadComplexityRecovery = () => {
    const quarantinedMap = quarantinedMapRecoveryRef.current;
    if (quarantinedMap === undefined) {
      showToast('The original oversized map is not available in this session. Reload it from the server before resetting.', 'warning');
      return;
    }
    try {
      const content = JSON.stringify(quarantinedMap, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `venue-map-recovery${quarantinedMapRecoveryRedactedRef.current ? '-redacted' : ''}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setComplexityRecoveryDownloaded(true);
      showToast(
        quarantinedMapRecoveryRedactedRef.current
          ? 'Downloaded the secret-redacted oversized Venue Map recovery file.'
          : 'Downloaded the original oversized Venue Map recovery file.',
        'success',
      );
    } catch (error) {
      showToast(describeUnknownError(error, 'The oversized Venue Map recovery file could not be downloaded.'), 'warning');
    }
  };

  const resetMalformedVenueMap = () => {
    const next = emptyVenueMapConfig();
    quarantinedMapRecoveryRef.current = undefined;
    quarantinedMapRecoveryRedactedRef.current = false;
    setComplexityRecoveryDownloaded(false);
    setStructuralRecoveryArtifacts([]);
    setDuplicateIdentityGroups([]);
    setDuplicateDependentRoutes([]);
    setRouteReferenceQuarantine([]);
    setRainContingencyQuarantine([]);
    setDrawingIntegrityQuarantine([]);
    setRouteRecoveryAddPoint({});
    setSelectedId(null);
    setSelectedDrawingId(null);
    setShowAllMissingVenues(false);
    setEditing(false);
    setInteractionMode('select');
    setKeepAddingPoints(false);
    setRenamingRoute(null);
    setPendingRouteSwitch(null);
    setRouteName('');
    setRoutePointIds([]);
    setRouteDraftWaypoints([]);
    setRouteAudience('public');
    setRouteAccessibility('unknown');
    setRoutePriority('standard');
    setRouteNotes('');
    setRouteEventSpaceIds([]);
    setSizeW(String(next.width));
    setSizeH(String(next.height));
    setBgUrlInput('');
    setPreviewAudience(null);
    setUndoStack([]);
    setRedoStack([]);
    update(next);
    setConfirmResetMalformedMap(false);
    showToast('Started a new empty Venue Map. Save and publish to replace the recovered map.', 'info');
  };

  const reconstructStructuralRecoveryArtifact = (
    artifact: VenueMapStructuralRecoveryArtifact,
  ) => {
    if (artifact.collectionMalformed || artifact.family === 'map') return;
    const id = typeof artifact.candidate.id === 'string'
      ? artifact.candidate.id.trim()
      : '';
    if (!id || id.length > VENUE_MAP_MAX_IDENTIFIER_LENGTH) {
      showToast('Enter or generate a valid ID before reconstructing this occurrence.', 'warning');
      return;
    }
    const canonicalIdUsed = artifact.family === 'point'
      ? map.points.some((point) => point.id === id)
      : artifact.family === 'route'
        ? (map.routes || []).some((route) => route.id === id)
        : artifact.family === 'drawing'
          ? (map.drawings || []).some((drawing) => drawing.id === id)
          : (map.rainContingencies || []).some((contingency) => contingency.id === id);
    const recoveryIdUsed = structuralRecoveryArtifacts.some((candidate) =>
      candidate.key !== artifact.key
        && candidate.family === artifact.family
        && candidate.candidate.id?.trim() === id,
    );
    if (canonicalIdUsed || recoveryIdUsed) {
      showToast(`ID “${id}” is already used by another ${structuralRecoveryFamilyLabel(artifact.family)}.`, 'warning');
      return;
    }

    let candidateMap = { ...map };
    if (artifact.family === 'point') {
      const candidate = artifact.candidate;
      if (!candidate.kind || !KINDS.includes(candidate.kind)) {
        showToast('Choose a supported map-point type before reconstruction.', 'warning');
        return;
      }
      const pointX = Number.isFinite(candidate.x) ? candidate.x! : map.width / 2;
      const pointY = Number.isFinite(candidate.y) ? candidate.y! : map.height / 2;
      const coordinateIssue = venueMapPointCoordinateIssue(
        { x: pointX, y: pointY },
        map,
      );
      if (coordinateIssue) {
        showToast(`Choose a point position inside the current map frame: ${coordinateIssue}`, 'warning');
        return;
      }
      const point = canonicalizeMapPointKindFields({
        id,
        label: candidate.label?.trim() || 'Recovered map point',
        description: candidate.description,
        x: pointX,
        y: pointY,
        kind: candidate.kind,
        audience: candidate.audience === undefined ? 'staff' : candidate.audience,
        eventSpaceIds: candidate.eventSpaceIds,
        venueId: candidate.venueId,
        lat: candidate.lat,
        lng: candidate.lng,
      });
      candidateMap = { ...candidateMap, points: [...candidateMap.points, point] };
    } else if (artifact.family === 'route') {
      const candidate = artifact.candidate;
      const route: VenueMapRoute = {
        id,
        name: candidate.name?.trim() || 'Recovered walkway',
        pointIds: Array.isArray(candidate.pointIds) ? candidate.pointIds : [],
        audience: candidate.audience === undefined ? 'staff' : candidate.audience,
        eventSpaceIds: candidate.eventSpaceIds,
        accessibility: candidate.accessibility === undefined ? 'unknown' : candidate.accessibility,
        priority: candidate.priority || 'standard',
        notes: candidate.notes,
      };
      if (
        venueMapRoutePriorityIssue(route)
        || route.pointIds.length < 2
        || venueMapRouteReferenceIssues(route, candidateMap.points).length > 0
      ) {
        setRouteReferenceQuarantine((routes) => [...routes, route]);
      } else {
        candidateMap = { ...candidateMap, routes: [...(candidateMap.routes || []), route] };
      }
    } else if (artifact.family === 'drawing') {
      const candidate = artifact.candidate;
      if (!candidate.type || !['zone', 'rectangle', 'circle', 'line'].includes(candidate.type)) {
        showToast('Choose a supported shape type before reconstruction.', 'warning');
        return;
      }
      const drawing = {
        ...candidate,
        id,
        type: candidate.type,
        x: Number.isFinite(candidate.x) ? candidate.x! : map.width / 2,
        y: Number.isFinite(candidate.y) ? candidate.y! : map.height / 2,
        audience: candidate.audience === undefined ? 'staff' : candidate.audience,
      } as DrawingObject;
      const drawingPartition = partitionVenueMapDrawingIntegrity({
        ...candidateMap,
        drawings: [...(candidateMap.drawings || []), drawing],
      });
      candidateMap = drawingPartition.map;
      if (drawingPartition.quarantinedDrawings.length > 0) {
        setDrawingIntegrityQuarantine((drawings) => [
          ...drawings,
          ...drawingPartition.quarantinedDrawings,
        ]);
      }
    } else {
      const candidate = artifact.candidate;
      const contingency = {
        id,
        outdoorVenueId: candidate.outdoorVenueId?.trim() || '',
        indoorVenueId: candidate.indoorVenueId?.trim() || '',
        note: candidate.note,
      };
      const issue = rainContingencyValidationIssue(contingency, venues);
      if (issue) {
        showToast(`Repair the rain plan before reconstruction: ${issue}`, 'warning');
        return;
      }
      if ((candidateMap.rainContingencies || []).some((existing) =>
        existing.outdoorVenueId === contingency.outdoorVenueId)) {
        showToast('That outdoor source already has a rain plan.', 'warning');
        return;
      }
      candidateMap = {
        ...candidateMap,
        rainContingencies: [...(candidateMap.rainContingencies || []), contingency],
      };
    }

    const complexityIssues = venueMapComplexityIssues(candidateMap);
    if (complexityIssues.length > 0) {
      showToast(`This recovery would exceed the Venue Map budget. ${complexityIssues[0]}`, 'warning');
      return;
    }
    setStructuralRecoveryArtifacts((artifacts) =>
      artifacts.filter((candidate) => candidate.key !== artifact.key),
    );
    setUndoStack([]);
    setRedoStack([]);
    update({ ...candidateMap, updatedAt: new Date().toISOString() });
    showToast(
      `Recovered ${structuralRecoveryFamilyLabel(artifact.family)} added to the working draft.`,
      'success',
    );
  };

  const settleRainContingencyRecovery = (
    pending: RainContingency[],
    message: string,
  ) => {
    const partition = partitionVenueMapRainContingencyCollisions({
      ...map,
      rainContingencies: [...(map.rainContingencies || []), ...pending],
    });
    const nextMap = { ...partition.map, updatedAt: new Date().toISOString() };
    // Map-only history cannot reconstruct quarantined plans. Recovery decisions
    // therefore establish a new explicit baseline, as duplicate-object recovery does.
    setUndoStack([]);
    setRedoStack([]);
    setRainContingencyQuarantine(partition.quarantinedContingencies);
    update(nextMap);
    showToast(message, 'success');
  };

  const updateQuarantinedRainContingency = (
    occurrenceIndex: number,
    patch: Partial<RainContingency>,
  ) => {
    const next = rainContingencyQuarantine.map((contingency, index) =>
      index === occurrenceIndex ? { ...contingency, ...patch } : contingency,
    );
    settleRainContingencyRecovery(next, 'Rain-plan recovery updated.');
  };

  const reidentifyQuarantinedRainContingency = (occurrenceIndex: number) => {
    const selected = rainContingencyQuarantine[occurrenceIndex];
    if (!selected) return;
    const usedIds = new Set([
      ...(map.rainContingencies || []).map((contingency) => contingency.id),
      ...rainContingencyQuarantine.map((contingency) => contingency.id),
    ]);
    updateQuarantinedRainContingency(occurrenceIndex, {
      id: recoveredIdentityId(selected.id, usedIds),
    });
  };

  const removeQuarantinedRainContingency = (occurrenceIndex: number) => {
    settleRainContingencyRecovery(
      rainContingencyQuarantine.filter((_, index) => index !== occurrenceIndex),
      'Quarantined rain plan removed from the working draft.',
    );
  };

  const keepOnlyQuarantinedRainContingency = (occurrenceIndex: number) => {
    const selected = rainContingencyQuarantine[occurrenceIndex];
    if (!selected) return;
    const component = new Set([occurrenceIndex]);
    const queue = [occurrenceIndex];
    while (queue.length > 0) {
      const current = rainContingencyQuarantine[queue.shift()!];
      rainContingencyQuarantine.forEach((candidate, index) => {
        if (
          !component.has(index)
          && (
            candidate.id.trim() === current.id.trim()
            || candidate.outdoorVenueId.trim() === current.outdoorVenueId.trim()
          )
        ) {
          component.add(index);
          queue.push(index);
        }
      });
    }
    settleRainContingencyRecovery(
      [
        ...rainContingencyQuarantine.filter((_, index) => !component.has(index)),
        selected,
      ],
      'Selected rain plan kept; its conflicting plans were removed from the working draft.',
    );
  };

  const settleDrawingIntegrityRecovery = (
    pending: DrawingObject[],
    message: string,
  ) => {
    const partition = partitionVenueMapDrawingIntegrity({
      ...map,
      drawings: [...(map.drawings || []), ...pending],
    });
    setUndoStack([]);
    setRedoStack([]);
    setDrawingIntegrityQuarantine(partition.quarantinedDrawings);
    update({ ...partition.map, updatedAt: new Date().toISOString() });
    showToast(message, 'success');
  };

  const repairedDrawingGeometry = (drawing: DrawingObject): DrawingObject => {
    if (drawing.type === 'zone' || drawing.type === 'rectangle') {
      return constrainMapDrawing({
        ...drawing,
        width: Number.isFinite(drawing.width) && drawing.width! > 0 ? drawing.width : Math.min(20, map.width),
        height: Number.isFinite(drawing.height) && drawing.height! > 0 ? drawing.height : Math.min(15, map.height),
      }, map.width, map.height);
    }
    if (drawing.type === 'circle') {
      return constrainMapDrawing({
        ...drawing,
        radius: Number.isFinite(drawing.radius) && drawing.radius! > 0
          ? drawing.radius
          : Math.min(10, map.width / 2, map.height / 2),
      }, map.width, map.height);
    }
    const validPoints = (drawing.points || []).filter((point) =>
      Number.isFinite(point.x) && Number.isFinite(point.y),
    );
    const first = validPoints[0] || {
      x: Number.isFinite(drawing.x) ? drawing.x : 0,
      y: Number.isFinite(drawing.y) ? drawing.y : 0,
    };
    const distinct = validPoints.find((point) => point.x !== first.x || point.y !== first.y);
    const second = distinct || {
      x: first.x < map.width ? Math.min(map.width, first.x + 10) : Math.max(0, first.x - 10),
      y: first.y,
    };
    return constrainMapDrawing({
      ...drawing,
      points: [first, second],
    }, map.width, map.height);
  };

  const updateQuarantinedDrawingRotation = (
    occurrenceIndex: number,
    rotation: number,
  ) => {
    setDrawingIntegrityQuarantine((drawings) => drawings.map((drawing, index) =>
      index === occurrenceIndex ? { ...drawing, rotation } : drawing,
    ));
    setDirty(true);
  };

  const resetQuarantinedDrawingPresentation = (occurrenceIndex: number) => {
    setDrawingIntegrityQuarantine((drawings) => drawings.map((drawing, index) =>
      index === occurrenceIndex
        ? { ...drawing, ...drawingPresentationRepairPatch(drawing) }
        : drawing,
    ));
    setDirty(true);
  };

  const repairQuarantinedDrawing = (occurrenceIndex: number) => {
    const selectedDrawing = drawingIntegrityQuarantine[occurrenceIndex];
    if (!selectedDrawing || !['zone', 'rectangle', 'circle', 'line'].includes(selectedDrawing.type)) return;
    settleDrawingIntegrityRecovery(
      drawingIntegrityQuarantine.map((drawing, index) =>
        index === occurrenceIndex ? repairedDrawingGeometry(drawing) : drawing,
      ),
      'Shape geometry rebuilt with safe defaults. Review it before publication.',
    );
  };

  const convertQuarantinedDrawingToZone = (occurrenceIndex: number) => {
    const selectedDrawing = drawingIntegrityQuarantine[occurrenceIndex];
    if (!selectedDrawing) return;
    settleDrawingIntegrityRecovery(
      drawingIntegrityQuarantine.map((drawing, index) => index === occurrenceIndex
        ? constrainMapDrawing({
            ...drawing,
            type: 'zone',
            width: Number.isFinite(drawing.width) && drawing.width! > 0
              ? drawing.width
              : Math.min(20, map.width),
            height: Number.isFinite(drawing.height) && drawing.height! > 0
              ? drawing.height
              : Math.min(15, map.height),
            points: undefined,
            radius: undefined,
          }, map.width, map.height)
        : drawing),
      'Unsupported shape explicitly converted to an editable rectangular zone.',
    );
  };

  const removeQuarantinedDrawing = (occurrenceIndex: number) => {
    settleDrawingIntegrityRecovery(
      drawingIntegrityQuarantine.filter((_, index) => index !== occurrenceIndex),
      'Quarantined shape removed from the working draft.',
    );
  };

  const recoverDuplicateIdentity = (
    group: VenueMapDuplicateIdentityGroup,
    occurrenceIndex: number,
    action: 'keep-and-reid' | 'reid' | 'remove',
  ) => {
    const currentGroup = duplicateIdentityGroups.find((candidate) =>
      candidate.family === group.family && candidate.id === group.id,
    );
    const selectedObject = currentGroup?.objects[occurrenceIndex];
    if (!currentGroup || !selectedObject) return;

    const usedIds = new Set<string>([
      ...(group.family === 'point'
        ? map.points.map((point) => point.id)
        : group.family === 'route'
          ? [...(map.routes || []), ...duplicateDependentRoutes].map((route) => route.id)
          : (map.drawings || []).map((drawing) => drawing.id)),
      ...duplicateIdentityGroups
        .filter((candidate) => candidate.family === group.family)
        .flatMap((candidate) => candidate.objects.map((object) => object.id)),
    ]);
    const withFreshId = (object: VenueMapIdentityObject): VenueMapIdentityObject => {
      const id = recoveredIdentityId(group.id, usedIds);
      usedIds.add(id);
      return { ...object, id };
    };

    let recoveredObjects: VenueMapIdentityObject[] = [];
    let nextObjects = currentGroup.objects.filter((_, index) => index !== occurrenceIndex);
    if (action === 'keep-and-reid') {
      recoveredObjects = [
        selectedObject,
        ...nextObjects.map((object) => withFreshId(object)),
      ];
      nextObjects = [];
    } else if (action === 'reid') {
      recoveredObjects = [withFreshId(selectedObject)];
    }
    if (nextObjects.length === 1) {
      recoveredObjects.push(nextObjects[0]);
      nextObjects = [];
    }

    const nextGroups = nextObjects.length > 1
      ? duplicateIdentityGroups.map((candidate) =>
          candidate.family === group.family && candidate.id === group.id
            ? { ...candidate, objects: nextObjects }
            : candidate,
        )
      : duplicateIdentityGroups.filter((candidate) =>
          candidate.family !== group.family || candidate.id !== group.id,
        );
    const unresolvedPointIds = new Set(
      nextGroups
        .filter((candidate) => candidate.family === 'point')
        .map((candidate) => candidate.id),
    );
    let candidateMap = { ...map };
    let pendingRoutes = [...duplicateDependentRoutes];

    if (group.family === 'point') {
      candidateMap = {
        ...candidateMap,
        points: [...candidateMap.points, ...(recoveredObjects as VenueMapPoint[])],
      };
    } else if (group.family === 'drawing') {
      candidateMap = {
        ...candidateMap,
        drawings: [...(candidateMap.drawings || []), ...(recoveredObjects as DrawingObject[])],
      };
    } else {
      // Every recovered route passes through the same reference-integrity gate;
      // resolving its duplicated ID must not accidentally release stale points.
      pendingRoutes.push(...recoveredObjects as VenueMapRoute[]);
    }

    const routesReadyForReferenceCheck = pendingRoutes.filter((route) =>
      route.pointIds.every((pointId) => !unresolvedPointIds.has(pointId)),
    );
    const routesNeedingReferenceRecovery = routesReadyForReferenceCheck.filter((route) =>
      venueMapRoutePriorityIssue(route) !== null
        || route.pointIds.length < 2
        || venueMapRouteReferenceIssues(route, candidateMap.points).length > 0,
    );
    const readyRoutes = routesReadyForReferenceCheck.filter((route) =>
      !routesNeedingReferenceRecovery.includes(route),
    );
    if (readyRoutes.length > 0) {
      candidateMap = {
        ...candidateMap,
        routes: [...(candidateMap.routes || []), ...readyRoutes],
      };
    }
    pendingRoutes = pendingRoutes.filter((route) =>
      !routesReadyForReferenceCheck.includes(route),
    );
    const drawingPartition = partitionVenueMapDrawingIntegrity(candidateMap);
    candidateMap = { ...drawingPartition.map, updatedAt: new Date().toISOString() };

    // Map-only history snapshots cannot safely reconstruct quarantine state.
    // Clear prior history at each explicit recovery decision so Undo cannot
    // silently drop a recovered occurrence after the quarantine is resolved.
    setUndoStack([]);
    setRedoStack([]);
    setDuplicateIdentityGroups(nextGroups);
    setDuplicateDependentRoutes(pendingRoutes);
    if (drawingPartition.quarantinedDrawings.length > 0) {
      setDrawingIntegrityQuarantine((previous) => [
        ...previous,
        ...drawingPartition.quarantinedDrawings.filter((drawing) =>
          !previous.some((candidate) => candidate.id === drawing.id),
        ),
      ]);
    }
    if (routesNeedingReferenceRecovery.length > 0) {
      setRouteReferenceQuarantine((previous) => [
        ...previous,
        ...routesNeedingReferenceRecovery.filter((route) =>
          !previous.some((candidate) => candidate.id === route.id),
        ),
      ]);
    }
    update(candidateMap);
    showToast(
      action === 'remove'
        ? 'Duplicate occurrence removed from the working draft.'
        : 'Duplicate recovery IDs applied to the working draft.',
      'info',
    );
  };

  const updateQuarantinedRoutePoints = (routeId: string, pointIds: string[]) => {
    setRouteReferenceQuarantine((routes) => routes.map((route) =>
      route.id === routeId ? { ...route, pointIds } : route,
    ));
    setDirty(true);
  };

  const updateQuarantinedRoutePriority = (
    routeId: string,
    priority: VenueMapRoutePriority,
  ) => {
    setRouteReferenceQuarantine((routes) => routes.map((route) =>
      route.id === routeId ? { ...route, priority } : route,
    ));
    setDirty(true);
  };

  const updateQuarantinedRouteAccessibility = (
    routeId: string,
    accessibility: VenueMapRouteAccessibility,
  ) => {
    setRouteReferenceQuarantine((routes) => routes.map((route) =>
      route.id === routeId ? { ...route, accessibility } : route,
    ));
    setDirty(true);
  };

  const applyQuarantinedRoute = (routeId: string) => {
    const route = routeReferenceQuarantine.find((candidate) => candidate.id === routeId);
    if (
      !route
      || venueMapRoutePriorityIssue(route)
      || venueMapRouteAccessibilityIssue(route)
      || route.pointIds.length < 2
      || venueMapRouteReferenceIssues(route, map.points).length > 0
    ) {
      showToast('Choose valid routing and mobility statuses, then repair unavailable, repeated, or same-position walkway stops before applying it.', 'warning');
      return;
    }
    setUndoStack([]);
    setRedoStack([]);
    setRouteReferenceQuarantine((routes) => routes.filter((candidate) => candidate.id !== routeId));
    setRouteRecoveryAddPoint((current) => {
      const next = { ...current };
      delete next[routeId];
      return next;
    });
    update({
      ...map,
      routes: [...(map.routes || []), route],
      updatedAt: new Date().toISOString(),
    });
    showToast(`Walkway “${route.name}” restored to the working draft.`, 'success');
  };

  const removeQuarantinedRoute = (routeId: string) => {
    const route = routeReferenceQuarantine.find((candidate) => candidate.id === routeId);
    if (!route) return;
    setUndoStack([]);
    setRedoStack([]);
    setRouteReferenceQuarantine((routes) => routes.filter((candidate) => candidate.id !== routeId));
    setRouteRecoveryAddPoint((current) => {
      const next = { ...current };
      delete next[routeId];
      return next;
    });
    update({ ...map, updatedAt: new Date().toISOString() });
    showToast(`Walkway “${route.name}” removed from the working draft.`, 'info');
  };

  const persist = async (next: VenueMapConfig): Promise<VenueMapDesignerSaveResult> => {
    setSaving(true);
    try {
      const submittedDraft = JSON.stringify(next);
      assertVenueMapIdentifiersValid(next);
      assertVenueMapPointGpsResolved(next);
      assertVenueMapAudiencesResolved(next);
      assertVenueMapArrivalRolesResolved(next);
      assertVenueMapBaseImageResolved(next);
      assertVenueMapRouteAccessibilityResolved(next);
      assertVenueMapRouteGeometryResolved(next);
      assertVenueMapSpacePointLinksUnique(next);
      const canonical = normalizeVenueMapConfig(next);
      if (!canonical) throw new Error('Venue map data is invalid and was not saved.');
      const canonicalSnapshot = JSON.stringify(canonical);
      // Local and cloud persistence must receive the exact same normalized map;
      // otherwise one successful action can create different server/cache truth.
      const result = await onSave(canonical, baseUpdatedAtRef.current);
      const outcome = result || { status: 'saved' as const };
      if (!mountedRef.current) return outcome;
      if (outcome.status === 'conflict' || outcome.status === 'error') {
        // The in-memory map remains the admin's draft. Do not advance its CAS
        // base or mark it clean until they explicitly reload/overwrite.
        if (outcome.status === 'conflict') {
          // The shell initially knows only the submitted snapshot. A request may
          // have been pending while more edits landed in this mounted editor;
          // explicit overwrite must use what the admin can currently see.
          // Preserve the exact visible recovery draft. Canonicalization can
          // clear malformed fields (for example half of a GPS pair), so it is
          // permitted only after the full preflight succeeds, never in a
          // conflict handoff that the admin may choose to keep repairing.
          onConflictDraftChange?.(
            mapRef.current,
            conflictOverwriteBlockedRef.current,
          );
        }
        setDirty(true);
        return outcome;
      }
      baseUpdatedAtRef.current = outcome.updatedAt ?? baseUpdatedAtRef.current;
      savedMapRef.current = canonicalSnapshot;
      // A cloud request can finish after the admin has continued editing. The
      // accepted canonical snapshot is now the CAS baseline, but it must not
      // replace newer mounted-editor state or falsely mark later changes saved.
      if (JSON.stringify(mapRef.current) === submittedDraft) {
        mapRef.current = canonical;
        setMap(canonical);
        setDirty(false);
        const currentSelectedId = selectedIdRef.current;
        const currentSelectedPoint = currentSelectedId
          ? canonical.points.find((point) => point.id === currentSelectedId)
          : undefined;
        pointDraftBaselineRef.current = currentSelectedPoint
          ? { ...currentSelectedPoint }
          : null;
        pointDraftBaselineUpdatedAtRef.current = canonical.updatedAt;
        newPointDraftRef.current = false;
        pendingDragRef.current = null;
        pendingDrawingDragRef.current = null;
        fieldUndoCapturedRef.current = false;
        drawingUndoCapturedRef.current = false;
        backgroundOpacityUndoCapturedRef.current = false;
        setEditing(false);
      } else {
        setDirty(true);
      }
      return outcome;
    } catch (error) {
      if (mountedRef.current) {
        setDirty(true);
        showToast(describeUnknownError(error, 'The venue map could not be saved.'), 'warning');
      }
      return { status: 'error' };
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };
  // Point fields edit the same local working draft as every other map control;
  // only the global Save & publish action reaches persistence. The first field
  // change captures one baseline so Undo/Revert can roll back the whole session.
  const editSelected = (next: VenueMapConfig) => {
    if (!fieldUndoCapturedRef.current) {
      pushUndo(map);
      fieldUndoCapturedRef.current = true;
    }
    setEditing(true);
    update(next);
  };

  // Notify the shell of unsaved edits so it can guard navigation away from the
  // module (prevents silent loss of in-progress map work).
  useEffect(() => {
    onDirtyChange?.(dirty || stagedDraftDirty || baseMapUploading || saving);
  }, [baseMapUploading, dirty, onDirtyChange, saving, stagedDraftDirty]);

  // ── Undo / redo ──────────────────────────────────────────────────────────
  const pushUndo = (m: VenueMapConfig) => {
    setUndoStack((prev) => [...prev, m].slice(-60));
    setRedoStack([]);
    pendingDragRef.current = null;
    pendingDrawingDragRef.current = null;
  };
  const restoreHistorySnapshot = (next: VenueMapConfig) => {
    mapRef.current = next;
    if (!sizeDraftDirty) { setSizeW(String(next.width)); setSizeH(String(next.height)); }
    if (!backgroundUrlDraftDirty) setBgUrlInput(next.backgroundImageUrl || '');
    setMap(next);
    setDirty(JSON.stringify(next) !== savedMapRef.current);

    // History restores map JSON, so reconcile every transient editor that can
    // otherwise keep referring to an object the restored snapshot no longer
    // contains. A surviving point remains selected but becomes a stable history
    // baseline; subsequent edits start a fresh Revert/Undo session.
    const restoredPoint = selectedId
      ? next.points.find((point) => point.id === selectedId)
      : undefined;
    if (!restoredPoint) setSelectedId(null);
    pointDraftBaselineRef.current = restoredPoint ? { ...restoredPoint } : null;
    pointDraftBaselineUpdatedAtRef.current = next.updatedAt;
    newPointDraftRef.current = false;
    setEditing(false);

    if (selectedDrawingId && !(next.drawings || []).some((drawing) => drawing.id === selectedDrawingId)) {
      setSelectedDrawingId(null);
    }
    if (renamingRoute && !(next.routes || []).some((route) => route.id === renamingRoute)) {
      setRenamingRoute(null);
      setPendingRouteSwitch(null);
      setRouteRename('');
      setRouteEditAudience('public');
      setRouteEditAccessibility('unknown');
      setRouteEditPriority('standard');
      setRouteEditNotes('');
      setRouteEditEventSpaceIds([]);
      setRouteEditPointIds([]);
    }

    pendingDragRef.current = null;
    pendingDrawingDragRef.current = null;
    fieldUndoCapturedRef.current = false;
    drawingUndoCapturedRef.current = false;
    backgroundOpacityUndoCapturedRef.current = false;
  };
  const stagedRouteHistoryConflict = (snapshot: VenueMapConfig): string | null => {
    const snapshotPointCounts = new Map<string, number>();
    for (const point of snapshot.points) {
      snapshotPointCounts.set(point.id, (snapshotPointCounts.get(point.id) || 0) + 1);
    }

    if (routeEditDraftDirty && renamingRoute) {
      const currentRoute = (map.routes || []).find((route) => route.id === renamingRoute);
      const snapshotRoute = (snapshot.routes || []).find((route) => route.id === renamingRoute);
      if (!currentRoute || !snapshotRoute || JSON.stringify(snapshotRoute) !== JSON.stringify(currentRoute)) {
        return `Apply or cancel the changes to “${currentRoute?.name || routeRename || 'the open walkway'}” before restoring history that changes that walkway.`;
      }
      if (routeEditPointIds.some((pointId) => snapshotPointCounts.get(pointId) !== 1)) {
        return `Apply or cancel the changes to “${currentRoute.name}” before restoring history that removes or duplicates one of its staged points.`;
      }
    }

    if (newRouteDraftDirty) {
      const permanentDraftPointIds = routePointIds.filter((pointId) =>
        !routeDraftWaypointIds.has(pointId),
      );
      if (permanentDraftPointIds.some((pointId) => snapshotPointCounts.get(pointId) !== 1)) {
        return 'Finish or cancel the walkway draft before restoring history that removes or duplicates one of its selected points.';
      }
      if (
        routeDraftWaypoints.length > 0
        && (snapshot.width !== map.width || snapshot.height !== map.height)
      ) {
        return 'Finish or cancel the walkway draft before restoring a different map size for its temporary waypoints.';
      }
    }

    return null;
  };
  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    const conflict = stagedRouteHistoryConflict(prev);
    if (conflict) {
      showToast(conflict, 'warning');
      return;
    }
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, map]);
    restoreHistorySnapshot(prev);
  };
  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const conflict = stagedRouteHistoryConflict(next);
    if (conflict) {
      showToast(conflict, 'warning');
      return;
    }
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, map]);
    restoreHistorySnapshot(next);
  };

  const handleSelectPoint = (id: string | null) => {
    if (id && id === selectedId) {
      // Re-engaging the currently selected point starts a possible drag but must
      // not silently convert a newly placed or edited point into a saved draft.
      pendingDragRef.current = map;
      return;
    }
    setSelectedId(id);
    fieldUndoCapturedRef.current = false;
    newPointDraftRef.current = false;
    pointDraftBaselineUpdatedAtRef.current = map.updatedAt;
    pointDraftBaselineRef.current = id
      ? { ...map.points.find((point) => point.id === id)! }
      : null;
    setEditing(false);
    pendingDragRef.current = id
      ? map // snapshot pre-drag state for undo coalescing
      : null;
  };

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo, Delete/Backspace removes
  // the selected point or property shape. Only fires outside text inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ConfirmDialog owns the keyboard while open. Never let destructive or
      // history shortcuts mutate the map behind a modal decision.
      if (isConfirmDialogOpen()) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape' && interactionMode !== 'select') {
        e.preventDefault();
        setInteractionMode('select');
        setKeepAddingPoints(false);
        showToast(
          routePointIds.length > 0
            ? 'Walkway draft paused. Resume it when you are ready, or cancel the draft.'
            : 'Placement cancelled. Select & Move is active.',
          'info',
        );
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          removeSelected();
        } else if (selectedDrawingId) {
          e.preventDefault();
          pushUndo(map);
          update(removeMapDrawing(map, selectedDrawingId));
          handleCanvasSelectDrawing(null);
          showToast('Shape removed from this local draft.', 'info');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const linkedVenueName = (venueId?: string) =>
    venues.find((v) => v.id === venueId)?.name || venueId || '—';

  // Suggested size summary (spaces, lodging, parking, entries).
  const summary = useMemo(() => {
    const count = (kind: VenueMapPointKind) =>
      map.points.filter((point) => point.kind === kind).length;
    const lodgingPointIds = new Set(
      map.points
        .filter((point) => point.kind === 'space'
          && venues.find((venue) => venue.id === point.venueId)?.category === 'lodging')
        .map((point) => point.id),
    );
    return {
      spaces: map.points.filter((point) =>
        point.kind === 'space' && !lodgingPointIds.has(point.id)).length,
      lodging: lodgingPointIds.size,
      parking: count('parking'),
      entries: count('entry'),
    };
  }, [map, venues]);

  const venueIdCounts = new Map<string, number>();
  for (const venue of venues) {
    venueIdCounts.set(venue.id, (venueIdCounts.get(venue.id) || 0) + 1);
  }
  const uniquelyLinkableVenues = venues.filter((venue) => venueIdCounts.get(venue.id) === 1);

  // Venues (event spaces + lodging) that have no pin linked to them. Ambiguous
  // catalog identities are excluded from controls until the catalog is repaired.
  const missingVenues = uniquelyLinkableVenues.filter(
    (v) => !map.points.some((p) => p.kind === 'space' && p.venueId === v.id),
  );
  const uniquelyPinnedVenueCount = uniquelyLinkableVenues.filter((venue) =>
    map.points.filter((point) => point.kind === 'space' && point.venueId === venue.id).length === 1,
  ).length;
  const initialPreviewVenueId = uniquelyLinkableVenues.find((venue) =>
    map.points.filter((point) => point.kind === 'space' && point.venueId === venue.id).length === 1,
  )?.id || uniquelyLinkableVenues[0]?.id || '';
  const validPreviewVenueIds = previewVenueIds.filter((venueId) =>
    venueIdCounts.get(venueId) === 1,
  );

  // Rain backups are part of the canonical map and therefore share this
  // editor's single draft, Save action, and CAS conflict flow.
  const outdoorVenues = uniquelyLinkableVenues.filter(isRainContingencySource);
  const indoorVenues = uniquelyLinkableVenues.filter(isRainContingencyBackup);
  const usedOutdoorVenueIds = new Set(
    (map.rainContingencies || []).map((contingency) => contingency.outdoorVenueId),
  );
  const availableOutdoorVenues = outdoorVenues.filter(
    (venue) => !usedOutdoorVenueIds.has(venue.id)
      && indoorVenues.some((backup) => backup.id !== venue.id),
  );
  const invalidRainContingencies = (map.rainContingencies || []).flatMap((contingency) => {
    const issue = rainContingencyValidationIssue(contingency, venues);
    return issue ? [{ contingency, issue }] : [];
  });
  const rainContingencyIssueById = new Map(
    invalidRainContingencies.map(({ contingency, issue }) => [contingency.id, issue]),
  );
  const spacePointLinkCollisionGroups = venueMapSpacePointLinkCollisionGroups(map);
  const collidingSpacePointIds = new Set(
    spacePointLinkCollisionGroups.flatMap((group) => group.points.map((point) => point.id)),
  );
  const spacePointLinkCollisionPending = spacePointLinkCollisionGroups.length > 0;
  const selectedSpaceLinkCollision = selected?.kind === 'space'
    && collidingSpacePointIds.has(selected.id)
    ? spacePointLinkCollisionGroups.find((group) =>
        group.points.some((point) => point.id === selected.id),
      )
    : undefined;
  const keepCanonicalSpacePoint = (venueId: string, pointId: string) => {
    const group = spacePointLinkCollisionGroups.find((candidate) =>
      candidate.venueId === venueId,
    );
    if (!group || !group.points.some((point) => point.id === pointId)) return;
    const removedIds = new Set(
      group.points.filter((point) => point.id !== pointId).map((point) => point.id),
    );
    const candidateMap = {
      ...map,
      points: map.points.filter((point) => !removedIds.has(point.id)),
      updatedAt: new Date().toISOString(),
    };
    const routePartition = partitionVenueMapRouteReferenceIntegrity(candidateMap);
    setUndoStack([]);
    setRedoStack([]);
    if (routePartition.quarantinedRoutes.length > 0) {
      setRouteReferenceQuarantine((routes) => [
        ...routes,
        ...routePartition.quarantinedRoutes.filter((route) =>
          !routes.some((candidate) => candidate.id === route.id),
        ),
      ]);
    }
    setSelectedId(pointId);
    update({ ...routePartition.map, updatedAt: candidateMap.updatedAt });
    showToast('Kept one canonical venue destination pin. Other occurrences were removed from this draft; affected walkways require explicit repair.', 'info');
  };
  const duplicateRecoveryPending = duplicateIdentityGroups.length > 0
    || duplicateDependentRoutes.length > 0;
  const routeReferenceRecoveryPending = routeReferenceQuarantine.length > 0;
  // Point movement and map shrinking can collapse a previously valid route after
  // initial recovery partitioning. Keep detecting that draft state continuously.
  const authoredZeroGeometryRoutes = (map.routes || []).filter((route) =>
    venueMapRouteGeometryIssue(route, map.points) !== null,
  );
  const rainContingencyCollisionRecoveryPending = rainContingencyQuarantine.length > 0;
  const drawingIntegrityRecoveryPending = drawingIntegrityQuarantine.length > 0;
  const structuralRecoveryPending = structuralRecoveryArtifacts.length > 0;
  const mapFrameRecoveryPending = structuralRecoveryArtifacts.some(
    (artifact) => artifact.family === 'map' && artifact.mapFrameMalformed === true,
  );
  const mapComplexityRecoveryPending = structuralRecoveryArtifacts.some(
    (artifact) => artifact.family === 'map' && artifact.mapComplexityExceeded === true,
  );
  const textIntegrityIssues = venueMapTextIntegrityIssues(map);
  const audienceIntegrityIssues = venueMapAudienceIntegrityIssues(map);
  const arrivalRoleIntegrityIssues = venueMapArrivalRoleIntegrityIssues(map);
  const routeAccessibilityIntegrityIssues = venueMapRouteAccessibilityIntegrityIssues(map);
  const invalidAudiencePointIds = new Set(
    audienceIntegrityIssues
      .filter((issue) => issue.family === 'point' && issue.objectId)
      .map((issue) => issue.objectId!),
  );
  const invalidAudienceRouteIds = new Set(
    audienceIntegrityIssues
      .filter((issue) => issue.family === 'route' && issue.objectId)
      .map((issue) => issue.objectId!),
  );
  const selectedPointAudienceIssue = selected
    ? audienceIntegrityIssues.find((issue) => issue.family === 'point' && issue.objectId === selected.id)
    : undefined;
  const selectedPointArrivalRoleIssue = selected
    ? arrivalRoleIntegrityIssues.find((issue) => issue.pointId === selected.id)
    : undefined;
  const selectedDrawingAudienceIssue = selectedDrawing
    ? audienceIntegrityIssues.find((issue) => issue.family === 'drawing' && issue.objectId === selectedDrawing.id)
    : undefined;
  const invalidGpsPoints = map.points.flatMap((point) => {
    const issue = venueMapPointGpsIssue(point);
    return issue ? [{ point, issue }] : [];
  });
  const invalidAuthoredDrawings = (map.drawings || []).flatMap((drawing, index) => {
    const issue = venueMapDrawingIntegrityIssue(drawing, map);
    return issue ? [{ drawing, index, issue }] : [];
  });
  const invalidSpacePointLinks = map.points.flatMap((point) => {
    const issue = venueMapSpacePointLinkIssue(point, venues);
    return issue ? [{ point, issue }] : [];
  });
  const invalidEventScopeObjects = [
    ...map.points.map((point) => ({
      type: 'Point',
      id: point.id,
      label: point.label,
      eventSpaceIds: point.eventSpaceIds,
    })),
    ...(map.routes || []).map((route) => ({
      type: 'Walkway',
      id: route.id,
      label: route.name,
      eventSpaceIds: route.eventSpaceIds,
    })),
    ...(map.drawings || []).map((drawing, index) => ({
      type: 'Shape',
      id: drawing.id,
      label: drawing.text || `Shape ${index + 1}`,
      eventSpaceIds: drawing.eventSpaceIds,
    })),
  ].flatMap((object) => {
    const unavailableIds = unavailableVenueMapEventScopeIds(object.eventSpaceIds, venues);
    return unavailableIds.length ? [{ ...object, unavailableIds }] : [];
  });
  const invalidEventScopeObjectKeys = new Set(
    invalidEventScopeObjects.map((object) => `${object.type}:${object.id}`),
  );
  // Unavailable/sentinel scopes have their own primary recovery workflow. Avoid
  // presenting a derivative route-compatibility error until those are repaired.
  const routeDeliveryIssues = allRouteDeliveryIssues.filter((issue) =>
    !invalidEventScopeObjectKeys.has(`Walkway:${issue.route.id}`)
      && !invalidEventScopeObjectKeys.has(`Point:${issue.point.id}`)
      && !invalidAudienceRouteIds.has(issue.route.id)
      && !invalidAudiencePointIds.has(issue.point.id),
  );
  const routeDeliveryIssueCount = new Set(
    routeDeliveryIssues.map((issue) => issue.route.id),
  ).size;
  // A save may remain in flight while the admin continues editing. If that save
  // conflicts, the shell's force path may use only a snapshot that still passes
  // every hard Designer preflight. Advisory route coverage is disclosed and
  // acknowledged separately in the conflict dialog.
  conflictOverwriteBlockedRef.current = baseMapUploading
    || baseImageIntegrityIssues.length > 0
    || unmanagedCloudBaseMap
    || baseMapLoadBlocksPublication
    || mapComplexityRecoveryPending
    || mapFrameRecoveryPending
    || structuralRecoveryPending
    || duplicateRecoveryPending
    || spacePointLinkCollisionPending
    || routeReferenceRecoveryPending
    || authoredZeroGeometryRoutes.length > 0
    || rainContingencyCollisionRecoveryPending
    || drawingIntegrityRecoveryPending
    || textIntegrityIssues.length > 0
    || audienceIntegrityIssues.length > 0
    || arrivalRoleIntegrityIssues.length > 0
    || routeAccessibilityIntegrityIssues.length > 0
    || invalidAuthoredDrawings.length > 0
    || invalidSpacePointLinks.length > 0
    || stagedDraftDirty
    || invalidRainContingencies.length > 0
    || invalidEventScopeObjects.length > 0
    || routeDeliveryIssues.length > 0
    || venueMapComplexityIssues(map).length > 0
    || invalidGpsPoints.length > 0;

  const updateRainContingency = (id: string, patch: Partial<RainContingency>) => {
    pushUndo(map);
    update({
      ...map,
      rainContingencies: (map.rainContingencies || []).map((contingency) =>
        contingency.id === id ? { ...contingency, ...patch } : contingency,
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const addRainContingency = () => {
    if ((map.rainContingencies || []).length >= VENUE_MAP_MAX_RAIN_CONTINGENCIES) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_RAIN_CONTINGENCIES} rain plans.`, 'warning');
      return;
    }
    const outdoorVenue = availableOutdoorVenues[0];
    const indoorVenue = outdoorVenue
      ? indoorVenues.find((candidate) => candidate.id !== outdoorVenue.id)
      : undefined;
    if (!outdoorVenue || !indoorVenue) return;
    pushUndo(map);
    update({
      ...map,
      rainContingencies: [
        ...(map.rainContingencies || []),
        {
          id: createEntityId('rain-plan', (map.rainContingencies || []).map((plan) => plan.id)),
          outdoorVenueId: outdoorVenue.id,
          indoorVenueId: indoorVenue.id,
        },
      ],
      updatedAt: new Date().toISOString(),
    });
    showToast('Rain backup added to this map draft. Save the venue map to publish it.', 'info');
  };

  const removeRainContingency = (id: string) => {
    pushUndo(map);
    update({
      ...map,
      rainContingencies: (map.rainContingencies || []).filter(
        (contingency) => contingency.id !== id,
      ),
      updatedAt: new Date().toISOString(),
    });
    showToast('Rain backup removed from this map draft.', 'info');
  };

  const handlePlace = (kind: VenueMapPointKind, x: number, y: number) => {
    if (workingMapWithRouteDraft.points.length >= VENUE_MAP_MAX_POINTS) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_POINTS} points.`, 'warning');
      return;
    }
    pushUndo(map);
    fieldUndoCapturedRef.current = false;
    const label = `${pointKindLabel(kind)} ${workingMapWithRouteDraft.points.filter((p) => p.kind === kind).length + 1}`;
    const next = addMapPoint(map, {
      label,
      kind,
      x,
      y,
      audience: 'public',
      arrivalRole: kind === 'entry' ? 'unknown' : undefined,
      venueId: kind === 'space' ? '' : undefined,
    });
    setSelectedId(next.points[next.points.length - 1].id);
    pointDraftBaselineRef.current = null;
    pointDraftBaselineUpdatedAtRef.current = map.updatedAt;
    newPointDraftRef.current = true;
    setEditing(true);
    update(next);
    if (!keepAddingPoints) {
      setInteractionMode('select');
    }
  };

  const addRoutePointToDraft = (id: string) => {
    if (!canvasMap.points.some((point) => point.id === id)) return;
    if (routePointIds.includes(id)) {
      showToast('That location is already included in this walkway.', 'info');
      return;
    }
    if (routePointIds.length >= VENUE_MAP_MAX_ROUTE_POINTS) {
      showToast(`A walkway can contain at most ${VENUE_MAP_MAX_ROUTE_POINTS} ordered points.`, 'warning');
      return;
    }
    setRoutePointIds((ids) => [...ids, id]);
  };

  const removeRoutePointFromDraft = (id: string) => {
    setRoutePointIds((ids) => ids.filter((candidate) => candidate !== id));
    setRouteDraftWaypoints((points) => points.filter((point) => point.id !== id));
  };

  const handleWalkwayWaypointPlace = (x: number, y: number): boolean => {
    if (workingMapWithRouteDraft.points.length >= VENUE_MAP_MAX_POINTS) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_POINTS} points.`, 'warning');
      return false;
    }
    if (routePointIds.length >= VENUE_MAP_MAX_ROUTE_POINTS) {
      showToast(`A walkway can contain at most ${VENUE_MAP_MAX_ROUTE_POINTS} ordered points.`, 'warning');
      return false;
    }
    const nextCanvasMap = addMapPoint(canvasMap, {
      label: `Waypoint ${routeDraftWaypoints.length + 1}`,
      kind: 'path',
      x,
      y,
      audience: routeAudience,
      eventSpaceIds: routeEventSpaceIds.length ? routeEventSpaceIds : undefined,
    });
    const waypoint = nextCanvasMap.points[nextCanvasMap.points.length - 1];
    setRouteDraftWaypoints((points) => [...points, waypoint]);
    setRoutePointIds((ids) => [...ids, waypoint.id]);
    return true;
  };

  const handleCanvasPlace = (kind: VenueMapPointKind, x: number, y: number) => {
    if (interactionMode === 'walkway' || kind === 'path') {
      handleWalkwayWaypointPlace(x, y);
      return;
    }
    handlePlace(kind, x, y);
  };

  const handleCanvasSelectPoint = (id: string | null) => {
    if (id && routeDraftWaypoints.some((point) => point.id === id)) return;
    if (id && interactionMode === 'place') {
      setInteractionMode('select');
      setKeepAddingPoints(false);
    }
    if (id) {
      setSelectedDrawingId(null);
      pendingDrawingDragRef.current = null;
      drawingUndoCapturedRef.current = false;
    }
    handleSelectPoint(id);
  };

  const handleCanvasSelectDrawing = (id: string | null) => {
    setSelectedDrawingId(id);
    drawingUndoCapturedRef.current = false;
    if (!id) {
      pendingDrawingDragRef.current = null;
      return;
    }
    handleSelectPoint(null);
    pendingDrawingDragRef.current = mapRef.current;
  };

  const handleCanvasMoveDrawing = (id: string, deltaX: number, deltaY: number) => {
    const latestMap = mapRef.current;
    const next = moveMapDrawing(latestMap, id, deltaX, deltaY);
    if (next === latestMap) return;
    if (pendingDrawingDragRef.current) {
      pushUndo(pendingDrawingDragRef.current);
      pendingDrawingDragRef.current = null;
    }
    update(next);
  };

  const handleCanvasActivatePoint = (id: string) => {
    if (interactionMode === 'walkway') addRoutePointToDraft(id);
  };

  const handleMove = (id: string, x: number, y: number) => {
    if (routeDraftWaypoints.some((point) => point.id === id)) {
      const nextCanvasMap = moveMapPoint(canvasMap, id, x, y);
      const movedWaypoint = nextCanvasMap.points.find((point) => point.id === id);
      if (movedWaypoint) {
        setRouteDraftWaypoints((points) => points.map((point) =>
          point.id === id ? movedWaypoint : point,
        ));
      }
      return;
    }
    // First move of a drag pushes the pre-drag snapshot once (not per-mousemove).
    if (pendingDragRef.current) {
      pushUndo(pendingDragRef.current);
      pendingDragRef.current = null;
    }
    update(moveMapPoint(map, id, x, y));
  };

  const finishPointEditing = () => {
    if (!selected) return;
    // This action closes the local edit session only. Kind cleanup happens live,
    // and the global publication path owns final text/GPS normalization.
    pointDraftBaselineRef.current = { ...selected };
    pointDraftBaselineUpdatedAtRef.current = map.updatedAt;
    newPointDraftRef.current = false;
    setEditing(false);
    fieldUndoCapturedRef.current = false;
    showToast('Point editing finished. Changes remain in the local draft until you publish.', 'success');
  };

  const removePointAndQuarantineRoutes = (
    pointId: string,
    options: { captureHistory?: boolean; updatedAt?: string } = {},
  ): number => {
    const removed = removeMapPoint(map, pointId);
    const routePartition = partitionVenueMapRouteReferenceIntegrity(removed);
    if (options.captureHistory && routePartition.quarantinedRoutes.length === 0) {
      pushUndo(map);
    } else if (routePartition.quarantinedRoutes.length > 0) {
      // Map-only history cannot reconstruct quarantine state. Preserve safety by
      // starting a fresh history after a deletion that requires route recovery.
      setUndoStack([]);
      setRedoStack([]);
    }
    if (routePartition.quarantinedRoutes.length > 0) {
      setRouteReferenceQuarantine((previous) => [
        ...previous,
        ...routePartition.quarantinedRoutes.filter((route) =>
          !previous.some((candidate) => candidate.id === route.id),
        ),
      ]);
    }
    update({
      ...routePartition.map,
      updatedAt: options.updatedAt || routePartition.map.updatedAt,
    });
    return routePartition.quarantinedRoutes.length;
  };

  const resetRouteEditDraft = () => {
    setRenamingRoute(null);
    setRouteRename('');
    setRouteEditAudience('public');
    setRouteEditAccessibility('unknown');
    setRouteEditPriority('standard');
    setRouteEditNotes('');
    setRouteEditEventSpaceIds([]);
    setRouteEditPointIds([]);
  };

  const prepareOpenRouteEditorForPointRemoval = (
    point: VenueMapPoint,
    closeCleanEditor = true,
  ): boolean => {
    if (!renamingRoute) return true;
    const savedRouteUsesPoint = Boolean(routeBeingEdited?.pointIds.includes(point.id));
    const stagedRouteUsesPoint = routeEditPointIds.includes(point.id);
    if (!savedRouteUsesPoint && !stagedRouteUsesPoint) return true;
    if (routeEditDraftDirty) {
      showToast(
        `Apply or cancel the changes to “${routeBeingEdited?.name || 'the open walkway'}” before removing “${point.label || 'this point'}”.`,
        'warning',
      );
      return false;
    }
    // A clean form has no unique work to preserve. Close it only when deletion
    // is actually confirmed so cancelling the safety dialog changes nothing.
    if (closeCleanEditor) resetRouteEditDraft();
    return true;
  };

  const cancelPointEdit = () => {
    if (!selected) return;
    if (!editing) {
      setSelectedId(null);
      pointDraftBaselineRef.current = null;
      return;
    }
    if (newPointDraftRef.current) {
      if (!prepareOpenRouteEditorForPointRemoval(selected)) return;
      removePointAndQuarantineRoutes(selected.id, {
        updatedAt: pointDraftBaselineUpdatedAtRef.current,
      });
      setRoutePointIds((ids) => ids.filter((id) => id !== selected.id));
    } else if (pointDraftBaselineRef.current) {
      const baseline = pointDraftBaselineRef.current;
      update({
        ...map,
        points: map.points.map((point) => point.id === selected.id ? baseline : point),
        updatedAt: pointDraftBaselineUpdatedAtRef.current,
      });
    }
    setSelectedId(null);
    pointDraftBaselineRef.current = null;
    newPointDraftRef.current = false;
    setEditing(false);
    fieldUndoCapturedRef.current = false;
  };

  const executePointRemoval = (point: VenueMapPoint) => {
    if (!prepareOpenRouteEditorForPointRemoval(point)) return;
    const quarantinedRouteCount = removePointAndQuarantineRoutes(point.id, {
      captureHistory: true,
    });
    setRoutePointIds((ids) => ids.filter((id) => id !== point.id));
    setSelectedId(null);
    pointDraftBaselineRef.current = null;
    newPointDraftRef.current = false;
    setEditing(false);
    fieldUndoCapturedRef.current = false;
    showToast(
      quarantinedRouteCount > 0
        ? `Point removed. ${quarantinedRouteCount} affected ${quarantinedRouteCount === 1 ? 'walkway now requires' : 'walkways now require'} explicit repair before publication.`
        : 'Point removed. Save the venue map to publish this change.',
      'info',
    );
  };

  const removeSelected = () => {
    if (!selected || !prepareOpenRouteEditorForPointRemoval(selected, false)) return;
    const affectedRoutes = (map.routes || [])
      .filter((route) => route.pointIds.includes(selected.id))
      .map((route) => ({ id: route.id, name: route.name }));
    if (affectedRoutes.length > 0) {
      setPendingPointDeletion({
        pointId: selected.id,
        pointLabel: selected.label,
        affectedRoutes,
      });
      return;
    }
    executePointRemoval(selected);
  };

  const confirmPointDeletion = () => {
    if (!pendingPointDeletion) return;
    const point = map.points.find((candidate) => candidate.id === pendingPointDeletion.pointId);
    setPendingPointDeletion(null);
    if (point) executePointRemoval(point);
  };

  /** Duplicate the selected point at a small offset and select the copy. */
  const duplicateSelected = () => {
    if (!selected) return;
    if (selected.kind === 'space') {
      showToast('Each event space or lodging record uses one canonical destination pin. Add missing venues from Map coverage instead.', 'info');
      return;
    }
    if (workingMapWithRouteDraft.points.length >= VENUE_MAP_MAX_POINTS) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_POINTS} points.`, 'warning');
      return;
    }
    pushUndo(map);
    fieldUndoCapturedRef.current = false;
    const next = duplicateMapPoint(map, selected.id);
    const copy = next.points[next.points.length - 1];
    setSelectedId(copy.id);
    pointDraftBaselineRef.current = null;
    pointDraftBaselineUpdatedAtRef.current = map.updatedAt;
    newPointDraftRef.current = true;
    setEditing(true);
    update(next);
    showToast('Point duplicated.', 'success');
  };

  /** Open a point's GPS location in Google Maps (used in preview mode). */
  const openInMaps = (p: VenueMapPoint) => {
    if (!isValidLatitude(p.lat) || !isValidLongitude(p.lng)) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`, '_blank', 'noopener,noreferrer');
  };

  /** Place a space pin for a venue that has no pin yet, labeled with its name. */
  const addVenuePin = (venue: Venue) => {
    if (workingMapWithRouteDraft.points.length >= VENUE_MAP_MAX_POINTS) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_POINTS} points.`, 'warning');
      return;
    }
    pushUndo(map);
    fieldUndoCapturedRef.current = false;
    const offset = map.points.length % 5;
    const row = Math.floor(map.points.length / 5) % 3;
    const next = addMapPoint(map, {
      label: venue.name,
      kind: 'space',
      x: Math.round(map.width * 0.5 + offset * 10 - 20),
      y: Math.round(map.height * 0.5 + row * 10),
      venueId: venue.id,
      audience: 'public',
    });
    setSelectedId(next.points[next.points.length - 1].id);
    pointDraftBaselineRef.current = null;
    pointDraftBaselineUpdatedAtRef.current = map.updatedAt;
    newPointDraftRef.current = true;
    setEditing(true);
    setInteractionMode('select');
    setKeepAddingPoints(false);
    update(next);
    showToast(`${venue.name} pin added — drag it into place.`, 'info');
  };

  /** Link the selected point to a venue; auto-suggest the venue name as the label. */
  const linkVenue = (venueId: string) => {
    if (!selected) return;
    const venue = venues.find((v) => v.id === venueId);
    const genericLabel = !selected.label.trim() ||
      new RegExp(`^${pointKindLabel(selected.kind)}( \\d+)?$`).test(selected.label.trim());
    editSelected(updateMapPoint(map, selected.id, {
      venueId: venueId || undefined,
      ...(venue && genericLabel ? { label: venue.name } : {}),
    }));
  };

  const addZone = () => {
    if ((map.drawings || []).length >= VENUE_MAP_MAX_DRAWINGS) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_DRAWINGS} shapes.`, 'warning');
      return;
    }
    const width = Math.max(8, map.width * 0.24);
    const height = Math.max(6, map.height * 0.18);
    const drawing: DrawingObject = {
      id: createEntityId('zone', (map.drawings || []).map((candidate) => candidate.id)),
      type: 'zone',
      x: Math.max(0, (map.width - width) / 2),
      y: Math.max(0, (map.height - height) / 2),
      width,
      height,
      text: 'New map zone',
      fillColor: '#0d9488',
      strokeColor: '#0f766e',
      strokeWidth: 1.2,
      opacity: 0.24,
      audience: 'public',
    };
    pushUndo(map);
    update(addMapDrawing(map, drawing));
    handleCanvasSelectDrawing(drawing.id);
    showToast('Zone added. Drag it into place or use the precise shape fields below.', 'info');
  };

  const editDrawing = (patch: Partial<Omit<DrawingObject, 'id'>>) => {
    if (!selectedDrawing) return;
    if (!drawingUndoCapturedRef.current) {
      pushUndo(map);
      drawingUndoCapturedRef.current = true;
    }
    update(updateMapDrawing(map, selectedDrawing.id, patch));
  };

  const editBackgroundOpacity = (opacity: number) => {
    if (!backgroundOpacityUndoCapturedRef.current) {
      pushUndo(map);
      backgroundOpacityUndoCapturedRef.current = true;
    }
    update(updateMapBackground(map, map.backgroundImageUrl, opacity));
  };

  const resetBackgroundOpacityGesture = () => {
    backgroundOpacityUndoCapturedRef.current = false;
  };

  const clearAllZones = () => {
    if ((map.drawings || []).length === 0) {
      setConfirmClearZones(false);
      return;
    }
    pushUndo(map);
    update(clearMapDrawings(map));
    handleCanvasSelectDrawing(null);
    setConfirmClearZones(false);
    showToast('All shapes removed from this draft. Save the venue map to publish this change.', 'info');
  };

  const clearRouteDraft = () => {
    setRouteName('');
    setRoutePointIds([]);
    setRouteDraftWaypoints([]);
    setRouteAudience('public');
    setRouteAccessibility('unknown');
    setRoutePriority('standard');
    setRouteNotes('');
    setRouteEventSpaceIds([]);
  };

  const resetRouteDraft = () => {
    const discardedWaypoints = routeDraftWaypoints.length;
    clearRouteDraft();
    setInteractionMode('select');
    showToast(
      discardedWaypoints > 0
        ? `Walkway draft cancelled. ${discardedWaypoints} temporary ${discardedWaypoints === 1 ? 'waypoint was' : 'waypoints were'} discarded.`
        : 'Walkway draft cancelled.',
      'info',
    );
  };

  const commitRoute = () => {
    if (routeName.trim().length > VENUE_MAP_MAX_ROUTE_NAME_LENGTH) {
      showToast(`Walkway names can contain at most ${VENUE_MAP_MAX_ROUTE_NAME_LENGTH} characters.`, 'warning');
      return;
    }
    if (routeNotes.trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH) {
      showToast(`Walkway guidance can contain at most ${VENUE_MAP_MAX_GUIDANCE_LENGTH} characters.`, 'warning');
      return;
    }
    if (routePointIds.length < 2) {
      showToast('A walkway needs at least 2 current map points.', 'warning');
      return;
    }
    if (routeDraftReferenceIssues.length > 0) {
      showToast(
        routeDraftReferenceIssues.some((issue) => issue.reason === 'coincident')
          ? 'Move or choose a stop at a different map position before finishing this walkway.'
          : 'Remove or replace every unavailable or repeated walkway point before finishing.',
        'warning',
      );
      return;
    }
    if (routeDraftDeliveryIssues.length > 0) {
      showToast('Adjust the walkway audience or event scope, or repair its restricted points, before finishing.', 'warning');
      return;
    }
    if (routePointIds.length > VENUE_MAP_MAX_ROUTE_POINTS) {
      showToast(`A walkway can contain at most ${VENUE_MAP_MAX_ROUTE_POINTS} ordered points.`, 'warning');
      return;
    }
    if ((map.routes || []).length >= VENUE_MAP_MAX_ROUTES) {
      showToast(`A Venue Map can contain at most ${VENUE_MAP_MAX_ROUTES} walkways.`, 'warning');
      return;
    }
    const committedWaypoints = routeDraftWaypoints.map((point) => ({
      ...point,
      audience: routeAudience,
      eventSpaceIds: routeEventSpaceIds.length ? routeEventSpaceIds : undefined,
    }));
    const mapWithWaypoints: VenueMapConfig = committedWaypoints.length > 0
      ? {
          ...map,
          points: [...map.points, ...committedWaypoints],
          updatedAt: new Date().toISOString(),
        }
      : map;
    const next = addMapRoute(
      mapWithWaypoints,
      routeName.trim() || `Walkway ${(map.routes || []).length + 1}`,
      routePointIds,
      {
        audience: routeAudience,
        accessibility: routeAccessibility,
        priority: routePriority,
        notes: routeNotes.trim() || undefined,
        eventSpaceIds: routeEventSpaceIds,
      },
    );
    if (next === mapWithWaypoints) {
      setRoutePointIds((ids) => ids.filter((id) => canvasMap.points.some((point) => point.id === id)));
      showToast('Choose at least 2 current map points for this walkway.', 'warning');
      return;
    }
    pushUndo(map);
    update(next);
    clearRouteDraft();
    setInteractionMode('select');
    showToast('Walkway added. Save the venue map to publish it.', 'success');
  };

  const openRouteEditor = (id: string) => {
    const route = (map.routes || []).find((item) => item.id === id);
    if (!route) {
      showToast('That walkway is no longer available to edit.', 'warning');
      return;
    }
    setRenamingRoute(id);
    setRouteRename(route.name);
    setRouteEditAudience(route.audience === undefined ? 'public' : route.audience);
    setRouteEditAccessibility(route.accessibility === undefined ? 'unknown' : route.accessibility);
    setRouteEditPriority(route.priority || 'standard');
    setRouteEditNotes(route.notes || '');
    setRouteEditEventSpaceIds(route.eventSpaceIds || []);
    setRouteEditPointIds(route.pointIds || []);
  };
  const startRename = (id: string, current: string) => {
    if (renamingRoute === id) return;
    if (routeEditDraftDirty) {
      setPendingRouteSwitch({ routeId: id, routeName: current });
      return;
    }
    openRouteEditor(id);
  };
  const discardRouteEditAndSwitch = () => {
    const target = pendingRouteSwitch;
    setPendingRouteSwitch(null);
    if (!target) return;
    openRouteEditor(target.routeId);
  };
  const focusTextIntegrityIssue = (issue: (typeof textIntegrityIssues)[number]) => {
    setPreviewAudience(null);
    setInteractionMode('select');
    if (issue.family === 'point' && issue.objectId) {
      handleSelectPoint(issue.objectId);
    } else if (issue.family === 'route' && issue.objectId) {
      startRename(issue.objectId, issue.objectLabel);
    } else if (issue.family === 'drawing' && issue.objectId) {
      handleCanvasSelectDrawing(issue.objectId);
    } else if (issue.family === 'rainContingency') {
      window.setTimeout(() => {
        document.getElementById(`rain-note-${issue.occurrenceIndex}`)?.focus();
      }, 0);
    }
  };
  const focusArrivalRoleIntegrityIssue = (
    issue: (typeof arrivalRoleIntegrityIssues)[number],
  ) => {
    setPreviewAudience(null);
    setInteractionMode('select');
    if (issue.pointId) {
      handleSelectPoint(issue.pointId);
      setEditing(true);
    }
  };
  const focusAudienceIntegrityIssue = (issue: VenueMapAudienceIntegrityIssue) => {
    setPreviewAudience(null);
    setInteractionMode('select');
    if (issue.family === 'point' && issue.objectId) {
      handleSelectPoint(issue.objectId);
      setEditing(true);
    } else if (issue.family === 'route' && issue.objectId) {
      startRename(issue.objectId, issue.objectLabel);
    } else if (issue.family === 'drawing' && issue.objectId) {
      handleCanvasSelectDrawing(issue.objectId);
    }
  };
  const focusRouteAccessibilityIntegrityIssue = (
    issue: (typeof routeAccessibilityIntegrityIssues)[number],
  ) => {
    setPreviewAudience(null);
    setInteractionMode('select');
    if (issue.routeId) startRename(issue.routeId, issue.routeLabel);
  };
  const commitRename = () => {
    if (!MAP_AUDIENCES.includes(routeEditAudience)) {
      showToast('Choose who may see this walkway before applying these changes.', 'warning');
      return;
    }
    if (!MAP_ROUTE_ACCESSIBILITY.includes(routeEditAccessibility)) {
      showToast('Choose the walkway mobility status before applying these changes.', 'warning');
      return;
    }
    if (renamingRoute && routeRename.trim().length === 0) {
      showToast('Enter a walkway name before applying these changes.', 'warning');
      return;
    }
    if (renamingRoute && routeRename.trim().length > VENUE_MAP_MAX_ROUTE_NAME_LENGTH) {
      showToast(`Walkway names can contain at most ${VENUE_MAP_MAX_ROUTE_NAME_LENGTH} characters.`, 'warning');
      return;
    }
    if (renamingRoute && routeEditNotes.trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH) {
      showToast(`Walkway guidance can contain at most ${VENUE_MAP_MAX_GUIDANCE_LENGTH} characters.`, 'warning');
      return;
    }
    if (renamingRoute && !routeBeingEdited) {
      showToast('That walkway is no longer available. Finish its recovery before editing it again.', 'warning');
      return;
    }
    if (renamingRoute && routeEditPointIds.length < 2) {
      showToast('A walkway needs at least 2 current map points.', 'warning');
      return;
    }
    if (renamingRoute && routeEditReferenceIssues.length > 0) {
      showToast(
        routeEditReferenceIssues.some((issue) => issue.reason === 'coincident')
          ? 'Move or choose a stop at a different map position before applying this walkway.'
          : 'Remove or replace every unavailable or repeated walkway point before applying.',
        'warning',
      );
      return;
    }
    if (renamingRoute && routeEditDeliveryIssues.length > 0) {
      showToast('Adjust the walkway audience or event scope, or repair its restricted points, before applying.', 'warning');
      return;
    }
    if (renamingRoute && routeEditPointIds.length > VENUE_MAP_MAX_ROUTE_POINTS) {
      showToast(`A walkway can contain at most ${VENUE_MAP_MAX_ROUTE_POINTS} ordered points.`, 'warning');
      return;
    }
    if (renamingRoute) {
      pushUndo(map);
      update(updateMapRoute(map, renamingRoute, {
        name: routeRename.trim(),
        audience: routeEditAudience,
        accessibility: routeEditAccessibility,
        priority: routeEditPriority,
        notes: routeEditNotes.trim() || undefined,
        eventSpaceIds: routeEditEventSpaceIds.length ? routeEditEventSpaceIds : undefined,
        pointIds: routeEditPointIds,
      }));
      showToast('Walkway changes applied. Save the venue map to publish them.', 'success');
    }
    resetRouteEditDraft();
  };

  const publishMap = async (allowKnownRouteGaps = false) => {
    if (baseImageIntegrityIssues.length > 0) {
      showToast('Replace or remove the invalid base-map source, and reset any invalid opacity, before publishing.', 'warning');
      return;
    }
    if (unmanagedCloudBaseMap) {
      showToast('Upload this legacy base image to the venue’s private map storage, or remove it, before publishing.', 'warning');
      return;
    }
    if (baseMapLoadBlocksPublication) {
      showToast(
        baseMapLoadState === 'error'
          ? 'The base map could not be decoded. Retry it, upload a replacement, or remove it before publishing.'
          : 'Wait for the base map to finish loading before publishing.',
        'warning',
      );
      return;
    }
    if (mapComplexityRecoveryPending) {
      showToast('Download the original oversized map for recovery, then reset this Venue Map before publishing.', 'warning');
      return;
    }
    if (mapFrameRecoveryPending) {
      showToast('Accept valid map dimensions or reset the Venue Map before publishing.', 'warning');
      return;
    }
    if (structuralRecoveryPending) {
      showToast('Explicitly reconstruct or remove every malformed saved map occurrence before publishing.', 'warning');
      return;
    }
    if (duplicateRecoveryPending) {
      showToast('Resolve every quarantined duplicate identity before publishing the venue map.', 'warning');
      return;
    }
    if (spacePointLinkCollisionPending) {
      showToast('Keep one canonical destination pin per venue by relinking, reclassifying, or removing each duplicate.', 'warning');
      return;
    }
    if (routeReferenceRecoveryPending) {
      showToast('Repair or remove every quarantined walkway before publishing the venue map.', 'warning');
      return;
    }
    if (authoredZeroGeometryRoutes.length > 0) {
      showToast('Move or replace a walkway stop so every walkway spans at least two different map positions before publishing.', 'warning');
      return;
    }
    if (rainContingencyCollisionRecoveryPending) {
      showToast('Resolve every duplicate or competing rain plan before publishing the venue map.', 'warning');
      return;
    }
    if (drawingIntegrityRecoveryPending) {
      showToast('Repair, convert, or remove every unsupported or malformed map shape before publishing.', 'warning');
      return;
    }
    if (textIntegrityIssues.length > 0) {
      const issue = textIntegrityIssues[0];
      focusTextIntegrityIssue(issue);
      showToast(`Repair ${issue.objectLabel} before publishing. ${issue.message}`, 'warning');
      return;
    }
    if (audienceIntegrityIssues.length > 0) {
      const issue = audienceIntegrityIssues[0];
      focusAudienceIntegrityIssue(issue);
      showToast(`Choose a valid visibility for ${issue.objectLabel} before publishing.`, 'warning');
      return;
    }
    if (arrivalRoleIntegrityIssues.length > 0) {
      const issue = arrivalRoleIntegrityIssues[0];
      focusArrivalRoleIntegrityIssue(issue);
      showToast(`Choose a valid arrival role for ${issue.pointLabel} before publishing.`, 'warning');
      return;
    }
    if (routeAccessibilityIntegrityIssues.length > 0) {
      const issue = routeAccessibilityIntegrityIssues[0];
      focusRouteAccessibilityIntegrityIssue(issue);
      showToast(`Choose a valid mobility status for ${issue.routeLabel} before publishing.`, 'warning');
      return;
    }
    if (invalidAuthoredDrawings.length > 0) {
      const { drawing, index, issue } = invalidAuthoredDrawings[0];
      setPreviewAudience(null);
      setInteractionMode('select');
      handleCanvasSelectDrawing(drawing.id);
      showToast(`Repair “${drawing.text || `Shape ${index + 1}`}” before publishing. ${issue}`, 'warning');
      return;
    }
    if (invalidSpacePointLinks.length > 0) {
      showToast('Link, reclassify, or remove every unavailable space pin before publishing the venue map.', 'warning');
      return;
    }
    if (stagedDraftDirty) {
      showToast('Apply or reset the in-progress size, base-map URL, or walkway form before publishing the venue map.', 'warning');
      return;
    }
    if (invalidRainContingencies.length > 0) {
      showToast('Repair or remove every unavailable rain backup before publishing the venue map.', 'warning');
      return;
    }
    if (invalidEventScopeObjects.length > 0) {
      showToast('Remove unavailable event-space scopes before publishing the venue map.', 'warning');
      return;
    }
    if (routeDeliveryIssues.length > 0) {
      showToast('Repair every walkway whose audience or event scope is broader than one of its points before publishing.', 'warning');
      return;
    }
    const complexityIssues = venueMapComplexityIssues(map);
    if (complexityIssues.length > 0) {
      showToast(`Reduce this map before publishing. ${complexityIssues[0]}`, 'warning');
      return;
    }
    if (invalidGpsPoints.length > 0) {
      const { point, issue } = invalidGpsPoints[0];
      setPreviewAudience(null);
      setInteractionMode('select');
      handleSelectPoint(point.id);
      setEditing(true);
      showToast(`Fix the GPS coordinates for “${point.label}” before saving. ${issue}`, 'warning');
      return;
    }
    if (guestRouteCoverageIssues.length > 0 && !allowKnownRouteGaps) {
      setConfirmPublishWithRouteGaps(true);
      return;
    }
    const outcome = await persist(map);
    if (outcome.status === 'saved') {
      showToast('Venue map saved and portal snapshots queued for refresh.', 'success');
    } else if (outcome.status === 'conflict') {
      showToast('This draft was not published because the shared map changed elsewhere.', 'warning');
    } else {
      showToast('The shared map could not be saved. Your draft remains open; keep this page open and try again.', 'warning');
    }
  };

  const restrictedLayerCount = [
    ...map.points,
    ...(map.routes || []),
    ...(map.drawings || []),
  ].filter((item) => item.audience !== undefined && item.audience !== 'public').length;
  const zoneAudienceSummary = MAP_AUDIENCES
    .map((audience) => ({
      audience,
      count: (map.drawings || []).filter(
        (drawing) => (drawing.audience || 'public') === audience,
      ).length,
    }))
    .filter(({ count }) => count > 0)
    .map(({ audience, count }) => `${count} ${mapAudienceLabel(audience).toLowerCase()}`)
    .join(', ');
  const exportHasUnpublishedChanges = dirty || stagedDraftDirty || baseMapUploading || saving;
  const quarantinedObjectsOmitted = structuralRecoveryPending
    || baseImageIntegrityIssues.length > 0
    || duplicateRecoveryPending
    || spacePointLinkCollisionPending
    || routeReferenceRecoveryPending
    || authoredZeroGeometryRoutes.length > 0
    || rainContingencyCollisionRecoveryPending
    || drawingIntegrityRecoveryPending;
  const visiblePublicationRepairPending = textIntegrityIssues.length > 0
    || audienceIntegrityIssues.length > 0
    || arrivalRoleIntegrityIssues.length > 0
    || routeAccessibilityIntegrityIssues.length > 0
    || invalidAuthoredDrawings.length > 0
    || invalidSpacePointLinks.length > 0
    || invalidRainContingencies.length > 0
    || invalidEventScopeObjects.length > 0
    || routeDeliveryIssues.length > 0
    || invalidGpsPoints.length > 0;
  const recoveryExportPending = quarantinedObjectsOmitted
    || visiblePublicationRepairPending
    || unmanagedCloudBaseMap;
  const exportSourceLabel = mapFrameRecoveryPending
    ? 'Frame recovery map — portals receive no map'
    : quarantinedObjectsOmitted
      ? 'Recovery map — quarantined objects omitted'
      : visiblePublicationRepairPending || unmanagedCloudBaseMap
        ? 'Admin recovery map — portal publication blocked'
        : exportHasUnpublishedChanges
          ? 'Unpublished working draft'
          : 'Saved canonical map';
  const exportSourceSlug = recoveryExportPending
    ? 'recovery-not-publishable'
    : exportHasUnpublishedChanges
      ? 'unpublished-draft'
      : 'saved-map';
  const previewScopeEntries = validPreviewVenueIds
    .map((venueId) => ({
      id: venueId,
      name: venues.find((venue) => venue.id === venueId)?.name?.trim() || venueId,
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const previewScopeNames = previewScopeEntries.map(({ name }) => name);
  const boundedPreviewScopeNames = previewScopeNames.map((name) => {
    const printable = name.replace(/[|\r\n]+/g, ' ').trim();
    return printable.length > 36 ? `${printable.slice(0, 33)}…` : printable;
  });
  const guestPreviewScopeCode = previewScopeEntries.length > 0
    ? venueMapScopeArtifactCode(previewScopeEntries.map(({ id }) => id))
    : 'global-only';
  const guestPreviewScopeLabel = boundedPreviewScopeNames.length === 0
    ? 'global guest layers only; no wedding spaces selected'
    : `wedding spaces: ${boundedPreviewScopeNames.slice(0, 3).join(', ')}${boundedPreviewScopeNames.length > 3 ? ` +${boundedPreviewScopeNames.length - 3} more` : ''} (scope ${guestPreviewScopeCode})`;
  const guestPreviewScopeBaseSlug = previewScopeNames
    .slice(0, 2)
    .join('-')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 64);
  const guestPreviewScopeSlug = previewScopeNames.length === 0
    ? 'global-only'
    : `${guestPreviewScopeBaseSlug || `${previewScopeNames.length}-spaces`}${previewScopeNames.length > 2 ? `-plus-${previewScopeNames.length - 2}` : ''}-scope-${guestPreviewScopeCode}`;
  const exportAudienceLabel = previewAudience === 'guest'
    ? `Guest portal preview — ${guestPreviewScopeLabel}`
    : previewAudience === 'couple'
      ? 'Couple portal preview'
      : 'Staff master — internal venue use';
  const exportAudienceSlug = previewAudience === 'guest'
    ? `guest-preview-${guestPreviewScopeSlug}`
    : previewAudience === 'couple'
      ? 'couple-preview'
      : 'staff-master';
  const exportButtonAudience = previewAudience === 'guest'
    ? 'Guest preview'
    : previewAudience === 'couple'
      ? 'Couple preview'
      : 'Staff master';
  const previewProjectedMap = previewAudience
    ? projectVenueMap(
        map,
        previewAudience,
        previewAudience === 'guest' ? validPreviewVenueIds : undefined,
        { managedBaseImageOnly: cloudMode, venues },
      )
    : null;
  const staffProjectedMap = projectVenueMap(
    map,
    'staff',
    undefined,
    { managedBaseImageOnly: cloudMode, venues },
  );
  const exportProjectedMap = previewProjectedMap || staffProjectedMap;
  const exportLegendKinds = KINDS.filter((kind) =>
    exportProjectedMap.points.some((point) => point.kind === kind),
  );
  const exportPointGuidanceItems = buildVenueMapPointGuidanceItems(
    exportProjectedMap.points,
  );
  const exportDrawingGuidanceItems = buildVenueMapDrawingGuidanceItems(
    exportProjectedMap.drawings || [],
  );
  const exportRouteGuidanceItems = buildVenueMapRouteGuidanceItems(
    exportProjectedMap.routes || [],
  );
  const exportRainGuidanceItems = buildVenueMapRainPlanGuidanceItems(
    exportProjectedMap.rainContingencies || [],
    venues,
  );
  const exportSupplementalSections = [
    ...(exportLegendKinds.length > 0
      ? [{
          heading: 'Map symbol legend',
          entries: exportLegendKinds.map((kind) =>
            `${pointKindIcon(kind)} ${pointKindLabel(kind)}`,
          ),
        }]
      : []),
    ...(exportPointGuidanceItems.length > 0
      ? [{
          heading: 'Location & arrival notes',
          entries: exportPointGuidanceItems.map((item) =>
            `${item.name} — ${item.kind} — ${item.guidance}`,
          ),
        }]
      : []),
    ...(exportDrawingGuidanceItems.length > 0
      ? [{
          heading: 'Map annotations',
          entries: exportDrawingGuidanceItems.map((item) =>
            `${item.text} — ${item.type}`,
          ),
        }]
      : []),
    ...(exportRouteGuidanceItems.length > 0
      ? [{
          heading: 'Walkways & access notes',
          entries: exportRouteGuidanceItems.map((item) =>
            `${item.name} — ${item.priority} · ${item.accessibility}${item.note ? ` — ${item.note}` : ''}`,
          ),
        }]
      : []),
    ...(exportRainGuidanceItems.length > 0
      ? [{
          heading: 'If the venue activates its rain plan',
          entries: exportRainGuidanceItems.map((item) =>
            item.note ? `${item.locationChange} — ${item.note}` : item.locationChange,
          ),
        }]
      : []),
  ];
  const exportPointNames = new Map(
    exportProjectedMap.points.map((point) => [point.id, point.label]),
  );
  const exportAccessibleSections: AccessibleHtmlArtifactSection[] = [
    ...(exportProjectedMap.points.length > 0
      ? [{
          heading: 'Locations',
          entries: exportProjectedMap.points.map((point) => ({
            heading: `${pointKindIcon(point.kind)} ${point.label}`,
            details: [
              `Type: ${pointKindLabel(point.kind)}.`,
              ...(point.kind === 'entry'
                ? [`Arrival role: ${arrivalRoleLabel(point.arrivalRole)}.`]
                : []),
              `Map position: X ${point.x}, Y ${point.y}.`,
              ...(point.venueId
                ? [`Linked venue space: ${venues.find((venue) => venue.id === point.venueId)?.name || point.venueId}.`]
                : []),
              ...(isValidLatitude(point.lat) && isValidLongitude(point.lng)
                ? [`GPS: ${point.lat}, ${point.lng}.`]
                : []),
              ...(point.description ? [`Guidance: ${point.description}`] : []),
            ],
          })),
        }]
      : []),
    ...((exportProjectedMap.routes || []).length > 0
      ? [{
          heading: 'Walkways and access',
          entries: buildVenueMapRouteGuidanceItems(exportProjectedMap.routes || []).map((item) => {
            const route = (exportProjectedMap.routes || []).find((candidate) => candidate.id === item.id)!;
            return {
              heading: item.name,
              details: [
                `Priority: ${item.priority}. Mobility: ${item.accessibility}.`,
                `Ordered stops: ${route.pointIds.map((pointId) => exportPointNames.get(pointId) || pointId).join(' → ')}.`,
                ...(item.note ? [`Guidance or caution: ${item.note}`] : []),
              ],
            };
          }),
        }]
      : []),
    ...((exportProjectedMap.drawings || []).length > 0
      ? [{
          heading: 'Map annotations',
          entries: (exportProjectedMap.drawings || []).map((drawing, index) => {
            const typeLabel = venueMapDrawingTypeLabel(drawing.type);
            const geometry = drawing.type === 'line'
              ? `Vertices: ${(drawing.points || []).map((point) => `(${point.x}, ${point.y})`).join(' → ')}.`
              : drawing.type === 'circle'
                ? `Center: X ${drawing.x}, Y ${drawing.y}; radius ${drawing.radius}.`
                : `Position: X ${drawing.x}, Y ${drawing.y}; width ${drawing.width}, height ${drawing.height}; rotation ${drawing.rotation || 0} degrees.`;
            return {
              heading: drawing.text?.trim() ? drawing.text : `${typeLabel} ${index + 1}`,
              details: [`Type: ${typeLabel}.`, geometry],
            };
          }),
        }]
      : []),
    ...(exportRainGuidanceItems.length > 0
      ? [{
          heading: 'Rain plan',
          entries: exportRainGuidanceItems.map((item) => ({
            heading: item.locationChange,
            details: item.note ? [item.note] : [],
          })),
        }]
      : []),
  ];
  const exportArtifactFilename = `${venueMapArtifactFilenameBase(mapTitle)}-${exportSourceSlug}-${exportAudienceSlug}`;

  const exportAccessibleHtml = () => {
    try {
      downloadAccessibleHtmlArtifact(exportArtifactFilename, {
        title: mapTitle?.trim() || 'Venue Map',
        summary: `${exportProjectedMap.points.length} mapped locations, ${(exportProjectedMap.routes || []).length} walkways, and ${(exportProjectedMap.drawings || []).length} property annotations.`,
        metadata: [
          { label: 'Artifact source', value: exportSourceLabel },
          { label: 'Audience and scope', value: exportAudienceLabel },
          { label: 'Map dimensions', value: `${exportProjectedMap.width} × ${exportProjectedMap.height} map units` },
          { label: 'Exported', value: new Date().toLocaleString() },
        ],
        sections: exportAccessibleSections,
      });
      showToast(`${exportSourceLabel} · ${exportAudienceLabel} accessible HTML exported.`, 'success');
    } catch (error) {
      showToast(describeUnknownError(error, 'Could not export the accessible venue map.'), 'warning');
    }
  };

  const pendingArtifactBackgroundSource = pendingVisualArtifact?.map.backgroundImageUrl;
  const pendingArtifactBaseMapState: VenueMapBackgroundLoadSnapshot['state'] =
    !pendingVisualArtifact
      ? 'none'
      : pendingVisualArtifact.map.backgroundImageUnavailable
        ? 'error'
        : !pendingArtifactBackgroundSource
          ? 'none'
          : artifactBaseMapLoadSnapshot.source === pendingArtifactBackgroundSource
            ? artifactBaseMapLoadSnapshot.state
            : 'loading';

  const queueVisualArtifact = (kind: PendingVenueMapVisualArtifact['kind']) => {
    if (mapComplexityRecoveryPending) {
      showToast('Download the original recovery JSON, then reset this oversized map before creating a visual artifact.', 'warning');
      return;
    }
    if (mapFrameRecoveryPending) {
      showToast('Accept valid map dimensions or reset the Venue Map before creating a visual artifact.', 'warning');
      return;
    }
    const preparedAt = new Date();
    artifactRequestSequenceRef.current += 1;
    artifactExecutionRef.current = null;
    artifactSvgRef.current = null;
    setArtifactBaseMapLoadSnapshot({ state: 'none' });
    setPendingVisualArtifact({
      id: artifactRequestSequenceRef.current,
      kind,
      map: exportProjectedMap,
      filename: exportArtifactFilename,
      sourceLabel: exportSourceLabel,
      audienceLabel: exportAudienceLabel,
      preparedAt: preparedAt.toLocaleString(),
      venues: [...venues],
      options: {
        scale: venueMapArtifactRasterScale(
          exportProjectedMap.width,
          exportProjectedMap.height,
        ),
        headerText: mapTitle?.trim() || 'Venue Map',
        footerText: `${exportSourceLabel} | ${exportAudienceLabel} | Exported ${preparedAt.toLocaleDateString()}`,
        supplementalSections: exportSupplementalSections,
      },
    });
  };

  useEffect(() => {
    const request = pendingVisualArtifact;
    if (!request || artifactExecutionRef.current === request.id) return;
    if (pendingArtifactBaseMapState === 'loading') return;

    artifactExecutionRef.current = request.id;
    if (pendingArtifactBaseMapState === 'error') {
      showToast(
        'The projected base map is unavailable, so the visual artifact was not created. Retry it, upload a managed replacement, or remove the broken base map first.',
        'warning',
      );
      setPendingVisualArtifact((current) => current?.id === request.id ? null : current);
      return;
    }

    const svg = artifactSvgRef.current;
    if (!svg || (pendingArtifactBackgroundSource && !svg.querySelector('image'))) {
      showToast('The projected Venue Map is not ready yet. Try creating the visual artifact again.', 'warning');
      setPendingVisualArtifact((current) => current?.id === request.id ? null : current);
      return;
    }

    void (async () => {
      try {
        if (request.kind === 'png') {
          await downloadLayoutPng(svg, request.filename, request.options);
          showToast(`${request.sourceLabel} · ${request.audienceLabel} exported (PNG).`, 'success');
        } else if (request.kind === 'pdf') {
          await downloadLayoutPdf(svg, request.filename, request.options);
          showToast(`${request.sourceLabel} · ${request.audienceLabel} exported (PDF).`, 'success');
        } else {
          window.print();
          showToast(`${request.sourceLabel} · ${request.audienceLabel} opened for printing.`, 'success');
        }
      } catch (error) {
        showToast(
          describeUnknownError(
            error,
            request.kind === 'print'
              ? 'Could not prepare the venue map for printing.'
              : 'Could not export the venue map. Try again.',
          ),
          'warning',
        );
      } finally {
        artifactExecutionRef.current = null;
        setPendingVisualArtifact((current) => current?.id === request.id ? null : current);
      }
    })();
  }, [
    pendingArtifactBackgroundSource,
    pendingArtifactBaseMapState,
    pendingVisualArtifact,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 no-print spm-studio-chrome">
        <span className="font-semibold text-gray-800">🗺️ Full-Venue Map Designer</span>
        <span className="text-xs text-gray-500">
          {summary.spaces} spaces · {summary.lodging} lodging · {summary.parking} parking · {summary.entries} entries
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={undoStack.length === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo (Ctrl/Cmd+Z)"
          >
            ↩ Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={redoStack.length === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            Redo ↪
          </button>
          <button
            type="button"
            disabled={mapFrameRecoveryPending || mapComplexityRecoveryPending}
            onClick={() => {
              if (previewAudience) setPreviewAudience(null);
              else {
                setPreviewVenueIds(initialPreviewVenueId ? [initialPreviewVenueId] : []);
                setPreviewAudience('guest');
              }
            }}
            className={`px-3 py-1.5 rounded-lg border text-sm disabled:cursor-not-allowed disabled:opacity-50 ${previewAudience ? 'bg-teal-700 border-teal-700 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            title={mapComplexityRecoveryPending
              ? 'Audience previews are unavailable until the oversized map is downloaded and reset'
              : mapFrameRecoveryPending
                ? 'Audience previews are unavailable until the map frame is accepted or reset'
                : 'Preview audience-visible map layers'}
          >
            {previewAudience ? '✕ Exit preview' : '👁 Preview audiences'}
          </button>
          <button
            type="button"
            disabled={mapComplexityRecoveryPending || mapFrameRecoveryPending || pendingVisualArtifact !== null}
            onClick={() => queueVisualArtifact('png')}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={mapComplexityRecoveryPending
              ? 'Download the original recovery JSON instead'
              : mapFrameRecoveryPending
                ? 'Accept or reset the saved map dimensions before exporting'
                : 'Create a PNG from the exact projected artifact map'}
          >
            🖼️ {exportButtonAudience} PNG
          </button>
          <button
            type="button"
            disabled={mapComplexityRecoveryPending || mapFrameRecoveryPending || pendingVisualArtifact !== null}
            onClick={() => queueVisualArtifact('pdf')}
            aria-label={`${exportButtonAudience} PDF — visual map; use accessible HTML for a text version`}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={mapComplexityRecoveryPending
              ? 'Download the original recovery JSON instead'
              : mapFrameRecoveryPending
                ? 'Accept or reset the saved map dimensions before exporting'
                : 'Visual map PDF from the exact projected artifact map; use Accessible HTML for semantic text'}
          >
            📄 {exportButtonAudience} Visual PDF
          </button>
          <button
            type="button"
            disabled={mapComplexityRecoveryPending}
            onClick={exportAccessibleHtml}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={mapComplexityRecoveryPending ? 'Download the original recovery JSON instead' : `Download semantic text for ${exportAudienceLabel}`}
          >
            ♿ {exportButtonAudience} Accessible HTML
          </button>
          <button
            type="button"
            disabled={mapComplexityRecoveryPending || mapFrameRecoveryPending || pendingVisualArtifact !== null}
            onClick={() => queueVisualArtifact('print')}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 no-print disabled:cursor-not-allowed disabled:opacity-50"
            title={mapComplexityRecoveryPending
              ? 'Download the original recovery JSON instead'
              : mapFrameRecoveryPending
                ? 'Accept or reset the saved map dimensions before printing'
                : `Prepare and print ${exportAudienceLabel}`}
          >
            🖨️ Print {exportButtonAudience}
          </button>
        </div>
      </div>

      {pendingVisualArtifact && (
        <div
          className="no-print spm-studio-chrome flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"
          role="status"
          aria-live="polite"
        >
          <span>
            Preparing the projected {pendingVisualArtifact.kind === 'print'
              ? 'printout'
              : pendingVisualArtifact.kind.toUpperCase()}{pendingArtifactBaseMapState === 'loading'
              ? ' — waiting for the complete base map to decode.'
              : '…'}
          </span>
          {pendingArtifactBaseMapState === 'loading' && (
            <button
              type="button"
              onClick={() => setPendingVisualArtifact(null)}
              className="min-h-8 rounded border border-sky-300 bg-white px-2 py-1 font-semibold hover:bg-sky-100"
            >
              Cancel artifact preparation
            </button>
          )}
        </div>
      )}

      <div
        className={`rounded-lg border px-3 py-2 text-xs ${
          exportSourceSlug !== 'saved-map' || (!previewAudience && restrictedLayerCount > 0)
            ? 'border-amber-300 bg-amber-50 text-amber-950'
            : previewAudience
              ? 'border-teal-300 bg-teal-50 text-teal-900'
              : 'border-gray-200 bg-gray-50 text-gray-700'
        }`}
        role="status"
        aria-live="polite"
      >
        <span className="font-semibold">Export/print source: {exportSourceLabel}. Audience: {exportAudienceLabel}.</span>{' '}
        {exportSourceSlug !== 'saved-map'
          ? 'This output does not represent the map currently available in portals.'
          : previewAudience
            ? 'Files and printouts contain the saved audience projection currently shown below.'
            : restrictedLayerCount > 0
              ? `Includes ${restrictedLayerCount} couple/staff-only ${restrictedLayerCount === 1 ? 'layer' : 'layers'}; do not distribute as a guest map.`
              : 'This is still the complete venue-authored map; use an audience preview before guest distribution.'}
      </div>

      {guestRouteCoverageIssues.length > 0 && (
        <section
          className="no-print rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950 spm-studio-chrome"
          aria-labelledby="guest-route-coverage-heading"
          role="status"
          aria-live="polite"
        >
          <h3
            id="guest-route-coverage-heading"
            ref={routeCoverageHeadingRef}
            tabIndex={-1}
            className="font-semibold"
          >
            Wayfinding coverage review: {guestRouteCoverageIssues.length} guest {guestRouteCoverageIssues.length === 1 ? 'destination needs' : 'destinations need'} attention
          </h3>
          <p className="mt-1">
            Review the exact destination and wedding-scope gaps below. The designer will not invent missing pins, routes, or accessibility claims. You may still publish an informational map after explicitly confirming these known gaps.
          </p>
          <ul className="mt-2 space-y-1.5">
            {guestRouteCoverageIssues.map((issue) => (
              <li key={`${issue.kind}:${issue.pointId || issue.venueId}`} className="rounded border border-amber-200 bg-white px-2 py-1.5">
                <span className="font-semibold">{issue.pointLabel} · {issue.venueName}</span>
                <span className="block">{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {baseImageIntegrityIssues.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-950 spm-studio-chrome" aria-labelledby="base-image-integrity-heading">
          <h3 id="base-image-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: the saved base-map configuration needs repair
          </h3>
          <ul className="mt-1 space-y-1">
            {baseImageIntegrityIssues.map((issue) => (
              <li key={issue.field} className="rounded border border-red-200 bg-white px-2 py-1.5">
                {issue.message} Saved value {recoveryValueLabel(issue.savedValue)}.
              </li>
            ))}
          </ul>
          <p className="mt-1">The unsafe base image is not rendered on this canvas and is omitted from Couple and Guest portals. Replace it below, reset only its opacity, or remove it explicitly.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {baseImageIntegrityIssues.some((issue) => issue.field === 'backgroundOpacity')
              && hasSavedBackgroundImage && (
              <button
                type="button"
                onClick={() => {
                  pushUndo(map);
                  update({ ...map, backgroundOpacity: 0.85, updatedAt: new Date().toISOString() });
                }}
                className="min-h-8 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50"
              >
                Reset opacity to 85%
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                pushUndo(map);
                update(updateMapBackground(map, undefined, undefined));
                setBgUrlInput('');
              }}
              className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold text-red-800 hover:bg-red-100"
            >
              Remove saved base map
            </button>
          </div>
        </section>
      )}

      {structuralRecoveryPending && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-950 spm-studio-chrome" aria-labelledby="structural-map-recovery-heading">
          <h3 id="structural-map-recovery-heading" className="font-semibold">
            <span role="alert">
              Publication blocked: {structuralRecoveryArtifacts.length} malformed saved map {structuralRecoveryArtifacts.length === 1 ? 'occurrence requires' : 'occurrences require'} an explicit decision
            </span>
          </h3>
          <p className="mt-1">
            These records are retained only in the admin recovery layer and are never sent to Couple or Guest portals. Accept a valid recovered frame, deliberately reconstruct a typed object, download an oversized source, remove an occurrence, or reset the map.
          </p>
          <div className="mt-3 space-y-3">
            {structuralRecoveryArtifacts.map((artifact, index) => (
              <article key={artifact.key} className="rounded-lg border border-red-200 bg-white p-2" aria-label={`Malformed saved map occurrence ${index + 1}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold capitalize">
                      {artifact.family === 'map'
                        ? artifact.mapComplexityExceeded
                          ? 'Oversized Venue Map'
                          : artifact.mapFrameMalformed
                            ? 'Venue Map frame'
                            : structuralRecoveryFamilyLabel(artifact.family)
                        : `${structuralRecoveryFamilyLabel(artifact.family)} ${artifact.collectionMalformed ? 'collection' : `occurrence ${artifact.occurrenceIndex + 1}`}`}
                    </p>
                    <ul className="mt-0.5 list-disc pl-4 text-red-800">
                      {artifact.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  </div>
                  <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px]">Recovery only · {artifact.key}</span>
                </div>

                {artifact.family === 'map' && artifact.mapFrameMalformed && (
                  <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                    All spatial objects remain admin-recoverable, but no portal receives this map until you use Map settings to choose valid dimensions and explicitly accept the repaired frame. The current recovery frame is {map.width} × {map.height}.
                  </p>
                )}

                {artifact.family === 'map' && artifact.mapComplexityExceeded && (
                  <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-amber-950">
                    The working canvas is intentionally empty so this page stays responsive. Download the {quarantinedMapRecoveryRedactedRef.current ? 'secret-redacted recovery source' : 'exact admin-only source'} before resetting it; the current canonical server row is not rewritten until you explicitly save the reset map.
                  </p>
                )}

                {!artifact.collectionMalformed && artifact.family !== 'map' && (
                  <div className="mt-2 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <label className="text-[11px] font-medium text-gray-700">
                        Canonical ID
                        <input
                          type="text"
                          maxLength={VENUE_MAP_MAX_IDENTIFIER_LENGTH}
                          value={artifact.candidate.id || ''}
                          onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                            id: event.target.value,
                          })}
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
                          aria-label={`Canonical ID for malformed ${structuralRecoveryFamilyLabel(artifact.family)} occurrence ${index + 1}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => generateStructuralRecoveryId(artifact)}
                        className="min-h-9 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50"
                        aria-label={`Generate a new ID for malformed map occurrence ${index + 1}`}
                      >
                        Generate new ID
                      </button>
                    </div>

                    {artifact.family === 'point' && (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[11px] font-medium text-gray-700">Point label
                            <input
                              type="text"
                              maxLength={200}
                              value={artifact.candidate.label || ''}
                              onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                                label: event.target.value,
                              })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                            />
                          </label>
                          <label className="text-[11px] font-medium text-gray-700">Point type
                            <select
                              value={artifact.candidate.kind || ''}
                              onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                                kind: event.target.value || undefined,
                              })}
                              className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="">Choose a point type</option>
                              {KINDS.map((kind) => <option key={kind} value={kind}>{pointKindLabel(kind)}</option>)}
                            </select>
                          </label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[11px] font-medium text-gray-700">Horizontal position (0–{map.width})
                            <input
                              type="number"
                              min={0}
                              max={map.width}
                              step="any"
                              value={Number.isFinite(artifact.candidate.x) ? artifact.candidate.x : ''}
                              onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                                x: event.target.value === '' ? undefined : Number(event.target.value),
                              })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                              aria-label={`Horizontal position for malformed point occurrence ${index + 1}`}
                            />
                          </label>
                          <label className="text-[11px] font-medium text-gray-700">Vertical position (0–{map.height})
                            <input
                              type="number"
                              min={0}
                              max={map.height}
                              step="any"
                              value={Number.isFinite(artifact.candidate.y) ? artifact.candidate.y : ''}
                              onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                                y: event.target.value === '' ? undefined : Number(event.target.value),
                              })}
                              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                              aria-label={`Vertical position for malformed point occurrence ${index + 1}`}
                            />
                          </label>
                        </div>
                      </>
                    )}

                    {artifact.family === 'route' && (
                      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                        <label className="text-[11px] font-medium text-gray-700">Walkway name
                          <input
                            type="text"
                            maxLength={200}
                            value={artifact.candidate.name || ''}
                            onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                              name: event.target.value,
                            })}
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                          />
                        </label>
                        <span className="pb-2 text-[10px] text-gray-500">
                          {artifact.candidate.pointIds?.length || 0} recovered ordered point references
                        </span>
                      </div>
                    )}

                    {artifact.family === 'drawing' && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[11px] font-medium text-gray-700">Shape label
                          <input
                            type="text"
                            maxLength={300}
                            value={artifact.candidate.text || ''}
                            onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                              text: event.target.value,
                            })}
                            className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                          />
                        </label>
                        <label className="text-[11px] font-medium text-gray-700">Shape type
                          <select
                            value={['zone', 'rectangle', 'circle', 'line'].includes(artifact.candidate.type || '')
                              ? artifact.candidate.type
                              : ''}
                            onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                              type: event.target.value || undefined,
                            })}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="">Choose a shape type</option>
                            <option value="zone">Zone</option>
                            <option value="rectangle">Rectangle</option>
                            <option value="circle">Circle</option>
                            <option value="line">Line</option>
                          </select>
                        </label>
                      </div>
                    )}

                    {artifact.family === 'rainContingency' && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[11px] font-medium text-gray-700">Outdoor source
                          <select
                            value={artifact.candidate.outdoorVenueId || ''}
                            onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                              outdoorVenueId: event.target.value || undefined,
                            })}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="">Choose an outdoor source</option>
                            {outdoorVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] font-medium text-gray-700">Indoor backup
                          <select
                            value={artifact.candidate.indoorVenueId || ''}
                            onChange={(event) => updateStructuralRecoveryCandidate(artifact.key, {
                              indoorVenueId: event.target.value || undefined,
                            })}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                          >
                            <option value="">Choose an indoor backup</option>
                            {indoorVenues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {artifact.family === 'map' && artifact.mapComplexityExceeded ? (
                    <>
                      <button
                        type="button"
                        onClick={downloadComplexityRecovery}
                        className="min-h-9 rounded bg-[#4A1942] px-3 py-1.5 font-semibold text-white hover:bg-[#3b1435]"
                      >
                        Download {quarantinedMapRecoveryRedactedRef.current ? 'redacted' : 'original'} recovery JSON
                      </button>
                      <button
                        type="button"
                        disabled={!complexityRecoveryDownloaded}
                        onClick={() => setConfirmResetMalformedMap(true)}
                        className="min-h-9 rounded border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title={complexityRecoveryDownloaded
                          ? 'Confirm a new empty working map'
                          : 'Download the recovery JSON before resetting this map'}
                      >
                        Reset Venue Map
                      </button>
                    </>
                  ) : artifact.family === 'map' && artifact.mapFrameMalformed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => acceptRecoveredMapFrame(artifact.key)}
                        className="min-h-9 rounded bg-[#4A1942] px-3 py-1.5 font-semibold text-white hover:bg-[#3b1435]"
                        aria-label={`Accept repaired Venue Map frame ${map.width} by ${map.height}`}
                      >
                        Accept current dimensions
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetMalformedMap(true)}
                        className="min-h-9 rounded border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100"
                      >
                        Reset Venue Map instead
                      </button>
                    </>
                  ) : (
                    <>
                      {!artifact.collectionMalformed && artifact.family !== 'map' && (
                        <button
                          type="button"
                          onClick={() => reconstructStructuralRecoveryArtifact(artifact)}
                          className="min-h-9 rounded bg-[#4A1942] px-3 py-1.5 font-semibold text-white hover:bg-[#3b1435]"
                          aria-label={`Reconstruct malformed map occurrence ${index + 1}`}
                        >
                          Reconstruct object
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeStructuralRecoveryArtifact(artifact.key)}
                        className="min-h-9 rounded border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800 hover:bg-red-100"
                        aria-label={`Remove malformed saved map occurrence ${index + 1}`}
                      >
                        {artifact.collectionMalformed ? 'Discard malformed collection' : 'Remove occurrence'}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <p className="mt-2 font-medium">No generated or temporary recovery key becomes canonical until you explicitly reconstruct the object and publish.</p>
        </section>
      )}

      {duplicateRecoveryPending && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-950 spm-studio-chrome" aria-labelledby="duplicate-map-identity-heading">
          <h3 id="duplicate-map-identity-heading" className="font-semibold">
            <span role="alert">Publication blocked: duplicated map identities require recovery</span>
          </h3>
          <p className="mt-1">
            Every ambiguous occurrence is quarantined off the working canvas and out of portal projections. Choose explicitly which occurrence keeps the original ID; when only one remains after re-ID/removal, that occurrence keeps it. Re-ID’d points begin unlinked while existing walkways remain anchored to the occurrence you keep.
          </p>
          <div className="mt-3 space-y-3">
            {duplicateIdentityGroups.map((group) => (
              <div key={`${group.family}:${group.id}`} className="rounded-lg border border-red-200 bg-white p-2">
                <p className="font-semibold">
                  Duplicate {duplicateIdentityFamilyLabel(group.family)} ID “{group.id}” — {group.objects.length} occurrences
                </p>
                <ol className="mt-2 space-y-2">
                  {group.objects.map((object, index) => {
                    const occurrenceLabel = duplicateIdentityObjectLabel(group.family, object, index);
                    return (
                      <li key={`${group.family}:${group.id}:${index}`} className="rounded border border-gray-200 bg-gray-50 p-2">
                        <p className="font-medium text-gray-800">{index + 1}. {occurrenceLabel}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => recoverDuplicateIdentity(group, index, 'keep-and-reid')}
                            className="min-h-8 rounded bg-[#4A1942] px-2 py-1 font-semibold text-white hover:bg-[#3b1435]"
                            aria-label={`Keep occurrence ${index + 1}, ${occurrenceLabel}, with original ID ${group.id} and re-ID the other occurrences`}
                          >
                            Keep this; re-ID others
                          </button>
                          <button
                            type="button"
                            onClick={() => recoverDuplicateIdentity(group, index, 'reid')}
                            className="min-h-8 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50"
                            aria-label={`Assign a new ID to occurrence ${index + 1}, ${occurrenceLabel}`}
                          >
                            Assign new ID
                          </button>
                          <button
                            type="button"
                            onClick={() => recoverDuplicateIdentity(group, index, 'remove')}
                            className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold text-red-700 hover:bg-red-100"
                            aria-label={`Remove duplicate occurrence ${index + 1}, ${occurrenceLabel}`}
                          >
                            Remove occurrence
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
          {duplicateDependentRoutes.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-950">
              <p className="font-semibold">
                {duplicateDependentRoutes.length} affected {duplicateDependentRoutes.length === 1 ? 'walkway is' : 'walkways are'} temporarily quarantined
              </p>
              <p className="mt-0.5">
                {duplicateDependentRoutes.map((route) => route.name).join(', ')}. Each returns unchanged after one occurrence of every referenced point ID is explicitly kept.
              </p>
            </div>
          )}
          <p className="mt-2 font-medium">Recovery choices affect only this draft until you publish. Leave the designer without publishing to discard them.</p>
        </section>
      )}

      {spacePointLinkCollisionPending && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-950 spm-studio-chrome" aria-labelledby="space-pin-collision-heading">
          <h3 id="space-pin-collision-heading" className="font-semibold">
            <span role="alert">Publication blocked: multiple destination pins link to the same venue</span>
          </h3>
          <p className="mt-1">
            Couple and Guest maps omit every ambiguous occurrence and any dependent walkway. Keep one canonical pin, or review each pin to relink it, change its kind, or remove it.
          </p>
          <div className="mt-3 space-y-3">
            {spacePointLinkCollisionGroups.map((group) => (
              <div key={group.venueId} className="rounded-lg border border-red-200 bg-white p-2">
                <p className="font-semibold">
                  {linkedVenueName(group.venueId)} — {group.points.length} linked destination pins
                </p>
                <ol className="mt-2 space-y-2">
                  {group.points.map((point, index) => (
                    <li key={point.id} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 p-2">
                      <span className="mr-auto font-medium text-gray-800">
                        {index + 1}. {point.label} at X {point.x}, Y {point.y}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewAudience(null);
                          setInteractionMode('select');
                          handleSelectPoint(point.id);
                        }}
                        className="min-h-8 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50"
                        aria-label={`Review duplicate venue pin ${point.label}`}
                      >
                        Review pin
                      </button>
                      <button
                        type="button"
                        onClick={() => keepCanonicalSpacePoint(group.venueId, point.id)}
                        className="min-h-8 rounded bg-[#4A1942] px-2 py-1 font-semibold text-white hover:bg-[#3b1435]"
                        aria-label={`Keep ${point.label} as the canonical pin for ${linkedVenueName(group.venueId)} and remove the other linked pins`}
                      >
                        Keep this; remove others
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="mt-2 font-medium">All choices stay in this working draft until Save &amp; publish.</p>
        </section>
      )}

      {routeReferenceRecoveryPending && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-950 spm-studio-chrome" aria-labelledby="route-reference-recovery-heading">
          <h3 id="route-reference-recovery-heading" className="font-semibold">
            <span role="alert">Publication blocked: {routeReferenceQuarantine.length} {routeReferenceQuarantine.length === 1 ? 'walkway has' : 'walkways have'} unsafe or unavailable routing data</span>
          </h3>
          <p className="mt-1">
            Each whole walkway is quarantined so an invalid priority cannot become a routine guest route, invalid mobility data cannot become guest guidance, a missing intermediate point cannot become a false direct segment, and same-position stops cannot claim an invisible route. Choose valid statuses, repair or rebuild its ordered sequence explicitly, or remove the walkway.
          </p>
          <div className="mt-3 space-y-3">
            {routeReferenceQuarantine.map((route) => {
              const issues = venueMapRouteReferenceIssues(route, map.points);
              const priorityIssue = venueMapRoutePriorityIssue(route);
              const accessibilityIssue = venueMapRouteAccessibilityIssue(route);
              const issueByIndex = new Map(issues.map((issue) => [issue.index, issue]));
              const canApply = !priorityIssue
                && !accessibilityIssue
                && route.pointIds.length >= 2
                && issues.length === 0;
              return (
                <div key={route.id} className="rounded-lg border border-red-200 bg-white p-2">
                  <p className="font-semibold">Walkway “{route.name}”</p>
                  <label className="mt-2 block text-[11px] font-medium text-gray-700">
                    Routing priority
                    <select
                      value={priorityIssue ? '' : route.priority || 'standard'}
                      onChange={(event) => updateQuarantinedRoutePriority(
                        route.id,
                        event.target.value as VenueMapRoutePriority,
                      )}
                      className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                      aria-label={`Recovery priority for ${route.name}`}
                    >
                      {priorityIssue && <option value="" disabled>Invalid saved priority — choose a safe value</option>}
                      {MAP_ROUTE_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>{routePriorityLabel(priority)}</option>
                      ))}
                    </select>
                  </label>
                  {priorityIssue && (
                    <p className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-800" role="alert">
                      {priorityIssue} The route remains hidden from Couple and Guest portals.
                    </p>
                  )}
                  <label className="mt-2 block text-[11px] font-medium text-gray-700">
                    Mobility status
                    <select
                      value={accessibilitySelectValue(route.accessibility as unknown)}
                      onChange={(event) => updateQuarantinedRouteAccessibility(
                        route.id,
                        event.target.value as VenueMapRouteAccessibility,
                      )}
                      className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                      aria-label={`Recovery mobility status for ${route.name}`}
                      aria-invalid={Boolean(accessibilityIssue)}
                    >
                      {accessibilityIssue && <option value="" disabled>Invalid saved mobility status — choose a safe value</option>}
                      <option value="unknown">Not verified</option>
                      <option value="step-free">Verified step-free</option>
                      <option value="not-step-free">Not step-free</option>
                    </select>
                  </label>
                  {accessibilityIssue && (
                    <p className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-800" role="alert">
                      {accessibilityIssue} Saved value {recoveryValueLabel((route as unknown as { accessibility?: unknown }).accessibility)}.
                    </p>
                  )}
                  {route.pointIds.length < 2 && (
                    <p className="mt-1 rounded border border-red-200 bg-red-50 px-2 py-1 font-medium text-red-800">
                      At least two distinct current map points are required.
                    </p>
                  )}
                  <ol className="mt-2 space-y-1.5">
                    {route.pointIds.map((pointId, index) => {
                      const issue = issueByIndex.get(index);
                      const linkedPoint = map.points.find((point) => point.id === pointId);
                      const issueText = issue?.reason === 'malformed'
                        ? 'Malformed saved reference'
                        : issue?.reason === 'unavailable'
                          ? `Unavailable point ID “${pointId}”`
                          : issue?.reason === 'ambiguous'
                            ? `Ambiguous point ID “${pointId}”`
                            : issue?.reason === 'duplicate'
                              ? `Repeated point “${linkedPoint?.label || pointId}”`
                              : issue?.reason === 'coincident'
                                ? 'Same position as every other stop'
                                : null;
                      return (
                        <li key={`${route.id}:${index}`} className={`rounded border p-2 ${issue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex flex-wrap items-end gap-1.5">
                            <label className="min-w-48 flex-1 text-[11px] font-medium text-gray-700">
                              Stop {index + 1}{issueText ? ` — ${issueText}` : ''}
                              <select
                                value={linkedPoint && issue?.reason !== 'ambiguous' ? pointId : ''}
                                onChange={(event) => {
                                  if (!event.target.value) return;
                                  const next = [...route.pointIds];
                                  next[index] = event.target.value;
                                  updateQuarantinedRoutePoints(route.id, next);
                                }}
                                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                                aria-label={`Replacement for stop ${index + 1} of ${route.name}`}
                              >
                                <option value="">Choose a current map point</option>
                                {map.points.map((point) => (
                                  <option key={point.id} value={point.id}>{point.label}</option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => {
                                const next = [...route.pointIds];
                                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                updateQuarantinedRoutePoints(route.id, next);
                              }}
                              className="min-h-8 rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
                              aria-label={`Move stop ${index + 1} earlier in ${route.name}`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={index === route.pointIds.length - 1}
                              onClick={() => {
                                const next = [...route.pointIds];
                                [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                updateQuarantinedRoutePoints(route.id, next);
                              }}
                              className="min-h-8 rounded border border-gray-300 bg-white px-2 py-1 disabled:opacity-40"
                              aria-label={`Move stop ${index + 1} later in ${route.name}`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => updateQuarantinedRoutePoints(
                                route.id,
                                route.pointIds.filter((_, candidateIndex) => candidateIndex !== index),
                              )}
                              className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold text-red-700 hover:bg-red-100"
                              aria-label={`Remove stop ${index + 1} from ${route.name}`}
                            >
                              Remove stop
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 p-2">
                    <label className="min-w-48 flex-1 text-[11px] font-medium text-gray-700">
                      Add a current map point
                      <select
                        value={routeRecoveryAddPoint[route.id] || ''}
                        onChange={(event) => setRouteRecoveryAddPoint((current) => ({
                          ...current,
                          [route.id]: event.target.value,
                        }))}
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                        aria-label={`Point to add to ${route.name}`}
                      >
                        <option value="">Choose a point</option>
                        {map.points.map((point) => (
                          <option key={point.id} value={point.id}>{point.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!routeRecoveryAddPoint[route.id]}
                      onClick={() => {
                        const pointId = routeRecoveryAddPoint[route.id];
                        if (!pointId) return;
                        updateQuarantinedRoutePoints(route.id, [...route.pointIds, pointId]);
                        setRouteRecoveryAddPoint((current) => ({ ...current, [route.id]: '' }));
                      }}
                      className="min-h-8 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-40"
                      aria-label={`Add selected stop to ${route.name}`}
                    >
                      Add stop
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canApply}
                      onClick={() => applyQuarantinedRoute(route.id)}
                      className="min-h-9 rounded bg-[#4A1942] px-3 py-1.5 font-semibold text-white hover:bg-[#3b1435] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Apply repaired walkway ${route.name}`}
                    >
                      Apply repaired walkway
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuarantinedRoute(route.id)}
                      className="min-h-9 rounded border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100"
                      aria-label={`Remove walkway ${route.name} from draft`}
                    >
                      Remove walkway from draft
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 font-medium">Recovery changes remain local until publication. Leave the designer without publishing to discard them.</p>
        </section>
      )}

      {authoredZeroGeometryRoutes.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-xs text-red-950 spm-studio-chrome" aria-labelledby="route-geometry-repair-heading">
          <h3 id="route-geometry-repair-heading" className="font-semibold">
            <span role="alert">
              Publication blocked: {authoredZeroGeometryRoutes.length} {authoredZeroGeometryRoutes.length === 1 ? 'walkway has' : 'walkways have'} no visible length
            </span>
          </h3>
          <p className="mt-1">
            Every walkway must span at least two different map positions. Move one of its linked points or replace a stop; invisible routes are omitted from portals, directions, exports, and coverage checks.
          </p>
          <ul className="mt-2 space-y-1.5">
            {authoredZeroGeometryRoutes.map((route) => (
              <li key={route.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white p-2">
                <span><strong>{route.name}</strong> — all {route.pointIds.length} stops share one position.</span>
                <button
                  type="button"
                  onClick={() => startRename(route.id, route.name)}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Review same-position stops for ${route.name}`}
                >
                  Review walkway
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rainContingencyCollisionRecoveryPending && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950 spm-studio-chrome" aria-labelledby="rain-plan-collision-heading">
          <h3 id="rain-plan-collision-heading" className="font-semibold">
            <span role="alert">
              Publication blocked: {rainContingencyQuarantine.length} duplicate or competing rain {rainContingencyQuarantine.length === 1 ? 'plan requires' : 'plans require'} recovery
            </span>
          </h3>
          <p className="mt-1">
            Every conflicting plan is withheld from Couple and Guest portals. Explicitly re-ID it, move it to another outdoor space, keep only one plan, or remove it.
          </p>
          <div className="mt-2 space-y-2">
            {rainContingencyQuarantine.map((contingency, index) => {
              const collisionIssues = rainContingencyCollisionIssues(
                contingency,
                rainContingencyQuarantine,
              );
              const validationIssue = rainContingencyValidationIssue(contingency, venues);
              const currentSourceAvailable = outdoorVenues.some((venue) =>
                venue.id === contingency.outdoorVenueId,
              );
              const currentBackupAvailable = indoorVenues.some((venue) =>
                venue.id === contingency.indoorVenueId
                  && venue.id !== contingency.outdoorVenueId,
              );
              const sourceUsedElsewhere = new Set([
                ...(map.rainContingencies || []).map((candidate) => candidate.outdoorVenueId),
                ...rainContingencyQuarantine
                  .filter((_, candidateIndex) => candidateIndex !== index)
                  .map((candidate) => candidate.outdoorVenueId),
              ]);
              return (
                <article key={`${contingency.id}:${contingency.outdoorVenueId}:${index}`} className="rounded border border-red-200 bg-white p-2" aria-label={`Quarantined rain plan ${index + 1}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">Plan {index + 1}: {linkedVenueName(contingency.outdoorVenueId)} → {linkedVenueName(contingency.indoorVenueId)}</p>
                      <ul className="mt-0.5 list-disc pl-4 text-red-800">
                        {collisionIssues.map((issue) => <li key={issue}>{issue}</li>)}
                        {validationIssue && <li>{validationIssue}</li>}
                      </ul>
                    </div>
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px]">{contingency.id}</span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-medium text-gray-700">
                      Outdoor source
                      <select
                        value={contingency.outdoorVenueId}
                        onChange={(event) => updateQuarantinedRainContingency(index, {
                          outdoorVenueId: event.target.value,
                        })}
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                        aria-label={`Outdoor source for quarantined rain plan ${index + 1}`}
                      >
                        {!currentSourceAvailable && (
                          <option value={contingency.outdoorVenueId} disabled>
                            Unavailable — {linkedVenueName(contingency.outdoorVenueId)}
                          </option>
                        )}
                        {outdoorVenues.map((venue) => (
                          <option
                            key={venue.id}
                            value={venue.id}
                            disabled={venue.id !== contingency.outdoorVenueId && sourceUsedElsewhere.has(venue.id)}
                          >
                            {venue.name}{sourceUsedElsewhere.has(venue.id) && venue.id !== contingency.outdoorVenueId ? ' — already assigned' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[11px] font-medium text-gray-700">
                      Indoor backup
                      <select
                        value={contingency.indoorVenueId}
                        onChange={(event) => updateQuarantinedRainContingency(index, {
                          indoorVenueId: event.target.value,
                        })}
                        className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs"
                        aria-label={`Indoor backup for quarantined rain plan ${index + 1}`}
                      >
                        {!currentBackupAvailable && (
                          <option value={contingency.indoorVenueId} disabled>
                            Unavailable — {linkedVenueName(contingency.indoorVenueId)}
                          </option>
                        )}
                        {indoorVenues
                          .filter((venue) => venue.id !== contingency.outdoorVenueId)
                          .map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {collisionIssues.some((issue) => issue.includes('Plan ID')) && (
                      <button
                        type="button"
                        onClick={() => reidentifyQuarantinedRainContingency(index)}
                        className="min-h-8 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50"
                        aria-label={`Assign a new ID to quarantined rain plan ${index + 1}`}
                      >
                        Assign new ID
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => keepOnlyQuarantinedRainContingency(index)}
                      className="min-h-8 rounded border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900 hover:bg-amber-50"
                      aria-label={`Keep only quarantined rain plan ${index + 1} in its conflict group`}
                    >
                      Keep this plan only
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuarantinedRainContingency(index)}
                      className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold text-red-800 hover:bg-red-100"
                      aria-label={`Remove quarantined rain plan ${index + 1}`}
                    >
                      Remove plan
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-2 font-medium">Recovery changes remain local until publication. Leave without publishing to discard them.</p>
        </section>
      )}

      {drawingIntegrityRecoveryPending && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950 spm-studio-chrome" aria-labelledby="drawing-integrity-heading">
          <h3 id="drawing-integrity-heading" className="font-semibold">
            <span role="alert">
              Publication blocked: {drawingIntegrityQuarantine.length} unsupported or malformed map {drawingIntegrityQuarantine.length === 1 ? 'shape requires' : 'shapes require'} recovery
            </span>
          </h3>
          <p className="mt-1">
            These shapes are withheld from the working canvas and all Couple and Guest projections. Repair invalid rotation or appearance, rebuild known geometry, explicitly convert a shape to a rectangular zone, or remove it.
          </p>
          <div className="mt-2 space-y-2">
            {drawingIntegrityQuarantine.map((drawing, index) => {
              const issue = venueMapDrawingIntegrityIssue(drawing, map);
              const rotationIssue = venueMapDrawingRotationIssue(drawing);
              const presentationIssues = venueMapDrawingPresentationIssues(drawing);
              const knownType = ['zone', 'rectangle', 'circle', 'line'].includes(drawing.type);
              return (
                <article key={`${drawing.id}:${index}`} className="rounded border border-red-200 bg-white p-2" aria-label={`Quarantined map shape ${index + 1}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{drawing.text || `Map shape ${index + 1}`}</p>
                      <p className="mt-0.5 text-red-800">{issue}</p>
                    </div>
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px]">{drawing.type || 'blank'} · {drawing.id}</span>
                  </div>
                  {rotationIssue && (
                    <label className="mt-2 block max-w-56 text-[11px] font-medium text-gray-700">
                      Rotation in degrees
                      <input
                        type="number"
                        min={VENUE_MAP_ROTATION_MIN}
                        max={VENUE_MAP_ROTATION_MAX}
                        step="1"
                        value={Number.isFinite(drawing.rotation) ? drawing.rotation : ''}
                        onChange={(event) => {
                          const rotation = Number(event.target.value);
                          if (event.target.value !== '' && Number.isFinite(rotation)) {
                            updateQuarantinedDrawingRotation(index, rotation);
                          }
                        }}
                        aria-label={`Recovery rotation for ${drawing.text || `map shape ${index + 1}`}`}
                        aria-invalid="true"
                        className="mt-1 w-full rounded border border-red-300 bg-white px-2 py-1.5 text-xs"
                      />
                      <span className="mt-0.5 block text-red-800">Choose {VENUE_MAP_ROTATION_MIN}° to {VENUE_MAP_ROTATION_MAX}°; saved value {recoveryValueLabel((drawing as unknown as { rotation?: unknown }).rotation)}.</span>
                    </label>
                  )}
                  {presentationIssues.length > 0 && (
                    <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
                      <ul className="space-y-0.5">
                        {presentationIssues.map((presentationIssue) => (
                          <li key={presentationIssue.field}>
                            {presentationIssue.message} Saved value {recoveryValueLabel(presentationIssue.savedValue)}.
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => resetQuarantinedDrawingPresentation(index)}
                        className="mt-1 min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                        aria-label={`Reset invalid appearance for ${drawing.text || `map shape ${index + 1}`}`}
                      >
                        Reset invalid appearance
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {knownType && (
                      <button
                        type="button"
                        onClick={() => repairQuarantinedDrawing(index)}
                        className="min-h-8 rounded border border-teal-300 bg-white px-2 py-1 font-semibold text-teal-800 hover:bg-teal-50"
                        aria-label={`Rebuild geometry for quarantined map shape ${index + 1}`}
                      >
                        Rebuild geometry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => convertQuarantinedDrawingToZone(index)}
                      className="min-h-8 rounded border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900 hover:bg-amber-50"
                      aria-label={`Convert quarantined map shape ${index + 1} to a rectangular zone`}
                    >
                      Convert to zone
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuarantinedDrawing(index)}
                      className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold text-red-800 hover:bg-red-100"
                      aria-label={`Remove quarantined map shape ${index + 1}`}
                    >
                      Remove shape
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-2 font-medium">Recovery changes remain local until publication. Leave without publishing to discard them.</p>
        </section>
      )}

      {textIntegrityIssues.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="map-text-integrity-heading">
          <h3 id="map-text-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: {textIntegrityIssues.length} map text {textIntegrityIssues.length === 1 ? 'field needs' : 'fields need'} repair.
          </h3>
          <ul className="mt-1 space-y-1">
            {textIntegrityIssues.map((issue) => (
              <li key={`${issue.family}:${issue.occurrenceIndex}:${issue.field}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span><strong>{issue.objectLabel}:</strong> {issue.message}</span>
                <button
                  type="button"
                  onClick={() => focusTextIntegrityIssue(issue)}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair ${issue.field} for ${issue.objectLabel}`}
                >
                  Repair text
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Shorten the named field or provide the required name. Save never silently cuts off this content.</p>
        </section>
      )}

      {audienceIntegrityIssues.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="map-audience-integrity-heading">
          <h3 id="map-audience-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: {audienceIntegrityIssues.length} map {audienceIntegrityIssues.length === 1 ? 'object needs' : 'objects need'} visibility repair.
          </h3>
          <ul className="mt-1 space-y-1">
            {audienceIntegrityIssues.map((issue) => (
              <li key={`${issue.family}:${issue.occurrenceIndex}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span>
                  <strong>{issue.objectLabel}:</strong> {issue.message} Saved value {recoveryValueLabel(issue.savedValue)}.
                </span>
                <button
                  type="button"
                  onClick={() => focusAudienceIntegrityIssue(issue)}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair visibility for ${issue.objectLabel}`}
                >
                  Repair visibility
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Choose visibility explicitly. Invalid saved values remain available here for recovery, while affected objects and dependent walkways stay out of guest and couple projections.</p>
        </section>
      )}

      {arrivalRoleIntegrityIssues.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="map-arrival-role-integrity-heading">
          <h3 id="map-arrival-role-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: {arrivalRoleIntegrityIssues.length} {arrivalRoleIntegrityIssues.length === 1 ? 'point needs' : 'points need'} arrival-role repair.
          </h3>
          <ul className="mt-1 space-y-1">
            {arrivalRoleIntegrityIssues.map((issue) => (
              <li key={issue.occurrenceIndex} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span>
                  <strong>{issue.pointLabel}:</strong> {issue.message} Saved value {recoveryValueLabel(issue.savedValue)}.
                </span>
                <button
                  type="button"
                  onClick={() => focusArrivalRoleIntegrityIssue(issue)}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair arrival role for ${issue.pointLabel}`}
                >
                  Repair arrival role
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">For an Entry / Exit pin, choose a valid role. For another pin type, explicitly remove the misplaced role or reclassify the pin. Saved values remain exact for admin recovery and stay out of portal projections until repaired.</p>
        </section>
      )}

      {routeAccessibilityIntegrityIssues.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="map-accessibility-integrity-heading">
          <h3 id="map-accessibility-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: {routeAccessibilityIntegrityIssues.length} {routeAccessibilityIntegrityIssues.length === 1 ? 'walkway needs' : 'walkways need'} mobility-status repair.
          </h3>
          <ul className="mt-1 space-y-1">
            {routeAccessibilityIntegrityIssues.map((issue) => (
              <li key={issue.occurrenceIndex} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span>
                  <strong>{issue.routeLabel}:</strong> {issue.message} Saved value {recoveryValueLabel(issue.savedValue)}.
                </span>
                <button
                  type="button"
                  onClick={() => focusRouteAccessibilityIntegrityIssue(issue)}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair mobility status for ${issue.routeLabel}`}
                >
                  Repair mobility status
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Until explicitly repaired, portals and step-free directions treat this walkway as not verified.</p>
        </section>
      )}

      {invalidGpsPoints.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="map-gps-integrity-heading">
          <h3 id="map-gps-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: {invalidGpsPoints.length} map {invalidGpsPoints.length === 1 ? 'point needs' : 'points need'} GPS repair.
          </h3>
          <ul className="mt-1 space-y-1">
            {invalidGpsPoints.map(({ point, issue }) => (
              <li key={point.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span>
                  <strong>{point.label}:</strong> {issue}{' '}
                  Saved latitude {recoveryValueLabel((point as VenueMapPoint & { lat?: unknown }).lat)}; longitude {recoveryValueLabel((point as VenueMapPoint & { lng?: unknown }).lng)}.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewAudience(null);
                    setInteractionMode('select');
                    handleSelectPoint(point.id);
                    setEditing(true);
                  }}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair GPS coordinates for ${point.label}`}
                >
                  Repair GPS
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Enter one valid latitude/longitude pair or explicitly clear both fields. Invalid saved values are retained here for recovery and omitted from portals.</p>
        </section>
      )}

      {invalidAuthoredDrawings.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="authored-shape-integrity-heading">
          <h3 id="authored-shape-integrity-heading" className="font-semibold" role="alert">
            Publication blocked: {invalidAuthoredDrawings.length} edited map {invalidAuthoredDrawings.length === 1 ? 'shape needs' : 'shapes need'} geometry repair.
          </h3>
          <ul className="mt-1 space-y-1">
            {invalidAuthoredDrawings.map(({ drawing, index, issue }) => (
              <li key={`${drawing.id}:${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span><strong>{drawing.text || `Shape ${index + 1}`}:</strong> {issue}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewAudience(null);
                    setInteractionMode('select');
                    handleCanvasSelectDrawing(drawing.id);
                  }}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair geometry for ${drawing.text || `Shape ${index + 1}`}`}
                >
                  Repair shape
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Move or edit the highlighted shape until its geometry is visible and stays inside the map frame. Use Undo to restore the prior shape.</p>
        </section>
      )}

      {invalidSpacePointLinks.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="space-pin-link-heading">
          <h3 id="space-pin-link-heading" className="font-semibold">
            <span role="alert">Publication blocked: {invalidSpacePointLinks.length} {invalidSpacePointLinks.length === 1 ? 'space pin is' : 'space pins are'} not linked to a unique current venue</span>
          </h3>
          <ul className="mt-1 space-y-1">
            {invalidSpacePointLinks.map(({ point, issue }, index) => (
              <li key={`${point.id}:${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-200 bg-white px-2 py-1.5">
                <span><strong>{point.label}:</strong> {issue}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewAudience(null);
                    handleSelectPoint(point.id);
                  }}
                  className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  aria-label={`Repair venue link for ${point.label}`}
                >
                  Repair pin
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1">Link each pin below, change it to a non-space kind, or remove it. Invalid space pins and their dependent routes are omitted from portals.</p>
        </section>
      )}

      {invalidEventScopeObjects.length > 0 && (
        <div className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" role="alert">
          <p className="font-semibold">
            Publication blocked: {invalidEventScopeObjects.length} map {invalidEventScopeObjects.length === 1 ? 'object has' : 'objects have'} unavailable event-space scope.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {invalidEventScopeObjects.map((object) => (
              <li key={`${object.type}:${object.id}`}>
                {object.type} “{object.label}”: {object.unavailableIds.map(venueMapEventScopeRecoveryLabel).join(', ')}
              </li>
            ))}
          </ul>
          <p className="mt-1">Open each object below to remove only unavailable scopes or reset it to all wedding events.</p>
        </div>
      )}

      {routeDeliveryIssues.length > 0 && (
        <section className="no-print rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 spm-studio-chrome" aria-labelledby="walkway-delivery-heading">
          <h3 id="walkway-delivery-heading" className="font-semibold" role="alert">
            Publication blocked: {routeDeliveryIssueCount} {routeDeliveryIssueCount === 1 ? 'walkway claims' : 'walkways claim'} an audience or event scope that one of its points cannot serve.
          </h3>
          <ul className="mt-2 space-y-1.5">
            {routeDeliveryIssues.map((issue) => (
              <li key={`${issue.route.id}:${issue.point.id}`} className="rounded border border-red-200 bg-white px-2 py-1.5">
                <p>
                  <strong>{issue.route.name} → {issue.point.label}:</strong>{' '}
                  {routeDeliveryIssueDescription(issue, venues)}.
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewAudience(null);
                      startRename(issue.route.id, issue.route.name);
                    }}
                    className="min-h-8 rounded border border-red-300 px-2 py-1 font-semibold hover:bg-red-100"
                    aria-label={`Repair audience or event scope for ${issue.route.name}`}
                  >
                    Edit walkway
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewAudience(null);
                      setInteractionMode('select');
                      handleSelectPoint(issue.point.id);
                    }}
                    className="min-h-8 rounded border border-red-300 px-2 py-1 font-semibold hover:bg-red-100"
                    aria-label={`Review restrictions for ${issue.point.label}`}
                  >
                    Review point
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2">Narrow the walkway, deliberately broaden the point after review, or replace the point. Restricted point visibility is never broadened automatically.</p>
        </section>
      )}

      <div className="spm-venue-map-print-grid grid grid-cols-1 lg:grid-cols-3 gap-3">
        {previewAudience ? (
          <div className="lg:col-span-3 space-y-3">
            <div className="no-print spm-studio-chrome rounded-xl border border-teal-300 bg-teal-50/60 p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-sm font-semibold text-teal-900">👁 Audience preview</span>
                <p className="text-xs text-teal-800 mt-0.5">
                  Staff-only layers are excluded. An individual guest’s map is also scoped to that wedding’s selected spaces and rain backup.
                </p>
                <p className={`mt-1 text-xs font-semibold ${exportSourceSlug === 'saved-map' ? 'text-teal-900' : 'text-amber-900'}`}>
                  Source: {exportSourceLabel}{exportSourceSlug === 'saved-map' ? '' : ' — not currently available in portals'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-teal-900">
                  Viewing as
                  <select
                    value={previewAudience}
                    onChange={(event) => setPreviewAudience(event.target.value as VenueMapViewer)}
                    className="ml-2 rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-xs"
                    aria-label="Preview map audience"
                  >
                    <option value="guest">Guest</option>
                    <option value="couple">Couple</option>
                  </select>
                </label>
                {previewAudience === 'guest' && uniquelyLinkableVenues.length > 0 && (
                  <fieldset className="max-w-xl rounded-lg border border-teal-300 bg-white px-2 py-1.5 text-xs text-teal-950">
                    <legend className="px-1 font-semibold">
                      Wedding spaces ({validPreviewVenueIds.length} selected)
                    </legend>
                    <div className="flex max-h-24 flex-wrap gap-x-3 gap-y-1 overflow-y-auto py-0.5">
                      {uniquelyLinkableVenues.map((venue) => {
                        const checked = validPreviewVenueIds.includes(venue.id);
                        return (
                          <label key={venue.id} className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded px-1 hover:bg-teal-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => setPreviewVenueIds((current) => {
                                if (event.target.checked) {
                                  return current.includes(venue.id) ? current : [...current, venue.id];
                                }
                                return current.filter((venueId) => venueId !== venue.id);
                              })}
                              aria-label={`Include ${venue.name} in guest preview`}
                            />
                            {venue.name}
                          </label>
                        );
                      })}
                    </div>
                    <p className="border-t border-teal-100 pt-1 text-[11px] font-normal" aria-live="polite">
                      {validPreviewVenueIds.length === 0
                        ? 'No spaces selected — showing only globally scoped guest layers.'
                        : `${validPreviewVenueIds.length} wedding ${validPreviewVenueIds.length === 1 ? 'space' : 'spaces'} included with applicable rain backups.`}
                    </p>
                  </fieldset>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewAudience(null)}
                  className="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800"
                >
                  Back to editing
                </button>
              </div>
            </div>
            <VenueMapCanvas
              map={previewProjectedMap!}
              editable={false}
              onPointClick={openInMaps}
              isPointInteractive={(point) => isValidLatitude(point.lat) && isValidLongitude(point.lng)}
              pointActionLabel={() => 'Open in maps.'}
              title={mapTitle}
              showLegend
              hideMapWhenBackgroundUnavailable
              onBackgroundLoadStateChange={setBaseMapLoadSnapshot}
            />
            <VenueMapRainPlanGuidance
              rainContingencies={previewProjectedMap!.rainContingencies}
              venues={venues}
            />
          </div>
        ) : (
        <>
        {/* Canvas */}
        <div className="lg:col-span-2 spm-print-canvas-container">
          <section className="mb-3 rounded-xl border border-gray-200 bg-white p-3 no-print spm-studio-chrome" aria-labelledby="venue-map-tools-heading">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Map editing tools">
              <span id="venue-map-tools-heading" className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Map tools
              </span>
              <button
                type="button"
                aria-pressed={interactionMode === 'select'}
                onClick={() => {
                  setInteractionMode('select');
                  setKeepAddingPoints(false);
                }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold ${interactionMode === 'select' ? 'border-[#4A1942] bg-[#4A1942] text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                ↖ Select &amp; Move
              </button>
              {PLACEABLE_POINT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={interactionMode === 'place' && activeKind === kind}
                  onClick={() => {
                    setActiveKind(kind);
                    setInteractionMode('place');
                    setKeepAddingPoints(false);
                  }}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold ${interactionMode === 'place' && activeKind === kind ? 'border-[#4A1942] bg-[#4A1942] text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {pointKindIcon(kind)} {pointKindLabel(kind)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={interactionMode === 'walkway'}
                onClick={() => {
                  setInteractionMode('walkway');
                  setKeepAddingPoints(false);
                }}
                className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold ${interactionMode === 'walkway' ? 'border-teal-700 bg-teal-700 text-white' : 'border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100'}`}
              >
                〰 Build walkway
              </button>
            </div>
            <div className={`mt-2 rounded-lg border px-3 py-2 text-xs ${interactionMode === 'select' ? 'border-gray-200 bg-gray-50 text-gray-700' : interactionMode === 'walkway' ? 'border-teal-200 bg-teal-50 text-teal-950' : 'border-purple-200 bg-purple-50 text-purple-950'}`} role="status" aria-live="polite">
              {interactionMode === 'select' ? (
                <><strong>Select &amp; Move:</strong> click a pin or property shape to edit it, or drag it to reposition. No new item will be created.</>
              ) : interactionMode === 'walkway' ? (
                <><strong>Building a walkway:</strong> click existing locations or empty map positions in travel order, or add a center waypoint below and set its coordinates. Dragging a pin only moves it. Press Escape to pause.</>
              ) : (
                <><strong>Place {pointKindLabel(activeKind)}:</strong> click one empty map position or use the center-placement button. Existing pins remain safe to select or drag.</>
              )}
            </div>
            {interactionMode === 'place' && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={keepAddingPoints}
                    onChange={(event) => setKeepAddingPoints(event.target.checked)}
                  />
                  Keep adding {pointKindLabel(activeKind).toLowerCase()} items
                </label>
                <button
                  type="button"
                  onClick={() => handlePlace(activeKind, map.width / 2, map.height / 2)}
                  className="min-h-11 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100"
                >
                  ＋ Place {pointKindLabel(activeKind)} at center
                </button>
              </div>
            )}
          </section>
          <div className="relative">
            <VenueMapCanvas
              map={canvasMap}
              editable={!mapComplexityRecoveryPending}
              interactionMode={interactionMode}
              selectedPointId={selectedId}
              selectedDrawingId={selectedDrawingId}
              placeKind={activeKind}
              highlightPointIds={routePointIds}
              transientPointIds={routeDraftWaypoints.map((point) => point.id)}
              onSelectPoint={handleCanvasSelectPoint}
              onSelectDrawing={handleCanvasSelectDrawing}
              onActivatePoint={handleCanvasActivatePoint}
              onMovePoint={handleMove}
              onMoveDrawing={handleCanvasMoveDrawing}
              onPlacePoint={handleCanvasPlace}
              title={mapTitle}
              showLegend
              onBackgroundLoadStateChange={setBaseMapLoadSnapshot}
            />
            {canvasMap.points.length === 0 && (
              <div className="no-print pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="max-w-sm rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-gray-700 shadow">
                  <span className="mb-1 block text-xl">🗺️</span>
                  {mapComplexityRecoveryPending
                    ? 'Oversized map quarantined — download the original recovery JSON, then reset this map.'
                    : interactionMode === 'place'
                      ? `Click an empty position to place ${pointKindLabel(activeKind).toLowerCase()}.`
                      : interactionMode === 'walkway'
                        ? 'Click an empty position, or use “Add Walkway Waypoint at center” below.'
                        : 'Choose Event Space, Parking, Entry / Exit, Amenity, or Build walkway from the toolbar to begin.'}
                </div>
              </div>
            )}
          </div>
          <VenueMapRainPlanGuidance
            rainContingencies={staffProjectedMap.rainContingencies}
            venues={venues}
            compact
          />
          {/* Guided walkway builder */}
          {(interactionMode === 'walkway' || newRouteDraftDirty) && (
          <>
          <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3 no-print spm-studio-chrome">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-teal-950">Guided walkway builder</h3>
                <p className="mt-0.5 text-xs text-teal-800">
                  {routePointIds.length === 0
                    ? 'Step 1 of 2: choose existing locations, click the map, or add a center Walkway Waypoint in travel order.'
                    : `Step 1 of 2: ${routePointIds.length} ordered ${routePointIds.length === 1 ? 'location' : 'locations'} selected. Add at least ${Math.max(0, 2 - routePointIds.length)} more.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {interactionMode !== 'walkway' && (
                  <button
                    type="button"
                    onClick={() => setInteractionMode('walkway')}
                    className="min-h-11 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100"
                  >
                    Resume canvas selection
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    workingMapWithRouteDraft.points.length >= VENUE_MAP_MAX_POINTS
                    || routePointIds.length >= VENUE_MAP_MAX_ROUTE_POINTS
                  }
                  onClick={() => {
                    if (handleWalkwayWaypointPlace(map.width / 2, map.height / 2)) {
                      showToast('Walkway Waypoint added at the map center. Set its coordinates below or use the arrow keys on the map.', 'info');
                    }
                  }}
                  className="min-h-11 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ＋ Add Walkway Waypoint at center
                </button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex flex-col text-xs text-gray-600">
                Walkway name
                <input
                  type="text"
                  maxLength={VENUE_MAP_MAX_ROUTE_NAME_LENGTH}
                  value={routeName}
                  onChange={(event) => setRouteName(event.target.value)}
                  placeholder="Main Walkway"
                  aria-label="Walkway name"
                  className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
                <span className="mt-0.5 text-right text-[10px] text-gray-400">
                  {routeName.length}/{VENUE_MAP_MAX_ROUTE_NAME_LENGTH}
                </span>
              </label>
              <label className="flex flex-col text-xs text-gray-600">
                Audience
                <select value={routeAudience} onChange={(e) => setRouteAudience(e.target.value as VenueMapAudience)} className="mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs bg-white">
                  {MAP_AUDIENCES.map((audience) => <option key={audience} value={audience}>{mapAudienceLabel(audience)}</option>)}
                </select>
              </label>
              <label className="flex flex-col text-xs text-gray-600">
                Routing priority
                <select value={routePriority} onChange={(e) => setRoutePriority(e.target.value as VenueMapRoutePriority)} className="mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs bg-white">
                  {MAP_ROUTE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{routePriorityLabel(priority)}</option>)}
                </select>
              </label>
              <label className="flex flex-col text-xs text-gray-600">
                Mobility status
                <select value={routeAccessibility} onChange={(e) => setRouteAccessibility(e.target.value as VenueMapRouteAccessibility)} className="mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs bg-white">
                  <option value="unknown">Not verified</option>
                  <option value="step-free">Verified step-free</option>
                  <option value="not-step-free">Not step-free</option>
                </select>
              </label>
              <label className="flex flex-col text-xs text-gray-600">
                Add point ({routePointIds.length} selected)
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) addRoutePointToDraft(event.target.value);
                  }}
                  className="mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs bg-white"
                  aria-label="Add point to walkway"
                >
                  <option value="">Select in travel order…</option>
                  {canvasMap.points.map((point) => (
                    <option key={point.id} value={point.id} disabled={routePointIds.includes(point.id)}>{point.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-2 flex flex-col text-xs text-gray-600">
              Route guidance or caution (optional)
              <textarea
                maxLength={VENUE_MAP_MAX_GUIDANCE_LENGTH}
                value={routeNotes}
                onChange={(event) => setRouteNotes(event.target.value)}
                placeholder="e.g. Use the ramp beside the stone terrace; path may be soft after rain."
                rows={2}
                aria-label="Route guidance or caution (optional)"
                className="mt-1 resize-y rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <span className="mt-0.5 text-right text-[10px] text-gray-400">
                {routeNotes.length}/{VENUE_MAP_MAX_GUIDANCE_LENGTH}
              </span>
            </label>
            {uniquelyLinkableVenues.length > 0 && (
              <div className="mt-2">
                <EventScopeEditor
                  eventSpaceIds={routeEventSpaceIds}
                  venues={uniquelyLinkableVenues}
                  subjectLabel="new walkway"
                  compact
                  onChange={(eventSpaceIds) => setRouteEventSpaceIds(eventSpaceIds || [])}
                />
              </div>
            )}
            {routeDraftReferenceIssues.length > 0 && (
              <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900" role="alert">
                <p className="font-semibold">
                  {routeDraftReferenceIssues.some((issue) => issue.reason === 'coincident')
                    ? 'This walkway has no visible length.'
                    : 'Repair the walkway travel order before finishing.'}
                </p>
                <p className="mt-1">
                  {routeDraftReferenceIssues.some((issue) => issue.reason === 'coincident')
                    ? 'Every selected stop is at the same map position. Move a point or choose a stop at a different position.'
                    : 'Remove or replace each unavailable or repeated point.'}
                </p>
              </div>
            )}
            {routeDraftDeliveryIssues.length > 0 && (
              <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900" role="alert">
                <p className="font-semibold">This walkway cannot serve its selected audience or events through every chosen point.</p>
                <ul className="mt-1 space-y-1">
                  {routeDraftDeliveryIssues.map((issue) => (
                    <li key={issue.point.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span><strong>{issue.point.label}:</strong> {routeDeliveryIssueDescription(issue, venues)}.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setInteractionMode('select');
                          handleSelectPoint(issue.point.id);
                        }}
                        className="min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                        aria-label={`Review restrictions for ${issue.point.label}`}
                      >
                        Review point
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-1">Narrow the walkway above, review the point, or remove it from the travel order.</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <button type="button" onClick={commitRoute} disabled={routePointIds.length < 2 || routeDraftReferenceIssues.length > 0 || routeDraftDeliveryIssues.length > 0} className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Finish walkway</button>
              <button type="button" onClick={resetRouteDraft} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancel walkway draft</button>
              <span className="text-[11px] text-gray-500">Step 2 of 2: review details. Only mark “step-free” after verifying the full route on site.</span>
            </div>
            <p className="mt-1 text-[10px] text-gray-500">
              Guest directions use Preferred routes before Standard, then Secondary, and choose the shortest displayed path within the first connected tier. Emergency-only routes are never used for routine directions.
            </p>
          </div>
          {routePointIds.length > 0 && (
            <div className="mt-2 rounded-lg border border-gray-200 p-2">
              <span className="text-[11px] font-medium text-gray-500">Route points (in order):</span>
              <ol className="mt-1 space-y-1">
                {routePointIds.map((id, i) => {
                  const pt = canvasMap.points.find((point) => point.id === id);
                  const transientWaypoint = routeDraftWaypoints.find((point) => point.id === id);
                  return (
                    <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[#4A1942]/10 px-2 py-1 text-[11px] text-[#4A1942]">
                      <span className="mr-auto font-medium">
                        <span className="text-gray-500">{i + 1}.</span> {pt?.label || '?'}
                        {transientWaypoint ? <span className="ml-1 font-normal text-gray-500">(temporary)</span> : null}
                      </span>
                      {transientWaypoint && (
                        <>
                          <label className="inline-flex min-h-8 items-center gap-1 text-gray-600">
                            X
                            <input
                              type="number"
                              min={0}
                              max={map.width}
                              step={0.1}
                              value={transientWaypoint.x}
                              onChange={(event) => {
                                if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                                  handleMove(
                                    id,
                                    event.currentTarget.valueAsNumber,
                                    transientWaypoint.y,
                                  );
                                }
                              }}
                              aria-label={`Horizontal position for ${transientWaypoint.label}`}
                              className="w-20 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800"
                            />
                          </label>
                          <label className="inline-flex min-h-8 items-center gap-1 text-gray-600">
                            Y
                            <input
                              type="number"
                              min={0}
                              max={map.height}
                              step={0.1}
                              value={transientWaypoint.y}
                              onChange={(event) => {
                                if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                                  handleMove(
                                    id,
                                    transientWaypoint.x,
                                    event.currentTarget.valueAsNumber,
                                  );
                                }
                              }}
                              aria-label={`Vertical position for ${transientWaypoint.label}`}
                              className="w-20 rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800"
                            />
                          </label>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRoutePointFromDraft(id)}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[#4A1942]/70 hover:bg-white hover:text-[#4A1942]"
                        aria-label={`Remove ${pt?.label || 'point'} from walkway`}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          </>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-3 no-print spm-studio-chrome">
          {/* Base Map Image Upload & Opacity */}
          <div className="rounded-xl border border-gray-200 p-3 space-y-2.5 bg-gray-50/60">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">🖼️ Base Map Image</span>
              <span className="text-xs text-gray-400">
                {hasSavedBackgroundImage ? `${Math.round(editableBackgroundOpacity * 100)}% opacity${baseImageIntegrityIssues.length ? ' · repair needed' : ''}` : 'None'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Upload an aerial photo, property diagram, or architectural site map to place your points &amp; routes on.
            </p>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
              The base image is visible to every map audience. Use a public-safe image without staff-only labels or sensitive details.
            </p>
            {unmanagedCloudBaseMap && (
              <div className="rounded-md border border-red-300 bg-red-50 px-2.5 py-2 text-[11px] text-red-800" role="alert">
                <strong className="block">Private-map upload required</strong>
                This legacy external, embedded, or general-bucket image remains visible here for admin recovery, but it is hidden from portal users and cannot be republished. Upload it to this venue’s private map storage or remove it.
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="venue-base-map-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleBaseMapUpload}
                disabled={baseMapUploading}
                className="sr-only"
                aria-label="Upload base map image file"
              />
              <label
                htmlFor="venue-base-map-upload"
                className={`flex min-h-8 items-center gap-1.5 rounded-lg bg-[#4A1942] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors ${baseMapUploading ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-[#3b1435]'}`}
              >
                <span>📤</span> {baseMapUploading ? 'Uploading…' : hasSavedBackgroundImage ? 'Change Base Map' : 'Upload Image'}
              </label>
              {hasSavedBackgroundImage && (
                <button
                  type="button"
                  disabled={baseMapUploading}
                  onClick={() => {
                    backgroundOpacityUndoCapturedRef.current = false;
                    pushUndo(map);
                    update(updateMapBackground(map, undefined, undefined));
                    setBgUrlInput('');
                    showToast('Base map removed.', 'info');
                  }}
                  className="min-h-8 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>🗑️</span> Remove
                </button>
              )}
            </div>
            {hasSavedBackgroundImage && (
              <div className="space-y-1 pt-1 border-t border-gray-200/80">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Opacity</span>
                  <span>{Math.round(editableBackgroundOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(editableBackgroundOpacity * 100)}
                  onPointerDown={resetBackgroundOpacityGesture}
                  onPointerUp={resetBackgroundOpacityGesture}
                  onPointerCancel={resetBackgroundOpacityGesture}
                  onKeyDown={(event) => {
                    if (!event.repeat) resetBackgroundOpacityGesture();
                  }}
                  onKeyUp={resetBackgroundOpacityGesture}
                  onBlur={resetBackgroundOpacityGesture}
                  onChange={(event) => editBackgroundOpacity(Number(event.target.value) / 100)}
                  className="w-full accent-[#4A1942]"
                  aria-label="Base map opacity slider"
                />
              </div>
            )}
            {cloudMode ? (
              <p className="border-t border-gray-200/80 pt-2 text-[10px] text-gray-500">
                Cloud portal maps accept private uploads only. External image URLs and embedded files cannot be lifecycle-scoped and are therefore not publishable.
              </p>
            ) : (
              <div className="pt-1 border-t border-gray-200/80">
                <label htmlFor="base-map-url-input" className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  Or paste Image URL:
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="base-map-url-input"
                    type="url"
                    value={bgUrlInput}
                    onChange={(e) => setBgUrlInput(e.target.value)}
                    placeholder="https://example.com/property-aerial.png"
                    disabled={baseMapUploading}
                    aria-label="Base map image URL"
                    className="flex-1 px-2.5 py-1 border border-gray-300 rounded-lg text-xs font-mono disabled:cursor-not-allowed disabled:bg-gray-100"
                  />
                  <button
                    type="button"
                    disabled={baseMapUploading}
                    onClick={() => {
                      const value = bgUrlInput.trim();
                      if (!value) return;
                      try {
                        const parsed = new URL(value);
                        if (parsed.protocol !== 'https:') throw new Error('Base-map URLs must use HTTPS.');
                      } catch (error) {
                        showToast(describeUnknownError(error, 'Enter a valid HTTPS image URL.'), 'warning');
                        return;
                      }
                      backgroundOpacityUndoCapturedRef.current = false;
                      pushUndo(map);
                      update(updateMapBackground(map, value, map.backgroundOpacity ?? 0.85));
                      setBgUrlInput(value);
                      showToast('Base map URL applied to the local draft. Confirm export works before saving.', 'info');
                    }}
                    className="min-h-8 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
                {backgroundUrlDraftDirty && (
                  <button
                    type="button"
                    onClick={() => setBgUrlInput(
                      typeof rawBackgroundImageUrl === 'string' ? rawBackgroundImageUrl : '',
                    )}
                    className="mt-1 inline-flex min-h-8 items-center rounded px-2 text-[11px] text-gray-600 hover:bg-gray-100 hover:underline"
                  >
                    Reset URL draft
                  </button>
                )}
                <p className="mt-1 text-[10px] text-gray-400">External hosts must allow cross-origin image downloads or PNG/PDF export will stop with an error.</p>
              </div>
            )}
          </div>

          {/* Map-native vector shapes */}
          <div className="rounded-xl border border-gray-200 p-3 space-y-2.5 bg-gray-50/60">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">🎨 Property shapes</span>
              <span className="text-xs text-gray-400">
                {(map.drawings || []).length} shape{(map.drawings || []).length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Add zones for lawns, parking, buildings, gardens, or restricted operations. In Select &amp; Move, click or drag any shape on the map; use these fields for precise geometry and resizing.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={addZone}
                className="min-h-11 flex-1 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800"
              >
                ＋ Add editable zone
              </button>
              {(map.drawings || []).length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClearZones(true)}
                  className="min-h-8 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Clear all shapes
                </button>
              )}
            </div>
            {(map.drawings || []).length > 0 && (
              <div className="space-y-1 pt-1 border-t border-gray-200/80 max-h-36 overflow-y-auto">
                {(map.drawings || []).map((drawing, index) => (
                  <div key={drawing.id} className={`flex items-center gap-1 rounded border px-1 py-1 text-xs ${selectedDrawingId === drawing.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-white'}`}>
                    <button
                      type="button"
                      onClick={() => handleCanvasSelectDrawing(drawing.id)}
                      aria-pressed={selectedDrawingId === drawing.id}
                      className="min-h-11 min-w-0 flex-1 truncate rounded px-2 py-2 text-left font-medium text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700"
                    >
                      {drawing.text || `Shape ${index + 1}`}
                    </button>
                    <span className="shrink-0 text-[10px] text-gray-400">{drawing.type} · {mapAudienceLabel(drawing.audience)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        pushUndo(map);
                        update(removeMapDrawing(map, drawing.id));
                        if (selectedDrawingId === drawing.id) handleCanvasSelectDrawing(null);
                      }}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Delete shape ${drawing.text || drawing.id}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {selectedDrawing && (
              <div className="space-y-2 rounded-lg border border-teal-200 bg-white p-2">
                {selectedDrawingIssue && (
                  <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-900" role="alert">
                    <p className="font-semibold">This shape cannot be published yet.</p>
                    <p className="mt-0.5">{selectedDrawingIssue}</p>
                    <p className="mt-0.5">{selectedDrawingPresentationIssues.length > 0
                      ? 'Reset the invalid appearance below, or use Undo to restore the prior styling.'
                      : selectedDrawingRotationIssue
                        ? `Choose a rotation from ${VENUE_MAP_ROTATION_MIN}° to ${VENUE_MAP_ROTATION_MAX}°, or use Undo.`
                        : selectedDrawing.type === 'line'
                          ? 'Give at least two vertices different positions, or use Undo to restore the line.'
                          : 'Adjust the geometry below, drag the shape back inside the map, or use Undo.'}</p>
                  </div>
                )}
                <label className="block text-xs text-gray-600">Shape label
                  <input
                    type="text"
                    maxLength={VENUE_MAP_MAX_DRAWING_TEXT_LENGTH}
                    value={selectedDrawing.text || ''}
                    onChange={(event) => editDrawing({ text: event.target.value })}
                    aria-label="Shape label"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                  <span className={`mt-0.5 block text-right text-[10px] ${(selectedDrawing.text || '').trim().length > VENUE_MAP_MAX_DRAWING_TEXT_LENGTH ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                    {(selectedDrawing.text || '').length}/{VENUE_MAP_MAX_DRAWING_TEXT_LENGTH}
                  </span>
                </label>
                <label className="block text-xs text-gray-600">Audience
                  <select
                    value={audienceSelectValue((selectedDrawing as unknown as { audience?: unknown }).audience)}
                    aria-label={`Visibility for ${selectedDrawing.text || selectedDrawing.id}`}
                    aria-invalid={Boolean(selectedDrawingAudienceIssue)}
                    onChange={(event) => editDrawing({ audience: event.target.value as VenueMapAudience })}
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                  >
                    {selectedDrawingAudienceIssue && <option value="" disabled>Choose visibility to repair…</option>}
                    {MAP_AUDIENCES.map((audience) => <option key={audience} value={audience}>{mapAudienceLabel(audience)}</option>)}
                  </select>
                  {selectedDrawingAudienceIssue && (
                    <span className="mt-1 block rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700" role="alert">
                      Choose visibility explicitly. Saved value {recoveryValueLabel(selectedDrawingAudienceIssue.savedValue)}.
                    </span>
                  )}
                </label>
                <EventScopeEditor
                  eventSpaceIds={selectedDrawing.eventSpaceIds}
                  venues={uniquelyLinkableVenues}
                  subjectLabel={selectedDrawing.text || selectedDrawing.id}
                  compact
                  onChange={(eventSpaceIds) => editDrawing({ eventSpaceIds })}
                />
                {(selectedDrawing.type === 'zone' || selectedDrawing.type === 'rectangle') && (
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      ['x', 'X', selectedDrawing.x, Math.max(0, map.width - (selectedDrawing.width ?? 1))],
                      ['y', 'Y', selectedDrawing.y, Math.max(0, map.height - (selectedDrawing.height ?? 1))],
                      ['width', 'Width', selectedDrawing.width ?? 1, Math.max(1, map.width - selectedDrawing.x)],
                      ['height', 'Height', selectedDrawing.height ?? 1, Math.max(1, map.height - selectedDrawing.y)],
                    ] as const).map(([field, label, value, max]) => (
                      <label key={field} className="text-[10px] text-gray-500">{label}
                        <input
                          type="number"
                          min={field === 'width' || field === 'height' ? 1 : 0}
                          max={max}
                          step="0.5"
                          value={Math.round(value * 10) / 10}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (Number.isFinite(parsed)) editDrawing({ [field]: Math.max(field === 'width' || field === 'height' ? 1 : 0, Math.min(max, parsed)) });
                          }}
                          className="mt-1 w-full rounded border border-gray-300 px-1 py-1 text-xs"
                        />
                      </label>
                    ))}
                  </div>
                )}
                {selectedDrawing.type === 'circle' && (
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      ['x', 'Center X', selectedDrawing.x, selectedDrawing.radius ?? 1, map.width - (selectedDrawing.radius ?? 1)],
                      ['y', 'Center Y', selectedDrawing.y, selectedDrawing.radius ?? 1, map.height - (selectedDrawing.radius ?? 1)],
                      ['radius', 'Radius', selectedDrawing.radius ?? 1, 1, Math.min(map.width, map.height) / 2],
                    ] as const).map(([field, label, value, min, max]) => (
                      <label key={field} className="text-[10px] text-gray-500">{label}
                        <input
                          type="number"
                          min={min}
                          max={Math.max(min, max)}
                          step="0.5"
                          value={Math.round(value * 10) / 10}
                          onChange={(event) => {
                            const parsed = Number(event.target.value);
                            if (Number.isFinite(parsed)) editDrawing({
                              [field]: Math.max(min, Math.min(Math.max(min, max), parsed)),
                            });
                          }}
                          className="mt-1 w-full rounded border border-gray-300 px-1 py-1 text-xs"
                        />
                      </label>
                    ))}
                  </div>
                )}
                {selectedDrawing.type === 'line' && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-gray-600">Line vertices</p>
                    {(selectedDrawing.points || []).map((point, pointIndex) => (
                      <div key={pointIndex} className="grid grid-cols-[1fr_1fr_auto] items-end gap-1">
                        <label className="text-[10px] text-gray-500">X {pointIndex + 1}
                          <input
                            type="number"
                            min={0}
                            max={map.width}
                            step="0.5"
                            value={Math.round(point.x * 10) / 10}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              if (!Number.isFinite(parsed)) return;
                              const points = [...(selectedDrawing.points || [])];
                              points[pointIndex] = { ...point, x: Math.max(0, Math.min(map.width, parsed)) };
                              editDrawing({ points });
                            }}
                            className="mt-1 w-full rounded border border-gray-300 px-1 py-1 text-xs"
                            aria-label={`Line vertex ${pointIndex + 1} X coordinate`}
                          />
                        </label>
                        <label className="text-[10px] text-gray-500">Y {pointIndex + 1}
                          <input
                            type="number"
                            min={0}
                            max={map.height}
                            step="0.5"
                            value={Math.round(point.y * 10) / 10}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              if (!Number.isFinite(parsed)) return;
                              const points = [...(selectedDrawing.points || [])];
                              points[pointIndex] = { ...point, y: Math.max(0, Math.min(map.height, parsed)) };
                              editDrawing({ points });
                            }}
                            className="mt-1 w-full rounded border border-gray-300 px-1 py-1 text-xs"
                            aria-label={`Line vertex ${pointIndex + 1} Y coordinate`}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={(selectedDrawing.points || []).length <= 2}
                          onClick={() => editDrawing({
                            points: (selectedDrawing.points || []).filter((_, index) => index !== pointIndex),
                          })}
                          className="min-h-8 rounded border border-red-200 px-2 text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove line vertex ${pointIndex + 1}`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={(selectedDrawing.points || []).length >= VENUE_MAP_MAX_LINE_VERTICES}
                      onClick={() => {
                        const points = selectedDrawing.points || [];
                        const nextPoints = appendMapLineVertex(points, map.width, map.height);
                        if (nextPoints === points) {
                          showToast(`A line can contain at most ${VENUE_MAP_MAX_LINE_VERTICES} vertices.`, 'warning');
                          return;
                        }
                        editDrawing({ points: nextPoints });
                      }}
                      className="min-h-8 w-full rounded border border-teal-300 bg-white px-2 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40"
                      title={(selectedDrawing.points || []).length >= VENUE_MAP_MAX_LINE_VERTICES
                        ? `A line can contain at most ${VENUE_MAP_MAX_LINE_VERTICES} vertices.`
                        : 'Add a new, distinct vertex inside the map frame'}
                    >
                      Add line vertex{(selectedDrawing.points || []).length >= VENUE_MAP_MAX_LINE_VERTICES ? ' — limit reached' : ''}
                    </button>
                  </div>
                )}
                {selectedDrawingPresentationIssues.length > 0 && (
                  <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-900">
                    <ul className="space-y-0.5">
                      {selectedDrawingPresentationIssues.map((issue) => (
                        <li key={issue.field}>{issue.message} Saved value {recoveryValueLabel(issue.savedValue)}.</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => editDrawing(drawingPresentationRepairPatch(selectedDrawing))}
                      className="mt-1 min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                    >
                      Reset invalid appearance
                    </button>
                  </div>
                )}
                <label className="block text-[10px] text-gray-500">Rotation in degrees
                  <input
                    type="number"
                    min={VENUE_MAP_ROTATION_MIN}
                    max={VENUE_MAP_ROTATION_MAX}
                    step="1"
                    value={Number.isFinite(selectedDrawing.rotation) ? selectedDrawing.rotation : ''}
                    aria-label={`Rotation for ${selectedDrawing.text || selectedDrawing.id}`}
                    aria-invalid={Boolean(selectedDrawingRotationIssue)}
                    onChange={(event) => {
                      const rotation = Number(event.target.value);
                      if (event.target.value !== '' && Number.isFinite(rotation)) editDrawing({ rotation });
                    }}
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                  {selectedDrawingRotationIssue && <span className="mt-0.5 block font-medium text-red-700">{selectedDrawingRotationIssue}</span>}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-[10px] text-gray-500">Fill color
                    <input
                      type="color"
                      value={drawingColorPickerValue((selectedDrawing as unknown as { fillColor?: unknown }).fillColor, '#0d9488')}
                      onChange={(event) => editDrawing({ fillColor: event.target.value })}
                      className="mt-1 h-8 w-full rounded border"
                      aria-label={`Fill color for ${selectedDrawing.text || selectedDrawing.id}`}
                    />
                    <button type="button" onClick={() => editDrawing({ fillColor: 'transparent' })} className="mt-1 w-full rounded border border-gray-300 px-1 py-1">No fill</button>
                  </div>
                  <div className="text-[10px] text-gray-500">Border color
                    <input
                      type="color"
                      value={drawingColorPickerValue((selectedDrawing as unknown as { strokeColor?: unknown }).strokeColor, '#0f766e')}
                      onChange={(event) => editDrawing({ strokeColor: event.target.value })}
                      className="mt-1 h-8 w-full rounded border"
                      aria-label={`Border color for ${selectedDrawing.text || selectedDrawing.id}`}
                    />
                    <button type="button" onClick={() => editDrawing({ strokeColor: 'transparent' })} className="mt-1 min-h-8 w-full rounded border border-gray-300 px-2 py-1">No border</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-gray-500">Border width
                    <input
                      type="number"
                      min={VENUE_MAP_STROKE_WIDTH_MIN}
                      max={VENUE_MAP_STROKE_WIDTH_MAX}
                      step="0.1"
                      value={typeof selectedDrawing.strokeWidth === 'number' && Number.isFinite(selectedDrawing.strokeWidth) ? selectedDrawing.strokeWidth : ''}
                      placeholder="Automatic"
                      onChange={(event) => editDrawing({ strokeWidth: event.target.value === '' ? undefined : Number(event.target.value) })}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                  </label>
                  <label className="text-[10px] text-gray-500">Label size
                    <input
                      type="number"
                      min={VENUE_MAP_FONT_SIZE_MIN}
                      max={VENUE_MAP_FONT_SIZE_MAX}
                      step="0.5"
                      value={typeof selectedDrawing.fontSize === 'number' && Number.isFinite(selectedDrawing.fontSize) ? selectedDrawing.fontSize : ''}
                      placeholder="Automatic"
                      onChange={(event) => editDrawing({ fontSize: event.target.value === '' ? undefined : Number(event.target.value) })}
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                  </label>
                </div>
                <label className="block text-[10px] text-gray-500">Shape opacity {Math.round((typeof selectedDrawing.opacity === 'number' && Number.isFinite(selectedDrawing.opacity) ? selectedDrawing.opacity : 0.24) * 100)}%
                  <input
                    type="range"
                    min={VENUE_MAP_OPACITY_MIN * 100}
                    max={VENUE_MAP_OPACITY_MAX * 100}
                    value={Math.round((typeof selectedDrawing.opacity === 'number' && Number.isFinite(selectedDrawing.opacity) ? selectedDrawing.opacity : 0.24) * 100)}
                    onChange={(event) => editDrawing({ opacity: Number(event.target.value) / 100 })}
                    className="mt-1 w-full"
                  />
                </label>
                <button type="button" onClick={() => handleCanvasSelectDrawing(null)} className="min-h-11 w-full rounded border border-gray-300 px-2 py-2 text-xs text-gray-600">Done editing shape</button>
              </div>
            )}
          </div>

          {/* Map size */}
          <div className="rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">📐 Map size</span>
              <span className="text-xs text-gray-400">{Math.round(map.width)}×{Math.round(map.height)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-gray-500">Width
                <input
                  type="number"
                  value={sizeW}
                  min={VENUE_MAP_FRAME_MIN}
                  max={VENUE_MAP_FRAME_MAX}
                  onChange={(e) => setSizeW(e.target.value)}
                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  aria-label="Map width"
                />
              </label>
              <label className="block text-xs text-gray-500">Height
                <input
                  type="number"
                  value={sizeH}
                  min={VENUE_MAP_FRAME_MIN}
                  max={VENUE_MAP_FRAME_MAX}
                  onChange={(e) => setSizeH(e.target.value)}
                  className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  aria-label="Map height"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!sizeDraftDirty || !sizeDraftValid}
              aria-describedby={!sizeDraftValid ? 'venue-map-size-error' : undefined}
              onClick={() => {
                pushUndo(map);
                const next = updateMapSize(map, Number(sizeW), Number(sizeH));
                setRouteDraftWaypoints((waypoints) => waypoints.map((point) => ({
                  ...point,
                  x: Math.round(Math.max(0, Math.min(point.x, next.width)) * 10) / 10,
                  y: Math.round(Math.max(0, Math.min(point.y, next.height)) * 10) / 10,
                })));
                setSizeW(String(next.width));
                setSizeH(String(next.height));
                update(next);
                showToast(`Map resized to ${next.width}×${next.height}.`, 'success');
              }}
              className="min-h-8 w-full rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply size
            </button>
            {sizeDraftDirty && (
              <button
                type="button"
                onClick={() => { setSizeW(String(map.width)); setSizeH(String(map.height)); }}
                className="inline-flex min-h-8 w-full items-center justify-center rounded px-2 text-[11px] text-gray-600 hover:bg-gray-100 hover:underline"
              >
                Reset size draft
              </button>
            )}
            {!sizeDraftValid && (
              <p id="venue-map-size-error" role="alert" className="text-[11px] font-medium text-red-700">
                Width and height must each be a finite number from {VENUE_MAP_FRAME_MIN} to {VENUE_MAP_FRAME_MAX}.
              </p>
            )}
            <p className="text-[11px] text-gray-400">Points, temporary walkway waypoints, and shapes stay inside the frame when the map shrinks.</p>
          </div>

          {/* Venue coverage */}
          <div className="rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">🗂️ Map coverage</span>
              <span className="text-xs text-gray-400">
                {uniquelyPinnedVenueCount}/{uniquelyLinkableVenues.length} uniquely pinned
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Any venue without a pin won't appear on the couple or guest map. Add a
              pin for each space &amp; lodging, then drag it into place.
            </p>
            {uniquelyLinkableVenues.length === 0 ? (
              <p className="text-xs text-amber-700">No uniquely identifiable current venue records are available to pin.</p>
            ) : missingVenues.length === 0 && !spacePointLinkCollisionPending ? (
              <p className="text-xs text-emerald-600">✓ Every venue has one canonical map pin.</p>
            ) : missingVenues.length === 0 ? (
              <p className="text-xs font-medium text-red-700">Resolve duplicate-linked venue pins above before publication.</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {(showAllMissingVenues ? missingVenues : missingVenues.slice(0, 8)).map((venue) => (
                    <li key={venue.id} className="flex items-center justify-between text-xs text-gray-700">
                      <span>
                        {venue.category === 'lodging' ? '🛏️' : '🏛️'} {venue.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => addVenuePin(venue)}
                        className="inline-flex min-h-8 items-center rounded px-2 text-teal-700 hover:bg-teal-50 hover:underline"
                        aria-label={`Add pin for ${venue.name}`}
                      >
                        + Add pin
                      </button>
                    </li>
                  ))}
                </ul>
                {missingVenues.length > 8 && (
                  <button
                    type="button"
                    aria-expanded={showAllMissingVenues}
                    onClick={() => setShowAllMissingVenues((expanded) => !expanded)}
                    className="mt-1 inline-flex min-h-8 items-center rounded px-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 hover:underline"
                  >
                    {showAllMissingVenues
                      ? 'Show fewer missing venues'
                      : `Show ${missingVenues.length - 8} more missing ${missingVenues.length - 8 === 1 ? 'venue' : 'venues'}`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Rain contingencies are canonical map data; edit them here so they
              receive the same dirty guard and CAS conflict handling as geometry. */}
          <div className="rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-800">🌧️ Rain contingencies</span>
              <button
                type="button"
                onClick={addRainContingency}
                disabled={availableOutdoorVenues.length === 0}
                className="min-h-8 rounded-lg bg-[#4A1942] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3b1435] disabled:cursor-not-allowed disabled:opacity-40"
              >
                + Add rain backup
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              Pair each outdoor-capable event space with one distinct indoor backup. Guests assigned to that outdoor space can then see its backup on their scoped map.
            </p>
            {invalidRainContingencies.length > 0 && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-800" role="alert">
                Publication blocked: repair or remove {invalidRainContingencies.length === 1 ? 'the unavailable rain backup' : `all ${invalidRainContingencies.length} unavailable rain backups`} below. Existing saved data remains visible here for recovery but is omitted from portals.
              </p>
            )}
            {(map.rainContingencies || []).length === 0 ? (
              <p className="text-xs text-gray-400">No rain-contingency backups set.</p>
            ) : (
              <div className="space-y-2">
                {(map.rainContingencies || []).map((contingency, contingencyIndex) => {
                  const backupPinned = map.points.some(
                    (point) => point.kind === 'space' && point.venueId === contingency.indoorVenueId,
                  );
                  const validationIssue = rainContingencyIssueById.get(contingency.id);
                  const currentOutdoorIsEligible = outdoorVenues.some(
                    (venue) => venue.id === contingency.outdoorVenueId,
                  );
                  const currentBackupIsEligible = indoorVenues.some(
                    (venue) => venue.id === contingency.indoorVenueId
                      && venue.id !== contingency.outdoorVenueId,
                  );
                  return (
                    <div
                      key={contingency.id}
                      className={`rounded-lg border p-2 ${validationIssue ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5">
                        <label className="min-w-0 text-[10px] text-gray-500">
                          Outdoor space
                          <select
                            value={contingency.outdoorVenueId}
                            onChange={(event) => {
                              const outdoorVenueId = event.target.value;
                              const currentBackupIsValid = contingency.indoorVenueId !== outdoorVenueId
                                && indoorVenues.some((venue) => venue.id === contingency.indoorVenueId);
                              const indoorVenueId = currentBackupIsValid
                                ? contingency.indoorVenueId
                                : indoorVenues.find((venue) => venue.id !== outdoorVenueId)?.id;
                              if (indoorVenueId) {
                                updateRainContingency(contingency.id, { outdoorVenueId, indoorVenueId });
                              }
                            }}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
                            aria-label={`Outdoor space for rain backup ${contingency.id}`}
                          >
                            {!currentOutdoorIsEligible && (
                              <option value={contingency.outdoorVenueId} disabled>
                                Unavailable — {linkedVenueName(contingency.outdoorVenueId)}
                              </option>
                            )}
                            {outdoorVenues
                              .filter((venue) => (
                                venue.id === contingency.outdoorVenueId
                                || !usedOutdoorVenueIds.has(venue.id)
                              ) && indoorVenues.some((backup) => backup.id !== venue.id))
                              .map((venue) => (
                                <option key={venue.id} value={venue.id}>{venue.name}</option>
                              ))}
                          </select>
                        </label>
                        <span className="mt-4 text-gray-400" aria-hidden="true">→</span>
                        <label className="min-w-0 text-[10px] text-gray-500">
                          Indoor backup
                          <select
                            value={contingency.indoorVenueId}
                            onChange={(event) => updateRainContingency(contingency.id, {
                              indoorVenueId: event.target.value,
                            })}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
                            aria-label={`Indoor backup for ${contingency.outdoorVenueId}`}
                          >
                            {!currentBackupIsEligible && (
                              <option value={contingency.indoorVenueId} disabled>
                                Unavailable — {linkedVenueName(contingency.indoorVenueId)}
                              </option>
                            )}
                            {indoorVenues
                              .filter((venue) => venue.id !== contingency.outdoorVenueId)
                              .map((venue) => (
                                <option key={venue.id} value={venue.id}>{venue.name}</option>
                              ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRainContingency(contingency.id)}
                          className="mt-3 inline-flex min-h-8 min-w-8 items-center justify-center rounded text-red-600 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Remove rain backup for ${linkedVenueName(contingency.outdoorVenueId)}`}
                        >
                          ✕
                        </button>
                      </div>
                      <label className="mt-2 block text-[10px] text-gray-500">
                        Guest rain-plan guidance (optional)
                        <textarea
                          id={`rain-note-${contingencyIndex}`}
                          maxLength={VENUE_MAP_MAX_GUIDANCE_LENGTH}
                          value={contingency.note || ''}
                          onChange={(event) => updateRainContingency(contingency.id, {
                            note: event.target.value || undefined,
                          })}
                          rows={2}
                          className="mt-1 w-full resize-y rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
                          placeholder="Example: If the lawn closes, follow signs to the ballroom."
                          aria-label={`Guest rain-plan guidance for ${linkedVenueName(contingency.outdoorVenueId)}`}
                          aria-invalid={(contingency.note || '').trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH}
                        />
                        <span className={`mt-0.5 block text-right ${(contingency.note || '').trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                          {(contingency.note || '').length}/{VENUE_MAP_MAX_GUIDANCE_LENGTH}
                        </span>
                      </label>
                      {validationIssue && (
                        <p className="mt-1 text-[10px] font-semibold text-red-800" role="status">
                          Not publishable: {validationIssue} Choose an eligible space or remove this pair.
                        </p>
                      )}
                      {!validationIssue && !backupPinned && (
                        <p className="mt-1 text-[10px] text-amber-700" role="status">
                          Add a map pin for {linkedVenueName(contingency.indoorVenueId)} so guests can see this backup.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {outdoorVenues.length === 0 && (
              <p className="text-[10px] text-gray-400">Mark a venue space as outdoor or both to configure a rain backup.</p>
            )}
          </div>

          {!selected ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
              Click a point on the map (or place a new one) to edit its details.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">
                  {pointKindIcon(selected.kind)} {pointKindLabel(selected.kind)}
                </span>
                <span className="text-xs text-gray-400" style={{ color: pointColor(selected.kind) }}>● {selected.id.slice(0, 6)}</span>
              </div>
              <label className="block text-xs text-gray-500">Label
                <input
                  type="text"
                  maxLength={VENUE_MAP_MAX_POINT_LABEL_LENGTH}
                  value={selected.label}
                  onChange={(event) => editSelected(updateMapPoint(map, selected.id, { label: event.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  aria-label="Label"
                  aria-invalid={selected.label.trim().length === 0 || selected.label.trim().length > VENUE_MAP_MAX_POINT_LABEL_LENGTH}
                />
                <span className={`mt-0.5 block text-right text-[10px] ${selected.label.trim().length === 0 || selected.label.trim().length > VENUE_MAP_MAX_POINT_LABEL_LENGTH ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                  {selected.label.length}/{VENUE_MAP_MAX_POINT_LABEL_LENGTH}
                </span>
              </label>
              <label className="block text-xs text-gray-500">Guest guidance / description
                <textarea
                  maxLength={VENUE_MAP_MAX_GUIDANCE_LENGTH}
                  value={selected.description || ''}
                  onChange={(event) => editSelected(updateMapPoint(map, selected.id, { description: event.target.value || undefined }))}
                  rows={2}
                  className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1 text-sm"
                  placeholder="Example: Enter through the stone arch beside the fountain."
                  aria-label="Guest guidance / description"
                  aria-invalid={(selected.description || '').trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH}
                />
                <span className={`mt-0.5 block text-right text-[10px] ${(selected.description || '').trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                  {(selected.description || '').length}/{VENUE_MAP_MAX_GUIDANCE_LENGTH}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-gray-500">Kind
                  <select value={selected.kind} onChange={(e) => editSelected(updateMapPoint(map, selected.id, { kind: e.target.value as VenueMapPointKind }))} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white">
                    {KINDS.map((k) => <option key={k} value={k}>{pointKindLabel(k)}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-gray-500">Audience
                  <select
                    value={audienceSelectValue((selected as unknown as { audience?: unknown }).audience)}
                    aria-label={`Visibility for ${selected.label}`}
                    aria-invalid={Boolean(selectedPointAudienceIssue)}
                    onChange={(event) => editSelected(updateMapPoint(map, selected.id, { audience: event.target.value as VenueMapAudience }))}
                    className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                  >
                    {selectedPointAudienceIssue && <option value="" disabled>Choose visibility to repair…</option>}
                    {MAP_AUDIENCES.map((audience) => <option key={audience} value={audience}>{mapAudienceLabel(audience)}</option>)}
                  </select>
                  {selectedPointAudienceIssue && (
                    <span className="mt-1 block rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700" role="alert">
                      Choose visibility explicitly. Saved value {recoveryValueLabel(selectedPointAudienceIssue.savedValue)}.
                    </span>
                  )}
                </label>
              </div>
              {selected.kind !== 'entry' && selectedPointArrivalRoleIssue && (
                <fieldset
                  className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-900"
                  aria-label={`Misplaced arrival role repair for ${selected.label}`}
                >
                  <legend className="px-1 font-semibold">Misplaced arrival role</legend>
                  <p>
                    {pointKindLabel(selected.kind)} pins cannot carry an Arrival role. Saved value{' '}
                    {recoveryValueLabel(selectedPointArrivalRoleIssue.savedValue)} remains unchanged until you choose a repair.
                    {selected.kind === 'space' && selected.venueId
                      ? ` Reclassifying will remove its link to ${venues.find((venue) => venue.id === selected.venueId)?.name || 'the current venue record'}.`
                      : ''}
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => editSelected(updateMapPoint(map, selected.id, { arrivalRole: undefined }))}
                      className="min-h-11 flex-1 rounded-lg bg-[#4A1942] px-3 py-2 font-semibold text-white hover:bg-[#3b1435]"
                    >
                      Remove arrival role · Keep {pointKindLabel(selected.kind)}
                    </button>
                    <button
                      type="button"
                      onClick={() => editSelected(updateMapPoint(map, selected.id, { kind: 'entry' }))}
                      className="min-h-11 flex-1 rounded-lg border border-red-300 bg-white px-3 py-2 font-semibold text-red-800 hover:bg-red-100"
                    >
                      Reclassify as Entry / Exit{selected.kind === 'space' && selected.venueId ? ' · Remove venue link' : ''}
                    </button>
                  </div>
                </fieldset>
              )}
              {selected.kind === 'entry' && (
                <label className="block text-xs text-gray-500">Arrival role
                  <select
                    value={arrivalRoleSelectValue((selected as unknown as { arrivalRole?: unknown }).arrivalRole)}
                    aria-label={`Arrival role for ${selected.label}`}
                    aria-invalid={Boolean(selectedPointArrivalRoleIssue)}
                    onChange={(event) => editSelected(updateMapPoint(map, selected.id, {
                      arrivalRole: event.target.value as VenueMapArrivalRole,
                    }))}
                    className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                  >
                    {selectedPointArrivalRoleIssue && <option value="" disabled>Choose arrival role to repair…</option>}
                    {MAP_ARRIVAL_ROLES.map((role) => (
                      <option key={role} value={role}>{arrivalRoleLabel(role)}</option>
                    ))}
                  </select>
                  <span className={`mt-1 block rounded border p-1.5 text-[11px] ${selected.arrivalRole === 'guest-arrival' || selected.arrivalRole === 'both' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                    {selected.arrivalRole === 'guest-arrival' || selected.arrivalRole === 'both'
                      ? 'This point can satisfy guest-arrival coverage and may be chosen automatically for directions.'
                      : selected.arrivalRole === 'exit-only'
                        ? 'Exit-only points remain visible but are excluded from normal guest directions unless a guest explicitly selects one.'
                        : 'Not yet classified: this point does not count as a safe guest arrival and is not selected automatically for directions.'}
                  </span>
                  {selectedPointArrivalRoleIssue && (
                    <span className="mt-1 block text-[10px] font-medium text-red-700" role="alert">
                      {selectedPointArrivalRoleIssue.message} Saved value {recoveryValueLabel(selectedPointArrivalRoleIssue.savedValue)}.
                    </span>
                  )}
                </label>
              )}
              {selected.kind === 'space' && (
                <label className="block text-xs text-gray-500">Linked event space or lodging
                  <select
                    value={selected.venueId || ''}
                    onChange={(e) => linkVenue(e.target.value)}
                    className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                    aria-invalid={Boolean(selectedSpaceLinkIssue || selectedSpaceLinkCollision)}
                  >
                    <option value="">(none — publication blocked)</option>
                    {selected.venueId && selectedSpaceLinkIssue && (
                      <option value={selected.venueId} disabled>
                        Unavailable — {selected.venueId}
                      </option>
                    )}
                    {uniquelyLinkableVenues.map((venue) => {
                      const linkedByAnotherPoint = map.points.some((point) =>
                        point.id !== selected.id
                        && point.kind === 'space'
                        && point.venueId === venue.id,
                      );
                      return (
                        <option
                          key={venue.id}
                          value={venue.id}
                          disabled={linkedByAnotherPoint && selected.venueId !== venue.id}
                        >
                          {linkedByAnotherPoint && selected.venueId !== venue.id
                            ? `Already linked — ${venue.name}`
                            : venue.name}
                        </option>
                      );
                    })}
                  </select>
                  {(selectedSpaceLinkIssue || selectedSpaceLinkCollision) && (
                    <span className="mt-1 block text-[10px] font-medium text-red-700" role="alert">
                      {selectedSpaceLinkIssue || `${selectedSpaceLinkCollision!.points.length} destination pins link to ${linkedVenueName(selectedSpaceLinkCollision!.venueId)}.`}{' '}
                      Relink, reclassify, or remove this pin—or keep one canonical occurrence in the recovery panel—before publication.
                    </span>
                  )}
                </label>
              )}
              {selected.kind !== 'space' && (
                <EventScopeEditor
                  eventSpaceIds={selected.eventSpaceIds}
                  venues={uniquelyLinkableVenues}
                  subjectLabel={selected.label}
                  onChange={(eventSpaceIds) => editSelected(updateMapPoint(
                    map,
                    selected.id,
                    { eventSpaceIds },
                  ))}
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-gray-500">X
                  <input type="number" min={0} max={map.width} step="0.5" value={Math.round(selected.x * 10) / 10} onChange={(e) => editSelected(moveMapPoint(map, selected.id, Number(e.target.value), selected.y))} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                </label>
                <label className="block text-xs text-gray-500">Y
                  <input type="number" min={0} max={map.height} step="0.5" value={Math.round(selected.y * 10) / 10} onChange={(e) => editSelected(moveMapPoint(map, selected.id, selected.x, Number(e.target.value)))} className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-gray-500">GPS lat
                  <input
                    type="number"
                    min={-90}
                    max={90}
                    step="any"
                    value={gpsInputValue((selected as unknown as { lat?: unknown }).lat)}
                    aria-invalid={Boolean(selectedGpsIssue)}
                    onChange={(event) => editSelected(updateMapPoint(map, selected.id, {
                      lat: event.target.value === '' ? undefined : Number(event.target.value),
                    }))}
                    className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </label>
                <label className="block text-xs text-gray-500">GPS lng
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    step="any"
                    value={gpsInputValue((selected as unknown as { lng?: unknown }).lng)}
                    aria-invalid={Boolean(selectedGpsIssue)}
                    onChange={(event) => editSelected(updateMapPoint(map, selected.id, {
                      lng: event.target.value === '' ? undefined : Number(event.target.value),
                    }))}
                    className="mt-1 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </label>
              </div>
              {selectedGpsIssue && (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700" role="alert">
                  <p className="font-medium">{selectedGpsIssue}</p>
                  <p className="mt-0.5">
                    Saved latitude {recoveryValueLabel((selected as unknown as { lat?: unknown }).lat)}; longitude {recoveryValueLabel((selected as unknown as { lng?: unknown }).lng)}.
                  </p>
                  <button
                    type="button"
                    onClick={() => editSelected(updateMapPoint(map, selected.id, {
                      lat: undefined,
                      lng: undefined,
                    }))}
                    className="mt-1 min-h-8 rounded border border-red-300 bg-white px-2 py-1 font-semibold hover:bg-red-100"
                  >
                    Clear both GPS fields
                  </button>
                </div>
              )}
              {selected.kind === 'space' && selected.venueId && (
                <p className="text-xs text-gray-500">→ {linkedVenueName(selected.venueId)}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {editing && (
                  <button type="button" onClick={finishPointEditing} className="min-h-11 flex-1 rounded-lg bg-[#4A1942] px-3 py-2 text-sm font-semibold text-white">
                    Done editing
                  </button>
                )}
                <button
                  type="button"
                  onClick={duplicateSelected}
                  disabled={selected.kind === 'space'}
                  className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title={selected.kind === 'space'
                    ? 'Each event space or lodging record uses one canonical destination pin.'
                    : 'Duplicate this point'}
                >
                  ⧉ Copy
                </button>
                <button type="button" onClick={cancelPointEdit} className="min-h-11 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  {editing ? newPointDraftRef.current ? 'Discard new point' : 'Revert point edits' : 'Close'}
                </button>
                <button type="button" onClick={removeSelected} className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50">Delete</button>
              </div>
              <p className="text-[11px] text-gray-500">
                {editing
                  ? 'Changes are already in this local working draft. Use Revert or Undo to roll them back; only Save & publish updates portals.'
                  : 'This point is selected. Drag it on the map or edit a field; only Save & publish updates portals.'}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 p-3">
            <span className="text-sm font-semibold text-gray-800">Walkway routes</span>
            <p className="mt-1 text-[11px] text-gray-500">Routes are authored paths used for portal wayfinding. Only mark a route step-free after venue verification.</p>
            <div className="mt-2 space-y-2">
              {(map.routes || []).map((route) => (
                <div key={route.id} className="rounded-lg border border-gray-200 bg-white p-2 text-xs">
                  {renamingRoute === route.id ? (
                    <div className="space-y-2">
                      <label className="block text-[11px] text-gray-500">Route name
                        <input
                          type="text"
                          maxLength={VENUE_MAP_MAX_ROUTE_NAME_LENGTH}
                          value={routeRename}
                          onChange={(event) => setRouteRename(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') { setRenamingRoute(null); setRouteRename(''); }
                          }}
                          autoFocus
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                          aria-label="Route name"
                          aria-invalid={routeRename.trim().length === 0 || routeRename.trim().length > VENUE_MAP_MAX_ROUTE_NAME_LENGTH}
                        />
                        <span className={`mt-0.5 block text-right text-[10px] ${routeRename.trim().length === 0 || routeRename.trim().length > VENUE_MAP_MAX_ROUTE_NAME_LENGTH ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                          {routeRename.length}/{VENUE_MAP_MAX_ROUTE_NAME_LENGTH}
                        </span>
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <label className="text-[11px] text-gray-500">Audience
                          <select
                            value={audienceSelectValue(routeEditAudience as unknown)}
                            aria-label={`Visibility for walkway ${routeBeingEdited?.name || 'walkway'}`}
                            aria-invalid={audienceSelectValue(routeEditAudience as unknown) === ''}
                            onChange={(event) => setRouteEditAudience(event.target.value as VenueMapAudience)}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-1 py-1 text-xs"
                          >
                            {audienceSelectValue(routeEditAudience as unknown) === '' && <option value="" disabled>Choose visibility to repair…</option>}
                            {MAP_AUDIENCES.map((audience) => <option key={audience} value={audience}>{mapAudienceLabel(audience)}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] text-gray-500">Routing priority
                          <select value={routeEditPriority} onChange={(event) => setRouteEditPriority(event.target.value as VenueMapRoutePriority)} className="mt-1 w-full rounded border border-gray-300 bg-white px-1 py-1 text-xs">
                            {MAP_ROUTE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{routePriorityLabel(priority)}</option>)}
                          </select>
                        </label>
                        <label className="text-[11px] text-gray-500">Mobility status
                          <select
                            value={accessibilitySelectValue(routeEditAccessibility as unknown)}
                            aria-label={`Mobility status for walkway ${routeBeingEdited?.name || 'walkway'}`}
                            aria-invalid={accessibilitySelectValue(routeEditAccessibility as unknown) === ''}
                            onChange={(event) => setRouteEditAccessibility(event.target.value as VenueMapRouteAccessibility)}
                            className="mt-1 w-full rounded border border-gray-300 bg-white px-1 py-1 text-xs"
                          >
                            {accessibilitySelectValue(routeEditAccessibility as unknown) === '' && <option value="" disabled>Choose mobility status to repair…</option>}
                            <option value="unknown">Not verified</option>
                            <option value="step-free">Verified step-free</option>
                            <option value="not-step-free">Not step-free</option>
                          </select>
                        </label>
                      </div>
                      <EventScopeEditor
                        eventSpaceIds={routeEditEventSpaceIds}
                        venues={uniquelyLinkableVenues}
                        subjectLabel={routeRename || route.name}
                        compact
                        onChange={(eventSpaceIds) => setRouteEditEventSpaceIds(eventSpaceIds || [])}
                      />
                      <fieldset className="rounded border border-gray-200 p-2">
                        <legend className="px-1 text-[11px] font-medium text-gray-600">Travel order</legend>
                        <div className="space-y-1">
                          {routeEditPointIds.map((pointId, index) => {
                            const point = map.points.find((item) => item.id === pointId);
                            return (
                              <div key={pointId} className="flex items-center gap-1 rounded bg-gray-50 px-1.5 py-1 text-[11px]">
                                <span className="w-4 text-gray-400">{index + 1}.</span>
                                <span className="min-w-0 flex-1 truncate text-gray-700">{point?.label || 'Missing point'}</span>
                                <button type="button" disabled={index === 0} onClick={() => setRouteEditPointIds((ids) => { const next = [...ids]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-200 disabled:opacity-30" aria-label={`Move ${point?.label || 'point'} earlier`}>↑</button>
                                <button type="button" disabled={index === routeEditPointIds.length - 1} onClick={() => setRouteEditPointIds((ids) => { const next = [...ids]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-200 disabled:opacity-30" aria-label={`Move ${point?.label || 'point'} later`}>↓</button>
                                <button type="button" onClick={() => setRouteEditPointIds((ids) => ids.filter((id) => id !== pointId))} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded text-red-600 hover:bg-red-100" aria-label={`Remove ${point?.label || 'point'} from walkway`}>✕</button>
                              </div>
                            );
                          })}
                        </div>
                        <select
                          value=""
                          onChange={(event) => {
                            if (!event.target.value) return;
                            setRouteEditPointIds((ids) => {
                              if (ids.length >= VENUE_MAP_MAX_ROUTE_POINTS) {
                                showToast(`A walkway can contain at most ${VENUE_MAP_MAX_ROUTE_POINTS} ordered points.`, 'warning');
                                return ids;
                              }
                              return [...ids, event.target.value];
                            });
                          }}
                          className="mt-1.5 w-full rounded border border-gray-300 bg-white px-1 py-1 text-[11px]"
                          aria-label="Add point to edited walkway"
                        >
                          <option value="">Add another point…</option>
                          {map.points.map((point) => <option key={point.id} value={point.id} disabled={routeEditPointIds.includes(point.id)}>{point.label}</option>)}
                        </select>
                        {routeEditPointIds.length < 2 && <p className="mt-1 text-[10px] text-red-600">Add at least two points before applying.</p>}
                      </fieldset>
                      <label className="block text-[11px] text-gray-500">Route guidance or cautions
                        <textarea
                          maxLength={VENUE_MAP_MAX_GUIDANCE_LENGTH}
                          value={routeEditNotes}
                          onChange={(event) => setRouteEditNotes(event.target.value)}
                          rows={2}
                          className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1 text-xs"
                          aria-label="Route guidance or cautions"
                          aria-invalid={routeEditNotes.trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH}
                        />
                        <span className={`mt-0.5 block text-right text-[10px] ${routeEditNotes.trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH ? 'font-semibold text-red-700' : 'text-gray-400'}`}>
                          {routeEditNotes.length}/{VENUE_MAP_MAX_GUIDANCE_LENGTH}
                        </span>
                      </label>
                      {routeEditReferenceIssues.length > 0 && (
                        <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-900" role="alert">
                          <p className="font-semibold">Repair the walkway travel order before applying.</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {routeEditReferenceIssues.map((issue) => (
                              <li key={`${issue.index}:${issue.pointId}`}>
                                Stop {issue.index + 1}:{' '}
                                {issue.reason === 'unavailable'
                                  ? `point ID “${issue.pointId}” is no longer available`
                                  : issue.reason === 'ambiguous'
                                    ? `point ID “${issue.pointId}” is ambiguous`
                                    : issue.reason === 'duplicate'
                                      ? `point ID “${issue.pointId}” is repeated`
                                      : issue.reason === 'coincident'
                                        ? 'every walkway stop is at the same map position'
                                        : 'the saved point reference is malformed'}.
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {routeEditDeliveryIssues.length > 0 && (
                        <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-900" role="alert">
                          <p className="font-semibold">Repair point visibility before applying this walkway.</p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4">
                            {routeEditDeliveryIssues.map((issue) => (
                              <li key={issue.point.id}>
                                <strong>{issue.point.label}:</strong> {routeDeliveryIssueDescription(issue, venues)}.
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => { setRenamingRoute(null); setRouteRename(''); }} className="min-h-8 rounded border border-gray-300 px-3 py-1 text-gray-600 hover:bg-gray-50">Cancel</button>
                        <button
                          type="button"
                          disabled={!routeBeingEdited
                            || audienceSelectValue(routeEditAudience as unknown) === ''
                            || accessibilitySelectValue(routeEditAccessibility as unknown) === ''
                            || routeRename.trim().length === 0
                            || routeRename.trim().length > VENUE_MAP_MAX_ROUTE_NAME_LENGTH
                            || routeEditNotes.trim().length > VENUE_MAP_MAX_GUIDANCE_LENGTH
                            || routeEditPointIds.length < 2
                            || routeEditReferenceIssues.length > 0
                            || routeEditDeliveryIssues.length > 0}
                          onClick={commitRename}
                          className="min-h-8 rounded bg-teal-700 px-3 py-1 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Apply route changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate font-semibold text-gray-700">🚶 {route.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <button type="button" onClick={() => startRename(route.id, route.name)} className="inline-flex min-h-8 items-center rounded px-2 text-teal-700 hover:bg-teal-50 hover:underline" aria-label={`Edit ${route.name}`}>Edit</button>
                          <button type="button" onClick={() => { pushUndo(map); update(removeMapRoute(map, route.id)); showToast('Walkway removed. Save the venue map to publish this change.', 'info'); }} className="inline-flex min-h-8 items-center rounded px-2 text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${route.name}`}>Delete</button>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{mapAudienceLabel(route.audience)}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${route.priority === 'preferred' ? 'bg-emerald-100 text-emerald-800' : route.priority === 'secondary' ? 'bg-violet-100 text-violet-800' : route.priority === 'emergency-only' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                          {routePriorityLabel(route.priority)}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${route.accessibility === 'step-free' ? 'bg-blue-100 text-blue-800' : route.accessibility === 'not-step-free' ? 'bg-amber-100 text-amber-800' : route.accessibility === undefined || route.accessibility === 'unknown' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-800'}`}>
                          {route.accessibility === 'step-free' ? '♿ ' : ''}{routeAccessibilityLabel(route.accessibility)}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{route.pointIds.length} points</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{route.eventSpaceIds?.length ? `${route.eventSpaceIds.length} event space${route.eventSpaceIds.length === 1 ? '' : 's'}` : 'All events'}</span>
                      </div>
                      {route.notes && <p className="text-[11px] leading-snug text-gray-500">{route.notes}</p>}
                      <button
                        type="button"
                        onClick={() => { pushUndo(map); update(updateMapRoute(map, route.id, { pointIds: [...route.pointIds].reverse() })); }}
                        className="inline-flex min-h-8 items-center rounded px-2 text-[10px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 hover:underline"
                      >
                        Reverse route order
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {(!map.routes || map.routes.length === 0) && <p className="text-xs text-gray-400">No walkways yet.</p>}
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 no-print spm-studio-chrome">
        <span className={`mr-auto text-xs font-medium ${dirty || stagedDraftDirty || baseMapUploading || saving || unmanagedCloudBaseMap || baseMapLoadBlocksPublication || baseImageIntegrityIssues.length > 0 || mapComplexityRecoveryPending || mapFrameRecoveryPending || structuralRecoveryPending || duplicateRecoveryPending || spacePointLinkCollisionPending || routeReferenceRecoveryPending || authoredZeroGeometryRoutes.length > 0 || rainContingencyCollisionRecoveryPending || drawingIntegrityRecoveryPending || textIntegrityIssues.length > 0 || audienceIntegrityIssues.length > 0 || arrivalRoleIntegrityIssues.length > 0 || routeAccessibilityIntegrityIssues.length > 0 || invalidGpsPoints.length > 0 || invalidAuthoredDrawings.length > 0 || invalidSpacePointLinks.length > 0 || invalidRainContingencies.length > 0 || invalidEventScopeObjects.length > 0 || routeDeliveryIssues.length > 0 || guestRouteCoverageIssues.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`} role="status">
          {baseMapUploading
            ? '● Base map upload in progress — keep this page open'
            : saving
              ? '● Publishing canonical venue map…'
              : baseImageIntegrityIssues.length > 0
                ? '● Repair or remove the invalid base-map configuration before publishing'
                : unmanagedCloudBaseMap
                  ? '● Private base-map upload required before the next publication'
                  : baseMapLoadBlocksPublication
                    ? baseMapLoadState === 'error'
                      ? '● Base map failed to load — retry, replace, or remove it before publishing'
                      : '● Base map is loading — publishing will unlock when it is ready'
                    : mapComplexityRecoveryPending
                      ? '● Oversized Venue Map recovery is pending — download the original recovery JSON, then reset the map before publishing'
                      : mapFrameRecoveryPending
                  ? '● Accept valid map dimensions or reset the Venue Map before publishing'
                  : structuralRecoveryPending
                    ? '● Reconstruct or remove malformed saved map occurrences before publishing'
                  : duplicateRecoveryPending
                    ? '● Resolve quarantined duplicate identities before publishing'
                  : spacePointLinkCollisionPending
                    ? '● Keep one canonical destination pin per venue before publishing'
                  : routeReferenceRecoveryPending
                    ? '● Repair quarantined walkway priorities, point references, or same-position stops before publishing'
                    : authoredZeroGeometryRoutes.length > 0
                      ? '● Move or replace same-position walkway stops before publishing'
                    : rainContingencyCollisionRecoveryPending
                      ? '● Resolve duplicate or competing rain plans before publishing'
                      : drawingIntegrityRecoveryPending
                        ? '● Repair, convert, or remove quarantined map shapes before publishing'
                        : textIntegrityIssues.length > 0
                          ? '● Repair overlong or missing map text before publishing'
                          : audienceIntegrityIssues.length > 0
                            ? '● Repair invalid map visibility before publishing'
                            : arrivalRoleIntegrityIssues.length > 0
                              ? '● Repair invalid Entry / Exit arrival roles before publishing'
                            : routeAccessibilityIntegrityIssues.length > 0
                              ? '● Repair invalid walkway mobility status before publishing'
                              : invalidGpsPoints.length > 0
                                ? '● Repair invalid or partial point GPS coordinates before publishing'
                            : invalidAuthoredDrawings.length > 0
                              ? '● Repair edited shape geometry before publishing'
                            : invalidSpacePointLinks.length > 0
                            ? '● Link, reclassify, or remove unavailable space pins before publishing'
                      : invalidRainContingencies.length > 0
                      ? '● Repair unavailable rain backups before publishing'
                      : invalidEventScopeObjects.length > 0
                        ? '● Remove unavailable event-space scopes before publishing'
                        : routeDeliveryIssues.length > 0
                          ? '● Repair walkway audience or event-scope mismatches before publishing'
                          : stagedDraftDirty
                          ? '● Finish or reset the in-progress map settings or walkway form before publishing'
                          : dirty
                            ? `● Local draft has unpublished changes${guestRouteCoverageIssues.length > 0
                              ? ` · ${guestRouteCoverageIssues.length} guest ${guestRouteCoverageIssues.length === 1 ? 'destination has' : 'destinations have'} known wayfinding gaps; publication requires confirmation`
                              : ''}`
                            : guestRouteCoverageIssues.length > 0
                              ? `✓ Canonical venue map is saved · ${guestRouteCoverageIssues.length} guest ${guestRouteCoverageIssues.length === 1 ? 'destination has' : 'destinations have'} known wayfinding gaps; review before the next publication`
                              : '✓ Canonical venue map is saved'}
        </span>
        {onClose && <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Close</button>}
        <button
          type="button"
          disabled={baseMapUploading || saving || unmanagedCloudBaseMap || baseMapLoadBlocksPublication}
          title={baseMapLoadBlocksPublication
            ? baseMapLoadState === 'error'
              ? 'Retry, replace, or remove the base map before publishing'
              : 'Wait for the base map to finish loading'
            : undefined}
          onClick={() => void publishMap()}
          className="px-4 py-2 rounded-lg bg-[#4A1942] text-white text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          💾 {saving ? 'Publishing…' : 'Save & publish Venue Map'}
        </button>
      </div>

      {pendingVisualArtifact && (
        <section
          key={pendingVisualArtifact.id}
          data-map-artifact-output="projected"
          className="spm-venue-map-artifact-output"
          aria-hidden="true"
        >
          <p className="mb-3 border-b border-gray-300 pb-2 text-xs text-gray-700">
            Artifact source: {pendingVisualArtifact.sourceLabel}. Audience: {pendingVisualArtifact.audienceLabel}. Prepared {pendingVisualArtifact.preparedAt}.
          </p>
          <VenueMapCanvas
            map={pendingVisualArtifact.map}
            editable={false}
            title={pendingVisualArtifact.options.headerText}
            showLegend
            hideMapWhenBackgroundUnavailable
            onBackgroundLoadStateChange={setArtifactBaseMapLoadSnapshot}
            svgRef={artifactSvgRef as React.RefObject<SVGSVGElement>}
          />
          <VenueMapRainPlanGuidance
            rainContingencies={pendingVisualArtifact.map.rainContingencies}
            venues={pendingVisualArtifact.venues}
          />
        </section>
      )}

      <section
        className="spm-venue-map-print-fallback"
        aria-hidden="true"
      >
        <h1>Venue Map print not prepared</h1>
        <p>
          Close this print dialog and use the Venue Map Designer’s Print button. The app will create an audience-projected artifact and verify the complete base map before printing.
        </p>
      </section>

      <ConfirmDialog
        open={pendingPointDeletion !== null}
        title="Delete a route-linked point?"
        message={`This removes “${pendingPointDeletion?.pointLabel || 'this point'}” from the working draft. It is used by ${pendingPointDeletion?.affectedRoutes.length || 0} ${(pendingPointDeletion?.affectedRoutes.length || 0) === 1 ? 'walkway' : 'walkways'}: ${(pendingPointDeletion?.affectedRoutes || []).slice(0, 5).map((route) => `“${route.name}”`).join(', ')}${(pendingPointDeletion?.affectedRoutes.length || 0) > 5 ? `, plus ${(pendingPointDeletion?.affectedRoutes.length || 0) - 5} more` : ''}. Those walkways will move into explicit recovery, and Undo cannot restore this deletion. Nothing changes in portals until you publish.`}
        confirmLabel="Delete point & quarantine walkways"
        cancelLabel="Keep point"
        initialFocus="cancel"
        tone="danger"
        onConfirm={confirmPointDeletion}
        onCancel={() => setPendingPointDeletion(null)}
      />

      <ConfirmDialog
        open={confirmPublishWithRouteGaps}
        title="Publish with known wayfinding gaps?"
        message={`This map has ${guestRouteCoverageIssues.length} guest ${guestRouteCoverageIssues.length === 1 ? 'destination gap' : 'destination gaps'}: ${guestRouteCoverageIssues.slice(0, 3).map((issue) => `${issue.pointLabel}: ${issue.message}`).join(' ')}${guestRouteCoverageIssues.length > 3 ? ` Plus ${guestRouteCoverageIssues.length - 3} more shown in the coverage report.` : ''} Publishing will not create a missing pin or route, or claim step-free access. Confirm only if this map is intentionally informational or you have independently handled destination and arrival guidance.`}
        confirmLabel="Publish anyway"
        cancelLabel="Review gaps"
        initialFocus="cancel"
        tone="danger"
        busy={saving}
        onConfirm={() => {
          setConfirmPublishWithRouteGaps(false);
          void publishMap(true);
        }}
        onCancel={() => {
          setConfirmPublishWithRouteGaps(false);
          window.setTimeout(() => routeCoverageHeadingRef.current?.focus(), 0);
        }}
      />

      <ConfirmDialog
        open={pendingRouteSwitch !== null}
        title="Discard unapplied walkway changes?"
        message={`You have unapplied changes to “${routeBeingEdited?.name || 'the current walkway'}”. Opening “${pendingRouteSwitch?.routeName || 'the selected walkway'}” will discard only those form changes. The published Venue Map will not change.`}
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        initialFocus="cancel"
        tone="danger"
        onConfirm={discardRouteEditAndSwitch}
        onCancel={() => setPendingRouteSwitch(null)}
      />

      <ConfirmDialog
        open={confirmResetMalformedMap}
        title="Reset the entire Venue Map?"
        message={`${mapComplexityRecoveryPending ? `The ${quarantinedMapRecoveryRedactedRef.current ? 'redacted' : 'original'} recovery JSON download was initiated. Keep that file if you may need any oversized-map data. ` : ''}This starts a new 100 × 80 working map and removes every recovered point, walkway, shape, rain plan, and base image. This reset cannot be undone inside the designer. The currently published map remains unchanged unless you save and publish the new empty map.`}
        confirmLabel="Reset working map"
        cancelLabel="Keep recovery map"
        initialFocus="cancel"
        tone="danger"
        onConfirm={resetMalformedVenueMap}
        onCancel={() => setConfirmResetMalformedMap(false)}
      />

      <ConfirmDialog
        open={confirmClearZones}
        title="Clear all property shapes?"
        message={`This removes all ${(map.drawings || []).length} shape${(map.drawings || []).length === 1 ? '' : 's'} from the working draft${zoneAudienceSummary ? ` (${zoneAudienceSummary})` : ''}. Nothing changes in portals until you publish. You can still use Undo before leaving the designer.`}
        confirmLabel="Clear all shapes"
        cancelLabel="Keep shapes"
        initialFocus="cancel"
        tone="danger"
        onConfirm={clearAllZones}
        onCancel={() => setConfirmClearZones(false)}
      />
    </div>
  );
}
