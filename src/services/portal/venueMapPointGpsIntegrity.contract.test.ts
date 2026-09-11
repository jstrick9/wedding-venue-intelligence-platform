import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0050_venue_map_point_gps_integrity.sql'),
  'utf8',
);

describe('migration 0050 Venue Map point GPS integrity', () => {
  it('requires latitude and longitude together as bounded JSON numbers', () => {
    expect(migration).toContain("(point.value ? 'lat') <> (point.value ? 'lng')");
    expect(migration).toContain("jsonb_typeof(point.value->'lat') is distinct from 'number'");
    expect(migration).toContain("jsonb_typeof(point.value->'lng') is distinct from 'number'");
    expect(migration).toContain("(point.value->>'lat')::numeric not between -90 and 90");
    expect(migration).toContain("(point.value->>'lng')::numeric not between -180 and 180");
  });

  it('blocks future Venue Map writes without rewriting historical recovery rows', () => {
    expect(migration).toContain("if new.domain <> 'venueMapConfigs'");
    expect(migration).toContain('venue_map_has_invalid_point_gps(new.payload)');
    expect(migration).toContain("message = 'venue_map_point_gps_invalid'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_point_gps[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps both integrity helpers private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_invalid_point_gps(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_point_gps()',
    );
  });
});
