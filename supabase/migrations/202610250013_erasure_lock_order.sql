-- Row triggers must not wait for the freeze lock while holding another row lock.
create or replace function private.guard_household_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 h:=case when TG_OP='DELETE' then old.household_id else new.household_id end;
 if TG_OP='DELETE' and exists(select 1 from private.account_erasure_jobs where household_id=h and state='purging') then return old; end if;
 perform 1 from public.households where id=h and erasure_started_at is null for share nowait;
 if not found then raise exception 'Account erasure is in progress' using errcode='42501'; end if;
 if TG_OP='UPDATE' and new.household_id is distinct from old.household_id then raise exception 'Household transfer is not supported' using errcode='42501'; end if;
 if TG_OP='DELETE' then return old; end if;return new;
exception when lock_not_available then raise exception 'Account state is changing. Retry the request.' using errcode='40001';
end; $$;

create or replace function private.guard_receipt_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 if new.bucket_id<>'receipts' then return new; end if;
 h:=split_part(new.name,'/',1)::uuid;
 perform 1 from public.households where id=h and erasure_started_at is null for share nowait;
 if not found then raise exception 'Account erasure is in progress' using errcode='42501'; end if;
 return new;
exception when lock_not_available then raise exception 'Account state is changing. Retry the request.' using errcode='40001';
end; $$;
