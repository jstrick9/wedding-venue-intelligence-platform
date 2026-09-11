import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0057_venue_map_arrival_role_integrity.sql'),
  'utf8',
);

describe('migration 0057 Venue Map arrival-role integrity', () => {
  it('allows omitted legacy roles but validates every explicit role and point kind', () => {
    expect(migration).toContain("point.value ? 'arrivalRole'");
    expect(migration).toContain("point.value->>'kind' is distinct from 'entry'");
    expect(migration).toContain("jsonb_typeof(point.value->'arrivalRole') is distinct from 'string'");
    for (const role of ['unknown', 'guest-arrival', 'exit-only', 'both']) {
      expect(migration).toContain(`'${role}'`);
    }
  });

  it('blocks future writes without rewriting historical recovery rows', () => {
    expect(migration).toContain("if new.domain <> 'venueMapConfigs'");
    expect(migration).toContain('venue_map_has_invalid_arrival_roles(new.payload)');
    expect(migration).toContain("message = 'venue_map_arrival_role_invalid'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_arrival_roles[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('projects valid roles, marks omitted roles unknown, and quarantines invalid points and routes', () => {
    expect(migration).toContain('apply_venue_map_arrival_roles');
    expect(migration).toContain("coalesce(projected.source_value->>'arrivalRole', 'unknown')");
    expect(migration).toContain("source.value->>'kind' <> 'entry'");
    expect(migration).toMatch(
      /from jsonb_array_elements_text\(route\.value->'pointIds'\)[\s\S]*?where not exists/,
    );
    expect(migration).toMatch(
      /build_guest_venue_map_projection_with_priority[\s\S]*?apply_venue_map_arrival_roles/,
    );
    expect(migration).toMatch(
      /build_couple_venue_map_projection\(v_portal_source_map\)[\s\S]*?v_portal_source_map/,
    );
  });

  it('keeps integrity and projection helpers private', () => {
    for (const signature of [
      'public.venue_map_has_invalid_arrival_roles(jsonb)',
      'public.enforce_valid_venue_map_arrival_roles()',
      'public.apply_venue_map_arrival_roles(jsonb, jsonb)',
      'public.build_guest_venue_map_projection_with_priority(jsonb, jsonb)',
      'public.sanitize_couple_portal_map_result(jsonb, uuid)',
    ]) {
      expect(migration).toContain(`revoke all on function ${signature}`);
    }
  });
});
