import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0047_venue_map_point_kind_canonicalization.sql'),
  'utf8',
);

describe('migration 0047 Venue Map point-kind canonicalization', () => {
  it('rejects kind-inapplicable point metadata and blank labels', () => {
    expect(migration).toContain(
      "point.value->>'kind' = 'space' and point.value ? 'eventSpaceIds'",
    );
    expect(migration).toContain(
      "point.value->>'kind' <> 'space' and point.value ? 'venueId'",
    );
    expect(migration).toContain(
      "jsonb_typeof(point.value->'label') is distinct from 'string'",
    );
    expect(migration).toContain("length(trim(point.value->>'label')) = 0");
  });

  it('repairs legacy residue only in the shared portal projection', () => {
    expect(migration).toMatch(
      /create or replace function public\.canonicalize_venue_map_point_kind_fields[\s\S]*?p_point - 'eventSpaceIds'[\s\S]*?p_point - 'venueId'/,
    );
    expect(migration).toMatch(
      /create or replace function public\.sanitize_venue_map_space_point_links[\s\S]*?public\.canonicalize_venue_map_point_kind_fields\(point\.value\)/,
    );
    expect(migration).toContain("else 'Point'");
  });

  it('limits the write check to recognized structural point kinds', () => {
    expect(migration).toContain(
      "point.value->>'kind' in ('space', 'parking', 'entry', 'amenity', 'path')",
    );
  });

  it('blocks future writes without rewriting existing rows', () => {
    expect(migration).toContain('venue_map_has_point_kind_field_conflicts(new.payload)');
    expect(migration).toContain("message = 'venue_map_point_kind_fields_noncanonical'");
    expect(migration).toMatch(
      /create trigger enforce_canonical_venue_map_point_kind_fields[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps helper and trigger functions internal', () => {
    expect(migration).toContain(
      'revoke all on function public.canonicalize_venue_map_point_kind_fields(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_space_point_links(jsonb, jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_point_kind_field_conflicts(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_canonical_venue_map_point_kind_fields()',
    );
  });
});
