import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0046_venue_map_route_delivery_compatibility.sql'),
  'utf8',
);

describe('migration 0046 Venue Map route-delivery compatibility', () => {
  it('uses the same fail-closed audience ordering as the client projection', () => {
    expect(migration).toContain("when not (p_object ? 'audience') then 0");
    expect(migration).toContain("p_object->>'audience' = 'public' then 0");
    expect(migration).toContain("p_object->>'audience' = 'couple' then 1");
    expect(migration).toMatch(/else 2\s+end/);
    expect(migration).toMatch(
      /venue_map_object_audience_rank\(point\.value\)[\s\S]*?> public\.venue_map_object_audience_rank\(route\.value\)/,
    );
  });

  it('requires a point scope to cover all events claimed by its route', () => {
    expect(migration).toContain("not (p_route ? 'eventSpaceIds')");
    expect(migration).toContain("not (p_point ? 'eventSpaceIds')");
    expect(migration).toMatch(/if v_point_all then[\s\S]*?return true/);
    expect(migration).toMatch(/if v_route_all then[\s\S]*?return false/);
    expect(migration).toMatch(
      /from jsonb_array_elements\(v_route_scope\)[\s\S]*?not exists \([\s\S]*?jsonb_array_elements\(v_point_scope\)/,
    );
  });

  it('checks only exact uniquely resolved point references and never guesses through duplicates', () => {
    expect(migration).toContain('count(*) over (partition by');
    expect(migration).toContain('point.id_occurrences = 1');
    expect(migration).toContain("point.id = trim(route_point.value #>> '{}')");
  });

  it('blocks future canonical writes without rewriting existing recovery data', () => {
    expect(migration).toContain('venue_map_has_route_delivery_issues(new.payload)');
    expect(migration).toContain("message = 'venue_map_route_delivery_incompatible'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_route_delivery[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps every helper and trigger function internal', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_object_audience_rank(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.venue_map_point_covers_route_scope(jsonb, jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_route_delivery_issues(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_route_delivery()',
    );
  });
});
