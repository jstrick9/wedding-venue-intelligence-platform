import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Point, Venue } from '../types';
import { useConfirm } from './useConfirm';
import { showToast } from './Toast';
import { useBrandingConfig } from '../config';
import { polygonValidationIssue } from '../utils/venueGeometry';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface NormalizedPoint {
  x: number; // 0..1
  y: number; // 0..1
}

interface CustomVenueBuilderProps {
  venue: Venue;
  onSave: (points: Point[]) => void;
  onClose: () => void;
}

const VIEWBOX_WIDTH = 1100;
const VIEWBOX_HEIGHT = 760;
const PADDING = 70;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type BuilderMode = 'select' | 'draw' | 'insert';

const defaultRectangle = (): NormalizedPoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const normalizePoints = (venue: Venue): NormalizedPoint[] => {
  if (venue.shapePoints && venue.shapePoints.length >= 3) {
    return venue.shapePoints.map((p) => ({
      x: venue.width > 0 ? clamp(p.x / venue.width, 0, 1) : 0,
      y: venue.height > 0 ? clamp(p.y / venue.height, 0, 1) : 0,
    }));
  }
  return defaultRectangle();
};

const templateShapes: Record<string, { label: string; description: string; points: NormalizedPoint[] }> = {
  rectangle: {
    label: 'Rectangle',
    description: 'Classic hall or ballroom footprint',
    points: defaultRectangle(),
  },
  bevel: {
    label: 'Beveled',
    description: 'Soft clipped corners for refined spaces',
    points: [
      { x: 0.08, y: 0 },
      { x: 0.92, y: 0 },
      { x: 1, y: 0.12 },
      { x: 1, y: 0.88 },
      { x: 0.92, y: 1 },
      { x: 0.08, y: 1 },
      { x: 0, y: 0.88 },
      { x: 0, y: 0.12 },
    ],
  },
  trapezoid: {
    label: 'Trapezoid',
    description: 'Great for tapered lawns and terraces',
    points: [
      { x: 0.12, y: 0 },
      { x: 0.88, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  },
  pavilion: {
    label: 'Pavilion',
    description: 'Open-sided structure with clipped ends',
    points: [
      { x: 0.05, y: 0 },
      { x: 0.95, y: 0 },
      { x: 1, y: 0.15 },
      { x: 1, y: 0.85 },
      { x: 0.95, y: 1 },
      { x: 0.05, y: 1 },
      { x: 0, y: 0.85 },
      { x: 0, y: 0.15 },
    ],
  },
  angled: {
    label: 'Angled',
    description: 'Asymmetric profile for modern venues',
    points: [
      { x: 0, y: 0.08 },
      { x: 0.12, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.88 },
      { x: 0.88, y: 1 },
      { x: 0, y: 1 },
    ],
  },
  courtyard: {
    label: 'Courtyard',
    description: 'Inset entry area for transitional spaces',
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.72 },
      { x: 0.7, y: 0.72 },
      { x: 0.7, y: 1 },
      { x: 0.3, y: 1 },
      { x: 0.3, y: 0.72 },
      { x: 0, y: 0.72 },
    ],
  },
};

const shapeToAbsolute = (points: NormalizedPoint[], venue: Venue): Point[] =>
  points.map((p) => ({
    x: Math.round(p.x * venue.width * 100) / 100,
    y: Math.round(p.y * venue.height * 100) / 100,
  }));

