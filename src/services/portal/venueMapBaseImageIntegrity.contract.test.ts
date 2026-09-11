import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0055_venue_map_base_image_integrity.sql'),
  'utf8',
);
const availabilityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0033_venue_map_base_image_availability.sql'),
  'utf8',
);
const projectionPipeline = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0049_venue_map_text_integrity.sql'),
  'utf8',
);

describe('migration 0055 Venue Map base-image integrity', () => {
  it('requires one textual source with optional bounded numeric opacity', () => {
    expect(migration).toContain("not (p_map ? 'backgroundImageUrl')");
    expect(migration).toContain("return not (p_map ? 'backgroundOpacity')");
    expect(migration).toContain(
      "jsonb_typeof(p_map->'backgroundImageUrl') is distinct from 'string'",
    );
    expect(migration).toContain(
      "jsonb_typeof(p_map->'backgroundOpacity') is distinct from 'number'",
    );
    expect(migration).toContain('v_opacity between 0.1 and 1');
  });

  it('pre-sanitizes before legacy builders can clamp malformed opacity', () => {
    expect(migration).toMatch(
      /create or replace function public\.sanitize_venue_map_drawings[\s\S]*?return public\.sanitize_venue_map_base_image_integrity\(v_drawing_safe_map\)/,
    );
    expect(projectionPipeline).toMatch(/public\.sanitize_venue_map_drawings\(v_[a-z_]+_safe_map\)/);
    expect(migration).toContain('sp://venue-map-images/invalid-base-config/recovery');
    expect(migration).toMatch(
      /sanitize_portal_venue_map_base_image[\s\S]*?backgroundImageUnavailable[\s\S]*?'true'::jsonb/,
    );
  });

  it('retains exact managed-object existence enforcement and blocks malformed writes', () => {
    expect(availabilityMigration).toMatch(
      /create trigger enforce_managed_venue_map_base_image[\s\S]*?before insert or update of payload, domain, organization_id/,
    );
    expect(migration).toContain('venue_map_base_image_configuration_invalid');
    expect(migration).toContain(
      'not public.venue_map_image_object_exists(v_ref, new.organization_id)',
    );
    expect(migration).not.toMatch(/update\s+public\.org_data/i);
  });

  it('keeps all integrity and sanitizer helpers private', () => {
    expect(migration).toContain(
      'revoke all on function public.venue_map_base_image_integrity_valid(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_venue_map_base_image_integrity(jsonb)',
    );
    expect(migration).toContain(
      'revoke all on function public.sanitize_portal_venue_map_base_image(jsonb, uuid)',
    );
    expect(migration).toContain(
      'revoke all on function public.enforce_managed_venue_map_base_image()',
    );
  });
});
