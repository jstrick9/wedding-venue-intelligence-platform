-- Keep point metadata canonical now that point fields are one live local draft.
-- Event-space pins derive event relevance from their linked venue and therefore
-- must not retain an independent eventSpaceIds restriction. Every other point
-- kind must not retain a stale venueId link from an earlier Event Space kind.
-- Browser normalization repairs legacy rows in memory; existing database rows
-- remain untouched until an admin explicitly republishes them.

create or replace function public.canonicalize_venue_map_point_kind_fields(
  p_point jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_point jsonb;
  v_label text;
begin
  if jsonb_typeof(p_point) is distinct from 'object' then
    return p_point;
  end if;

  v_point := case
    when p_point->>'kind' = 'space' then p_point - 'eventSpaceIds'
    else p_point - 'venueId'
  end;
  v_label := case
    when jsonb_typeof(p_point->'label') = 'string'
      and length(trim(p_point->>'label')) > 0 then trim(p_point->>'label')
    else 'Point'
  end;
  return jsonb_set(v_point, '{label}', to_jsonb(v_label), true);
end;
$$;

revoke all on function public.canonicalize_venue_map_point_kind_fields(jsonb)
  from public, anon, authenticated;

-- Extend the shared portal sanitizer used by both authoritative Couple and
-- Guest projections. This repairs legacy point-kind residue only in the
-- delivered projection; the canonical recovery row remains untouched.
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
      count(*) over (partition by left(trim(point.value->>'id'), 200)) as id_occurrences
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'points') = 'array' then p_map->'points' else '[]'::jsonb end
    ) with ordinality as point(value, ordinality)
    where jsonb_typeof(point.value) = 'object'
      and jsonb_typeof(point.value->'id') = 'string'
      and length(trim(point.value->>'id')) between 1 and 200
      and point.value->>'kind' in ('space', 'parking', 'entry', 'amenity', 'path')
  )
  select coalesce(
    jsonb_agg(
      public.canonicalize_venue_map_point_kind_fields(point.value)
      order by point.ordinality
    ),
    '[]'::jsonb
  )
    into v_points
  from point_candidates as point
  where point.id_occurrences > 1
     or point.value->>'kind' <> 'space'
     or public.venue_map_space_point_link_valid(point.value, p_venues);

  with point_candidates as (
    select
      point.value,
      left(trim(point.value->>'id'), 200) as id,
      count(*) over (partition by left(trim(point.value->>'id'), 200)) as id_occurrences
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
      and not public.venue_map_space_point_link_valid(point.value, p_venues)
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

create or replace function public.venue_map_has_point_kind_field_conflicts(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_map->'points') = 'array' then exists (
      select 1
      from jsonb_array_elements(p_map->'points') as point(value)
      where jsonb_typeof(point.value) = 'object'
        and jsonb_typeof(point.value->'kind') = 'string'
        and point.value->>'kind' in ('space', 'parking', 'entry', 'amenity', 'path')
        and (
          (point.value->>'kind' = 'space' and point.value ? 'eventSpaceIds')
          or (point.value->>'kind' <> 'space' and point.value ? 'venueId')
          or jsonb_typeof(point.value->'label') is distinct from 'string'
          or length(trim(point.value->>'label')) = 0
        )
    )
    else false
  end;
$$;

revoke all on function public.venue_map_has_point_kind_field_conflicts(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_canonical_venue_map_point_kind_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' or jsonb_typeof(new.payload) <> 'object' then
    return new;
  end if;

  if public.venue_map_has_point_kind_field_conflicts(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_point_kind_fields_noncanonical',
      detail = 'Remove inapplicable venue links/event scopes and provide a nonblank point label before publication.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_canonical_venue_map_point_kind_fields()
  from public, anon, authenticated;

drop trigger if exists enforce_canonical_venue_map_point_kind_fields
  on public.org_data;
create trigger enforce_canonical_venue_map_point_kind_fields
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_canonical_venue_map_point_kind_fields();
