import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0054_venue_map_drawing_presentation_integrity.sql'),
  'utf8',
);
const frameMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0048_venue_map_drawing_frame_integrity.sql'),
  'utf8',
);
const latestProjection = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0049_venue_map_text_integrity.sql'),
  'utf8',
);

describe('migration 0054 Venue Map drawing presentation integrity', () => {
  it('defines the existing safe SVG paint and numeric appearance ranges', () => {
    expect(migration).toContain("v_color <> 'transparent'");
    expect(migration).toContain("v_color !~* '^#[0-9a-f]{3,8}$'");
    expect(migration).toContain('if v_value < 0.1 or v_value > 20');
    expect(migration).toContain('if v_value < 0 or v_value > 1');
    expect(migration).toContain('if v_value < 1 or v_value > 100');
  });

  it('withholds the whole malformed-appearance shape in the shared sanitizer', () => {
    expect(migration).toMatch(
      /create or replace function public\.sanitize_venue_map_drawings[\s\S]*?venue_map_drawing_presentation_valid\(drawing\.value\)/,
    );
    expect(migration).toMatch(
      /venue_map_has_invalid_drawing_geometry[\s\S]*?not public\.venue_map_drawing_presentation_valid\(drawing\.value\)/,
    );
    expect(latestProjection).toMatch(/public\.sanitize_venue_map_drawings\(v_[a-z_]+_safe_map\)/);
  });

  it('strengthens the established write trigger without rewriting historical rows', () => {
    expect(frameMigration).toMatch(
      /create trigger enforce_valid_venue_map_drawing_geometry[\s\S]*?before insert or update of payload, domain, organization_id/,
    );
    expect(migration).toContain('venue_map_has_invalid_drawing_geometry(new.payload)');
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps all replacement helpers private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_drawing_presentation_valid(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_invalid_drawing_geometry(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_drawings(jsonb)',
    );
  });
});
