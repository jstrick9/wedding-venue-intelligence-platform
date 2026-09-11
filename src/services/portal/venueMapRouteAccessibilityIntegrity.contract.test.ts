import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0052_venue_map_route_accessibility_integrity.sql'),
  'utf8',
);
const guestProjection = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0026_venue_map_guest_projection_hardening.sql'),
  'utf8',
);
const coupleProjection = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0031_venue_map_authoritative_couple_projection.sql'),
  'utf8',
);

describe('migration 0052 Venue Map route accessibility integrity', () => {
  it('validates only explicitly present mobility status against the shared enum', () => {
    expect(migration).toContain("route.value ? 'accessibility'");
    expect(migration).toContain(
      "jsonb_typeof(route.value->'accessibility') is distinct from 'string'",
    );
    expect(migration).toContain(
      "route.value->>'accessibility' not in ('unknown', 'step-free', 'not-step-free')",
    );
  });

  it('blocks future Venue Map writes without rewriting historical recovery rows', () => {
    expect(migration).toContain("if new.domain <> 'venueMapConfigs'");
    expect(migration).toContain('venue_map_has_invalid_route_accessibility(new.payload)');
    expect(migration).toContain("message = 'venue_map_route_accessibility_invalid'");
    expect(migration).toMatch(
      /create trigger enforce_valid_venue_map_route_accessibility[\s\S]*?before insert or update of payload, domain, organization_id[\s\S]*?on public\.org_data/,
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('retains established fail-closed portal projection as unknown', () => {
    for (const projector of [guestProjection, coupleProjection]) {
      expect(projector).toMatch(
        /route\.value->>'accessibility' in \('unknown', 'step-free', 'not-step-free'\)[\s\S]*?else 'unknown'/,
      );
    }
  });

  it('keeps both integrity helpers private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_has_invalid_route_accessibility(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_valid_venue_map_route_accessibility()',
    );
  });
});
