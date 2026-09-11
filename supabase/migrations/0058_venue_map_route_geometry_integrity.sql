-- Prevent zero-length walkways from being rendered or counted as real routes.
--
-- Distinct point identities are not sufficient route geometry: historical or
-- accidental points can share one coordinate, producing an invisible SVG line
-- and a zero-cost graph edge. Existing canonical rows remain untouched for
-- explicit admin recovery. Portal projections quarantine the whole walkway,
-- while future writes reject it until at least two stops occupy different map
-- positions.

create or replace function public.venue_map_route_has_visible_geometry(
  p_route jsonb,
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_route) is distinct from 'object'
      or jsonb_typeof(p_map) is distinct from 'object'
      or jsonb_typeof(p_route->'pointIds') is distinct from 'array'
      or jsonb_array_length(
        case when jsonb_typeof(p_route->'pointIds') = 'array'
          then p_route->'pointIds' else '[]'::jsonb end
      ) < 2
      then false
    else (
      select count(distinct jsonb_build_array(
        point.value->'x',
        point.value->'y'
      )) >= 2
      from jsonb_array_elements(p_route->'pointIds') as route_point(value)
      join jsonb_array_elements(
        case when jsonb_typeof(p_map->'points') = 'array'
          then p_map->'points' else '[]'::jsonb end
      ) as point(value)
        on jsonb_typeof(route_point.value) = 'string'
       and jsonb_typeof(point.value) = 'object'
       and jsonb_typeof(point.value->'id') = 'string'
       and trim(point.value->>'id') = trim(route_point.value #>> '{}')
      where jsonb_typeof(point.value->'x') = 'number'
        and jsonb_typeof(point.value->'y') = 'number'
    )
  end;
$$;

revoke all on function public.venue_map_route_has_visible_geometry(jsonb, jsonb)
  from public, anon, authenticated;

-- Limit this detector to routes whose references resolve uniquely. Other route
-- corruption remains owned by the established reference-integrity trigger, so
-- operators receive the most relevant failure and no malformed value is cast.
create or replace function public.venue_map_has_zero_length_routes(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_map) is distinct from 'object' then false
    else exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'routes') = 'array'
          then p_map->'routes' else '[]'::jsonb end
      ) as route(value)
      where jsonb_typeof(route.value) = 'object'
        and jsonb_typeof(route.value->'pointIds') = 'array'
        and jsonb_array_length(route.value->'pointIds') >= 2
        and not exists (
          select 1
          from jsonb_array_elements(route.value->'pointIds') as route_point(value)
          where jsonb_typeof(route_point.value) is distinct from 'string'
             or (
               select count(*)
               from jsonb_array_elements(
                 case when jsonb_typeof(p_map->'points') = 'array'
                   then p_map->'points' else '[]'::jsonb end
               ) as point(value)
               where jsonb_typeof(point.value) = 'object'
                 and jsonb_typeof(point.value->'id') = 'string'
                 and trim(point.value->>'id') = trim(route_point.value #>> '{}')
                 and jsonb_typeof(point.value->'x') = 'number'
                 and jsonb_typeof(point.value->'y') = 'number'
             ) <> 1
        )
        and not public.venue_map_route_has_visible_geometry(route.value, p_map)
    )
  end;
$$;

revoke all on function public.venue_map_has_zero_length_routes(jsonb)
  from public, anon, authenticated;

