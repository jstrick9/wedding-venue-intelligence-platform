-- Prevent a successfully saved walkway from silently disappearing for an
-- audience or wedding event that the route claims to serve.
--
-- Portal projections already fail closed: they remove restricted points and
-- then remove any route that no longer has every referenced point. Existing
-- rows remain untouched so admins can repair them explicitly. This write guard
-- rejects future publications when a uniquely resolved point is more
-- restrictive than its route. It never broadens point visibility automatically.

create or replace function public.venue_map_object_audience_rank(
  p_object jsonb
) returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_object) is distinct from 'object' then 2
    when not (p_object ? 'audience') then 0
    when jsonb_typeof(p_object->'audience') = 'string'
      and p_object->>'audience' = 'public' then 0
    when jsonb_typeof(p_object->'audience') = 'string'
      and p_object->>'audience' = 'couple' then 1
    else 2
  end;
$$;

revoke all on function public.venue_map_object_audience_rank(jsonb)
  from public, anon, authenticated;

create or replace function public.venue_map_point_covers_route_scope(
  p_point jsonb,
  p_route jsonb
) returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_route_scope jsonb;
  v_point_scope jsonb;
  v_route_all boolean;
  v_point_all boolean;
begin
  if jsonb_typeof(p_point) is distinct from 'object'
     or jsonb_typeof(p_route) is distinct from 'object' then
    return false;
  end if;

  if not (p_route ? 'eventSpaceIds') then
    v_route_scope := '[]'::jsonb;
    v_route_all := true;
  elsif jsonb_typeof(p_route->'eventSpaceIds') = 'array' then
    v_route_scope := p_route->'eventSpaceIds';
    v_route_all := jsonb_array_length(v_route_scope) = 0;
  else
    return false;
  end if;

  if not (p_point ? 'eventSpaceIds') then
    v_point_scope := '[]'::jsonb;
    v_point_all := true;
  elsif jsonb_typeof(p_point->'eventSpaceIds') = 'array' then
    v_point_scope := p_point->'eventSpaceIds';
    v_point_all := jsonb_array_length(v_point_scope) = 0;
  else
    return false;
  end if;

  if v_point_all then
    return true;
  end if;
  if v_route_all then
    return false;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(v_route_scope) as route_scope(value)
    where jsonb_typeof(route_scope.value) is distinct from 'string'
       or not exists (
         select 1
         from jsonb_array_elements(v_point_scope) as point_scope(value)
         where jsonb_typeof(point_scope.value) = 'string'
           and point_scope.value = route_scope.value
       )
  );
end;
$$;

revoke all on function public.venue_map_point_covers_route_scope(jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.venue_map_has_route_delivery_issues(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with point_candidates as (
    select
      point.value,
      trim(point.value->>'id') as id,
      count(*) over (partition by trim(point.value->>'id')) as id_occurrences
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'points') = 'array' then p_map->'points' else '[]'::jsonb end
    ) as point(value)
    where jsonb_typeof(point.value) = 'object'
      and jsonb_typeof(point.value->'id') = 'string'
      and length(trim(point.value->>'id')) between 1 and 200
  ), route_candidates as (
    select route.value
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'routes') = 'array' then p_map->'routes' else '[]'::jsonb end
    ) as route(value)
    where jsonb_typeof(route.value) = 'object'
      and jsonb_typeof(route.value->'id') = 'string'
      and length(trim(route.value->>'id')) between 1 and 200
  )
  select exists (
    select 1
    from route_candidates as route
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(route.value->'pointIds') = 'array'
          then route.value->'pointIds'
        else '[]'::jsonb
      end
    ) as route_point(value)
    join point_candidates as point
      on point.id_occurrences = 1
     and jsonb_typeof(route_point.value) = 'string'
     and point.id = trim(route_point.value #>> '{}')
    where public.venue_map_object_audience_rank(point.value)
        > public.venue_map_object_audience_rank(route.value)
       or not public.venue_map_point_covers_route_scope(point.value, route.value)
  );
$$;

revoke all on function public.venue_map_has_route_delivery_issues(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_route_delivery()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' or jsonb_typeof(new.payload) <> 'object' then
    return new;
  end if;

  if public.venue_map_has_route_delivery_issues(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_route_delivery_incompatible',
      detail = 'Narrow each walkway audience/event scope, or explicitly repair its restricted referenced points.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_route_delivery()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_route_delivery
  on public.org_data;
create trigger enforce_valid_venue_map_route_delivery
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_route_delivery();
