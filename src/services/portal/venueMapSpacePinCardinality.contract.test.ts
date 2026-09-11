import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0056_venue_map_space_pin_cardinality.sql'),
  'utf8',
);
const pipeline = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0049_venue_map_text_integrity.sql'),
  'utf8',
);
const originalBoundary = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0037_venue_map_space_point_link_integrity.sql'),
  'utf8',
);

describe('migration 0056 Venue Map space-pin cardinality', () => {
  it('detects more than one destination point for the same canonical venue link', () => {
    expect(migration).toMatch(
      /point\.value->>'kind' = 'space'[\s\S]*?group by trim\(point\.value->>'venueId'\)[\s\S]*?having count\(\*\) > 1/,
    );
  });

  it('omits every collided point and every dependent route before portal builders', () => {
    expect(migration).toContain('point.venue_link_occurrences = 1');
    expect(migration).toContain('or point.venue_link_occurrences > 1');
    expect(migration).toMatch(
      /join invalid_space_ids as invalid[\s\S]*?invalid\.id = trim\(route_point\.value #>> '\{\}'\)/,
    );
    expect(pipeline).toContain(
      'public.sanitize_venue_map_space_point_links(v_rain_safe_map, p_venues)',
    );
  });

  it('rejects collided future writes through the existing canonical trigger', () => {
    expect(migration).toContain(
      'public.venue_map_has_space_point_link_collisions(new.payload)',
    );
    expect(migration).toContain('venue_map_space_point_link_duplicated');
    expect(originalBoundary).toMatch(
      /create trigger enforce_valid_venue_map_space_point_links[\s\S]*?before insert or update of payload, domain, organization_id/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps collision and sanitizer helpers private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_space_point_link_collisions(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_space_point_links(jsonb, jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_space_point_links()',
    );
  });
});
