import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0051_venue_map_audience_integrity.sql'),
  'utf8',
);
const coupleProjection = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0031_venue_map_authoritative_couple_projection.sql'),
  'utf8',
);
const guestProjection = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0025_venue_map_invalid_scope_fail_closed.sql'),
  'utf8',
);

describe('migration 0051 Venue Map audience integrity', () => {
  it('checks points, walkways, and shapes without treating legacy omission as invalid', () => {
    expect(migration).toContain("p_map->'points'");
    expect(migration).toContain("p_map->'routes'");
    expect(migration).toContain("p_map->'drawings'");
    expect(migration).toContain("map_object.value ? 'audience'");
    expect(migration).toContain(
      "jsonb_typeof(map_object.value->'audience') is distinct from 'string'",
    );
    expect(migration).toContain(
      "map_object.value->>'audience' not in ('public', 'couple', 'staff')",
    );
  });

  it('blocks future Venue Map writes without rewriting historical recovery rows', () => {
    expect(migration).toContain("if new.domain <> 'venueMapConfigs'");
    expect(migration).toContain('venue_map_has_invalid_audiences(new.payload)');
    expect(migration).toContain("message = 'venue_map_audience_invalid'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_audiences[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('retains established fail-closed public and couple projection behavior', () => {
    expect(coupleProjection).toMatch(
      /when not \(p_object \? 'audience'\) then true[\s\S]*?p_object->>'audience' in \('public', 'couple'\)/,
    );
    expect(guestProjection).toMatch(
      /when p_object \? 'audience' then p_object->>'audience' = 'public'[\s\S]*?else true/,
    );
  });

  it('keeps both integrity helpers private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_invalid_audiences(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_audiences()',
    );
  });
});
