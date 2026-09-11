-- Preserve a base image as one exact, renderable source/opacity configuration.
--
-- Legacy builders clamp opacity before the managed-object sanitizer runs. This
-- migration pre-sanitizes malformed configuration before those builders, using
-- an internal unavailable sentinel so portal responses retain the established
-- backgroundImageUnavailable signal. Existing rows remain untouched for admin
-- recovery; the managed-image trigger rejects malformed future writes.

create or replace function public.venue_map_base_image_integrity_valid(
  p_map jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_opacity numeric;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return false;
  end if;

  if not (p_map ? 'backgroundImageUrl') then
    return not (p_map ? 'backgroundOpacity');
  end if;

  if jsonb_typeof(p_map->'backgroundImageUrl') is distinct from 'string'
     or length(p_map->>'backgroundImageUrl') not between 1 and 5 * 1024 * 1024 then
    return false;
  end if;

  if not (p_map ? 'backgroundOpacity') then
    return true;
  end if;
  if jsonb_typeof(p_map->'backgroundOpacity') is distinct from 'number' then
    return false;
  end if;
  v_opacity := (p_map->>'backgroundOpacity')::numeric;
  return v_opacity between 0.1 and 1;
end;
$$;

revoke all on function public.venue_map_base_image_integrity_valid(jsonb)
  from public, anon, authenticated;

-- This marker passes the legacy builder's syntactic sp:// allowlist but can
-- never satisfy the organization UUID + exact-object check. The outer sanitizer
-- therefore removes it and emits backgroundImageUnavailable=true.
create or replace function public.sanitize_venue_map_base_image_integrity(
  p_map jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;
  if public.venue_map_base_image_integrity_valid(p_map) then
    return p_map;
  end if;
  if p_map ? 'backgroundImageUrl' then
    return jsonb_set(
      p_map - 'backgroundImageUrl' - 'backgroundOpacity' - 'backgroundImageUnavailable',
      '{backgroundImageUrl}',
      to_jsonb('sp://venue-map-images/invalid-base-config/recovery'::text),
      true
    );
  end if;
  return p_map - 'backgroundOpacity' - 'backgroundImageUnavailable';
end;
$$;

revoke all on function public.sanitize_venue_map_base_image_integrity(jsonb)
  from public, anon, authenticated;

-- The latest guest/couple pipelines call this shared sanitizer before their
-- legacy projection builders. Compose base-image integrity here so malformed
-- opacity cannot be clamped before it is detected.
create or replace function public.sanitize_venue_map_drawings(
  p_map jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_drawings jsonb := '[]'::jsonb;
  v_drawing_safe_map jsonb;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;

  select coalesce(jsonb_agg(drawing.value order by drawing.ordinality), '[]'::jsonb)
    into v_drawings
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_map->'drawings') = 'array' then p_map->'drawings'
      else '[]'::jsonb
    end
  ) with ordinality as drawing(value, ordinality)
  where public.venue_map_drawing_geometry_valid(drawing.value)
    and public.venue_map_drawing_rotation_valid(drawing.value)
    and public.venue_map_drawing_presentation_valid(drawing.value)
    and public.venue_map_drawing_within_frame(drawing.value, p_map);

  v_drawing_safe_map := jsonb_set(p_map, '{drawings}', v_drawings, true);
  return public.sanitize_venue_map_base_image_integrity(v_drawing_safe_map);
end;
$$;

revoke all on function public.sanitize_venue_map_drawings(jsonb)
  from public, anon, authenticated;

create or replace function public.sanitize_portal_venue_map_base_image(
  p_map jsonb,
  p_organization_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_ref text;
begin
  if jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;

  if not public.venue_map_base_image_integrity_valid(p_map) then
    if p_map ? 'backgroundImageUrl' then
      return jsonb_set(
        p_map - 'backgroundImageUrl' - 'backgroundOpacity' - 'backgroundImageUnavailable',
        '{backgroundImageUnavailable}',
        'true'::jsonb,
        true
      );
    end if;
    return p_map - 'backgroundOpacity' - 'backgroundImageUnavailable';
  end if;

  v_ref := p_map->>'backgroundImageUrl';
  if v_ref is null then
    return p_map - 'backgroundImageUnavailable';
  end if;

  if public.venue_map_image_object_exists(v_ref, p_organization_id) then
    return p_map - 'backgroundImageUnavailable';
  end if;

  return jsonb_set(
    p_map - 'backgroundImageUrl' - 'backgroundOpacity' - 'backgroundImageUnavailable',
    '{backgroundImageUnavailable}',
    'true'::jsonb,
    true
  );
end;
$$;

revoke all on function public.sanitize_portal_venue_map_base_image(jsonb, uuid)
  from public, anon, authenticated;

create or replace function public.enforce_managed_venue_map_base_image()
returns trigger
language plpgsql
set search_path = public, storage, pg_temp
as $$
declare
  v_ref text;
begin
  if new.domain <> 'venueMapConfigs' or jsonb_typeof(new.payload) <> 'object' then
    return new;
  end if;

  if not public.venue_map_base_image_integrity_valid(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_base_image_configuration_invalid',
      detail = 'Base-map source must be text and opacity must be omitted or a number from 0.1 to 1.';
  end if;

  v_ref := new.payload->>'backgroundImageUrl';
  if v_ref is not null
     and not public.venue_map_image_object_exists(v_ref, new.organization_id) then
    raise exception using
      errcode = '23503',
      message = 'venue_map_base_image_must_reference_existing_managed_object',
      detail = 'Upload the base map to this organization''s venue-map-images folder or remove it.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_managed_venue_map_base_image()
  from public, anon, authenticated;
