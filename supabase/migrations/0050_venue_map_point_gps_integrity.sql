-- Preserve optional point GPS as one complete, valid coordinate pair.
--
-- Existing malformed rows remain available to the admin recovery client, while
-- established Couple/Guest projectors continue to emit null GPS values unless
-- both coordinates are numeric and in range. Future writes fail closed so a
-- partial or malformed pair cannot be silently erased by client normalization.

create or replace function public.venue_map_has_invalid_point_gps(
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
      and (
        (point.value ? 'lat') <> (point.value ? 'lng')
        or (
          point.value ? 'lat'
          and point.value ? 'lng'
          and case
            when jsonb_typeof(point.value->'lat') is distinct from 'number'
              or jsonb_typeof(point.value->'lng') is distinct from 'number'
              then true
            else (point.value->>'lat')::numeric not between -90 and 90
              or (point.value->>'lng')::numeric not between -180 and 180
          end
        )
      )
  );
$$;

revoke all on function public.venue_map_has_invalid_point_gps(jsonb)
  from public, anon, authenticated;

create or replace function public.enforce_valid_venue_map_point_gps()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.domain <> 'venueMapConfigs' then
    return new;
  end if;

  if public.venue_map_has_invalid_point_gps(new.payload) then
    raise exception using
      errcode = '23514',
      message = 'venue_map_point_gps_invalid',
      detail = 'Point GPS must be omitted entirely or contain one numeric latitude/longitude pair within geographic bounds.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_valid_venue_map_point_gps()
  from public, anon, authenticated;

drop trigger if exists enforce_valid_venue_map_point_gps
  on public.org_data;
create trigger enforce_valid_venue_map_point_gps
  before insert or update of payload, domain, organization_id
  on public.org_data
  for each row
  execute function public.enforce_valid_venue_map_point_gps();
