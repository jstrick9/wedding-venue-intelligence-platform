-- Keep every published Venue Map shape wholly inside its declared map frame.
--
-- Migration 0039 validated renderable primitive geometry, but did not relate that
-- geometry to map width/height. Existing rows remain untouched for explicit
-- admin recovery. Portal projections omit out-of-frame shapes, and future writes
-- fail closed. Rotated rectangles are checked by their rendered corner bounds.

create or replace function public.venue_map_drawing_within_frame(
  p_drawing jsonb,
  p_map jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_map_width numeric;
  v_map_height numeric;
  v_x numeric;
  v_y numeric;
  v_width numeric;
  v_height numeric;
  v_radius numeric;
  v_rotation numeric := 0;
  v_cosine numeric;
  v_sine numeric;
  v_half_width numeric;
  v_half_height numeric;
  v_center_x numeric;
  v_center_y numeric;
begin
  if not public.venue_map_drawing_geometry_valid(p_drawing) then
    return false;
  end if;
  if p_map is null
     or jsonb_typeof(p_map) <> 'object'
     or jsonb_typeof(p_map->'width') is distinct from 'number'
     or jsonb_typeof(p_map->'height') is distinct from 'number' then
    return false;
  end if;

  v_map_width := (p_map->>'width')::numeric;
  v_map_height := (p_map->>'height')::numeric;
  if v_map_width <= 0 or v_map_height <= 0 then
    return false;
  end if;

  if p_drawing ? 'rotation' then
    if jsonb_typeof(p_drawing->'rotation') is distinct from 'number' then
      return false;
    end if;
    v_rotation := (p_drawing->>'rotation')::numeric;
  end if;

  if p_drawing->>'type' in ('zone', 'rectangle') then
    v_x := (p_drawing->>'x')::numeric;
    v_y := (p_drawing->>'y')::numeric;
    v_width := (p_drawing->>'width')::numeric;
    v_height := (p_drawing->>'height')::numeric;
    -- Reduce an arbitrarily large equivalent angle before converting to double
    -- precision for trigonometry.
    v_cosine := abs(cos(radians(mod(v_rotation, 360)::double precision)))::numeric;
    v_sine := abs(sin(radians(mod(v_rotation, 360)::double precision)))::numeric;
    v_half_width := (v_cosine * v_width + v_sine * v_height) / 2;
    v_half_height := (v_sine * v_width + v_cosine * v_height) / 2;
    v_center_x := v_x + v_width / 2;
    v_center_y := v_y + v_height / 2;
    return v_center_x - v_half_width >= -0.0000001
      and v_center_y - v_half_height >= -0.0000001
      and v_center_x + v_half_width <= v_map_width + 0.0000001
      and v_center_y + v_half_height <= v_map_height + 0.0000001;
  end if;

  if p_drawing->>'type' = 'circle' then
    v_x := (p_drawing->>'x')::numeric;
    v_y := (p_drawing->>'y')::numeric;
    v_radius := (p_drawing->>'radius')::numeric;
    return v_x - v_radius >= 0
      and v_y - v_radius >= 0
      and v_x + v_radius <= v_map_width
      and v_y + v_radius <= v_map_height;
  end if;

  if p_drawing->>'type' = 'line' then
    return not exists (
      select 1
      from jsonb_array_elements(p_drawing->'points') as vertex(value)
      where (vertex.value->>'x')::numeric < 0
         or (vertex.value->>'x')::numeric > v_map_width
         or (vertex.value->>'y')::numeric < 0
         or (vertex.value->>'y')::numeric > v_map_height
    );
  end if;

  return false;
end;
$$;

revoke all on function public.venue_map_drawing_within_frame(jsonb, jsonb)
  from public, anon, authenticated;

-- Retain the established function name so migration 0039's trigger and every
-- repository boundary automatically acquire the stronger frame invariant.
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
         or not public.venue_map_drawing_within_frame(drawing.value, p_map)
    )
  end;
$$;

revoke all on function public.venue_map_has_invalid_drawing_geometry(jsonb)
  from public, anon, authenticated;

-- Both authoritative portal projection paths already compose this sanitizer.
-- Keep malformed canonical rows recoverable while withholding unsafe geometry.
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
      detail = 'Map drawings must use supported renderable geometry wholly inside the declared map frame.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_drawing_geometry()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_drawing_geometry
  on public.org_data;
create trigger enforce_valid_venue_map_drawing_geometry
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_drawing_geometry();