-- This sanitizer runs only on a structurally, text, coordinate, and catalog-safe
-- source. It preserves route order and exact guidance for valid routes while
-- withholding the complete historical route when its geometry is invisible.
create or replace function public.sanitize_venue_map_route_geometry(
  p_map jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_routes jsonb := '[]'::jsonb;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;

  select coalesce(jsonb_agg(route.value order by route.ordinality), '[]'::jsonb)
    into v_routes
  from jsonb_array_elements(
    case when jsonb_typeof(p_map->'routes') = 'array'
      then p_map->'routes' else '[]'::jsonb end
  ) with ordinality as route(value, ordinality)
  where public.venue_map_route_has_visible_geometry(route.value, p_map);

  return jsonb_set(p_map, '{routes}', v_routes, true);
end;
$$;

revoke all on function public.sanitize_venue_map_route_geometry(jsonb)
  from public, anon, authenticated;

-- Recompose the latest shared Couple/Guest source sanitizer. Route geometry is
-- checked after point-coordinate and venue-link sanitation, so a route cannot
-- borrow a rejected point merely to appear visible.
create or replace function public.sanitize_venue_map_rain_contingencies(
  p_map jsonb,
  p_venues jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_structural_safe_map jsonb;
  v_text_safe_map jsonb;
  v_coordinate_safe_map jsonb;
  v_contingencies jsonb := '[]'::jsonb;
  v_rain_safe_map jsonb;
  v_space_safe_map jsonb;
  v_route_geometry_safe_map jsonb;
begin
  if public.venue_map_exceeds_complexity_budget(p_map) then
    return null;
  end if;
  if public.venue_map_has_invalid_frame(p_map) then
    return null;
  end if;

  v_structural_safe_map := public.sanitize_venue_map_structural_integrity(p_map);
  v_text_safe_map := public.sanitize_venue_map_text_integrity(v_structural_safe_map);
  v_coordinate_safe_map := public.sanitize_venue_map_point_coordinates(v_text_safe_map);
  if v_coordinate_safe_map is null
     or jsonb_typeof(v_coordinate_safe_map) <> 'object' then
    return v_coordinate_safe_map;
  end if;

  with candidates as (
    select
      contingency.value,
      contingency.ordinality,
      trim(contingency.value->>'id') as id,
      trim(contingency.value->>'outdoorVenueId') as outdoor_venue_id,
      count(*) over (partition by trim(contingency.value->>'id')) as id_occurrences,
      count(*) over (
        partition by trim(contingency.value->>'outdoorVenueId')
      ) as outdoor_occurrences
    from jsonb_array_elements(v_coordinate_safe_map->'rainContingencies')
      with ordinality as contingency(value, ordinality)
    where jsonb_typeof(contingency.value) = 'object'
      and jsonb_typeof(contingency.value->'id') = 'string'
      and length(trim(contingency.value->>'id')) between 1 and 200
      and jsonb_typeof(contingency.value->'outdoorVenueId') = 'string'
      and length(trim(contingency.value->>'outdoorVenueId')) between 1 and 200
      and jsonb_typeof(contingency.value->'indoorVenueId') = 'string'
      and length(trim(contingency.value->>'indoorVenueId')) between 1 and 200
  )
  select coalesce(jsonb_agg(contingency.value order by contingency.ordinality), '[]'::jsonb)
    into v_contingencies
  from candidates as contingency
  where contingency.id_occurrences = 1
    and contingency.outdoor_occurrences = 1
    and public.venue_map_rain_contingency_valid(contingency.value, p_venues);

  v_rain_safe_map := jsonb_set(
    v_coordinate_safe_map,
    '{rainContingencies}',
    v_contingencies,
    true
  );
  v_space_safe_map := public.sanitize_venue_map_space_point_links(v_rain_safe_map, p_venues);
  v_route_geometry_safe_map := public.sanitize_venue_map_route_geometry(v_space_safe_map);
  return public.sanitize_venue_map_route_priorities(
    public.sanitize_venue_map_drawings(v_route_geometry_safe_map)
  );
end;
$$;

revoke all on function public.sanitize_venue_map_rain_contingencies(jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_route_geometry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' then
    return new;
  end if;

  if public.venue_map_has_zero_length_routes(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_route_geometry_invalid',
      detail = 'Every walkway must span at least two different map positions; zero-length routes cannot be published.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_route_geometry()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_route_geometry
  on public.org_data;
create trigger enforce_valid_venue_map_route_geometry
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_route_geometry();
