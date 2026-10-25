-- Erasure is an explicit owner action. Private jobs survive partial external failures.
alter table public.households add column erasure_started_at timestamptz;
create table private.account_erasure_jobs (
 user_id uuid primary key,household_id uuid unique,state text not null default 'frozen' check(state in ('frozen','purging','database_removed')),
 started_at timestamptz not null default now()
);
revoke all on private.account_erasure_jobs from public,anon,authenticated,service_role;
create or replace function private.is_member(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.household_memberships m join public.households h on h.id=m.household_id
 where m.household_id=target and m.user_id=(select auth.uid()) and h.erasure_started_at is null);
$$;
-- Every write holds a shared household lock until commit. Freeze waits for in-flight
-- writes, then later writes (including service-role completions) are rejected.
create function private.guard_household_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 h:=case when TG_OP='DELETE' then old.household_id else new.household_id end;
 if TG_OP='DELETE' and exists(select 1 from private.account_erasure_jobs where household_id=h and state='purging') then return old; end if;
 perform 1 from public.households where id=h and erasure_started_at is null for share;
 if not found then raise exception 'Account erasure is in progress' using errcode='42501'; end if;
 if TG_OP='UPDATE' and new.household_id is distinct from old.household_id then raise exception 'Household transfer is not supported' using errcode='42501'; end if;
 if TG_OP='DELETE' then return old; end if;return new;
end; $$;
revoke all on function private.guard_household_write() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['household_memberships','storage_locations','products','inventory_batches','inventory_operations','stock_movements','receipt_imports','receipt_lines','food_preferences','meal_suggestions','cooking_confirmations','list_operations','shopping_items','planned_meals'] loop
 execute format('create trigger erasure_write_guard before insert or update or delete on public.%I for each row execute function private.guard_household_write()',t);
 end loop;
end $$;
create function private.guard_receipt_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 if new.bucket_id<>'receipts' then return new; end if;
 h:=split_part(new.name,'/',1)::uuid;
 perform 1 from public.households where id=h and erasure_started_at is null for share;
 if not found then raise exception 'Account erasure is in progress' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function private.guard_receipt_upload() from public,anon,authenticated;
create trigger erasure_upload_guard before insert or update on storage.objects for each row execute function private.guard_receipt_upload();
create or replace function public.bootstrap_household(p_timezone text default 'UTC') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_household uuid;
begin
  if v_user is null or not exists(select 1 from auth.users where id = v_user and email_confirmed_at is not null) then
    raise exception 'Verified sign-in required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  if exists(select 1 from private.account_erasure_jobs where user_id=v_user) then raise exception 'Account erasure is in progress. Open Account to continue.' using errcode='42501'; end if;
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

create function public.begin_account_erasure(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 if p_user is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'Account unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if exists(select 1 from private.account_erasure_jobs where user_id=p_user) then return; end if;
 select household_id into h from public.household_memberships where user_id=p_user and role='owner';
 if exists(select 1 from public.household_memberships where user_id=p_user) and h is null then raise exception 'Owner action required' using errcode='42501'; end if;
 if h is not null then
  perform 1 from public.households where id=h for update;
  if (select count(*) from public.household_memberships where household_id=h)<>1 then raise exception 'Transfer shared-household ownership first' using errcode='22023'; end if;
  update public.households set erasure_started_at=now() where id=h;
 end if;
 insert into private.account_erasure_jobs(user_id,household_id) values(p_user,h);
end; $$;
create function public.account_erasure_batch(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.account_erasure_jobs;
begin
 select * into job from private.account_erasure_jobs where user_id=p_user;
 if not found then raise exception 'Erasure not started' using errcode='22023'; end if;
 return jsonb_build_object('state',job.state,'paths',coalesce((select jsonb_agg(name) from (select name from storage.objects where bucket_id='receipts' and starts_with(name,job.household_id::text||'/') order by name limit 100) objects),'[]'::jsonb));
end; $$;
create function public.purge_account_household(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job private.account_erasure_jobs; t text;
begin
 select * into job from private.account_erasure_jobs where user_id=p_user for update;
 if not found then raise exception 'Erasure not started' using errcode='22023'; end if;
 if job.state='database_removed' then return; end if;
 if exists(select 1 from storage.objects where bucket_id='receipts' and starts_with(name,job.household_id::text||'/')) then raise exception 'Remove private files before database erasure' using errcode='22023'; end if;
 update private.account_erasure_jobs set state='purging' where user_id=p_user;
 if job.household_id is not null then
  foreach t in array array['planned_meals','stock_movements','cooking_confirmations','inventory_operations','list_operations','inventory_batches','receipt_lines','receipt_imports','meal_suggestions','food_preferences','shopping_items','products','storage_locations','household_memberships'] loop
   execute format('delete from public.%I where household_id=$1',t) using job.household_id;
  end loop;
  delete from public.households where id=job.household_id;
 end if;
 update private.account_erasure_jobs set state='database_removed' where user_id=p_user;
end; $$;
create function public.finish_account_erasure(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users where id=p_user) then raise exception 'Remove Auth identity last' using errcode='22023'; end if;
 delete from private.account_erasure_jobs where user_id=p_user and state='database_removed';
end; $$;
revoke all on function public.begin_account_erasure(uuid),public.account_erasure_batch(uuid),public.purge_account_household(uuid),public.finish_account_erasure(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_erasure(uuid),public.account_erasure_batch(uuid),public.purge_account_household(uuid),public.finish_account_erasure(uuid) to service_role;
