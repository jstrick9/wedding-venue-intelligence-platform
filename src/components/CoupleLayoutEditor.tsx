import { useMemo, useState } from 'react';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import {
  getTableSpecs,
  getFixtureTypes,
  getDecorItems,
} from '../hooks/useLayoutState';
import {
  Venue,
  PlacedTable,
  PlacedFixture,
  PlacedDecor,
  CoupleSpaceLayout,
} from '../types';
import { useBrandingConfig } from '../config';
import { layoutSeatCount } from '../utils/layoutSeating';
import { effectiveCanvasGeometry } from '../utils/venueGeometry';
import { createEntityId } from '../utils/entityId';

interface Props {
  venue: Venue;
  initial?: CoupleSpaceLayout | null;
  /** Expected number of guests this layout must seat (for a capacity warning). */
  guestCount?: number;
  onSave: (layout: CoupleSpaceLayout) => void;
  onClose: () => void;
}

type PendingKind = 'table' | 'fixture' | 'decor';

interface PendingItem {
  kind: PendingKind;
  specId: string;
}

/**
 * A self-contained layout editor for a single couple space. Reuses the venue's
 * FloorPlanCanvas + catalog (tables/chairs, fixtures, decor) so the couple can
 * draw a real layout in-portal. The drawn layout is saved per couple+space and
 * later shown to the venue for approval.
 */
