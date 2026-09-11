import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0053_venue_map_drawing_rotation_integrity.sql'),
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

describe('migration 0053 Venue Map drawing rotation integrity', () => {
  it('defines one explicit canonical rotation range without rewriting source rows', () => {
    expect(migration).toContain('v_rotation between -360 and 360');
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
    expect(migration).not.toMatch(/greatest\s*\(|least\s*\(/i);
  });

  it('withholds the whole shape in the shared sanitizer', () => {
    expect(migration).toMatch(
      /create or replace function public\.sanitize_venue_map_drawings[\s\S]*?venue_map_drawing_rotation_valid\(drawing\.value\)/,
    );
    expect(migration).toMatch(
      /venue_map_has_invalid_drawing_geometry[\s\S]*?not public\.venue_map_drawing_rotation_valid\(drawing\.value\)/,
    );
    expect(latestProjection).toMatch(/public\.sanitize_venue_map_drawings\(v_[a-z_]+_safe_map\)/);
  });

  it('strengthens the established write trigger and keeps helpers private', () => {
    expect(frameMigration).toMatch(
      /create trigger enforce_valid_venue_map_drawing_geometry[\s\S]*?before insert or update of payload, domain, organization_id/,
    );
    expect(migration).toContain('venue_map_has_invalid_drawing_geometry(new.payload)');
    expect(migration).toContain(
      'revoke all on function public.venue_map_drawing_rotation_valid(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_invalid_drawing_geometry(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_drawings(jsonb)',
    );
  });
});
