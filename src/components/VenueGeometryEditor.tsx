import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point, ShapeType, Venue } from '../types';
import {
  analyzeVenueGeometryImpact,
  effectiveCanvasGeometry,
  normalizeVenueGeometryDraft,
  type GeometryImpactSource,
  type GeometryImpactSourceKind,
} from '../utils/venueGeometryImpact';
import {
  changeVenueShape,
  customPathForPoints,
  isSupportedVenueShape,
  polygonValidationIssue,
  resizeVenueOutline,
  venueGeometrySignature,
  venueShapePolygon,
} from '../utils/venueGeometry';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CustomVenueBuilder } from './CustomVenueBuilder';
import { ConfirmDialog } from './ConfirmDialog';
import { showToast } from './Toast';

interface VenueGeometryEditorProps {
  venue: Venue;
  sources: GeometryImpactSource[];
  onApply: (venue: Venue, baselineGeometrySignature: string) => void | Promise<void>;
  onClose: () => void;
}

const SHAPES: Array<{ value: ShapeType; label: string; description: string }> = [
  { value: 'rectangle', label: 'Rectangle', description: 'Full rectangular footprint' },
  { value: 'l-shape', label: 'L-shape', description: 'Two connected wings' },
  { value: 't-shape', label: 'T-shape', description: 'Wide head with a centered stem' },
  { value: 'u-shape', label: 'U-shape', description: 'Three-sided footprint' },
  { value: 'custom', label: 'Custom', description: 'Editable point-by-point outline' },
];

const GROUPS: Array<{ kind: GeometryImpactSourceKind; label: string; empty: string }> = [
  { kind: 'working', label: 'Current working layout', empty: 'No current working layout.' },
  { kind: 'master', label: 'Venue master', empty: 'No venue master layout is saved.' },
  { kind: 'named', label: 'Named saved layouts', empty: 'No named layouts use this venue.' },
  { kind: 'couple', label: 'Couple layouts', empty: 'No couple layouts use this venue.' },
];

function numberFromInput(value: string): number {
  if (value.trim() === '') return Number.NaN;
  return Number(value);
}