export function CoupleLayoutEditor({ venue, initial, guestCount, onSave, onClose }: Props) {
  const config = useBrandingConfig();
  const [tables, setTables] = useState<PlacedTable[]>(initial?.tables || []);
  const [fixtures, setFixtures] = useState<PlacedFixture[]>(initial?.fixtures || []);
  const [decor, setDecor] = useState<PlacedDecor[]>(initial?.decor || []);
  // Legacy/master ceremony rows are not edited in the simplified couple tool,
  // but they must remain visible and survive every save round-trip.
  const [ceremonyRows] = useState(() => initial?.ceremonyRows || []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.9);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [pending, setPending] = useState<PendingItem | null>(null);

  const tableSpecs = useMemo(() => getTableSpecs(), []);
  const fixtureTypes = useMemo(() => getFixtureTypes(), []);
  const decorItems = useMemo(() => getDecorItems(), []);

  // Palette groups (only catalogs relevant to this space's category).
  const category = venue.category;
  const pendingFixture = pending?.kind === 'fixture'
    ? fixtureTypes.find((fixture) => fixture.id === pending.specId)
    : undefined;
  const pendingUsesCanvasCoordinates = pending?.kind === 'decor'
    || !!pendingFixture?.isExterior
    || pendingFixture?.category === 'exterior';

  const place = (position: { x: number; y: number }) => {
    if (!pending) return;
    const canvas = effectiveCanvasGeometry(venue);
    const pos = {
      x: Math.max(0, Math.min(position.x, (pendingUsesCanvasCoordinates ? canvas.canvasWidth : venue.width) - 2)),
      y: Math.max(0, Math.min(position.y, (pendingUsesCanvasCoordinates ? canvas.canvasHeight : venue.height) - 2)),
    };
    if (pending.kind === 'table') {
      const spec = tableSpecs.find((s) => s.id === pending.specId);
      if (!spec) return;
      setTables((prev) => [
        ...prev,
        {
          id: createEntityId('table', [...tables, ...fixtures, ...decor].map((item) => item.id)),
          type: 'table',
          specId: spec.id,
          x: pos.x,
          y: pos.y,
          rotation: 0,
          label: spec.name,
          guests: [],
          showChairs: spec.showChairs ?? true,
        },
      ]);
    } else if (pending.kind === 'fixture') {
      const spec = fixtureTypes.find((s) => s.id === pending.specId);
      if (!spec) return;
      setFixtures((prev) => [
        ...prev,
        {
          id: createEntityId('fixture', [...tables, ...fixtures, ...decor].map((item) => item.id)),
          type: 'fixture',
          specId: spec.id,
          x: pos.x,
          y: pos.y,
          rotation: 0,
          label: spec.name,
          isExterior: !!spec.isExterior || spec.category === 'exterior',
        },
      ]);
    } else {
      const spec = decorItems.find((s) => s.id === pending.specId);
      if (!spec) return;
      setDecor((prev) => [
        ...prev,
        {
          id: createEntityId('decor', [...tables, ...fixtures, ...decor].map((item) => item.id)),
          decorItemId: spec.id,
          x: pos.x,
          y: pos.y,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          zIndex: prev.length + 1,
          parentType: 'canvas',
        },
      ]);
    }
    setPending(null);
  };

  const move = (id: string, position: { x: number; y: number }, isExterior?: boolean) => {
    const canvas = effectiveCanvasGeometry(venue);
    const clampPosition = (canvasAnchored: boolean) => ({
      x: Math.max(0, Math.min(position.x, (canvasAnchored ? canvas.canvasWidth : venue.width) - 2)),
      y: Math.max(0, Math.min(position.y, (canvasAnchored ? canvas.canvasHeight : venue.height) - 2)),
    });
    setTables((prev) => prev.map((table) => {
      if (table.id !== id) return table;
      const next = clampPosition(false);
      return { ...table, x: next.x, y: next.y };
    }));
    setFixtures((prev) => prev.map((fixture) => {
      if (fixture.id !== id) return fixture;
      const canvasAnchored = isExterior ?? fixture.isExterior ?? false;
      const next = clampPosition(canvasAnchored);
      return { ...fixture, x: next.x, y: next.y, isExterior: canvasAnchored };
    }));
    setDecor((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const next = clampPosition(item.parentType === 'canvas');
      return { ...item, x: next.x, y: next.y };
    }));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setTables((prev) => prev.filter((t) => t.id !== selectedId));
    setFixtures((prev) => prev.filter((f) => f.id !== selectedId));
    setDecor((prev) => prev.filter((d) => d.id !== selectedId));
    setSelectedId(null);
  };

  const handleSave = () => {
    onSave({ tables, fixtures, decor, ceremonyRows, updatedAt: new Date().toISOString() });
  };

  const count = tables.length + fixtures.length + decor.length + ceremonyRows.length;

  // Configured chair count is the shared capacity source used by venue, couple,
  // guest-assignment, canvas, and print surfaces.
  const seatingCapacity = layoutSeatCount(tables, tableSpecs, ceremonyRows);
  const capacityShort = !!guestCount && seatingCapacity < guestCount;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[11000] p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="px-4 py-3 text-white flex items-center justify-between"
          style={{
            background: `linear-gradient(135deg, ${config.primaryColor || '#4A1942'}, ${config.primaryDark || '#3d1a45'})`,
          }}
        >
          <div>
            <h3 className="font-semibold">Layout editor — {venue.name}</h3>
            <p className="text-xs text-white/80 mt-0.5">Pick an item, click the canvas to place it, drag to move.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-white/20 rounded-full px-2 py-1">{count} item(s)</span>
            {guestCount != null && (
              <span
                className={`text-xs rounded-full px-2 py-1 ${
                  capacityShort
                    ? 'bg-amber-300 text-amber-900 font-semibold'
                    : 'bg-white/20 text-white'
                }`}
                title={capacityShort ? `This layout seats ${seatingCapacity} but you expect ${guestCount} guests.` : undefined}
              >
                {capacityShort ? '⚠️' : '🪑'} Seats {seatingCapacity} / {guestCount} guests
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-lg bg-white text-xs font-bold shadow hover:bg-gray-100 transition-colors"
              style={{ color: config.primaryColor || '#4A1942' }}
            >
              💾 Save layout
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-sm font-medium hover:bg-white/30"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-gray-200 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            className={`px-2 py-1 rounded border font-semibold ${showGrid ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300'}`}
            style={showGrid ? { color: config.primaryColor || '#4A1942', borderColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${config.primaryColor || '#4A1942'} 10%, transparent)` } : undefined}
          >
            Grid
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="px-2 py-1 rounded border border-gray-300 text-gray-600">−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="px-2 py-1 rounded border border-gray-300 text-gray-600">+</button>
          <span className="mx-1" />
          {selectedId && (
            <button type="button" onClick={removeSelected} className="px-2 py-1 rounded bg-red-600 text-white font-bold">🗑 Delete selected</button>
          )}
          {pending && (
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-medium">Click the canvas to place the selected item</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* Palette */}
          <div className="sm:w-52 sm:overflow-y-auto border-b sm:border-b-0 sm:border-r border-gray-200 p-3 space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Tables / Seating</div>
              <div className="space-y-1">
                {tableSpecs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPending(pending?.specId === s.id ? null : { kind: 'table', specId: s.id })}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${pending?.specId === s.id && pending.kind === 'table' ? 'text-white font-bold shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                    style={pending?.specId === s.id && pending.kind === 'table' ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
                  >
                    {s.name} <span className="opacity-60">({s.width}×{s.height})</span>
                  </button>
                ))}
                {tableSpecs.length === 0 && <p className="text-xs text-gray-400">No tables configured.</p>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Fixtures</div>
              <div className="space-y-1">
                {fixtureTypes
                  .filter((f) => f.visibleToUsers !== false && (f.isSelectable ?? true) && (!f.venueCategories || f.venueCategories.includes(category)))
                  .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPending(pending?.specId === f.id ? null : { kind: 'fixture', specId: f.id })}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${pending?.specId === f.id && pending.kind === 'fixture' ? 'text-white font-bold shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                      style={pending?.specId === f.id && pending.kind === 'fixture' ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
                    >
                      {f.name}
                    </button>
                  ))}
                {fixtureTypes.length === 0 && <p className="text-xs text-gray-400">No fixtures configured.</p>}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1">Decor</div>
              <div className="space-y-1">
                {decorItems.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setPending(pending?.specId === d.id ? null : { kind: 'decor', specId: d.id })}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${pending?.specId === d.id && pending.kind === 'decor' ? 'text-white font-bold shadow-sm' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}
                    style={pending?.specId === d.id && pending.kind === 'decor' ? { backgroundColor: config.primaryColor || '#4A1942' } : undefined}
                  >
                    {d.icon} {d.name}
                  </button>
                ))}
                {decorItems.length === 0 && <p className="text-xs text-gray-400">No decor items.</p>}
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative overflow-hidden bg-gray-100">
            <FloorPlanCanvas
              venue={venue}
              tables={tables}
              fixtures={fixtures}
              decor={decor}
              ceremonyRows={ceremonyRows}
              guests={[]}
              selectedId={selectedId}
              zoom={zoom}
              showGrid={showGrid}
              gridSize={2}
              onSelect={setSelectedId}
              onDoubleClick={setSelectedId}
              onMove={move}
              onDrop={(pos) => place(pos)}
              onClickToPlace={(pos) => place(pos)}
              isDragging={!!pending}
              isDraggingExterior={pendingUsesCanvasCoordinates}
              isAdmin
              onViewImage={() => {}}
              panOffset={panOffset}
              onPanChange={setPanOffset}
              onZoomChange={setZoom}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