export const CustomVenueBuilder: React.FC<CustomVenueBuilderProps> = ({ venue, onSave, onClose }) => {
  const { confirm, confirmDialog } = useConfirm();
  const config = useBrandingConfig();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusTrap(dialogRef, true, undefined, titleRef);
  const [points, setPoints] = useState<NormalizedPoint[]>(normalizePoints(venue));
  // Reference to the shape as loaded, for the "unsaved changes" close guard.
  const initialPointsRef = useRef<NormalizedPoint[]>(normalizePoints(venue));
  const isDirty = useMemo(
    () =>
      JSON.stringify(points) !== JSON.stringify(initialPointsRef.current),
    [points],
  );

  const requestClose = async () => {
    if (isDirty) {
      const ok = await confirm({ title: 'Discard changes?', message: 'You have unsaved shape changes. Discard them and close?', confirmLabel: 'Discard', tone: 'default' });
      if (!ok) return;
    }
    onClose();
  };
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
  const [hoverSegmentIndex, setHoverSegmentIndex] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [gridDivisions, setGridDivisions] = useState(16);
  const [gridContrast, setGridContrast] = useState(0.9);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [builderMode, setBuilderMode] = useState<BuilderMode>('select');
  const [pointNudge, setPointNudge] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const sidebarResizeStartRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    const updateViewport = () => setIsNarrowViewport(window.innerWidth < 768);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Escape closes the builder (with the unsaved-changes guard).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const start = sidebarResizeStartRef.current;
      if (!start) return;
      const delta = e.clientX - start.x;
      const nextWidth = clamp(start.width + delta, 220, 480);
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      sidebarResizeStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  const workspaceWidth = VIEWBOX_WIDTH - PADDING * 2;
  const workspaceHeight = VIEWBOX_HEIGHT - PADDING * 2;

  const toCanvas = useCallback((p: NormalizedPoint) => ({
    x: PADDING + p.x * workspaceWidth,
    y: PADDING + p.y * workspaceHeight,
  }), [workspaceHeight, workspaceWidth]);

  const toNormalized = (clientX: number, clientY: number): NormalizedPoint | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;

    let nx = clamp((x - PADDING) / workspaceWidth, 0, 1);
    let ny = clamp((y - PADDING) / workspaceHeight, 0, 1);

    if (snapToGrid) {
      nx = Math.round(nx * gridDivisions) / gridDivisions;
      ny = Math.round(ny * gridDivisions) / gridDivisions;
    }

    return { x: nx, y: ny };
  };

  const polygonPoints = useMemo(() => points.map((p) => toCanvas(p)), [points, toCanvas]);
  const polygonString = polygonPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const absolutePoints = useMemo(() => shapeToAbsolute(points, venue), [points, venue]);

  const shapeValidationIssue = useMemo(
    () => polygonValidationIssue(absolutePoints),
    [absolutePoints],
  );

  const saveShape = () => {
    if (shapeValidationIssue) {
      showToast(shapeValidationIssue, 'warning');
      return;
    }
    initialPointsRef.current = points.map((p) => ({ ...p }));
    onSave(absolutePoints);
  };

  const updatePoint = (index: number, next: NormalizedPoint) => {
    setPoints((prev) => prev.map((p, i) => (i === index ? next : p)));
  };

  const addPointAt = (segmentIndex: number, next: NormalizedPoint) => {
    setPoints((prev) => {
      const updated = [...prev];
      updated.splice(segmentIndex + 1, 0, next);
      return updated;
    });
  };

  const removeSelectedPoint = () => {
    if (selectedPointIndex === null || points.length <= 3) return;
    setPoints((prev) => prev.filter((_, i) => i !== selectedPointIndex));
    setSelectedPointIndex(null);
  };

  const resetToRectangle = () => {
    setPoints(defaultRectangle());
    setSelectedPointIndex(null);
  };

  const applyTemplate = (name: keyof typeof templateShapes) => {
    setPoints(templateShapes[name].points.map((p) => ({ ...p })));
    setSelectedPointIndex(null);
  };

  const nudgeSelectedPoint = (dx: number, dy: number) => {
    if (selectedPointIndex === null) return;
    const deltaX = dx / venue.width;
    const deltaY = dy / venue.height;
    const current = points[selectedPointIndex];
    updatePoint(selectedPointIndex, {
      x: clamp(current.x + deltaX, 0, 1),
      y: clamp(current.y + deltaY, 0, 1),
    });
  };

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (builderMode !== 'draw') return;
    const next = toNormalized(e.clientX, e.clientY);
    if (!next) return;
    setPoints((prev) => [...prev, next]);
    setSelectedPointIndex(points.length);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingPointIndex === null) return;
    const next = toNormalized(e.clientX, e.clientY);
    if (!next) return;
    updatePoint(draggingPointIndex, next);
  };

  const handleMouseUp = () => setDraggingPointIndex(null);

  const startSidebarResize = (e: React.MouseEvent<HTMLDivElement>) => {
    if (sidebarCollapsed || isNarrowViewport) return;
    e.preventDefault();
    sidebarResizeStartRef.current = { x: e.clientX, width: sidebarWidth };
    setIsResizingSidebar(true);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 p-2 sm:p-3">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="venue-shape-builder-title"
        tabIndex={-1}
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-[99vw] h-[97vh] overflow-hidden"
      >
        <div
          className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-white"
          style={{
            background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
          }}
        >
          <div>
            <h2 id="venue-shape-builder-title" ref={titleRef} tabIndex={-1} className="text-xl font-semibold outline-none">✏️ Venue Shape Builder</h2>
            <p className="text-sm text-white/85">Design a custom venue outline for {venue.name}. Your shape scales automatically with {venue.width}’ × {venue.height}’ dimensions.</p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand builder controls' : 'Collapse builder controls'}
            >
              {sidebarCollapsed ? '☰ Show Controls' : '⇤ Hide Controls'}
            </button>
            <button onClick={resetToRectangle} className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Reset</button>
            <button onClick={saveShape} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium shadow-sm">✓ Use Shape in Draft</button>
            <button onClick={requestClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors" aria-label="Close shape builder">✕</button>
          </div>
        </div>

        <div
          className={`grid grid-cols-1 h-full min-h-0 ${isResizingSidebar ? 'select-none' : ''}`}
          style={!isNarrowViewport ? { gridTemplateColumns: `${sidebarCollapsed ? 56 : sidebarWidth}px minmax(0,1fr)` } : undefined}
        >
          <aside className="relative border-r border-gray-200 bg-gray-50 p-3 overflow-y-auto space-y-3" aria-label="Venue shape builder controls">
            {sidebarCollapsed ? (
              <div className="space-y-2">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="w-full px-2 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm"
                  title="Expand controls"
                >
                  ☰
                </button>
                <button
                  onClick={() => setBuilderMode('select')}
                  className={`w-full px-2 py-2 rounded-lg border text-sm ${builderMode === 'select' ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-gray-200 text-gray-700'}`}
                  title="Select mode"
                >
                  🎯
                </button>
                <button
                  onClick={() => setBuilderMode('insert')}
                  className={`w-full px-2 py-2 rounded-lg border text-sm ${builderMode === 'insert' ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-gray-200 text-gray-700'}`}
                  title="Insert mode"
                >
                  ➕
                </button>
                <button
                  onClick={() => setBuilderMode('draw')}
                  className={`w-full px-2 py-2 rounded-lg border text-sm ${builderMode === 'draw' ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-gray-200 text-gray-700'}`}
                  title="Draw mode"
                >
                  ✏️
                </button>
                <button
                  onClick={saveShape}
                  className="w-full px-2 py-2 rounded-lg border border-green-300 bg-green-50 hover:bg-green-100 text-green-700 text-sm"
                  title="Use shape in geometry draft"
                >
                  💾
                </button>
              </div>
            ) : (
              <>
            <div className="rounded-xl border border-purple-200 bg-white p-4 space-y-3">
              <h3 className="font-semibold" style={{ color: config.primaryColor || '#4A1942' }}>Builder Mode</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'select', label: 'Select', icon: '🎯' },
                  { id: 'insert', label: 'Insert', icon: '➕' },
                  { id: 'draw', label: 'Draw', icon: '✏️' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setBuilderMode(mode.id as BuilderMode)}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${builderMode === mode.id ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
                  >
                    <div>{mode.icon}</div>
                    <div>{mode.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold" style={{ color: config.primaryColor || '#4A1942' }}>Starter Templates</h3>
                  <p className="text-xs text-gray-500 mt-1">Pick a starting footprint, then fine-tune it by dragging points.</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">{points.length} points</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(templateShapes).map(([key, template]) => (
                  <button
                    key={key}
                    onClick={() => applyTemplate(key as keyof typeof templateShapes)}
                    className="text-left px-3 py-3 rounded-xl bg-gray-50 hover:bg-purple-50 text-sm text-gray-700 border border-gray-200 hover:border-purple-300 transition-colors"
                  >
                    <div className="font-medium text-gray-900">{template.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <h3 className="font-semibold" style={{ color: config.primaryColor || '#4A1942' }}>Precision Controls</h3>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700">Show grid</span>
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="w-4 h-4" />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700">Snap to grid</span>
                <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} className="w-4 h-4" />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700">Show measurements</span>
                <input type="checkbox" checked={showMeasurements} onChange={(e) => setShowMeasurements(e.target.checked)} className="w-4 h-4" />
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Grid divisions</label>
                <input type="range" min={4} max={40} value={gridDivisions} onChange={(e) => setGridDivisions(parseInt(e.target.value))} className="w-full" />
                <div className="text-xs text-gray-500 mt-1">{gridDivisions} divisions</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Grid contrast</label>
                <input
                  type="range"
                  min={0.3}
                  max={1}
                  step={0.05}
                  value={gridContrast}
                  onChange={(e) => setGridContrast(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="text-xs text-gray-500 mt-1">{Math.round(gridContrast * 100)}%</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Arrow nudge</label>
                <select value={pointNudge} onChange={(e) => setPointNudge(parseInt(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value={1}>1 foot</option>
                  <option value={2}>2 feet</option>
                  <option value={5}>5 feet</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2 max-w-[180px]">
                <div />
                <button onClick={() => nudgeSelectedPoint(0, -pointNudge)} className="px-2 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border">↑</button>
                <div />
                <button onClick={() => nudgeSelectedPoint(-pointNudge, 0)} className="px-2 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border">←</button>
                <button onClick={() => nudgeSelectedPoint(0, pointNudge)} className="px-2 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border">↓</button>
                <button onClick={() => nudgeSelectedPoint(pointNudge, 0)} className="px-2 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border">→</button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold" style={{ color: config.primaryColor || '#4A1942' }}>Point Controls</h3>
                {selectedPointIndex !== null && (
                  <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">Point {selectedPointIndex + 1}</span>
                )}
              </div>
              {selectedPointIndex === null ? (
                <p className="text-sm text-gray-500">Select a point on the shape to edit exact dimensions or use arrow nudges.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">X (ft)</label>
                      <input
                        type="number"
                        value={absolutePoints[selectedPointIndex]?.x ?? 0}
                        onChange={(e) => updatePoint(selectedPointIndex, { x: clamp((parseFloat(e.target.value) || 0) / venue.width, 0, 1), y: points[selectedPointIndex].y })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Y (ft)</label>
                      <input
                        type="number"
                        value={absolutePoints[selectedPointIndex]?.y ?? 0}
                        onChange={(e) => updatePoint(selectedPointIndex, { x: points[selectedPointIndex].x, y: clamp((parseFloat(e.target.value) || 0) / venue.height, 0, 1) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <button onClick={removeSelectedPoint} disabled={points.length <= 3} className="w-full px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed">
                    Remove Selected Point
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Point List</h4>
                <div className="max-h-44 overflow-auto space-y-1 pr-1">
                  {absolutePoints.map((point, index) => (
                    <button
                      key={`point-row-${index}`}
                      onClick={() => setSelectedPointIndex(index)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selectedPointIndex === index ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">Point {index + 1}</span>
                        <span className="text-xs text-gray-500">{point.x.toFixed(1)}’, {point.y.toFixed(1)}’</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <h3 className="font-semibold" style={{ color: config.primaryColor || '#4A1942' }}>Tips</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p>• Drag points directly to shape the venue.</p>
                <p>• In Insert mode, click an edge to add a new point.</p>
                <p>• Shapes scale automatically when venue width/height change.</p>
                <p>• Use templates as a fast starting point for unusual layouts.</p>
              </div>
              <button onClick={resetToRectangle} className="mt-2 w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200">
                Reset to Rectangle
              </button>
            </div>
              </>
            )}
            {!isNarrowViewport && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize controls sidebar"
                onMouseDown={startSidebarResize}
                onDoubleClick={() => setSidebarWidth(300)}
                className={`absolute top-0 right-0 h-full w-2 translate-x-1/2 cursor-col-resize group ${sidebarCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
              >
                <div className="mx-auto h-full w-1 rounded-full bg-transparent group-hover:bg-purple-300/80 transition-colors" />
              </div>
            )}
          </aside>

          <div className="min-h-0 overflow-hidden bg-gray-100 p-2 sm:p-3">
            <div className="h-full rounded-2xl border border-gray-300 bg-white shadow-inner overflow-hidden flex flex-col">
              <div className="px-4 py-2 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <span className="font-medium">Mode:</span>
                  <span className="px-2 py-1 rounded-full bg-white border border-purple-200 text-purple-700 font-medium capitalize">{builderMode}</span>
                  <span className="text-gray-400">•</span>
                  <span>{showGrid ? `${gridDivisions} × ${gridDivisions} grid` : 'Grid hidden'}</span>
                  {showGrid && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span>{Math.round(gridContrast * 100)}% contrast</span>
                    </>
                  )}
                  <span className="text-gray-400">•</span>
                  <span>{snapToGrid ? 'Snap on' : 'Freeform'}</span>
                </div>
                <div className="text-xs text-gray-500">
                  Drag points • Click edge to insert • Use Shape in Draft when ready
                </div>
              </div>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-full flex-1 cursor-crosshair select-none"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onClick={handleCanvasClick}
              >
                <rect x={PADDING} y={PADDING} width={workspaceWidth} height={workspaceHeight} fill="#faf5ff" stroke="#d8b4fe" strokeWidth={2} rx={18} />

                {showGrid && (
                  <g opacity={gridContrast}>
                    {Array.from({ length: gridDivisions + 1 }).map((_, i) => {
                      const x = PADDING + (i / gridDivisions) * workspaceWidth;
                      const y = PADDING + (i / gridDivisions) * workspaceHeight;
                      const isMajor = i % 4 === 0;
                      const majorStroke = gridContrast > 0.7 ? '#8b5cf6' : '#a78bfa';
                      const minorStroke = gridContrast > 0.7 ? '#c4b5fd' : '#ddd6fe';
                      return (
                        <g key={i}>
                          <line
                            x1={x}
                            y1={PADDING}
                            x2={x}
                            y2={PADDING + workspaceHeight}
                            stroke={isMajor ? majorStroke : minorStroke}
                            strokeWidth={isMajor ? 1.2 : 0.9}
                          />
                          <line
                            x1={PADDING}
                            y1={y}
                            x2={PADDING + workspaceWidth}
                            y2={y}
                            stroke={isMajor ? majorStroke : minorStroke}
                            strokeWidth={isMajor ? 1.2 : 0.9}
                          />
                        </g>
                      );
                    })}
                  </g>
                )}

                {showMeasurements && (
                  <>
                    <text x={VIEWBOX_WIDTH / 2} y={30} textAnchor="middle" fontSize={16} fill={config.primaryColor || '#4A1942'} fontWeight="600">Width: {venue.width} ft</text>
                    <text x={26} y={VIEWBOX_HEIGHT / 2} textAnchor="middle" fontSize={16} fill={config.primaryColor || '#4A1942'} fontWeight="600" transform={`rotate(-90 26 ${VIEWBOX_HEIGHT / 2})`}>
                      Height: {venue.height} ft
                    </text>
                  </>
                )}

                {points.map((point, index) => {
                  const current = toCanvas(point);
                  const next = toCanvas(points[(index + 1) % points.length]);
                  const midX = (current.x + next.x) / 2;
                  const midY = (current.y + next.y) / 2;
                  return (
                    <g key={`segment-${index}`}>
                      <line
                        x1={current.x}
                        y1={current.y}
                        x2={next.x}
                        y2={next.y}
                        stroke={hoverSegmentIndex === index ? '#7c3aed' : '#9333ea'}
                        strokeWidth={hoverSegmentIndex === index ? 12 : 10}
                        opacity={0.14}
                        onMouseEnter={() => setHoverSegmentIndex(index)}
                        onMouseLeave={() => setHoverSegmentIndex(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (builderMode === 'insert' || builderMode === 'select') {
                            const nextPoint = toNormalized(e.clientX, e.clientY);
                            if (nextPoint) addPointAt(index, nextPoint);
                          }
                        }}
                      />
                      {(builderMode === 'insert' || hoverSegmentIndex === index) && (
                        <g pointerEvents="none">
                          <circle cx={midX} cy={midY} r={9} fill="#ffffff" stroke="#9333ea" strokeWidth={2} />
                          <text x={midX} y={midY + 3} textAnchor="middle" fontSize={11} fill="#9333ea" fontWeight="700">+</text>
                        </g>
                      )}
                    </g>
                  );
                })}

                <polygon points={polygonString} fill="rgba(147,51,234,0.18)" stroke="#7e22ce" strokeWidth={3} />

                {points.map((point, index) => {
                  const canvasPoint = toCanvas(point);
                  const selected = selectedPointIndex === index;
                  return (
                    <g key={`point-${index}`}>
                      <circle
                        cx={canvasPoint.x}
                        cy={canvasPoint.y}
                        r={selected ? 11 : 8}
                        fill={selected ? '#7e22ce' : '#ffffff'}
                        stroke="#7e22ce"
                        strokeWidth={3}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedPointIndex(index);
                          setDraggingPointIndex(index);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPointIndex(index);
                        }}
                      />
                      <text x={canvasPoint.x} y={canvasPoint.y + 4} textAnchor="middle" fontSize={11} fill={selected ? '#fff' : '#7e22ce'} fontWeight="700" pointerEvents="none">
                        {index + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
};