function formatFeet(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function VenueGeometryEditor({ venue, sources, onApply, onClose }: VenueGeometryEditorProps) {
  const [initialDraft] = useState<Venue>(() => normalizeVenueGeometryDraft(venue));
  const [draft, setDraft] = useState<Venue>(initialDraft);
  const [showShapeBuilder, setShowShapeBuilder] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [acknowledgedImpact, setAcknowledgedImpact] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useFocusTrap(dialogRef, true, undefined, titleRef);
  const lastValidDimensionsRef = useRef({
    width: Number.isFinite(initialDraft.width) && initialDraft.width > 0 ? initialDraft.width : 0.01,
    height: Number.isFinite(initialDraft.height) && initialDraft.height > 0 ? initialDraft.height : 0.01,
  });

  const baselineGeometrySignature = venueGeometrySignature(initialDraft);
  const activeVenueChanged = venue.id !== initialDraft.id;
  const externalGeometryChanged = !activeVenueChanged
    && venueGeometrySignature(venue) !== baselineGeometrySignature;
  const staleVenueConflict = activeVenueChanged || externalGeometryChanged;
  const dirty = venueGeometrySignature(draft) !== baselineGeometrySignature;
  const impact = useMemo(
    () => analyzeVenueGeometryImpact(initialDraft, draft, sources),
    [draft, initialDraft, sources],
  );
  const canvas = effectiveCanvasGeometry(draft);
  const rawCanvas = useMemo(() => ({
    canvasWidth: draft.canvasWidth ?? Number.NaN,
    canvasHeight: draft.canvasHeight ?? Number.NaN,
    venueX: draft.venueX ?? Number.NaN,
    venueY: draft.venueY ?? Number.NaN,
  }), [draft.canvasHeight, draft.canvasWidth, draft.venueX, draft.venueY]);
  const unsupportedShape = !isSupportedVenueShape(draft.shape);
  const unsupportedShapeError = unsupportedShape
    ? `Stored venue shape “${draft.shape}” is unsupported. Choose Rectangle, L-shape, T-shape, U-shape, or Custom before applying.`
    : null;
  const outline = venueShapePolygon(draft);
  const previewPoints = outline
    .map((point) => `${point.x + canvas.venueX},${point.y + canvas.venueY}`)
    .join(' ');

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (unsupportedShapeError) errors.push(unsupportedShapeError);
    const fields: Array<[string, number]> = [
      ['Venue width', draft.width],
      ['Venue height', draft.height],
      ['Canvas width', rawCanvas.canvasWidth],
      ['Canvas height', rawCanvas.canvasHeight],
      ['Venue X', rawCanvas.venueX],
      ['Venue Y', rawCanvas.venueY],
    ];
    fields.forEach(([label, value]) => {
      if (!Number.isFinite(value)) errors.push(`${label} must be a number.`);
    });
    if (Number.isFinite(draft.width) && draft.width <= 0) errors.push('Venue width must be greater than zero.');
    if (Number.isFinite(draft.height) && draft.height <= 0) errors.push('Venue height must be greater than zero.');
    if (Number.isFinite(rawCanvas.canvasWidth) && rawCanvas.canvasWidth <= 0) errors.push('Canvas width must be greater than zero.');
    if (Number.isFinite(rawCanvas.canvasHeight) && rawCanvas.canvasHeight <= 0) errors.push('Canvas height must be greater than zero.');
    if (Number.isFinite(rawCanvas.venueX) && rawCanvas.venueX < 0) errors.push('Venue X cannot be negative.');
    if (Number.isFinite(rawCanvas.venueY) && rawCanvas.venueY < 0) errors.push('Venue Y cannot be negative.');
    if (
      Number.isFinite(rawCanvas.venueX)
      && Number.isFinite(draft.width)
      && Number.isFinite(rawCanvas.canvasWidth)
      && rawCanvas.venueX + draft.width > rawCanvas.canvasWidth + 0.01
    ) errors.push('Canvas width must contain the venue at its proposed X position.');
    if (
      Number.isFinite(rawCanvas.venueY)
      && Number.isFinite(draft.height)
      && Number.isFinite(rawCanvas.canvasHeight)
      && rawCanvas.venueY + draft.height > rawCanvas.canvasHeight + 0.01
    ) errors.push('Canvas height must contain the venue at its proposed Y position.');
    if (draft.shape === 'custom') {
      const points = draft.shapePoints || [];
      const polygonIssue = polygonValidationIssue(points);
      if (polygonIssue) errors.push(polygonIssue);
      if (Number.isFinite(draft.width) && Number.isFinite(draft.height)
        && points.some((point) => point.x < 0 || point.y < 0
          || point.x > draft.width || point.y > draft.height)) {
        errors.push('Every custom outline point must remain inside the venue width and height.');
      }
    }
    return [...new Set(errors)];
  }, [draft, rawCanvas, unsupportedShapeError]);

  const compatibilityPreviewOnly = unsupportedShape
    && validationErrors.length === 1
    && validationErrors[0] === unsupportedShapeError;
  const hasImpact = impact.affectedItems > 0 || impact.venueOutsideCanvasAfter;

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || showShapeBuilder) return;
      event.preventDefault();
      if (dirty) setDiscardOpen(true);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, onClose, showShapeBuilder]);

  const updateDraft = (updater: (current: Venue) => Venue) => {
    setDraft((current) => updater(current));
    setAcknowledgedImpact(false);
  };

  const updateDimension = (key: 'width' | 'height', raw: string) => {
    const value = numberFromInput(raw);
    updateDraft((current) => {
      if (!Number.isFinite(value) || value <= 0) return { ...current, [key]: value };
      const validBase = {
        ...current,
        width: Number.isFinite(current.width) && current.width > 0
          ? current.width
          : lastValidDimensionsRef.current.width,
        height: Number.isFinite(current.height) && current.height > 0
          ? current.height
          : lastValidDimensionsRef.current.height,
      };
      const resized = key === 'width'
        ? resizeVenueOutline(validBase, value, validBase.height)
        : resizeVenueOutline(validBase, validBase.width, value);
      lastValidDimensionsRef.current = { width: resized.width, height: resized.height };
      return resized;
    });
  };

  const requestClose = () => {
    if (dirty) setDiscardOpen(true);
    else onClose();
  };

  const apply = async () => {
    if (staleVenueConflict || !dirty || validationErrors.length > 0 || (hasImpact && !acknowledgedImpact)) return;
    setApplying(true);
    setApplyError(null);
    try {
      await onApply({ ...draft }, baselineGeometrySignature);
    } catch (error) {
      console.error('Failed to apply venue geometry:', error);
      const message = error instanceof Error
        ? error.message
        : 'Venue geometry could not be applied. Your draft is still open.';
      setApplyError(message);
      showToast('Venue geometry could not be applied. Your draft is still open.', 'error');
      setApplying(false);
    }
  };

  const changedSummary = [
    initialDraft.width !== draft.width || initialDraft.height !== draft.height
      ? `Footprint ${formatFeet(initialDraft.width)} × ${formatFeet(initialDraft.height)} ft → ${formatFeet(draft.width)} × ${formatFeet(draft.height)} ft`
      : null,
    initialDraft.canvasWidth !== draft.canvasWidth || initialDraft.canvasHeight !== draft.canvasHeight
      ? `Canvas ${formatFeet(initialDraft.canvasWidth || 0)} × ${formatFeet(initialDraft.canvasHeight || 0)} ft → ${formatFeet(canvas.canvasWidth)} × ${formatFeet(canvas.canvasHeight)} ft`
      : null,
    initialDraft.venueX !== draft.venueX || initialDraft.venueY !== draft.venueY
      ? `Position (${formatFeet(initialDraft.venueX || 0)}, ${formatFeet(initialDraft.venueY || 0)}) → (${formatFeet(canvas.venueX)}, ${formatFeet(canvas.venueY)}) ft`
      : null,
    (initialDraft.shape || 'rectangle') !== (draft.shape || 'rectangle')
      ? `Shape ${initialDraft.shape || 'rectangle'} → ${draft.shape || 'rectangle'}`
      : null,
    draft.shape === 'custom'
      && JSON.stringify(initialDraft.shapePoints || []) !== JSON.stringify(draft.shapePoints || [])
      ? 'Custom outline points updated'
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-[20000] bg-black/60 p-2 sm:p-4 flex items-center justify-center">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="venue-geometry-title"
        tabIndex={-1}
        className="w-full max-w-7xl h-[96vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col"
      >
        <header className="shrink-0 flex items-start justify-between gap-4 border-b border-gray-200 bg-[#4A1942] px-5 py-4 text-white">
          <div>
            <h2 id="venue-geometry-title" ref={titleRef} tabIndex={-1} className="text-xl font-bold outline-none">
              Edit venue & canvas geometry
            </h2>
            <p className="mt-1 text-sm text-white/80">
              {venue.name} · Draft locally, review every affected layout, then apply explicitly.
            </p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Close venue geometry editor" className="rounded-full p-2 text-xl leading-none hover:bg-white/15">✕</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-5">
          {staleVenueConflict && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
              <strong>{activeVenueChanged ? 'The active venue changed.' : 'Venue geometry changed in another update.'}</strong>{' '}
              This draft cannot overwrite newer geometry. Close it, discard the local draft, and reopen the editor to review the latest venue record.
            </div>
          )}
          {applyError && !staleVenueConflict && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
              <strong>Apply was blocked.</strong> {applyError}
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,0.8fr)_minmax(500px,1.2fr)] gap-5">
            <div className="space-y-4">
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="venue-size-heading">
                <h3 id="venue-size-heading" className="font-bold text-gray-900">Venue footprint</h3>
                <p className="mt-1 text-xs text-gray-500">Dimensions are real-world feet. Placed-item coordinates never scale or clamp.</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium text-gray-700">
                    Width (ft)
                    <input type="number" min="0.1" step="0.5" value={Number.isFinite(draft.width) ? draft.width : ''} onChange={(event) => updateDimension('width', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    Height (ft)
                    <input type="number" min="0.1" step="0.5" value={Number.isFinite(draft.height) ? draft.height : ''} onChange={(event) => updateDimension('height', event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                  </label>
                </div>
                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-gray-700">Shape</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {SHAPES.map((shape) => (
                      <button
                        key={shape.value}
                        type="button"
                        disabled={!Number.isFinite(draft.width) || draft.width <= 0
                          || !Number.isFinite(draft.height) || draft.height <= 0}
                        onClick={() => updateDraft((current) =>
                          (current.shape || 'rectangle') === shape.value
                            ? current
                            : changeVenueShape(current, shape.value))}
                        aria-pressed={(draft.shape || 'rectangle') === shape.value}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${(draft.shape || 'rectangle') === shape.value ? 'border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-300' : 'border-gray-200 hover:border-purple-300'}`}
                      >
                        <span className="block text-sm font-semibold">{shape.label}</span>
                        <span className="block text-[11px] text-gray-500">{shape.description}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                {unsupportedShape && (
                  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950" role="alert">
                    <strong>Rectangular compatibility outline:</strong> the stored “{draft.shape}” venue shape is not silently converted. Choose a supported shape above before Apply.
                  </div>
                )}
                {draft.shape === 'custom' && (
                  <button type="button" onClick={() => setShowShapeBuilder(true)} disabled={!Number.isFinite(draft.width) || !Number.isFinite(draft.height) || draft.width <= 0 || draft.height <= 0} className="mt-3 w-full rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-800 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50">
                    ✏️ Edit {draft.shapePoints?.length || 0} custom outline points
                  </button>
                )}
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="canvas-size-heading">
                <h3 id="canvas-size-heading" className="font-bold text-gray-900">Canvas & venue position</h3>
                <p className="mt-1 text-xs text-gray-500">Venue X/Y is the footprint’s top-left offset inside the full planning canvas.</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {([
                    ['canvasWidth', 'Canvas width (ft)', rawCanvas.canvasWidth],
                    ['canvasHeight', 'Canvas height (ft)', rawCanvas.canvasHeight],
                    ['venueX', 'Venue X (ft)', rawCanvas.venueX],
                    ['venueY', 'Venue Y (ft)', rawCanvas.venueY],
                  ] as const).map(([key, label, value]) => (
                    <label key={key} className="text-sm font-medium text-gray-700">
                      {label}
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={Number.isFinite(value) ? value : ''}
                        onChange={(event) => {
                          const next = numberFromInput(event.target.value);
                          updateDraft((current) => ({ ...current, [key]: next }));
                        }}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="geometry-preview-heading">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="geometry-preview-heading" className="font-bold text-gray-900">Local preview</h3>
                  <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-700">Not applied</span>
                </div>
                <div className="mt-3 aspect-[4/3] overflow-hidden rounded-lg border border-gray-300 bg-slate-100">
                  {validationErrors.length === 0 || compatibilityPreviewOnly ? (
                    <svg
                      viewBox={`0 0 ${canvas.canvasWidth} ${canvas.canvasHeight}`}
                      className="h-full w-full"
                      role="img"
                      aria-label={unsupportedShape
                        ? `Rectangular compatibility preview for unsupported stored ${draft.shape} venue shape`
                        : `Proposed ${draft.shape || 'rectangle'} venue footprint on its canvas`}
                    >
                      <rect x="0" y="0" width={canvas.canvasWidth} height={canvas.canvasHeight} fill={draft.canvasFillColor || '#f8fafc'} stroke={draft.canvasBorderColor || '#94a3b8'} strokeWidth={Math.max(0.5, canvas.canvasWidth / 300)} />
                      <polygon points={previewPoints} fill={draft.color || '#ede9fe'} stroke={draft.borderColor || '#6d28d9'} strokeWidth={Math.max(0.8, canvas.canvasWidth / 180)} />
                      <text x={canvas.venueX + draft.width / 2} y={Math.max(3, canvas.venueY - 2)} textAnchor="middle" fontSize={Math.max(3, canvas.canvasWidth / 35)} fill="#4c1d95">{formatFeet(draft.width)} ft</text>
                    </svg>
                  ) : (
                    <div className="h-full flex items-center justify-center p-4 text-sm text-red-700">Enter valid dimensions to preview.</div>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm" aria-labelledby="impact-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="impact-heading" className="text-lg font-bold text-gray-900">Impact review</h3>
                    <p className="mt-1 text-sm text-gray-600">Coordinates remain unchanged in every layout. This report tests those exact coordinates against the proposed footprint and canvas.</p>
                  </div>
                  <div className={`rounded-lg px-3 py-2 text-sm font-bold ${hasImpact ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`} role="status" aria-live="polite">
                    {hasImpact ? `${impact.affectedItems} affected item${impact.affectedItems === 1 ? '' : 's'}` : 'No affected items'}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-xl font-bold text-gray-900">{impact.layoutsReviewed}</div><div className="text-xs text-gray-500">Layouts reviewed</div></div>
                  <div className="rounded-lg bg-gray-50 p-3"><div className="text-xl font-bold text-gray-900">{impact.itemsReviewed}</div><div className="text-xs text-gray-500">Items reviewed</div></div>
                  <div className="rounded-lg bg-amber-50 p-3"><div className="text-xl font-bold text-amber-900">{impact.affectedLayouts}</div><div className="text-xs text-amber-700">Layouts with conflicts</div></div>
                  <div className="rounded-lg bg-red-50 p-3"><div className="text-xl font-bold text-red-900">{impact.newlyAffectedItems}</div><div className="text-xs text-red-700">Newly affected</div></div>
                </div>

                {changedSummary.length > 0 ? (
                  <ul className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 space-y-1">
                    {changedSummary.map((summary) => <li key={summary}>• {summary}</li>)}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">Change a geometry field to preview its impact.</p>
                )}

                {validationErrors.length > 0 && (
                  <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
                    <div className="font-bold">Repair before applying</div>
                    <ul className="mt-1 list-disc pl-5">{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>
                  </div>
                )}

                <div className="mt-4 space-y-4">
                  {GROUPS.map((group) => {
                    const rows = impact.rows.filter((row) => row.kind === group.kind);
                    return (
                      <section key={group.kind} aria-labelledby={`impact-${group.kind}`}>
                        <div className="flex items-center justify-between gap-3">
                          <h4 id={`impact-${group.kind}`} className="text-sm font-bold text-gray-800">{group.label}</h4>
                          <span className="text-xs text-gray-500">{rows.length}</span>
                        </div>
                        {rows.length === 0 ? (
                          <p className="mt-1 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">{group.empty}</p>
                        ) : (
                          <div className="mt-1 overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full min-w-[560px] text-left text-xs">
                              <thead className="bg-gray-50 text-gray-600">
                                <tr><th className="px-3 py-2">Layout</th><th className="px-3 py-2">Items</th><th className="px-3 py-2">Outside venue</th><th className="px-3 py-2">Outside canvas</th><th className="px-3 py-2">Newly affected</th></tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {rows.map((row) => (
                                  <tr key={row.id} className={row.affectedItemIds.length > 0 ? 'bg-amber-50/60' : 'bg-white'}>
                                    <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                                    <td className="px-3 py-2">{row.itemCount}</td>
                                    <td className="px-3 py-2">{row.outsideVenueBefore} → <strong>{row.outsideVenueAfter}</strong></td>
                                    <td className="px-3 py-2">{row.outsideCanvasBefore} → <strong>{row.outsideCanvasAfter}</strong></td>
                                    <td className={`px-3 py-2 font-bold ${row.newlyAffectedCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>{row.newlyAffectedCount}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                  <p><strong>Outside venue</strong> uses each rotated physical footprint, including configured chairs and explicit zero-chair behavior.</p>
                  <p><strong>Outside canvas</strong> includes venue-anchored items, fixed exterior items, and canvas decor.</p>
                  <p>Changing venue X/Y moves the venue and venue-anchored content together on the canvas; their local feet coordinates do not change.</p>
                </div>

                {hasImpact && validationErrors.length === 0 && (
                  <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <input type="checkbox" checked={acknowledgedImpact} onChange={(event) => setAcknowledgedImpact(event.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span><strong>I reviewed the conflicts.</strong> Apply the geometry without scaling, moving, or clamping any placed item.</span>
                  </label>
                )}
              </section>
            </div>
          </div>
        </div>

        <footer className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-3">
          <p className="text-xs text-gray-500">Only Apply geometry writes to the shared venue record. Closing discards this draft.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => {
              setDraft(initialDraft);
              lastValidDimensionsRef.current = {
                width: initialDraft.width,
                height: initialDraft.height,
              };
              setAcknowledgedImpact(false);
            }} disabled={!dirty || applying} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Reset draft</button>
            <button type="button" onClick={requestClose} disabled={applying} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={() => void apply()} disabled={staleVenueConflict || !dirty || applying || validationErrors.length > 0 || (hasImpact && !acknowledgedImpact)} className="rounded-lg bg-[#4A1942] px-5 py-2 text-sm font-bold text-white hover:bg-[#35112f] disabled:cursor-not-allowed disabled:opacity-50">
              {applying ? 'Applying…' : 'Apply geometry'}
            </button>
          </div>
        </footer>
      </section>

      {showShapeBuilder && (
        <CustomVenueBuilder
          venue={draft}
          onSave={(points: Point[]) => {
            updateDraft((current) => ({
              ...current,
              shape: 'custom',
              isCustomShape: true,
              shapePoints: points,
              customPath: customPathForPoints(points),
            }));
            setShowShapeBuilder(false);
          }}
          onClose={() => setShowShapeBuilder(false)}
        />
      )}

      <ConfirmDialog
        open={discardOpen}
        title="Discard geometry draft?"
        message="Your venue and canvas edits have not been applied. Closing now discards only this local draft; every saved layout remains unchanged."
        confirmLabel="Discard draft"
        cancelLabel="Keep editing"
        initialFocus="cancel"
        tone="danger"
        onConfirm={onClose}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>
  );
}
