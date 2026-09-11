import { useEffect, useId, useRef, useState } from 'react';
import { DrawingObject, VenueMapConfig, VenueMapPoint, VenueMapPointKind } from '../types';
import {
  arrivalRoleLabel,
  pointColor,
  pointKindIcon,
  pointKindLabel,
  partitionVenueMapBaseImageIntegrity,
  routePoints,
  venueMapDrawingBounds,
  venueMapPointTypeLabel,
} from '../utils/venueMapDesigner';
import { isStoragePathRef, resolveImageRef } from '../services/storage/imageStorage';
import { VenueMapDrawingGuidance } from './VenueMapDrawingGuidance';
import { VenueMapPointGuidance } from './VenueMapPointGuidance';
import { VenueMapRouteGuidance } from './VenueMapRouteGuidance';

export type VenueMapCanvasInteractionMode = 'select' | 'place' | 'walkway';
export type VenueMapBackgroundLoadState = 'none' | 'loading' | 'ready' | 'error';
export interface VenueMapBackgroundLoadSnapshot {
  source?: string;
  state: VenueMapBackgroundLoadState;
}

export interface VenueMapCanvasProps {
  map: VenueMapConfig;
  /** When true, existing points can be selected and repositioned. */
  editable?: boolean;
  /**
   * Explicit designer gesture mode. Editable canvases default to the safe
   * selection mode; empty-canvas clicks never create data unless a creation
   * mode is deliberately active.
   */
  interactionMode?: VenueMapCanvasInteractionMode;
  selectedPointId?: string | null;
  onSelectPoint?: (id: string | null) => void;
  /** Fired after an existing point is clicked/tapped without being dragged. */
  onActivatePoint?: (id: string) => void;
  onMovePoint?: (id: string, x: number, y: number) => void;
  /** Selected property shape; shapes are interactive only in Select & Move. */
  selectedDrawingId?: string | null;
  onSelectDrawing?: (id: string | null) => void;
  /** Translate a whole shape by an incremental map-coordinate delta. */
  onMoveDrawing?: (id: string, deltaX: number, deltaY: number) => void;
  onPlacePoint?: (kind: VenueMapPointKind, x: number, y: number) => void;
  /** Which point kind an intentional placement click creates. */
  placeKind?: VenueMapPointKind;
  /** Point ids to visually highlight (e.g. pins already added to an in-progress route). */
  highlightPointIds?: string[];
  /** Transient editor-only point ids that must never appear in print or exports. */
  transientPointIds?: string[];
  /** Fired on click/tap of an actionable point in read-only mode. */
  onPointClick?: (point: VenueMapPoint) => void;
  /** Limits which read-only points expose button semantics and invoke the action. */
  isPointInteractive?: (point: VenueMapPoint) => boolean;
  /** Describes the read-only action in each interactive point's accessible name. */
  pointActionLabel?: (point: VenueMapPoint) => string;
  /** Show labels (default true). */
  showLabels?: boolean;
  /** Render an external color/symbol key for point kinds present. */
  showLegend?: boolean;
  /** Forwarded so print/export can capture only the authored spatial SVG. */
  svgRef?: React.RefObject<SVGSVGElement | null>;
  /** Optional visible title rendered outside the spatial SVG. */
  title?: string;
  /** Hide spatial geometry while a configured base image is loading or unavailable. */
  hideMapWhenBackgroundUnavailable?: boolean;
  /** Reports source-bound signed-resolution plus actual browser decode state. */
  onBackgroundLoadStateChange?: (snapshot: VenueMapBackgroundLoadSnapshot) => void;
  /** Re-pull portal data when the server reports that the published image is unavailable. */
  onRetryBackgroundImage?: () => void;
}

const KIND_RADIUS: Record<VenueMapPointKind, number> = {
  space: 5,
  parking: 5,
  entry: 4.5,
  amenity: 4,
  path: 2,
};
const ALL_KINDS: VenueMapPointKind[] = ['space', 'parking', 'entry', 'amenity', 'path'];
const hasValidGps = (point: VenueMapPoint) =>
  Number.isFinite(point.lat)
  && Number.isFinite(point.lng)
  && point.lat! >= -90
  && point.lat! <= 90
  && point.lng! >= -180
  && point.lng! <= 180;

interface MapClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function venueMapPolylineMidpoint(
  points: readonly Pick<VenueMapPoint, 'x' | 'y'>[],
): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const segments = points.slice(1).map((point, index) => {
    const start = points[index];
    return { start, end: point, length: Math.hypot(point.x - start.x, point.y - start.y) };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength === 0) return { x: points[0].x, y: points[0].y };
  let remaining = totalLength / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

/** Convert a viewport point through an xMidYMid/meet SVG viewport. */
export function clientPointToVenueMap(
  rect: MapClientRect,
  mapWidth: number,
  mapHeight: number,
  clientX: number,
  clientY: number,
): { x: number; y: number; inside: boolean } {
  const width = Math.max(1, mapWidth);
  const height = Math.max(1, mapHeight);
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0, inside: false };
  const scale = Math.min(rect.width / width, rect.height / height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0, y: 0, inside: false };
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;
  const rawX = (clientX - rect.left - offsetX) / scale;
  const rawY = (clientY - rect.top - offsetY) / scale;
  return {
    x: Math.max(0, Math.min(width, rawX)),
    y: Math.max(0, Math.min(height, rawY)),
    inside: rawX >= 0 && rawX <= width && rawY >= 0 && rawY <= height,
  };
}

/**
 * Shared, reusable full-property renderer. Pointer, keyboard, and assistive-
 * technology interactions all use the same point model in editable and portal
 * views.
 */
