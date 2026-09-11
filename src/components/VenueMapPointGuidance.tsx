import type { VenueMapPoint } from '../types';
import { pointKindIcon, pointKindLabel } from '../utils/venueMapDesigner';

interface VenueMapPointGuidanceProps {
  points?: readonly VenueMapPoint[];
  compact?: boolean;
}

export interface VenueMapPointGuidanceItem {
  id: string;
  name: string;
  kind: string;
  icon: string;
  guidance: string;
}

export function buildVenueMapPointGuidanceItems(
  points: readonly VenueMapPoint[],
): VenueMapPointGuidanceItem[] {
  return points.flatMap((point) => {
    const guidance = point.description?.trim();
    return guidance
      ? [{
          id: point.id,
          name: point.label,
          kind: pointKindLabel(point.kind),
          icon: pointKindIcon(point.kind),
          guidance,
        }]
      : [];
  });
}

/** Delivers exact notes for points already projected to the current map viewer. */
export function VenueMapPointGuidance({
  points = [],
  compact = false,
}: VenueMapPointGuidanceProps) {
  const guidanceItems = buildVenueMapPointGuidanceItems(points);
  if (guidanceItems.length === 0) return null;

  return (
    <section
      aria-label="Location and arrival notes"
      className={compact
        ? 'mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950'
        : 'mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950'}
    >
      <p className="font-semibold">📍 Location &amp; arrival notes</p>
      <ul className="mt-1 grid gap-2 sm:grid-cols-2">
        {guidanceItems.map((item) => (
          <li key={item.id} className="rounded border border-amber-200/80 bg-white/70 px-2 py-1.5">
            <p className="font-medium">
              <span aria-hidden="true">{item.icon} </span>
              {item.name}
            </p>
            <p className="text-[0.92em] text-amber-800">{item.kind}</p>
            <p className="mt-0.5 leading-relaxed">{item.guidance}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
