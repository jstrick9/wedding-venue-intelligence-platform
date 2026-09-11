-- Align saved shape rotation with the Designer's canonical -360..360 range.
--
-- Migration 0048 correctly evaluates arbitrary finite angles modulo 360 for
-- frame geometry, but legacy portal builders clamp the authored value. A 450°
-- shape could therefore validate as 90° and render as 360°. Existing rows stay
-- intact for exact admin recovery; portal sanitization withholds the whole shape
-- and the established drawing-integrity trigger rejects future invalid writes.

create or replace function public.venue_map_drawing_rotation_valid(
  p_drawing jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_rotation numeric;
begin
  if p_drawing is null or jsonb_typeof(p_drawing) <> 'object' then
    return false;
  end if;
  if not (p_drawing ? 'rotation') then
    return true;
  end if;
  if jsonb_typeof(p_drawing->'rotation') is distinct from 'number' then
    return false;
  end if;
  v_rotation := (p_drawing->>'rotation')::numeric;
  return v_rotation between -360 and 360;
end;
$$;

revoke all on function public.venue_map_drawing_rotation_valid(jsonb)
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
      detail = 'Map drawings must use supported in-frame geometry and rotation from -360 to 360 degrees.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_drawing_geometry()
  from public, anon, authenticated;
