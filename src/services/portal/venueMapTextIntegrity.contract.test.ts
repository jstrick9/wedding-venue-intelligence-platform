import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0049_venue_map_text_integrity.sql'),
  'utf8',
);

describe('migration 0049 Venue Map text integrity', () => {
  it('defines the established required-name and optional-guidance limits', () => {
    expect(migration).toContain("venue_map_text_field_valid(point.value, 'label', 200, true)");
    expect(migration).toContain("venue_map_text_field_valid(point.value, 'description', 1000, false)");
    expect(migration).toContain("venue_map_text_field_valid(route.value, 'name', 200, true)");
    expect(migration).toContain("venue_map_text_field_valid(route.value, 'notes', 1000, false)");
    expect(migration).toContain("venue_map_text_field_valid(drawing.value, 'text', 300, false)");
    expect(migration).toContain("venue_map_text_field_valid(contingency.value, 'note', 1000, false)");
  });

  it('sanitizes text only after structural duplicate counting and removes dependent routes', () => {
    expect(migration).toMatch(
      /v_structural_safe_map := public\.sanitize_venue_map_structural_integrity\(p_map\);\s+v_text_safe_map := public\.sanitize_venue_map_text_integrity\(v_structural_safe_map\);/,
    );
    expect(migration).toMatch(
      /create or replace function public\.sanitize_venue_map_text_integrity[\s\S]*?into v_routes[\s\S]*?jsonb_array_elements\(v_points\)[\s\S]*?<> 1/,
    );
    expect(migration).toContain(
      'v_coordinate_safe_map := public.sanitize_venue_map_point_coordinates(v_text_safe_map)',
    );
  });

  it('blocks future direct writes without rewriting historical recovery rows', () => {
    expect(migration).toContain('venue_map_has_invalid_text_fields(new.payload)');
    expect(migration).toContain("message = 'venue_map_text_fields_invalid'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_text_fields[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps helper execution private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_text_field_valid(jsonb, text, integer, boolean)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_text_integrity(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_text_fields()',
    );
  });
});
