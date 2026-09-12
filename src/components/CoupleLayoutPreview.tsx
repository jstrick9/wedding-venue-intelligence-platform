import { useMemo, useState } from 'react';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { getTableSpecs } from '../hooks/useLayoutState';
import { Venue, CoupleSpaceLayout, LayoutReviewPin } from '../types';
import { layoutSeatCount } from '../utils/layoutSeating';

interface Props {
  venue: Venue;
  layout: CoupleSpaceLayout;
  /** Expected guest count for this event, to surface a capacity shortfall. */
  guestCount?: number;
  reviewPins?: LayoutReviewPin[];
  onAddReviewPin?: (position: { x: number; y: number }, comment: string) => void;
  onRemoveReviewPin?: (pinId: string) => void;
}

/**
 * Read-only preview of a couple's drawn layout for one space. Used by the venue
 * in the layout approval queue so it can see the actual drawing before deciding.
 */
export function CoupleLayoutPreview({
  venue,
  layout,
  guestCount,
  reviewPins = [],
  onAddReviewPin,
  onRemoveReviewPin,
}: Props) {
  const [zoom, setZoom] = useState(0.7);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [pendingPinPos, setPendingPinPos] = useState<{ x: number; y: number } | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  const tableSpecs = useMemo(() => getTableSpecs(), []);
  const seatingCapacity = layoutSeatCount(layout.tables, tableSpecs, layout.ceremonyRows || []);
  const capacityShort = guestCount != null && seatingCapacity < guestCount;

  const handleSavePin = () => {
    if (pendingPinPos && commentInput.trim() && onAddReviewPin) {
      onAddReviewPin(pendingPinPos, commentInput.trim());
      setPendingPinPos(null);
      setCommentInput('');
      setIsAddingPin(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden mt-2">
      <div className="px-2 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-600 flex items-center justify-between gap-2 flex-wrap border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span>Drawn layout — {venue.name}</span>
          {onAddReviewPin && (
            <button
              type="button"
              onClick={() => {
                setIsAddingPin((prev) => !prev);
                setPendingPinPos(null);
                setCommentInput('');
              }}
              className={`rounded px-2 py-0.5 text-xs font-medium border transition-colors ${
                isAddingPin
                  ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {isAddingPin
                ? '✕ Cancel pin mode'
                : `📍 Add review pin${reviewPins.length ? ` (${reviewPins.length})` : ''}`}
            </button>
          )}
        </div>
        <span className="flex items-center gap-2">
          {guestCount != null && (
            <span
              className={`rounded-full px-2 py-0.5 ${
                capacityShort ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'
              }`}
              title={capacityShort ? `This space seats ${seatingCapacity} but the couple expects ${guestCount} guests.` : undefined}
            >
              {capacityShort ? '⚠️' : '🪑'} Seats {seatingCapacity} / {guestCount} guests
            </span>
          )}
          <span className="text-gray-400">
            {layout.tables.length} table(s) · {layout.fixtures.length} fixture(s) · {layout.decor.length} decor
            {(layout.ceremonyRows?.length || 0) > 0 ? ` · ${layout.ceremonyRows!.length} ceremony row(s)` : ''}
          </span>
        </span>
      </div>

      {pendingPinPos && (
        <div className="bg-rose-50 border-b border-rose-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="text-xs font-bold text-rose-700 whitespace-nowrap">
              📍 Pin at ({Math.round(pendingPinPos.x)}, {Math.round(pendingPinPos.y)}):
            </span>
            <input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Enter review note (e.g. Move table 5ft left)"
              className="text-xs px-2 py-1 border border-rose-300 rounded flex-1 bg-white"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePin();
              }}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSavePin}
              disabled={!commentInput.trim()}
              className="text-xs bg-rose-600 text-white px-2.5 py-1 rounded font-medium disabled:opacity-50 hover:bg-rose-700"
            >
              Save Pin
            </button>
            <button
              type="button"
              onClick={() => setPendingPinPos(null)}
              className="text-xs border border-gray-300 px-2.5 py-1 rounded hover:bg-gray-100 bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-50">
        <FloorPlanCanvas
          venue={venue}
          tables={layout.tables}
          fixtures={layout.fixtures}
          decor={layout.decor}
          ceremonyRows={layout.ceremonyRows || []}
          guests={[]}
          reviewPins={reviewPins}
          onSelectReviewPin={(pinId) => setSelectedPinId(pinId)}
          selectedId={null}
          zoom={zoom}
          showGrid={isAddingPin}
          gridSize={2}
          onSelect={() => {}}
          onDoubleClick={() => {}}
          onMove={() => {}}
          onDrop={() => {}}
          onClickToPlace={(pos) => {
            if (isAddingPin) {
              setPendingPinPos(pos);
              setCommentInput('');
            }
          }}
          isDragging={isAddingPin}
          isAdmin
          onViewImage={() => {}}
          panOffset={panOffset}
          onPanChange={setPanOffset}
          onZoomChange={setZoom}
        />
      </div>

      {reviewPins.length > 0 && (
        <div className="border-t border-gray-200 bg-white px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-gray-700">
            📍 Layout Review Pins ({reviewPins.length})
          </div>
          {reviewPins.map((pin, i) => {
            const isSelected = selectedPinId === pin.id;
            return (
              <div
                key={pin.id}
                className={`flex items-center justify-between text-xs rounded px-2 py-1 border transition-colors ${
                  isSelected ? 'bg-rose-50 border-rose-300' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-rose-600 mr-1.5">#{i + 1}</span>
                  <span className="text-gray-800 font-medium">{pin.comment}</span>
                  <span className="text-gray-400 ml-2">
                    ({Math.round(pin.x)}, {Math.round(pin.y)})
                  </span>
                  {pin.authorName && (
                    <span className="text-gray-500 ml-1.5">— {pin.authorName}</span>
                  )}
                </div>
                {onRemoveReviewPin && (
                  <button
                    type="button"
                    onClick={() => onRemoveReviewPin(pin.id)}
                    className="text-gray-400 hover:text-red-600 ml-2 font-bold px-1"
                    title="Delete review pin"
                    aria-label={`Delete review pin ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
