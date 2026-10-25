-- Keep only IDs needed for device cleanup until Auth deletion completes.
alter table private.account_erasure_jobs add column receipt_ids uuid[] not null default '{}';
create or replace function public.begin_account_erasure(p_user uuid) returns void
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
 insert into private.account_erasure_jobs(user_id,household_id,receipt_ids) values(p_user,h,coalesce((select array_agg(id) from public.receipt_imports where household_id=h),'{}'));
end; $$;
create or replace function public.account_erasure_batch(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.account_erasure_jobs;
begin
 select * into job from private.account_erasure_jobs where user_id=p_user;
 if not found then raise exception 'Erasure not started' using errcode='22023'; end if;
 return jsonb_build_object('state',job.state,'household_id',job.household_id,'receipt_ids',to_jsonb(job.receipt_ids),'paths',coalesce((select jsonb_agg(name) from (select name from storage.objects where bucket_id='receipts' and starts_with(name,job.household_id::text||'/') order by name limit 100) objects),'[]'::jsonb));
end; $$;
