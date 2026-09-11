-- Preserve venue-authored map wording by making the established projection
-- limits an explicit canonical write contract instead of silently truncating
-- labels and safety/accessibility guidance during normalization.
--
-- Existing malformed rows remain untouched for admin repair. Both authoritative
-- portal projections already compose sanitize_venue_map_rain_contingencies;
-- this migration adds an object-level text sanitizer to that chain so legacy
-- overlong/malformed objects and routes that depend on a rejected point fail
-- closed rather than being delivered with a silently shortened meaning.

create or replace function public.venue_map_text_field_valid(
  p_object jsonb,
  p_field text,
  p_max_length integer,
  p_required boolean default false
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p_object) is distinct from 'object' then false
    when not (p_object ? p_field) then not p_required
    when jsonb_typeof(p_object->p_field) is distinct from 'string' then false
    when p_required and length(trim(p_object->>p_field)) = 0 then false
    else length(trim(p_object->>p_field)) <= p_max_length
  end;
$$;

revoke all on function public.venue_map_text_field_valid(jsonb, text, integer, boolean)
  from public, anon, authenticated;

create or replace function public.venue_map_has_invalid_text_fields(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_map is null or jsonb_typeof(p_map) <> 'object' then false
    else exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'points') = 'array' then p_map->'points' else '[]'::jsonb end
      ) as point(value)
      where not public.venue_map_text_field_valid(point.value, 'label', 200, true)
         or not public.venue_map_text_field_valid(point.value, 'description', 1000, false)
    ) or exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'routes') = 'array' then p_map->'routes' else '[]'::jsonb end
      ) as route(value)
      where not public.venue_map_text_field_valid(route.value, 'name', 200, true)
         or not public.venue_map_text_field_valid(route.value, 'notes', 1000, false)
    ) or exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'drawings') = 'array' then p_map->'drawings' else '[]'::jsonb end
      ) as drawing(value)
      where not public.venue_map_text_field_valid(drawing.value, 'text', 300, false)
    ) or exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_map->'rainContingencies') = 'array'
            then p_map->'rainContingencies'
          else '[]'::jsonb
        end
      ) as contingency(value)
      where not public.venue_map_text_field_valid(contingency.value, 'note', 1000, false)
    )
  end;
$$;

revoke all on function public.venue_map_has_invalid_text_fields(jsonb)
  from public, anon, authenticated;

-- Run only after structural/identity sanitation. This ordering prevents an
-- invalid-text duplicate from being removed before duplicate groups are counted.
create or replace function public.sanitize_venue_map_text_integrity(
  p_map jsonb
) returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_points jsonb := '[]'::jsonb;
  v_routes jsonb := '[]'::jsonb;
  v_drawings jsonb := '[]'::jsonb;
  v_contingencies jsonb := '[]'::jsonb;
  v_safe_map jsonb;
begin
  if p_map is null or jsonb_typeof(p_map) <> 'object' then
    return p_map;
  end if;

  select coalesce(jsonb_agg(point.value order by point.ordinality), '[]'::jsonb)
    into v_points
  from jsonb_array_elements(
    case when jsonb_typeof(p_map->'points') = 'array' then p_map->'points' else '[]'::jsonb end
  ) with ordinality as point(value, ordinality)
  where public.venue_map_text_field_valid(point.value, 'label', 200, true)
    and public.venue_map_text_field_valid(point.value, 'description', 1000, false);

  select coalesce(jsonb_agg(route.value order by route.ordinality), '[]'::jsonb)
    into v_routes
  from jsonb_array_elements(
    case when jsonb_typeof(p_map->'routes') = 'array' then p_map->'routes' else '[]'::jsonb end
  ) with ordinality as route(value, ordinality)
  where public.venue_map_text_field_valid(route.value, 'name', 200, true)
    and public.venue_map_text_field_valid(route.value, 'notes', 1000, false)
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(route.value->'pointIds') = 'array' then route.value->'pointIds'
          else '[]'::jsonb
        end
      ) as route_point(value)
      where jsonb_typeof(route_point.value) <> 'string'
         or (
           select count(*)
           from jsonb_array_elements(v_points) as point(value)
           where jsonb_typeof(point.value->'id') = 'string'
             and trim(point.value->>'id') = trim(route_point.value #>> '{}')
         ) <> 1
    );

  select coalesce(jsonb_agg(drawing.value order by drawing.ordinality), '[]'::jsonb)
    into v_drawings
  from jsonb_array_elements(
    case when jsonb_typeof(p_map->'drawings') = 'array' then p_map->'drawings' else '[]'::jsonb end
  ) with ordinality as drawing(value, ordinality)
  where public.venue_map_text_field_valid(drawing.value, 'text', 300, false);

  select coalesce(
    jsonb_agg(contingency.value order by contingency.ordinality),
    '[]'::jsonb
  )
    into v_contingencies
  from jsonb_array_elements(
    case
      when jsonb_typeof(p_map->'rainContingencies') = 'array'
        then p_map->'rainContingencies'
      else '[]'::jsonb
    end
  ) with ordinality as contingency(value, ordinality)
  where public.venue_map_text_field_valid(contingency.value, 'note', 1000, false);

  v_safe_map := jsonb_set(p_map, '{points}', v_points, true);
  v_safe_map := jsonb_set(v_safe_map, '{routes}', v_routes, true);
  v_safe_map := jsonb_set(v_safe_map, '{drawings}', v_drawings, true);
  return jsonb_set(v_safe_map, '{rainContingencies}', v_contingencies, true);
end;
$$;

revoke all on function public.sanitize_venue_map_text_integrity(jsonb)
  from public, anon, authenticated;

-- Recompose the latest shared Couple/Guest source sanitizer. Complexity and
-- frame checks still fail the whole map closed; structural duplicate counting
-- still runs before object-level text rejection.
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
  return public.sanitize_venue_map_route_priorities(
    public.sanitize_venue_map_drawings(v_space_safe_map)
  );
end;
$$;

revoke all on function public.sanitize_venue_map_rain_contingencies(jsonb, jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_text_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' or jsonb_typeof(new.payload) <> 'object' then
    return new;
  end if;

  if public.venue_map_has_invalid_text_fields(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_text_fields_invalid',
      detail = 'Point labels and walkway names are required (200 characters); shape labels allow 300; guest, walkway, and rain guidance allow 1000.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_text_fields()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_text_fields
  on public.org_data;
create trigger enforce_valid_venue_map_text_fields
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_text_fields();
