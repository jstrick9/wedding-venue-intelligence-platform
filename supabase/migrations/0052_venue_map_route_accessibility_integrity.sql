-- Require explicitly authored walkway mobility status to use the shared enum.
--
-- Omitted legacy status remains "unknown". Existing malformed values remain in
-- admin recovery data, while portal projectors and step-free routing continue
-- to treat them as not verified. Future writes fail until an admin explicitly
-- chooses unknown, step-free, or not-step-free.

create or replace function public.venue_map_has_invalid_route_accessibility(
  p_map jsonb
) returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_map->'routes') = 'array'
        then p_map->'routes' else '[]'::jsonb end
    ) as route(value)
    where jsonb_typeof(route.value) = 'object'
      and route.value ? 'accessibility'
      and (
        jsonb_typeof(route.value->'accessibility') is distinct from 'string'
        or coalesce(
          route.value->>'accessibility' not in ('unknown', 'step-free', 'not-step-free'),
          true
        )
      )
  );
$$;

revoke all on function public.venue_map_has_invalid_route_accessibility(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_route_accessibility()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' then
    return new;
  end if;

  if public.venue_map_has_invalid_route_accessibility(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_route_accessibility_invalid',
      detail = 'Explicit walkway mobility status must be unknown, step-free, or not-step-free.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_route_accessibility()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_route_accessibility
  on public.org_data;
create trigger enforce_valid_venue_map_route_accessibility
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_route_accessibility();
