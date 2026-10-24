-- One verified owner per account; all membership writes stay inside bootstrap.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My kitchen' check (length(btrim(name)) between 1 and 100),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
create table public.household_memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  primary key (household_id, user_id)
);
create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  unique (household_id, id),
  unique (household_id, name)
);
create function private.is_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.household_memberships where household_id = target and user_id = (select auth.uid()));
$$;
revoke all on function private.is_member(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.storage_locations enable row level security;
create policy household_read on public.households for select to authenticated using (private.is_member(id));
create policy membership_read on public.household_memberships for select to authenticated using (user_id = (select auth.uid()));
create policy location_read on public.storage_locations for select to authenticated using (private.is_member(household_id));
create policy location_insert on public.storage_locations for insert to authenticated with check (private.is_member(household_id));
create policy location_update on public.storage_locations for update to authenticated using (private.is_member(household_id)) with check (private.is_member(household_id));
create policy location_delete on public.storage_locations for delete to authenticated using (private.is_member(household_id));
revoke all on public.households, public.household_memberships, public.storage_locations from anon, authenticated;
grant select on public.households, public.household_memberships to authenticated;
grant select, insert, update(name), delete on public.storage_locations to authenticated;

create function public.bootstrap_household(p_timezone text default 'UTC') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_household uuid;
begin
  if v_user is null or not exists(select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'Verified sign-in required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select household_id into v_household from public.household_memberships where user_id = v_user;
  if v_household is not null then return v_household; end if;
  if not exists(select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  insert into public.households(timezone) values(p_timezone) returning id into v_household;
  insert into public.household_memberships(household_id, user_id) values(v_household, v_user);
  insert into public.storage_locations(household_id, name) values(v_household, 'Pantry'), (v_household, 'Fridge'), (v_household, 'Freezer');
  return v_household;
end;
$$;
revoke all on function public.bootstrap_household(text) from public, anon;
grant execute on function public.bootstrap_household(text) to authenticated;
