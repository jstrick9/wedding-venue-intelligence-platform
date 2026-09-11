import type { VenueMapRoute, VenueMapRoutePriority } from '../types';
import { routeAccessibilityLabel, routePriorityLabel } from '../utils/venueMapDesigner';

interface VenueMapRouteGuidanceProps {
  routes?: readonly VenueMapRoute[];
  compact?: boolean;
}

export interface VenueMapRouteGuidanceItem {
  id: string;
  name: string;
  priority: string;
  accessibility: string;
  note?: string;
}

const PRIORITY_RANK: Record<VenueMapRoutePriority, number> = {
  preferred: 0,
  standard: 1,
  secondary: 2,
  'emergency-only': 3,
};

export function buildVenueMapRouteGuidanceItems(
  routes: readonly VenueMapRoute[],
): VenueMapRouteGuidanceItem[] {
  return routes
    .map((route, index) => ({ route, index }))
    .sort((left, right) => {
      const leftPriority = left.route.priority || 'standard';
      const rightPriority = right.route.priority || 'standard';
      return (PRIORITY_RANK[leftPriority] ?? PRIORITY_RANK.standard)
        - (PRIORITY_RANK[rightPriority] ?? PRIORITY_RANK.standard)
        || left.index - right.index;
    })
    .map(({ route }) => ({
      id: route.id,
      name: route.name,
      priority: routePriorityLabel(route.priority),
      accessibility: routeAccessibilityLabel(route.accessibility),
      note: route.notes?.trim() || undefined,
    }));
}

/**
 * Delivers the complete authored identity, priority, mobility status, and
 * cautions for routes already projected to the current map viewer.
 */
export function VenueMapRouteGuidance({
  routes = [],
  compact = false,
}: VenueMapRouteGuidanceProps) {
  if (routes.length === 0) return null;
  const guidanceItems = buildVenueMapRouteGuidanceItems(routes);

  return (
    <section
      aria-label="Walkways and access notes"
      className={compact
        ? 'mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-950'
        : 'mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950'}
    >
      <p className="font-semibold">🧭 Walkways &amp; access notes</p>
      <ul className="mt-1 grid gap-2 sm:grid-cols-2">
        {guidanceItems.map((item) => (
          <li key={item.id} className="rounded border border-emerald-200/80 bg-white/70 px-2 py-1.5">
            <p className="font-medium">{item.name}</p>
            <p className="text-[0.92em] text-emerald-800">
              {item.priority} · {item.accessibility}
            </p>
            {item.note && (
              <p className="mt-0.5 leading-relaxed">{item.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
