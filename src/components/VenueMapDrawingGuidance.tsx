import type { DrawingObject } from '../types';

interface VenueMapDrawingGuidanceProps {
  drawings?: readonly DrawingObject[];
  compact?: boolean;
}

export interface VenueMapDrawingGuidanceItem {
  id: string;
  type: string;
  text: string;
}

export function venueMapDrawingTypeLabel(type: string): string {
  switch (type) {
    case 'zone': return 'Zone';
    case 'rectangle': return 'Rectangle';
    case 'circle': return 'Circle';
    case 'line': return 'Line';
    default: return type || 'Map shape';
  }
}

export function buildVenueMapDrawingGuidanceItems(
  drawings: readonly DrawingObject[],
): VenueMapDrawingGuidanceItem[] {
  return drawings.flatMap((drawing) => {
    const text = drawing.text?.trim();
    return text
      ? [{ id: drawing.id, type: venueMapDrawingTypeLabel(drawing.type), text: drawing.text! }]
      : [];
  });
}

/** Delivers exact labels for shapes already projected to the current viewer. */
export function VenueMapDrawingGuidance({
  drawings = [],
  compact = false,
}: VenueMapDrawingGuidanceProps) {
  const guidanceItems = buildVenueMapDrawingGuidanceItems(drawings);
  if (guidanceItems.length === 0) return null;

  return (
    <section
      aria-label="Map annotations"
      className={compact
        ? 'mt-2 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1.5 text-[11px] text-violet-950'
        : 'mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950'}
    >
      <p className="font-semibold">▱ Map annotations</p>
      <ul className="mt-1 grid gap-2 sm:grid-cols-2">
        {guidanceItems.map((item) => (
          <li key={item.id} className="rounded border border-violet-200/80 bg-white/70 px-2 py-1.5">
            <p className="font-medium whitespace-pre-wrap break-words">{item.text}</p>
            <p className="text-[0.92em] text-violet-800">{item.type}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
