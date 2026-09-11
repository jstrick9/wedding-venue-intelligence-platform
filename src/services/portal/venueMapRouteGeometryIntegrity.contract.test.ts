import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0058_venue_map_route_geometry_integrity.sql'),
  'utf8',
);

describe('migration 0058 Venue Map route-geometry integrity', () => {
  it('requires at least two distinct referenced coordinate pairs', () => {
    expect(migration).toMatch(/create or replace function public\.venue_map_route_has_visible_geometry/i);
    expect(migration).toMatch(/count\(distinct jsonb_build_array\([\s\S]*point\.value->'x'[\s\S]*point\.value->'y'[\s\S]*\)\)\s*>=\s*2/i);
    expect(migration).toMatch(/create or replace function public\.venue_map_has_zero_length_routes/i);
    expect(migration).toMatch(/not public\.venue_map_route_has_visible_geometry\(route\.value, p_map\)/i);
  });

  it('quarantines historical invisible routes after coordinate and catalog sanitation', () => {
    expect(migration).toMatch(/create or replace function public\.sanitize_venue_map_route_geometry/i);
    expect(migration).toMatch(/where public\.venue_map_route_has_visible_geometry\(route\.value, p_map\)/i);
    expect(migration).toMatch(/v_coordinate_safe_map := public\.sanitize_venue_map_point_coordinates\(v_text_safe_map\)/i);
    expect(migration).toMatch(/v_space_safe_map := public\.sanitize_venue_map_space_point_links\(v_rain_safe_map, p_venues\)/i);
    expect(migration).toMatch(/v_route_geometry_safe_map := public\.sanitize_venue_map_route_geometry\(v_space_safe_map\)/i);
  });

  it('rejects future zero-length canonical writes without rewriting historical rows', () => {
    expect(migration).toMatch(/create trigger enforce_valid_venue_map_route_geometry/i);
    expect(migration).toMatch(/before insert or update of payload, domain, organization_id/i);
    expect(migration).toMatch(/message = 'venue_map_route_geometry_invalid'/i);
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });
});