export function VenueMapCanvas({
  map,
  editable = false,
  interactionMode = 'select',
  selectedPointId,
  onSelectPoint,
  onActivatePoint,
  onMovePoint,
  selectedDrawingId,
  onSelectDrawing,
  onMoveDrawing,
  onPlacePoint,
  placeKind = 'space',
  highlightPointIds,
  transientPointIds,
  onPointClick,
  isPointInteractive,
  pointActionLabel,
  showLabels = true,
  showLegend = false,
  svgRef,
  title,
  hideMapWhenBackgroundUnavailable = false,
  onBackgroundLoadStateChange,
  onRetryBackgroundImage,
}: VenueMapCanvasProps) {
  const panHintId = useId();
  const svgRefInternal = useRef<SVGSVGElement | null>(null);
  const ref = svgRef || svgRefInternal;
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    dx: number;
    dy: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    captureTarget: SVGGElement;
  } | null>(null);
  const drawingDragRef = useRef<{
    id: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startMapX: number;
    startMapY: number;
    emittedDeltaX: number;
    emittedDeltaY: number;
    minDeltaX: number;
    maxDeltaX: number;
    minDeltaY: number;
    maxDeltaY: number;
    moved: boolean;
    captureTarget: SVGGElement;
  } | null>(null);
  const completedPointGestureRef = useRef<{ id: string; moved: boolean } | null>(null);
  const completedDrawingGestureRef = useRef<{ id: string; moved: boolean } | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const suppressCanvasClickTimerRef = useRef<number | null>(null);
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [draggingDrawingId, setDraggingDrawingId] = useState<string | null>(null);
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const [focusedDrawingId, setFocusedDrawingId] = useState<string | null>(null);
  // Treat source + opacity as one integrity boundary even when a caller bypasses
  // the service projection helpers. An unsafe source must never reach SVG href.
  const baseImageSafeMap = partitionVenueMapBaseImageIntegrity(map);
  const backgroundSource = baseImageSafeMap.backgroundImageUrl;
  const backgroundImageUnavailable = Boolean(baseImageSafeMap.backgroundImageUnavailable);
  const [backgroundRetry, setBackgroundRetry] = useState(0);
  const [backgroundResolution, setBackgroundResolution] = useState<{
    source?: string;
    status: VenueMapBackgroundLoadState;
    url?: string;
  }>(() => {
    const source = backgroundSource;
    if (backgroundImageUnavailable) return { source, status: 'error' };
    if (!source) return { status: 'none' };
    if (!isStoragePathRef(source)) return { source, status: 'ready', url: source };
    return { source, status: 'loading' };
  });
  const [decodedBackground, setDecodedBackground] = useState<{
    source?: string;
    url?: string;
    status: 'none' | 'ready' | 'error';
  }>({ status: 'none' });

  useEffect(() => {
    let cancelled = false;
    const source = backgroundSource;
    if (backgroundImageUnavailable) {
      setBackgroundResolution({ source, status: 'error' });
      return () => { cancelled = true; };
    }
    if (!source) {
      setBackgroundResolution({ status: 'none' });
      return () => { cancelled = true; };
    }
    if (!isStoragePathRef(source)) {
      setBackgroundResolution({ source, status: 'ready', url: source });
      return () => { cancelled = true; };
    }

    const refreshSignedUrl = (initial: boolean) => {
      if (initial) setBackgroundResolution({ source, status: 'loading' });
      void resolveImageRef(source)
        .then((url) => {
          if (!cancelled) {
            setBackgroundResolution(url
              ? { source, status: 'ready', url }
              : { source, status: 'error' });
          }
        })
        .catch(() => {
          if (cancelled) return;
          setBackgroundResolution((current) => (
            !initial && current.source === source && current.status === 'ready'
              ? current
              : { source, status: 'error' }
          ));
        });
    };

    refreshSignedUrl(true);
    const refreshTimer = window.setInterval(() => refreshSignedUrl(false), 50 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [backgroundImageUnavailable, backgroundRetry, backgroundSource]);

  const activeResolution = backgroundImageUnavailable
    ? { source: backgroundSource, status: 'error' as const, url: undefined }
    : !backgroundSource
      ? { source: undefined, status: 'none' as const, url: undefined }
      : backgroundResolution.source === backgroundSource
        ? backgroundResolution
        : isStoragePathRef(backgroundSource)
          ? { source: backgroundSource, status: 'loading' as const, url: undefined }
          : { source: backgroundSource, status: 'ready' as const, url: backgroundSource };
  const resolvedBackgroundUrl = activeResolution.status === 'ready'
    ? activeResolution.url
    : undefined;
  const backgroundExpected = Boolean(backgroundSource || backgroundImageUnavailable);
  const backgroundLoadState: VenueMapBackgroundLoadState = !backgroundExpected
    ? 'none'
    : activeResolution.status === 'error'
      ? 'error'
      : activeResolution.status !== 'ready' || !resolvedBackgroundUrl
        ? 'loading'
        : decodedBackground.source === backgroundSource
          && decodedBackground.url === resolvedBackgroundUrl
          ? decodedBackground.status === 'ready' ? 'ready' : 'error'
          : 'loading';
  const backgroundUnavailable = backgroundLoadState === 'error';
  const hideSpatialMap = hideMapWhenBackgroundUnavailable
    && backgroundExpected
    && backgroundLoadState !== 'ready';
  useEffect(() => {
    onBackgroundLoadStateChange?.({
      source: backgroundSource,
      state: backgroundLoadState,
    });
  }, [backgroundLoadState, backgroundSource, onBackgroundLoadStateChange]);

  const retryBackground = () => {
    if (backgroundSource) {
      setDecodedBackground({ source: backgroundSource, status: 'none' });
      setBackgroundResolution({ source: backgroundSource, status: 'loading' });
      setBackgroundRetry((attempt) => attempt + 1);
    }
    onRetryBackgroundImage?.();
  };

  const W = Math.max(1, map.width || 100);
  const H = Math.max(1, map.height || 80);
  const unit = Math.max(0.25, Math.min(W, H) / 80);
  const mapAspectRatio = W / H;
  const extremeAspectRatio = mapAspectRatio > 4 || mapAspectRatio < 0.25;
  const minimumRenderedShortSide = 240;
  const extremeRenderedWidth = W >= H
    ? mapAspectRatio * minimumRenderedShortSide
    : minimumRenderedShortSide;

  const toMap = (event: { clientX: number; clientY: number }) => {
    const svg = ref.current;
    if (!svg) return { x: 0, y: 0, inside: false };
    return clientPointToVenueMap(svg.getBoundingClientRect(), W, H, event.clientX, event.clientY);
  };

  const canActivatePoint = (point: VenueMapPoint) =>
    point.kind !== 'path'
    && Boolean(onPointClick)
    && (isPointInteractive ? isPointInteractive(point) : true);
  const pointActionDescription = (point: VenueMapPoint) =>
    pointActionLabel?.(point) || (hasValidGps(point) ? 'Open in maps.' : 'Open this location.');

  const clearCanvasClickSuppression = () => {
    suppressCanvasClickRef.current = false;
    if (suppressCanvasClickTimerRef.current !== null) {
      window.clearTimeout(suppressCanvasClickTimerRef.current);
      suppressCanvasClickTimerRef.current = null;
    }
  };

  const suppressGestureCanvasClick = () => {
    suppressCanvasClickRef.current = true;
    if (suppressCanvasClickTimerRef.current !== null) {
      window.clearTimeout(suppressCanvasClickTimerRef.current);
    }
    // A compatibility click is dispatched immediately after pointerup. Keep the
    // guard through that click, then clear it before the next user gesture.
    suppressCanvasClickTimerRef.current = window.setTimeout(() => {
      suppressCanvasClickRef.current = false;
      suppressCanvasClickTimerRef.current = null;
    }, 0);
  };

  useEffect(() => () => {
    if (suppressCanvasClickTimerRef.current !== null) {
      window.clearTimeout(suppressCanvasClickTimerRef.current);
    }
  }, []);

  const handleSvgClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!editable) return;
    if (suppressCanvasClickRef.current) {
      clearCanvasClickSuppression();
      return;
    }
    const target = event.target as Element;
    if (target.closest('[data-map-point], [data-map-drawing], [data-map-ui]')) return;
    const position = toMap(event);
    if (!position.inside) return;
    if (interactionMode === 'select') {
      onSelectPoint?.(null);
      onSelectDrawing?.(null);
      return;
    }
    if (!onPlacePoint) return;
    onPlacePoint(interactionMode === 'walkway' ? 'path' : placeKind, position.x, position.y);
  };

  const drawingTypeLabel = (drawing: DrawingObject) => {
    if (drawing.type === 'zone') return 'Property zone';
    if (drawing.type === 'rectangle') return 'Rectangle';
    if (drawing.type === 'circle') return 'Circle';
    return 'Line';
  };
  const drawingAccessibleName = (drawing: DrawingObject) =>
    `${drawingTypeLabel(drawing)}: ${drawing.text?.trim() || 'Unlabeled shape'}. Use arrow keys to move.`;
  const drawingsInteractive = editable
    && interactionMode === 'select'
    && Boolean(onSelectDrawing);
  const handleDrawingDown = (
    event: React.PointerEvent<SVGGElement>,
    drawing: DrawingObject,
  ) => {
    if (!drawingsInteractive || !onMoveDrawing) return;
    event.preventDefault();
    event.stopPropagation();
    clearCanvasClickSuppression();
    suppressCanvasClickRef.current = true;
    const position = toMap(event);
    const bounds = venueMapDrawingBounds(drawing);
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture?.(event.pointerId);
    drawingDragRef.current = {
      id: drawing.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startMapX: position.x,
      startMapY: position.y,
      emittedDeltaX: 0,
      emittedDeltaY: 0,
      minDeltaX: -bounds.minX,
      maxDeltaX: W - bounds.maxX,
      minDeltaY: -bounds.minY,
      maxDeltaY: H - bounds.maxY,
      moved: false,
      captureTarget,
    };
    completedDrawingGestureRef.current = null;
    setDraggingDrawingId(drawing.id);
    onSelectDrawing?.(drawing.id);
  };

  const handleDrawingClick = (
    event: React.MouseEvent<SVGGElement>,
    drawing: DrawingObject,
  ) => {
    if (!drawingsInteractive) return;
    event.stopPropagation();
    const completed = completedDrawingGestureRef.current;
    completedDrawingGestureRef.current = null;
    clearCanvasClickSuppression();
    if (!completed || completed.id !== drawing.id) onSelectDrawing?.(drawing.id);
  };

  const handleDrawingKey = (
    event: React.KeyboardEvent<SVGGElement>,
    drawing: DrawingObject,
  ) => {
    if (!drawingsInteractive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectDrawing?.(drawing.id);
      return;
    }
    if (!onMoveDrawing || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    onSelectDrawing?.(drawing.id);
    onMoveDrawing(drawing.id, deltaX, deltaY);
  };

  const handlePointDown = (event: React.PointerEvent<SVGGElement>, point: VenueMapPoint) => {
    if (!editable || !onMovePoint) return;
    event.preventDefault();
    event.stopPropagation();
    clearCanvasClickSuppression();
    suppressCanvasClickRef.current = true;
    const position = toMap(event);
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      id: point.id,
      pointerId: event.pointerId,
      dx: point.x - position.x,
      dy: point.y - position.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      captureTarget,
    };
    completedPointGestureRef.current = null;
    setDraggingPointId(point.id);
    onSelectPoint?.(point.id);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointDrag = dragRef.current;
    if (pointDrag && pointDrag.pointerId === event.pointerId && onMovePoint) {
      const distance = Math.hypot(
        event.clientX - pointDrag.startClientX,
        event.clientY - pointDrag.startClientY,
      );
      // Ignore ordinary click/tap jitter. This avoids dirtying the map and adding
      // an undo entry when an admin only intended to select a point.
      if (!pointDrag.moved && distance < 4) return;
      event.preventDefault();
      pointDrag.moved = true;
      const position = toMap(event);
      onMovePoint(pointDrag.id, position.x + pointDrag.dx, position.y + pointDrag.dy);
      return;
    }

    const drawingDrag = drawingDragRef.current;
    if (!drawingDrag || drawingDrag.pointerId !== event.pointerId || !onMoveDrawing) return;
    const distance = Math.hypot(
      event.clientX - drawingDrag.startClientX,
      event.clientY - drawingDrag.startClientY,
    );
    if (!drawingDrag.moved && distance < 4) return;
    event.preventDefault();
    drawingDrag.moved = true;
    const position = toMap(event);
    const totalDeltaX = Math.max(
      drawingDrag.minDeltaX,
      Math.min(position.x - drawingDrag.startMapX, drawingDrag.maxDeltaX),
    );
    const totalDeltaY = Math.max(
      drawingDrag.minDeltaY,
      Math.min(position.y - drawingDrag.startMapY, drawingDrag.maxDeltaY),
    );
    const deltaX = totalDeltaX - drawingDrag.emittedDeltaX;
    const deltaY = totalDeltaY - drawingDrag.emittedDeltaY;
    drawingDrag.emittedDeltaX = totalDeltaX;
    drawingDrag.emittedDeltaY = totalDeltaY;
    if (deltaX !== 0 || deltaY !== 0) onMoveDrawing(drawingDrag.id, deltaX, deltaY);
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>, cancelled = false) => {
    const pointDrag = dragRef.current;
    if (pointDrag && pointDrag.pointerId === event.pointerId) {
      if (pointDrag.captureTarget.hasPointerCapture?.(event.pointerId)) {
        pointDrag.captureTarget.releasePointerCapture?.(event.pointerId);
      }
      dragRef.current = null;
      setDraggingPointId(null);
      if (cancelled) {
        completedPointGestureRef.current = null;
        clearCanvasClickSuppression();
        return;
      }
      completedPointGestureRef.current = { id: pointDrag.id, moved: pointDrag.moved };
      suppressGestureCanvasClick();
      return;
    }

    const drawingDrag = drawingDragRef.current;
    if (!drawingDrag || drawingDrag.pointerId !== event.pointerId) return;
    if (drawingDrag.captureTarget.hasPointerCapture?.(event.pointerId)) {
      drawingDrag.captureTarget.releasePointerCapture?.(event.pointerId);
    }
    drawingDragRef.current = null;
    setDraggingDrawingId(null);
    if (cancelled) {
      completedDrawingGestureRef.current = null;
      clearCanvasClickSuppression();
      return;
    }
    completedDrawingGestureRef.current = { id: drawingDrag.id, moved: drawingDrag.moved };
    suppressGestureCanvasClick();
  };

  const handlePointKey = (event: React.KeyboardEvent<SVGGElement>, point: VenueMapPoint) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (!editable && !canActivatePoint(point)) return;
      event.preventDefault();
      if (editable) {
        onSelectPoint?.(point.id);
        onActivatePoint?.(point.id);
      } else {
        onPointClick?.(point);
      }
      return;
    }
    if (!editable || !onMovePoint || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    onSelectPoint?.(point.id);
    onMovePoint(point.id, point.x + dx, point.y + dy);
  };

  const highlightedRoutePoints = (highlightPointIds || []).flatMap((id) => {
    const point = map.points.find((candidate) => candidate.id === id);
    return point ? [point] : [];
  });
  const legendKinds = ALL_KINDS.filter((kind) => map.points.some((point) => point.kind === kind));
  const visibleTitle = title?.trim();
  const mapName = visibleTitle || 'Venue map';
  const interactive = editable || map.points.some(canActivatePoint);
  const editorModeDescription = interactionMode === 'place'
    ? `Point placement mode. Click an empty map location to place ${pointKindLabel(placeKind)}.`
    : interactionMode === 'walkway'
      ? 'Walkway builder mode. Click existing locations or empty map positions in travel order.'
      : 'Select and move mode. Click a point or property shape to edit it, or drag it to a new position.';
  const actionablePoints = editable ? [] : map.points.filter(canActivatePoint);
  const nonActionableFallbackPoints = hideSpatialMap
    ? map.points.filter((point) => point.kind !== 'path' && !canActivatePoint(point))
    : [];
  const panExtremeMap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!extremeAspectRatio || event.defaultPrevented) return;
    const distance = event.shiftKey ? 160 : 64;
    const delta = event.key === 'ArrowLeft'
      ? { left: -distance, top: 0 }
      : event.key === 'ArrowRight'
        ? { left: distance, top: 0 }
        : event.key === 'ArrowUp'
          ? { left: 0, top: -distance }
          : event.key === 'ArrowDown'
            ? { left: 0, top: distance }
            : null;
    if (!delta) return;
    event.preventDefault();
    event.currentTarget.scrollBy({ ...delta, behavior: 'smooth' });
  };

  return (
    <div>
      {visibleTitle && (
        <header
          data-map-external-title="true"
          className="mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
        >
          <h3 className="break-words text-sm font-semibold text-gray-800">{visibleTitle}</h3>
        </header>
      )}
      {resolvedBackgroundUrl && backgroundLoadState !== 'ready' && (
        <img
          data-map-background-preloader="true"
          src={resolvedBackgroundUrl}
          alt=""
          aria-hidden="true"
          className="hidden no-print"
          onLoad={() => setDecodedBackground({
            source: backgroundSource,
            url: resolvedBackgroundUrl,
            status: 'ready',
          })}
          onError={() => {
            setDecodedBackground({
              source: backgroundSource,
              url: resolvedBackgroundUrl,
              status: 'error',
            });
            setBackgroundResolution({ source: backgroundSource, status: 'error' });
          }}
        />
      )}
      {backgroundExpected && backgroundLoadState === 'loading' && hideMapWhenBackgroundUnavailable && (
        <div className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-900" role="status">
          Loading the published property base map before showing spatial guidance…
        </div>
      )}
      {backgroundUnavailable && (
        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950" role="alert">
          <p className="font-semibold">The property base map is temporarily unavailable.</p>
          <p className="mt-1 text-xs">
            {hideMapWhenBackgroundUnavailable
              ? 'Spatial pins and walkways are hidden to avoid showing them against the wrong context. Named locations and any available actions remain below.'
              : 'Map vectors remain visible for venue-admin recovery. Retry first; if the image remains unavailable, upload a replacement base map or remove the broken reference.'}
          </p>
          {(backgroundSource || onRetryBackgroundImage) && (
            <button
              type="button"
              onClick={retryBackground}
              className="no-print spm-studio-chrome mt-2 min-h-11 rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100"
            >
              Retry base map
            </button>
          )}
        </div>
      )}
      {!hideSpatialMap && (
        <>
          {extremeAspectRatio && (
            <p id={panHintId} className="no-print mb-2 text-xs text-gray-600">
              This map has an extra-wide or extra-tall layout. Scroll, swipe, or focus this viewport and use the arrow keys to pan without shrinking its locations.
            </p>
          )}
          <div
            data-map-scroll-viewport
            tabIndex={extremeAspectRatio ? 0 : undefined}
            role={extremeAspectRatio ? 'region' : undefined}
            aria-label={extremeAspectRatio ? 'Scrollable venue map viewport' : undefined}
            aria-describedby={extremeAspectRatio ? panHintId : undefined}
            onKeyDown={panExtremeMap}
            className={`spm-map-scroll-viewport ${extremeAspectRatio
              ? 'max-h-[70vh] overflow-auto overscroll-contain rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700'
              : ''}`}
          >
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full rounded-lg border border-teal-100 bg-teal-50"
        role="group"
        aria-label={`${mapName}. ${map.points.length} mapped point${map.points.length === 1 ? '' : 's'}, ${(map.routes || []).length} walkway${(map.routes || []).length === 1 ? '' : 's'}, and ${(map.drawings || []).length} property shape${(map.drawings || []).length === 1 ? '' : 's'}.${editable ? ` ${editorModeDescription}` : ''}`}
        onClick={handleSvgClick}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={(event) => endDrag(event, true)}
        style={{
          aspectRatio: `${W} / ${H}`,
          cursor: editable
            ? interactionMode === 'select' ? 'default' : 'crosshair'
            : undefined,
          touchAction: editable
            ? extremeAspectRatio ? 'pan-x pan-y' : 'pan-y'
            : 'auto',
          width: extremeAspectRatio ? `${extremeRenderedWidth}px` : undefined,
          maxWidth: extremeAspectRatio ? 'none' : undefined,
          marginInline: extremeAspectRatio && H > W ? 'auto' : undefined,
        }}
      >
        <title>{mapName}</title>
        <desc>
          {editable
            ? `Interactive property map. ${editorModeDescription} Tab to individual points and property shapes for keyboard editing.`
            : interactive
              ? 'Interactive property map. Tab to individual points for details and actions.'
              : 'Property map showing venue locations and authored walkways.'}
        </desc>

        {/* The background and route overlays are always pointer-transparent.
            Shapes become controls only in Select & Move, remaining transparent
            during point placement and walkway authoring. */}
        {resolvedBackgroundUrl && (
          <image
            href={resolvedBackgroundUrl}
            x={0}
            y={0}
            width={W}
            height={H}
            preserveAspectRatio="none"
            opacity={baseImageSafeMap.backgroundOpacity ?? 0.85}
            pointerEvents="none"
            onLoad={() => setDecodedBackground({
              source: backgroundSource,
              url: resolvedBackgroundUrl,
              status: 'ready',
            })}
            onError={() => {
              setDecodedBackground({
                source: backgroundSource,
                url: resolvedBackgroundUrl,
                status: 'error',
              });
              setBackgroundResolution({
                source: backgroundSource,
                status: 'error',
              });
            }}
          />
        )}

        <g pointerEvents={drawingsInteractive ? 'auto' : 'none'} aria-hidden={drawingsInteractive ? undefined : true}>
          {(map.drawings || []).map((draw) => {
            const selected = selectedDrawingId === draw.id;
            const focused = focusedDrawingId === draw.id;
            if (draw.type === 'rectangle' || draw.type === 'zone') {
              const width = draw.width ?? 20 * unit;
              const height = draw.height ?? 15 * unit;
              return (
                <g
                  key={draw.id}
                  data-map-drawing={draw.id}
                  tabIndex={drawingsInteractive ? 0 : undefined}
                  role={drawingsInteractive ? 'button' : undefined}
                  aria-label={drawingsInteractive ? drawingAccessibleName(draw) : undefined}
                  aria-pressed={drawingsInteractive ? selected : undefined}
                  onPointerDown={(event) => handleDrawingDown(event, draw)}
                  onClick={(event) => handleDrawingClick(event, draw)}
                  onKeyDown={(event) => handleDrawingKey(event, draw)}
                  onFocus={() => {
                    if (!drawingsInteractive) return;
                    setFocusedDrawingId(draw.id);
                    onSelectDrawing?.(draw.id);
                  }}
                  onBlur={() => setFocusedDrawingId((current) => current === draw.id ? null : current)}
                  transform={draw.rotation
                    ? `rotate(${draw.rotation} ${draw.x + width / 2} ${draw.y + height / 2})`
                    : undefined}
                  style={{
                    cursor: drawingsInteractive
                      ? draggingDrawingId === draw.id ? 'grabbing' : 'grab'
                      : 'default',
                    touchAction: drawingsInteractive ? 'none' : 'auto',
                  }}
                >
                  <rect
                    x={draw.x}
                    y={draw.y}
                    width={width}
                    height={height}
                    fill={draw.fillColor || '#0d9488'}
                    fillOpacity={draw.opacity ?? 0.25}
                    stroke={draw.strokeColor || '#0d9488'}
                    strokeOpacity={draw.opacity ?? 1}
                    strokeWidth={draw.strokeWidth ?? 1 * unit}
                    rx={2 * unit}
                  />
                  {draw.text && (
                    <text
                      x={draw.x + width / 2}
                      y={draw.y + height / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={draw.fontSize ?? 3.5 * unit}
                      fontWeight="bold"
                      fill={draw.strokeColor || '#0d9488'}
                    >
                      {draw.text}
                    </text>
                  )}
                  {(selected || focused) && (
                    <g
                      data-map-drawing-focus-ring={focused ? draw.id : undefined}
                      data-map-export-exclude="true"
                      pointerEvents="none"
                      aria-hidden="true"
                    >
                      <rect x={draw.x} y={draw.y} width={width} height={height} rx={2 * unit} fill="none" stroke="#ffffff" strokeWidth={3 * unit} />
                      <rect x={draw.x} y={draw.y} width={width} height={height} rx={2 * unit} fill="none" stroke={selected ? '#4A1942' : '#111827'} strokeWidth={1.4 * unit} strokeDasharray={`${2 * unit},${1.2 * unit}`} />
                    </g>
                  )}
                </g>
              );
            }
            if (draw.type === 'circle') {
              const radius = draw.radius ?? 10 * unit;
              return (
                <g
                  key={draw.id}
                  data-map-drawing={draw.id}
                  tabIndex={drawingsInteractive ? 0 : undefined}
                  role={drawingsInteractive ? 'button' : undefined}
                  aria-label={drawingsInteractive ? drawingAccessibleName(draw) : undefined}
                  aria-pressed={drawingsInteractive ? selected : undefined}
                  onPointerDown={(event) => handleDrawingDown(event, draw)}
                  onClick={(event) => handleDrawingClick(event, draw)}
                  onKeyDown={(event) => handleDrawingKey(event, draw)}
                  onFocus={() => {
                    if (!drawingsInteractive) return;
                    setFocusedDrawingId(draw.id);
                    onSelectDrawing?.(draw.id);
                  }}
                  onBlur={() => setFocusedDrawingId((current) => current === draw.id ? null : current)}
                  style={{
                    cursor: drawingsInteractive
                      ? draggingDrawingId === draw.id ? 'grabbing' : 'grab'
                      : 'default',
                    touchAction: drawingsInteractive ? 'none' : 'auto',
                  }}
                >
                  <circle
                    cx={draw.x}
                    cy={draw.y}
                    r={radius}
                    fill={draw.fillColor || '#0d9488'}
                    fillOpacity={draw.opacity ?? 0.25}
                    stroke={draw.strokeColor || '#0d9488'}
                    strokeOpacity={draw.opacity ?? 1}
                    strokeWidth={draw.strokeWidth ?? 1 * unit}
                  />
                  {draw.text && (
                    <text
                      x={draw.x}
                      y={draw.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={draw.fontSize ?? 3.5 * unit}
                      fontWeight="bold"
                      fill={draw.strokeColor || '#0d9488'}
                    >
                      {draw.text}
                    </text>
                  )}
                  {(selected || focused) && (
                    <g
                      data-map-drawing-focus-ring={focused ? draw.id : undefined}
                      data-map-export-exclude="true"
                      pointerEvents="none"
                      aria-hidden="true"
                    >
                      <circle cx={draw.x} cy={draw.y} r={radius} fill="none" stroke="#ffffff" strokeWidth={3 * unit} />
                      <circle cx={draw.x} cy={draw.y} r={radius} fill="none" stroke={selected ? '#4A1942' : '#111827'} strokeWidth={1.4 * unit} strokeDasharray={`${2 * unit},${1.2 * unit}`} />
                    </g>
                  )}
                </g>
              );
            }
            if (draw.type === 'line' && draw.points && draw.points.length >= 2) {
              const labelPoint = draw.points[Math.floor(draw.points.length / 2)];
              const linePoints = draw.points.map((point) => `${point.x},${point.y}`).join(' ');
              return (
                <g
                  key={draw.id}
                  data-map-drawing={draw.id}
                  tabIndex={drawingsInteractive ? 0 : undefined}
                  role={drawingsInteractive ? 'button' : undefined}
                  aria-label={drawingsInteractive ? drawingAccessibleName(draw) : undefined}
                  aria-pressed={drawingsInteractive ? selected : undefined}
                  onPointerDown={(event) => handleDrawingDown(event, draw)}
                  onClick={(event) => handleDrawingClick(event, draw)}
                  onKeyDown={(event) => handleDrawingKey(event, draw)}
                  onFocus={() => {
                    if (!drawingsInteractive) return;
                    setFocusedDrawingId(draw.id);
                    onSelectDrawing?.(draw.id);
                  }}
                  onBlur={() => setFocusedDrawingId((current) => current === draw.id ? null : current)}
                  style={{
                    cursor: drawingsInteractive
                      ? draggingDrawingId === draw.id ? 'grabbing' : 'grab'
                      : 'default',
                    touchAction: drawingsInteractive ? 'none' : 'auto',
                  }}
                >
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke={draw.strokeColor || '#0d9488'}
                    strokeWidth={draw.strokeWidth ?? 1.5 * unit}
                    opacity={draw.opacity ?? 1}
                  />
                  {drawingsInteractive && (
                    <polyline
                      points={linePoints}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={8 * unit}
                      pointerEvents="stroke"
                    />
                  )}
                  {draw.text && (
                    <text
                      x={labelPoint.x}
                      y={labelPoint.y - 1.5 * unit}
                      textAnchor="middle"
                      fontSize={draw.fontSize ?? 3.5 * unit}
                      fontWeight="bold"
                      fill={draw.strokeColor || '#0d9488'}
                      paintOrder="stroke"
                      stroke="#ffffff"
                      strokeWidth={0.8 * unit}
                    >
                      {draw.text}
                    </text>
                  )}
                  {(selected || focused) && (
                    <g
                      data-map-drawing-focus-ring={focused ? draw.id : undefined}
                      data-map-export-exclude="true"
                      pointerEvents="none"
                      aria-hidden="true"
                    >
                      <polyline points={linePoints} fill="none" stroke="#ffffff" strokeWidth={4 * unit} />
                      <polyline points={linePoints} fill="none" stroke={selected ? '#4A1942' : '#111827'} strokeWidth={1.8 * unit} strokeDasharray={`${2 * unit},${1.2 * unit}`} />
                    </g>
                  )}
                </g>
              );
            }
            return null;
          })}
        </g>

        <g pointerEvents="none" aria-hidden="true">
          {(map.routes || []).map((route) => {
            const points = routePoints(map, route);
            if (points.length < 2) return null;
            const stepFree = route.accessibility === 'step-free';
            const notStepFree = route.accessibility === 'not-step-free';
            const priority = route.priority || 'standard';
            const preferred = priority === 'preferred';
            const secondary = priority === 'secondary';
            const emergencyOnly = priority === 'emergency-only';
            const labelPoint = venueMapPolylineMidpoint(points);
            const routeLabel = `${
              emergencyOnly
                ? 'Emergency only · '
                : preferred
                  ? 'Preferred · '
                  : secondary
                    ? 'Secondary · '
                    : ''
            }${stepFree ? '♿ ' : notStepFree ? 'Not step-free · ' : ''}${route.name}`;
            const placeRouteLabelToLeft = labelPoint.x > W / 2;
            const routeLabelX = labelPoint.x + (placeRouteLabelToLeft ? -1.5 : 1.5) * unit;
            const placeRouteLabelBelow = labelPoint.y - 1.5 * unit < 4 * unit;
            const routeLabelY = labelPoint.y + (placeRouteLabelBelow ? 4 : -1.5) * unit;
            return (
              <g key={route.id}>
                <polyline
                  points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={emergencyOnly ? '#b91c1c' : stepFree ? '#047857' : notStepFree ? '#b45309' : '#0f766e'}
                  strokeWidth={(preferred ? 2 : emergencyOnly ? 1.8 : 1.4) * unit}
                  strokeDasharray={emergencyOnly
                    ? `${1.2 * unit},${1.2 * unit}`
                    : secondary
                      ? `${5 * unit},${2 * unit}`
                      : stepFree ? undefined : `${3 * unit},${2 * unit}`}
                  opacity={secondary ? 0.7 : 0.9}
                />
                <text
                  data-map-route-label={route.id}
                  x={routeLabelX}
                  y={routeLabelY}
                  textAnchor={placeRouteLabelToLeft ? 'end' : 'start'}
                  fontSize={3 * unit}
                  fontWeight={preferred || emergencyOnly ? 'bold' : 600}
                  fill={emergencyOnly ? '#991b1b' : stepFree ? '#065f46' : notStepFree ? '#92400e' : '#115e59'}
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={0.8 * unit}
                  strokeLinejoin="round"
                >
                  {routeLabel}
                </text>
              </g>
            );
          })}

          {editable && highlightedRoutePoints.length >= 2 && (
            <polyline
              data-map-ui="walkway-draft"
              data-map-export-exclude="true"
              points={highlightedRoutePoints.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="#4A1942"
              strokeWidth={2 * unit}
              strokeDasharray={`${3 * unit},${1.5 * unit}`}
              opacity={0.85}
            />
          )}
        </g>

        {/* Points */}
        {map.points.map((point) => {
          const radius = (KIND_RADIUS[point.kind] ?? 4) * unit;
          const selected = selectedPointId === point.id;
          const focused = focusedPointId === point.id;
          const highlightedIndex = highlightPointIds?.indexOf(point.id) ?? -1;
          const highlighted = highlightedIndex >= 0;
          const pointInteractive = editable || canActivatePoint(point);
          const accessibleAction = !editable && pointInteractive
            ? pointActionDescription(point)
            : '';
          const placeLabelToLeft = point.x > W / 2;
          const pointLabelX = point.x + (placeLabelToLeft ? -1 : 1) * (radius + 1.5 * unit);
          const placeLabelBelow = point.y - radius - unit < 5 * unit;
          const pointLabelY = placeLabelBelow
            ? point.y + radius + 4.5 * unit
            : point.y - radius - unit;
          return (
            <g
              key={point.id}
              data-map-point={point.id}
              data-map-export-exclude={transientPointIds?.includes(point.id) ? 'true' : undefined}
              tabIndex={pointInteractive ? 0 : undefined}
              role={pointInteractive ? 'button' : undefined}
              aria-label={pointInteractive
                ? `${venueMapPointTypeLabel(point)}: ${point.label}${accessibleAction ? `. ${accessibleAction}` : ''}`
                : undefined}
              onPointerDown={(event) => handlePointDown(event, point)}
              onClick={(event) => {
                event.stopPropagation();
                if (editable) {
                  const completed = completedPointGestureRef.current;
                  completedPointGestureRef.current = null;
                  clearCanvasClickSuppression();
                  if (!completed) onSelectPoint?.(point.id);
                  if (!completed?.moved) onActivatePoint?.(point.id);
                } else if (canActivatePoint(point)) {
                  onPointClick?.(point);
                }
              }}
              onKeyDown={(event) => handlePointKey(event, point)}
              onFocus={() => {
                setFocusedPointId(point.id);
                if (editable) onSelectPoint?.(point.id);
              }}
              onBlur={() => setFocusedPointId((current) => current === point.id ? null : current)}
              style={{
                cursor: editable
                  ? draggingPointId === point.id ? 'grabbing' : 'grab'
                  : pointInteractive ? 'pointer' : 'default',
                touchAction: editable ? 'none' : 'auto',
              }}
            >
              <circle cx={point.x} cy={point.y} r={radius + 3 * unit} fill="transparent" />
              {selected && (
                <circle
                  data-map-selected-point-ring={point.id}
                  data-map-export-exclude="true"
                  cx={point.x}
                  cy={point.y}
                  r={radius + 1.8 * unit}
                  fill="none"
                  stroke="#111827"
                  strokeWidth={1.5 * unit}
                  pointerEvents="none"
                  aria-hidden="true"
                />
              )}
              {focused && (
                <g
                  data-map-focus-ring={point.id}
                  data-map-export-exclude="true"
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius + 2.8 * unit}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={3 * unit}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius + 2.8 * unit}
                    fill="none"
                    stroke="#111827"
                    strokeWidth={1.5 * unit}
                  />
                </g>
              )}
              {highlighted && (
                <g data-map-export-exclude="true" pointerEvents="none" aria-hidden="true">
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius + 3.5 * unit}
                    fill="none"
                    stroke="#4A1942"
                    strokeWidth={1.1 * unit}
                    strokeDasharray={`${2 * unit},${1.5 * unit}`}
                  />
                  <circle
                    cx={point.x - radius - 2.5 * unit}
                    cy={point.y - radius - 2.5 * unit}
                    r={3.3 * unit}
                    fill="#4A1942"
                    stroke="#ffffff"
                    strokeWidth={0.8 * unit}
                  />
                  <text
                    x={point.x - radius - 2.5 * unit}
                    y={point.y - radius - 2.3 * unit}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={3.5 * unit}
                    fontWeight="bold"
                    fill="#ffffff"
                  >
                    {highlightedIndex + 1}
                  </text>
                </g>
              )}
              {point.kind !== 'path' ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={radius}
                  fill={pointColor(point.kind)}
                  stroke="white"
                  strokeWidth={1 * unit}
                  pointerEvents="none"
                />
              ) : (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={1.5 * unit}
                  fill={pointColor(point.kind)}
                  pointerEvents="none"
                />
              )}
              {showLabels && point.kind !== 'path' && (
                <text
                  x={pointLabelX}
                  y={pointLabelY}
                  textAnchor={placeLabelToLeft ? 'end' : 'start'}
                  fontSize={4.5 * unit}
                  fill="#1f2937"
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth={0.9 * unit}
                  strokeLinejoin="round"
                  pointerEvents="none"
                >
                  {pointKindIcon(point.kind)} {point.label}{point.kind === 'entry' ? ` · ${arrivalRoleLabel(point.arrivalRole)}` : ''}
                </text>
              )}
            </g>
          );
        })}

      </svg>
          </div>
        </>
      )}
      {showLegend && legendKinds.length > 0 && (
        <section
          data-map-external-legend="true"
          aria-label="Map symbol legend"
          className="mt-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
        >
          <p className="font-semibold text-gray-800">Map symbols</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
            {legendKinds.map((kind) => (
              <li key={kind} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
                  style={{ backgroundColor: pointColor(kind) }}
                />
                <span aria-hidden="true">{pointKindIcon(kind)}</span>
                <span>{pointKindLabel(kind)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <VenueMapPointGuidance points={map.points} compact={editable} />
      <VenueMapDrawingGuidance drawings={map.drawings || []} compact={editable} />
      <VenueMapRouteGuidance routes={map.routes || []} compact={editable} />
      {editable && onSelectPoint && map.points.length > 0 && (
        <details className="no-print mt-2 rounded-lg border border-gray-200 bg-white text-sm spm-studio-chrome">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-semibold text-gray-700">
            <span>Map points for editing</span>
            <span className="text-xs font-normal text-gray-500">
              {map.points.length} point{map.points.length === 1 ? '' : 's'}
            </span>
          </summary>
          <div className="grid gap-2 border-t border-gray-200 p-2 sm:grid-cols-2">
            {map.points.map((point) => {
              const selected = point.id === selectedPointId;
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => onSelectPoint(point.id)}
                  aria-pressed={selected}
                  aria-label={`Select ${point.label} for editing. ${venueMapPointTypeLabel(point)} at X ${point.x}, Y ${point.y}.`}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                    selected
                      ? 'border-teal-500 bg-teal-50 text-teal-950'
                      : 'border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50'
                  }`}
                >
                  <span aria-hidden="true">{pointKindIcon(point.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{point.label}</span>
                    <span className="block text-xs text-gray-500">
                      {venueMapPointTypeLabel(point)} · X {point.x}, Y {point.y}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </details>
      )}
      {nonActionableFallbackPoints.length > 0 && (
        <details className="mt-2 rounded-lg border border-gray-200 bg-white text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-semibold text-gray-700">
            <span>Named map locations</span>
            <span className="text-xs font-normal text-gray-500">
              {nonActionableFallbackPoints.length} location{nonActionableFallbackPoints.length === 1 ? '' : 's'}
            </span>
          </summary>
          <ul className="grid gap-2 border-t border-gray-200 p-2 sm:grid-cols-2">
            {nonActionableFallbackPoints.map((point) => (
              <li key={point.id} className="rounded-lg border border-gray-200 px-3 py-2 text-gray-700">
                <span className="font-semibold">{pointKindIcon(point.kind)} {point.label}</span>
                <span className="block text-xs text-gray-500">{venueMapPointTypeLabel(point)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {actionablePoints.length > 0 && (
        <details className="no-print spm-studio-chrome mt-2 rounded-lg border border-gray-200 bg-white text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2 font-semibold text-gray-700">
            <span>Map location actions</span>
            <span className="text-xs font-normal text-gray-500">{actionablePoints.length} location{actionablePoints.length === 1 ? '' : 's'}</span>
          </summary>
          <div className="grid gap-2 border-t border-gray-200 p-2 sm:grid-cols-2">
            {actionablePoints.map((point) => (
              <button
                key={point.id}
                type="button"
                onClick={() => onPointClick?.(point)}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-teal-300 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                aria-label={`${venueMapPointTypeLabel(point)}: ${point.label}. ${pointActionDescription(point)}`}
              >
                <span aria-hidden="true">{pointKindIcon(point.kind)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{point.label}</span>
                  <span className="block text-xs text-gray-500">{pointActionDescription(point)}</span>
                </span>
              </button>
            ))}
          </div>
        </details>
      )}
      <p className="sr-only">
        {map.points.map((point) => `${venueMapPointTypeLabel(point)}: ${point.label}.`).join(' ')}
        {hideSpatialMap && ' Spatial walkways and zones are hidden until the property base map is available.'}
      </p>
    </div>
  );
}
