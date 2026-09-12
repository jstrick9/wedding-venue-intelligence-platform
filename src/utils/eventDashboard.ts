import type { Guest, PlacedTable, RSVPSubmission, TableSpec } from '../types';
import { tableSeatCount } from './layoutSeating';

/**
 * Pure, testable "event intelligence" metrics for the wedding-event overview.
 * Computed from the data the app already holds (guest list, RSVP submissions,
 * placed tables + their specs). Kept free of React so it can be unit-tested and
 * reused by any consumer.
 */

export type DashboardHealth = 'ready' | 'attention' | 'warning';

export interface EventDashboard {
  totalGuests: number;
  confirmed: number;
  pending: number;
  declined: number;
  /** Percent of guests with a definitive (confirmed/declined) RSVP. */
  responseRate: number;
  seated: number;
  unseated: number;
  /** Sum of capacity across placed (non-seating-type) tables. */
  totalSeats: number;
  /** confirmed attendees as a % of total table seats (0 when no seats). */
  seatingUtilization: number;
  /** Over-capacity if confirmed attendees exceed total seats. */
  overCapacity: boolean;
  health: DashboardHealth;
  messages: string[];
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function computeEventDashboard(
  guests: Guest[],
  submissions: RSVPSubmission[],
  tables: PlacedTable[],
  tableSpecs: TableSpec[],
): EventDashboard {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed').length;
  const declined = guests.filter((g) => g.rsvpStatus === 'declined').length;
  const pending = guests.length - confirmed - declined;
  const responded = confirmed + declined;
  const responseRate = pct(responded, guests.length);

  const seated = guests.filter((g) => g.tableId || g.roomId).length;
  const unseated = guests.length - seated;

  const totalSeats = tables.reduce((sum, t) => {
    const spec = tableSpecs.find((s) => s.id === t.specId);
    // Seating-type rows are intentionally excluded from "table seats" here.
    if (spec?.isSeatingType) return sum;
    return sum + tableSeatCount(t, spec);
  }, 0);

  const seatingUtilization = pct(confirmed, totalSeats);
  const overCapacity = totalSeats > 0 && confirmed > totalSeats;

  // `submissions` is accepted so callers with RSVP data can pass it; the
  // primary attendance driver is the confirmed count on the guest list.
  void submissions;

  const messages: string[] = [];
  if (overCapacity) {
    messages.push(
      `Confirmed guests (${confirmed}) exceed table seating capacity (${totalSeats}).`,
    );
  }
  if (responseRate < 60 && guests.length > 0) {
    messages.push(`RSVP response rate is low (${responseRate}%).`);
  }
  if (unseated > 0) {
    messages.push(`${unseated} guest${unseated === 1 ? ' is' : 's are'} not yet seated.`);
  }
  if (totalSeats === 0 && guests.length > 0) {
    messages.push('No seating capacity configured yet (add tables to your layout).');
  }
  if (guests.length === 0) {
    messages.push('No guests added yet — import or add your guest list to get insights.');
  }
  if (messages.length === 0) {
    messages.push('Looking good — capacity and guest counts are aligned.');
  }

  // Only flag unseated guests as an issue once seating actually exists; a
  // fresh layout with no tables yet shouldn't show as "needs attention".
  const manyUnseated = totalSeats > 0 && unseated > guests.length * 0.5;

  const health: DashboardHealth = overCapacity
    ? 'warning'
    : responseRate < 60 || manyUnseated
      ? 'attention'
      : 'ready';

  return {
    totalGuests: guests.length,
    confirmed,
    pending,
    declined,
    responseRate,
    seated,
    unseated,
    totalSeats,
    seatingUtilization,
    overCapacity,
    health,
    messages,
  };
}
