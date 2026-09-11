-- Require one canonical destination pin per event-space or lodging record.
--
-- Existing duplicate-linked points remain in canonical storage for explicit
-- Venue Map Designer recovery. Portal sanitation omits every ambiguous point
-- occurrence and every route that depends on one. Future writes reject the
-- collision; this migration never rewrites historical rows.

create or replace function public.venue_map_has_space_point_link_collisions(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(p_map->'points') = 'array' then p_map->'points'
        else '[]'::jsonb
      end
    ) as point(value)
    where jsonb_typeof(point.value) = 'object'
      and point.value->>'kind' = 'space'
      and jsonb_typeof(point.value->'venueId') = 'string'
      and length(trim(point.value->>'venueId')) between 1 and 200
    group by trim(point.value->>'venueId')
    having count(*) > 1
  );
$$;

revoke all on function public.venue_map_has_space_point_link_collisions(jsonb)
  from public, anon, authenticated;

create or replace function public.sanitize_venue_map_space_point_links(
  p_map jsonb,
  p_venues jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_points jsonb := '[]'::jsonb;
  v_routes jsonb := '[]'::jsonb;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;

  with point_candidates as (
    select
      point.value,
      point.ordinality,
      left(trim(point.value->>'id'), 200) as id,
      count(*) over (partition by left(trim(point.value->>'id'), 200)) as id_occurrences,
      count(*) filter (
        where point.value->>'kind' = 'space'
          and jsonb_typeof(point.value->'venueId') = 'string'
          and length(trim(point.value->>'venueId')) between 1 and 200
      ) over (partition by trim(point.value->>'venueId')) as venue_link_occurrences
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'points') = 'array' then p_map->'points' else '[]'::jsonb end
    ) with ordinality as point(value, ordinality)
    where jsonb_typeof(point.value) = 'object'
      and jsonb_typeof(point.value->'id') = 'string'
      and length(trim(point.value->>'id')) between 1 and 200
      and point.value->>'kind' in ('space', 'parking', 'entry', 'amenity', 'path')
  )
  select coalesce(jsonb_agg(point.value order by point.ordinality), '[]'::jsonb)
    into v_points
  from point_candidates as point
  where point.id_occurrences > 1
     or point.value->>'kind' <> 'space'
     or (
       public.venue_map_space_point_link_valid(point.value, p_venues)
       and point.venue_link_occurrences = 1
     );

  -- Preserve duplicate point identities for the downstream identity sanitizer.
  -- Unique point IDs are removed here when their venue link is unavailable or
  -- shared by another destination point; all dependent routes are removed too.
  with point_candidates as (
    select
      point.value,
      left(trim(point.value->>'id'), 200) as id,
      count(*) over (partition by left(trim(point.value->>'id'), 200)) as id_occurrences,
      count(*) filter (
        where point.value->>'kind' = 'space'
          and jsonb_typeof(point.value->'venueId') = 'string'
          and length(trim(point.value->>'venueId')) between 1 and 200
      ) over (partition by trim(point.value->>'venueId')) as venue_link_occurrences
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'points') = 'array' then p_map->'points' else '[]'::jsonb end
    ) as point(value)
    where jsonb_typeof(point.value) = 'object'
      and jsonb_typeof(point.value->'id') = 'string'
      and length(trim(point.value->>'id')) between 1 and 200
      and point.value->>'kind' in ('space', 'parking', 'entry', 'amenity', 'path')
  ), invalid_space_ids as (
    select point.id
    from point_candidates as point
    where point.id_occurrences = 1
      and point.value->>'kind' = 'space'
      and (
        not public.venue_map_space_point_link_valid(point.value, p_venues)
        or point.venue_link_occurrences > 1
      )
  )
  select coalesce(jsonb_agg(route.value order by route.ordinality), '[]'::jsonb)
    into v_routes
  from jsonb_array_elements(
    case when jsonb_typeof(p_map->'routes') = 'array' then p_map->'routes' else '[]'::jsonb end
  ) with ordinality as route(value, ordinality)
  where not exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(route.value->'pointIds') = 'array' then route.value->'pointIds' else '[]'::jsonb end
    ) as route_point(value)
    join invalid_space_ids as invalid
      on jsonb_typeof(route_point.value) = 'string'
     and invalid.id = trim(route_point.value #>> '{}')
  );

  return jsonb_set(
    jsonb_set(p_map, '{points}', v_points, true),
    '{routes}',
    v_routes,
    true
  );
end;
$$;

revoke all on function public.sanitize_venue_map_space_point_links(jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_space_point_links()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_venues jsonb;
begin
  if new.domain <> 'venueMapConfigs' or jsonb_typeof(new.payload) <> 'object' then
    return new;
  end if;

  select data.payload
    into v_venues
  from public.org_data as data
  where data.organization_id = new.organization_id
    and data.domain = 'venues'
  limit 1;

  if public.venue_map_has_invalid_space_point_links(new.payload, v_venues) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_space_point_link_invalid',
      detail = 'Every event-space or lodging pin must link to exactly one current venue record.';
  end if;

  if public.venue_map_has_space_point_link_collisions(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_space_point_link_duplicated',
      detail = 'Each event-space or lodging record may have only one canonical destination pin.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_space_point_links()
  from public, anon, authenticated;
