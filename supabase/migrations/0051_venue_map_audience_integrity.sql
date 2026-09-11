-- Require every explicitly authored map visibility value to use the shared enum.
--
-- Audience omission remains the established legacy-public case. Explicit null,
-- blank, misspelled, or non-text values are materially different: existing
-- rows stay available to the admin recovery workflow, public/couple projectors
-- continue to fail closed, and future writes are rejected until an admin picks
-- the intended visibility.

create or replace function public.venue_map_has_invalid_audiences(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from (
      select point.value
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'points') = 'array'
          then p_map->'points' else '[]'::jsonb end
      ) as point(value)
      union all
      select route.value
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'routes') = 'array'
          then p_map->'routes' else '[]'::jsonb end
      ) as route(value)
      union all
      select drawing.value
      from jsonb_array_elements(
        case when jsonb_typeof(p_map->'drawings') = 'array'
          then p_map->'drawings' else '[]'::jsonb end
      ) as drawing(value)
    ) as map_object
    where jsonb_typeof(map_object.value) = 'object'
      and map_object.value ? 'audience'
      and (
        jsonb_typeof(map_object.value->'audience') is distinct from 'string'
        or coalesce(
          map_object.value->>'audience' not in ('public', 'couple', 'staff'),
          true
        )
      )
  );
$$;

revoke all on function public.venue_map_has_invalid_audiences(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_audiences()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' then
    return new;
  end if;

  if public.venue_map_has_invalid_audiences(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_audience_invalid',
      detail = 'Explicit point, walkway, and shape visibility must be public, couple, or staff.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_audiences()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_audiences
  on public.org_data;
create trigger enforce_valid_venue_map_audiences
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_audiences();
