-- Distinguish normal guest arrivals from exit-only Entry / Exit pins.
--
-- Omitted legacy roles remain "unknown" and do not satisfy arrival coverage.
-- Explicit roles are accepted only on Entry / Exit points and must use the
-- shared enum. Malformed values stay available in admin recovery data, while
-- future writes fail until the venue explicitly repairs them.

create or replace function public.venue_map_has_invalid_arrival_roles(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'points') = 'array'
        then p_map->'points' else '[]'::jsonb end
    ) as point(value)
    where jsonb_typeof(point.value) = 'object'
      and point.value ? 'arrivalRole'
      and (
        point.value->>'kind' is distinct from 'entry'
        or jsonb_typeof(point.value->'arrivalRole') is distinct from 'string'
        or coalesce(
          point.value->>'arrivalRole' not in (
            'unknown',
            'guest-arrival',
            'exit-only',
            'both'
          ),
          true
        )
      )
  );
$$;

revoke all on function public.venue_map_has_invalid_arrival_roles(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_arrival_roles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' then
    return new;
  end if;

  if public.venue_map_has_invalid_arrival_roles(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_arrival_role_invalid',
      detail = 'Entry / Exit arrivalRole must be unknown, guest-arrival, exit-only, or both; other point kinds cannot carry it.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_arrival_roles()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_arrival_roles
  on public.org_data;
create trigger enforce_valid_venue_map_arrival_roles
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_arrival_roles();

-- Enrich an already audience-scoped projection from the exact canonical source.
-- Historical malformed roles fail closed by removing the point and every route
-- that references it. Omitted legacy Entry / Exit roles remain visibly unknown.
create or replace function public.apply_venue_map_arrival_roles(
  p_projection jsonb,
  p_source_map jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_points jsonb;
  v_routes jsonb;
  v_result jsonb;
begin
  if jsonb_typeof(p_projection) <> 'object' then
    return p_projection;
  end if;

  with source_points as (
    select
      source.value,
      trim(source.value->>'id') as id,
      count(*) over (partition by trim(source.value->>'id')) as id_occurrences
    from jsonb_array_elements(
      case when jsonb_typeof(p_source_map->'points') = 'array'
        then p_source_map->'points' else '[]'::jsonb end
    ) as source(value)
    where jsonb_typeof(source.value) = 'object'
      and jsonb_typeof(source.value->'id') = 'string'
  ), projected as (
    select point.value, point.ordinality, source.value as source_value
    from jsonb_array_elements(
      case when jsonb_typeof(p_projection->'points') = 'array'
        then p_projection->'points' else '[]'::jsonb end
    ) with ordinality as point(value, ordinality)
    join source_points as source
      on source.id = point.value->>'id'
     and source.id_occurrences = 1
    where (
      source.value->>'kind' = 'entry'
      and (
        not (source.value ? 'arrivalRole')
        or (
          jsonb_typeof(source.value->'arrivalRole') = 'string'
          and source.value->>'arrivalRole' in (
            'unknown', 'guest-arrival', 'exit-only', 'both'
          )
        )
      )
    ) or (
      source.value->>'kind' <> 'entry'
      and not (source.value ? 'arrivalRole')
    )
  )
  select coalesce(
    jsonb_agg(
      case when projected.source_value->>'kind' = 'entry'
        then projected.value || jsonb_build_object(
          'arrivalRole',
          coalesce(projected.source_value->>'arrivalRole', 'unknown')
        )
        else projected.value - 'arrivalRole'
      end
      order by projected.ordinality
    ),
    '[]'::jsonb
  ) into v_points
  from projected;

  select coalesce(jsonb_agg(route.value order by route.ordinality), '[]'::jsonb)
    into v_routes
  from jsonb_array_elements(
    case when jsonb_typeof(p_projection->'routes') = 'array'
      then p_projection->'routes' else '[]'::jsonb end
  ) with ordinality as route(value, ordinality)
  where jsonb_typeof(route.value->'pointIds') = 'array'
    and not exists (
      select 1
      from jsonb_array_elements_text(route.value->'pointIds') as route_point(id)
      where not exists (
        select 1
        from jsonb_array_elements(v_points) as projected_point(value)
        where projected_point.value->>'id' = route_point.id
      )
    );

  v_result := jsonb_set(p_projection, '{points}', v_points, true);
  return jsonb_set(v_result, '{routes}', v_routes, true);
end;
$$;

revoke all on function public.apply_venue_map_arrival_roles(jsonb, jsonb)
  from public, anon, authenticated;

-- Preserve priority and then apply exact arrival-role projection for Guest maps.
create or replace function public.build_guest_venue_map_projection_with_priority(
  p_couple_map jsonb,
  p_selected_space_ids jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_projection jsonb;
  v_routes jsonb;
begin
  v_projection := public.build_guest_venue_map_projection(
    p_couple_map,
    p_selected_space_ids
  );
  if jsonb_typeof(v_projection) <> 'object'
     or jsonb_typeof(v_projection->'routes') <> 'array' then
    return v_projection;
  end if;

  select coalesce(
      jsonb_agg(
        projected.value || jsonb_build_object(
          'priority',
          coalesce(
            (
              select case
                when count(*) = 1 then max(
                  case
                    when source.value->>'priority' in (
                      'preferred',
                      'standard',
                      'secondary',
                      'emergency-only'
                    ) then source.value->>'priority'
                    else 'standard'
                  end
                )
                else 'standard'
              end
              from jsonb_array_elements(
                case
                  when jsonb_typeof(p_couple_map->'routes') = 'array'
                    then p_couple_map->'routes'
                  else '[]'::jsonb
                end
              ) as source(value)
              where jsonb_typeof(source.value) = 'object'
                and source.value->>'id' = projected.value->>'id'
            ),
            'standard'
          )
        )
        order by projected.ordinality
      ),
      '[]'::jsonb
    )
    into v_routes
  from jsonb_array_elements(v_projection->'routes')
    with ordinality as projected(value, ordinality);

  return public.apply_venue_map_arrival_roles(
    jsonb_set(v_projection, '{routes}', v_routes, true),
    p_couple_map
  );
end;
$$;

revoke all on function public.build_guest_venue_map_projection_with_priority(jsonb, jsonb)
  from public, anon, authenticated;

-- Retain the latest rain-plan and managed-image sanitation while enriching both
-- authoritative Couple and Guest maps with fail-closed arrival roles.
create or replace function public.sanitize_couple_portal_map_result(
  p_result jsonb,
  p_organization_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_source_map jsonb;
  v_source_venues jsonb;
  v_portal_source_map jsonb;
  v_couple_map jsonb;
  v_guest_map jsonb;
  v_selected_space_ids jsonb := '[]'::jsonb;
  v_has_canonical_map boolean := false;
  v_has_canonical_venues boolean := false;
begin
  if coalesce((p_result->>'ok')::boolean, false) is not true
     or jsonb_typeof(p_result->'payload') <> 'object' then
    return p_result;
  end if;

  v_payload := p_result->'payload';

  select data.payload
    into v_source_map
  from public.org_data as data
  where data.organization_id = p_organization_id
    and data.domain = 'venueMapConfigs'
  limit 1;
  v_has_canonical_map := found;
  if not v_has_canonical_map then
    v_source_map := v_payload->'venueMapConfigs';
  end if;

  select data.payload
    into v_source_venues
  from public.org_data as data
  where data.organization_id = p_organization_id
    and data.domain = 'venues'
  limit 1;
  v_has_canonical_venues := found;
  if not v_has_canonical_venues then
    v_source_venues := v_payload->'venues';
  end if;

  if jsonb_typeof(v_payload->'coupleEvents') = 'array'
     and jsonb_array_length(v_payload->'coupleEvents') > 0
     and jsonb_typeof(v_payload->'coupleEvents'->0->'selectedSpaces') = 'array' then
    v_selected_space_ids := v_payload->'coupleEvents'->0->'selectedSpaces';
  end if;

  v_portal_source_map := public.sanitize_venue_map_rain_contingencies(
    v_source_map,
    v_source_venues
  );
  v_couple_map := public.sanitize_portal_venue_map_base_image(
    public.apply_venue_map_arrival_roles(
      public.build_couple_venue_map_projection(v_portal_source_map),
      v_portal_source_map
    ),
    p_organization_id
  );
  v_guest_map := public.sanitize_portal_venue_map_base_image(
    public.build_guest_venue_map_projection_with_priority(
      v_portal_source_map,
      v_selected_space_ids
    ),
    p_organization_id
  );

  v_payload := jsonb_set(
    v_payload,
    '{venueMapConfigs}',
    coalesce(v_couple_map, 'null'::jsonb),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{guestVenueMap}',
    coalesce(v_guest_map, 'null'::jsonb),
    true
  );

  return jsonb_set(p_result, '{payload}', v_payload, true);
end;
$$;

revoke all on function public.sanitize_couple_portal_map_result(jsonb, uuid)
  from public, anon, authenticated;
