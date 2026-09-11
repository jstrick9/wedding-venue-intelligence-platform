import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0048_venue_map_drawing_frame_integrity.sql'),
  'utf8',
);

describe('migration 0048 Venue Map drawing-frame integrity', () => {
  it('checks rectangles, circles, lines, and rotated rendered bounds against the map frame', () => {
    expect(migration).toMatch(
      /create or replace function public\.venue_map_drawing_within_frame[\s\S]*?p_drawing jsonb[\s\S]*?p_map jsonb/,
    );
    expect(migration).toContain("p_drawing->>'type' in ('zone', 'rectangle')");
    expect(migration).toContain("p_drawing->>'type' = 'circle'");
    expect(migration).toContain("p_drawing->>'type' = 'line'");
    expect(migration).toContain('cos(radians(mod(v_rotation, 360)::double precision))');
    expect(migration).toContain('sin(radians(mod(v_rotation, 360)::double precision))');
    expect(migration).toContain("jsonb_array_elements(p_drawing->'points')");
  });

  it('omits legacy out-of-frame shapes from the shared portal sanitizer', () => {
    expect(migration).toMatch(
      /create or replace function public\.sanitize_venue_map_drawings[\s\S]*?venue_map_drawing_geometry_valid\(drawing\.value\)[\s\S]*?venue_map_drawing_within_frame\(drawing\.value, p_map\)/,
    );
  });

  it('blocks future direct writes through the established org-data trigger', () => {
    expect(migration).toMatch(
      /create or replace function public\.venue_map_has_invalid_drawing_geometry[\s\S]*?not public\.venue_map_drawing_within_frame\(drawing\.value, p_map\)/,
    );
    expect(migration).toContain('venue_map_has_invalid_drawing_geometry(new.payload)');
    expect(migration).toContain("message = 'venue_map_drawing_geometry_invalid'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_drawing_geometry[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
  });

  it('keeps recovery rows untouched and helper execution private', () => {
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
    expect(migration).toContain(
      'revoke all on function public.venue_map_drawing_within_frame(jsonb, jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_drawings(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_drawing_geometry()',
    );
  });
});
