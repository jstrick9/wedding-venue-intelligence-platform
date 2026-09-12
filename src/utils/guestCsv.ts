import type { Guest } from '../types';
import { createEntityId } from './entityId';

/**
 * Pure CSV → guest-list parsing. Kept separate from React state so it can be
 * unit-tested in isolation and reused by any caller.
 */

export interface GuestImportResult {
  ok: boolean;
  error?: string;
  added?: number;
  skipped?: number;
  /** The newly-parsed guests (present when ok). */
  guests?: Guest[];
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

const TRUTHY = new Set(['yes', 'y', 'true', '1']);

/**
 * Parse a CSV guest list and produce new Guest records, deduplicating against
 * the provided existing guests by (name + group). Returns a structured result
 * rather than relying on `alert()`.
 */
export function parseGuestCsv(
  csvText: string,
  existing: Guest[] = [],
): GuestImportResult {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { ok: true, added: 0, skipped: 0, guests: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const nameIndex = headers.findIndex((h) => h.includes('name'));
  const groupIndex = headers.findIndex((h) => h.includes('group') || h.includes('party'));
  const emailIndex = headers.findIndex((h) => h.includes('email'));
  const phoneIndex = headers.findIndex((h) => h.includes('phone'));
  const dietaryIndex = headers.findIndex((h) => h.includes('diet'));
  const accessibilityIndex = headers.findIndex((h) => h.includes('accessib'));

  if (nameIndex === -1) {
    return { ok: false, error: 'CSV must have a "name" column.', guests: [] };
  }

  const existingKeys = new Set(
    existing.map((g) =>
      `${g.name.trim().toLowerCase()}::${(g.group || '').trim().toLowerCase()}`,
    ),
  );

  const guests: Guest[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const name = (values[nameIndex] || '').trim();
    if (!name) continue;

    const group = groupIndex >= 0 ? values[groupIndex]?.trim() : undefined;
    const key = `${name.toLowerCase()}::${(group || '').toLowerCase()}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);

    const rawAccessibility = accessibilityIndex >= 0
      ? (values[accessibilityIndex] || '').trim().toLowerCase()
      : '';

    guests.push({
      id: createEntityId('guest', [...existing, ...guests].map((guest) => guest.id)),
      name,
      group: group || undefined,
      email: emailIndex >= 0 ? values[emailIndex]?.trim() || undefined : undefined,
      phone: phoneIndex >= 0 ? values[phoneIndex]?.trim() || undefined : undefined,
      dietaryRestrictions: dietaryIndex >= 0 ? values[dietaryIndex]?.trim() || undefined : undefined,
        accessibility:
          accessibilityIndex >= 0 && rawAccessibility !== ''
            ? TRUTHY.has(rawAccessibility)
            : undefined,
      rsvpStatus: 'pending' as const,
    });
  }

  return { ok: true, added: guests.length, skipped, guests };
}
