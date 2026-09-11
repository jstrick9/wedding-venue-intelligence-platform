-- Treat shape appearance as part of the same fail-closed drawing contract.
--
-- Portal builders historically dropped malformed SVG paint values and clamped
-- numeric styling, which could silently recolor or hide a saved property zone.
-- Existing rows remain exact for admin recovery. The shared sanitizer withholds
-- the whole shape, and the established drawing trigger rejects future writes.

create or replace function public.venue_map_drawing_presentation_valid(
  p_drawing jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_value numeric;
  v_color text;
begin
  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    return false;
  end if;

  if p_drawing ? 'fillColor' then
    if jsonb_typeof(p_drawing->'fillColor') is distinct from 'string' then
      return false;
    end if;
    v_color := trim(p_drawing->>'fillColor');
    if v_color <> 'transparent' and v_color !~* '^#[0-9a-f]{3,8}$' then
      return false;
    end if;
  end if;

  if p_drawing ? 'strokeColor' then
    if jsonb_typeof(p_drawing->'strokeColor') is distinct from 'string' then
      return false;
    end if;
    v_color := trim(p_drawing->>'strokeColor');
    if v_color <> 'transparent' and v_color !~* '^#[0-9a-f]{3,8}$' then
      return false;
    end if;
  end if;

  if p_drawing ? 'strokeWidth' then
    if jsonb_typeof(p_drawing->'strokeWidth') is distinct from 'number' then
      return false;
    end if;
    v_value := (p_drawing->>'strokeWidth')::numeric;
    if v_value < 0.1 or v_value > 20 then return false; end if;
  end if;

  if p_drawing ? 'opacity' then
    if jsonb_typeof(p_drawing->'opacity') is distinct from 'number' then
      return false;
    end if;
    v_value := (p_drawing->>'opacity')::numeric;
    if v_value < 0 or v_value > 1 then return false; end if;
  end if;

  if p_drawing ? 'fontSize' then
    if jsonb_typeof(p_drawing->'fontSize') is distinct from 'number' then
      return false;
    end if;
    v_value := (p_drawing->>'fontSize')::numeric;
    if v_value < 1 or v_value > 100 then return false; end if;
  end if;

  return true;
end;
$$;

revoke all on function public.venue_map_drawing_presentation_valid(jsonb)
  from public, anon, authenticated;

create or replace function public.venue_map_has_invalid_drawing_geometry(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_map is null or jsonb_typeof(p_map) <> 'object' then false
    when p_map ? 'drawings' and jsonb_typeof(p_map->'drawings') <> 'array' then true
    else exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_map->'drawings') = 'array' then p_map->'drawings'
          else '[]'::jsonb
        end
      ) as drawing(value)
      where not public.venue_map_drawing_geometry_valid(drawing.value)
         or not public.venue_map_drawing_rotation_valid(drawing.value)
         or not public.venue_map_drawing_presentation_valid(drawing.value)
         or not public.venue_map_drawing_within_frame(drawing.value, p_map)
    )
  end;
$$;

revoke all on function public.venue_map_has_invalid_drawing_geometry(jsonb)
  from public, anon, authenticated;

create or replace function public.sanitize_venue_map_drawings(
  p_map jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_drawings jsonb := '[]'::jsonb;
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

  return jsonb_set(p_map, '{drawings}', v_drawings, true);
end;
$$;

revoke all on function public.sanitize_venue_map_drawings(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_drawing_geometry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' or jsonb_typeof(new.payload) <> 'object' then
    return new;
  end if;

  if public.venue_map_has_invalid_drawing_geometry(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_drawing_geometry_invalid',
      detail = 'Map drawings must use supported in-frame geometry, bounded rotation, and safe appearance values.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_drawing_geometry()
  from public, anon, authenticated;
