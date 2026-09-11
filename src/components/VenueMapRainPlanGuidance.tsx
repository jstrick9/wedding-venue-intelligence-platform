import type { RainContingency, Venue } from '../types';

interface VenueMapRainPlanGuidanceProps {
  rainContingencies?: readonly RainContingency[];
  venues: readonly Venue[];
  compact?: boolean;
}

export interface VenueMapRainPlanGuidanceItem {
  id: string;
  locationChange: string;
  note?: string;
}

export function buildVenueMapRainPlanGuidanceItems(
  rainContingencies: readonly RainContingency[],
  venues: readonly Venue[],
): VenueMapRainPlanGuidanceItem[] {
  const venueName = (venueId: string) =>
    venues.find((venue) => venue.id === venueId)?.name?.trim() || venueId;
  return rainContingencies.map((contingency) => ({
    id: contingency.id,
    locationChange: `${venueName(contingency.outdoorVenueId)} → ${venueName(contingency.indoorVenueId)}`,
    note: contingency.note?.trim() || undefined,
  }));
}

/**
 * Delivers venue-authored rain-plan instructions from the audience-scoped map
 * projection. Callers must pass only contingencies already validated/scoped for
 * the current portal viewer.
 */
export function VenueMapRainPlanGuidance({
  rainContingencies = [],
  venues,
  compact = false,
}: VenueMapRainPlanGuidanceProps) {
  if (rainContingencies.length === 0) return null;
  const guidanceItems = buildVenueMapRainPlanGuidanceItems(rainContingencies, venues);

  return (
    <section
      aria-label="Applicable rain contingency guidance"
      className={compact
        ? 'mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] text-blue-900'
        : 'mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950'}
    >
      <p className="font-semibold">🌧️ If the venue activates its rain plan</p>
      <ul className="mt-1 space-y-2">
        {guidanceItems.map((item) => (
          <li key={item.id}>
            <p className="font-medium">{item.locationChange}</p>
            {item.note && (
              <p className="mt-0.5 leading-relaxed">{item.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
