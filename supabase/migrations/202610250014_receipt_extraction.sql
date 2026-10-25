-- On-demand extraction; leases and call reservations survive network failures.
alter table public.receipt_imports
 add column extraction_status text not null default 'idle' check(extraction_status in ('idle','pending','completed','failed')),
 add column extraction_attempt uuid,
 add column extraction_attempts integer not null default 0 check(extraction_attempts between 0 and 2),
 add column extraction_calls integer not null default 0 check(extraction_calls between 0 and 2),
 add column extraction_revision integer,
 add column extraction_started_at timestamptz,
 add column extraction_lease_until timestamptz,
 add column extraction_route text check(extraction_route in ('embedded_text','vision')),
 add column extraction_reason text check(length(extraction_reason)<=80),
 add column extraction_error text check(length(extraction_error)<=80),
 add column extraction_model text check(length(extraction_model)<=100),
 add column extraction_prompt text check(length(extraction_prompt)<=100),
 add column extraction_metadata jsonb;
alter table public.receipt_lines add column source_position integer check(source_position between 1 and 200);

create function private.invalidate_receipt_extraction() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.extraction_status='pending' and new.extraction_status='pending' and
 (new.revision<>old.revision or new.status<>old.status or new.deletion_token is distinct from old.deletion_token
 or new.source_deleted_at is distinct from old.source_deleted_at or new.source_path is distinct from old.source_path) then
  new.extraction_status:='failed'; new.extraction_error:='REVIEW_OR_SOURCE_CHANGED'; new.extraction_lease_until:=null;
 end if;
 return new;
end; $$;
revoke all on function private.invalidate_receipt_extraction() from public,anon,authenticated;
create trigger invalidate_receipt_extraction before update on public.receipt_imports for each row execute function private.invalidate_receipt_extraction();

create function public.begin_receipt_extraction(p_receipt uuid,p_user uuid,p_revision integer,p_model text,p_prompt text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.receipt_imports;
begin
 select * into r from public.receipt_imports where id=p_receipt for update;
 if not found or r.uploaded_by<>p_user or not exists(select 1 from public.household_memberships m join public.households h on h.id=m.household_id where m.household_id=r.household_id and m.user_id=p_user and h.erasure_started_at is null) then raise exception 'Receipt unavailable' using errcode='42501'; end if;
 if r.extraction_status='completed' then return jsonb_build_object('status','completed','acquired',false); end if;
 if r.revision is distinct from p_revision or r.status<>'uploaded' or r.verified_hash is null
 or r.source_deleted_at is not null or r.deletion_token is not null
 or exists(select 1 from public.receipt_lines where receipt_id=r.id) then raise exception 'Review or source changed. Use the saved draft.' using errcode='40001'; end if;
 if r.extraction_status='pending' and r.extraction_lease_until>now() then return jsonb_build_object('status','pending','acquired',false); end if;
 if r.extraction_attempts>=2 then raise exception 'Extraction attempt budget exhausted. Enter lines manually.' using errcode='22023'; end if;
 if p_model is null or length(p_model) not between 1 and 100 or p_prompt is null or length(p_prompt) not between 1 and 100 then raise exception 'Invalid model configuration' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.household_id::text||'receipt-extraction',0));
 if (select count(*) from public.receipt_imports where household_id=r.household_id and extraction_started_at>now()-interval '10 minutes' and id<>r.id)>=5 then raise exception 'Receipt processing rate limit. Try later.' using errcode='P0001'; end if;
 update public.receipt_imports set extraction_status='pending',extraction_attempt=gen_random_uuid(),extraction_attempts=extraction_attempts+1,
 extraction_calls=0,extraction_revision=revision,extraction_started_at=now(),extraction_lease_until=now()+interval '60 seconds',
 extraction_route=null,extraction_reason=null,extraction_error=null,extraction_model=p_model,extraction_prompt=p_prompt
 where id=r.id returning * into r;
 return jsonb_build_object('status','pending','acquired',true,'attempt',r.extraction_attempt,'path',coalesce(r.source_path,r.object_path),'hash',r.verified_hash);
end; $$;

create function public.reserve_receipt_model_call(p_receipt uuid,p_user uuid,p_attempt uuid,p_route text,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_route is null or p_route not in ('embedded_text','vision') or (p_route='embedded_text' and p_reason is not null) or (p_route='vision' and p_reason is null) then raise exception 'Invalid extraction route' using errcode='22023'; end if;
 update public.receipt_imports r set extraction_calls=extraction_calls+1,extraction_route=p_route,extraction_reason=p_reason
 where r.id=p_receipt and r.uploaded_by=p_user and r.extraction_attempt=p_attempt and r.extraction_status='pending'
 and r.extraction_lease_until>now() and r.extraction_calls<2 and r.revision=r.extraction_revision and r.status='uploaded'
 and r.source_deleted_at is null and r.deletion_token is null
 and exists(select 1 from public.household_memberships m join public.households h on h.id=m.household_id where m.household_id=r.household_id and m.user_id=p_user and h.erasure_started_at is null)
 returning extraction_calls into n;
 if not found then raise exception 'Extraction lease or call budget unavailable' using errcode='40001'; end if;
 return n;
end; $$;

create function public.finish_receipt_extraction(p_receipt uuid,p_user uuid,p_attempt uuid,p_proposal jsonb,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.receipt_imports; l jsonb; pos integer:=0; q numeric; meta jsonb;
begin
 select * into r from public.receipt_imports where id=p_receipt for update;
 if not found or r.uploaded_by<>p_user or not exists(select 1 from public.household_memberships m join public.households h on h.id=m.household_id where m.household_id=r.household_id and m.user_id=p_user and h.erasure_started_at is null) then raise exception 'Receipt unavailable' using errcode='42501'; end if;
 if r.extraction_attempt=p_attempt and r.extraction_status='completed' then return true; end if;
 if r.extraction_attempt is distinct from p_attempt or r.extraction_status<>'pending' or r.extraction_lease_until<=now()
 or r.status<>'uploaded' or r.revision<>r.extraction_revision or r.source_deleted_at is not null or r.deletion_token is not null then return false; end if;
 if p_error is not null then
  if p_error not in ('SOURCE_UNAVAILABLE','SOURCE_CHANGED','INVALID_PDF','TIMEOUT','UPSTREAM_FAILED','RATE_LIMITED','MODEL_REFUSAL','INCOMPLETE_RESPONSE','INVALID_PROPOSAL','VISION_DISABLED','PROCESSING_FAILED') then raise exception 'Invalid error category' using errcode='22023'; end if;
  update public.receipt_imports set extraction_status='failed',extraction_error=p_error,extraction_lease_until=null where id=r.id;
  return true;
 end if;
 if r.extraction_calls=0 or p_proposal is null or jsonb_typeof(p_proposal->'lines') is distinct from 'array' or jsonb_array_length(p_proposal->'lines') not between 1 and 200 or jsonb_typeof(p_proposal->'metadata') is distinct from 'object' then raise exception 'Invalid proposal' using errcode='22023'; end if;
 if exists(select 1 from public.receipt_lines where receipt_id=r.id) then return false; end if;
 for l in select value from jsonb_array_elements(p_proposal->'lines') loop
  pos:=pos+1;
  if l->>'kind' is null or l->>'kind' not in ('grocery','deposit','discount','non_food','unknown') or jsonb_typeof(l->'issues') is distinct from 'array' then raise exception 'Invalid proposal line' using errcode='22023'; end if;
  q:=case when l->>'quantity' is null then null else private.quantity(l->>'quantity') end;
  if (q is null)<>(l->>'unit' is null) or (q is not null and nullif(btrim(l->>'quantity_evidence'),'') is null) then raise exception 'Missing quantity evidence' using errcode='22023'; end if;
  insert into public.receipt_lines(id,household_id,receipt_id,source_label,source_position,proposed,reviewed_name,quantity,unit,included)
  values(gen_random_uuid(),r.household_id,r.id,l->>'source_label',pos,l,l->>'proposed_name',q,l->>'unit',l->>'kind' in ('grocery','unknown'));
 end loop;
 meta:=p_proposal->'metadata';
 update public.receipt_imports set extraction_status='completed',extraction_error=null,extraction_lease_until=null,extraction_metadata=meta,
 merchant=nullif(btrim(meta->>'merchant'),''),receipt_number=nullif(btrim(meta->>'receipt_number'),''),purchased_on=(meta->>'purchased_on')::date,
 total=case when meta->>'total' is null then null else (meta->>'total')::numeric end,currency=meta->>'currency',
 status='review_ready',revision=revision+1 where id=r.id;
 return true;
end; $$;
revoke all on function public.begin_receipt_extraction(uuid,uuid,integer,text,text),public.reserve_receipt_model_call(uuid,uuid,uuid,text,text),public.finish_receipt_extraction(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.begin_receipt_extraction(uuid,uuid,integer,text,text),public.reserve_receipt_model_call(uuid,uuid,uuid,text,text),public.finish_receipt_extraction(uuid,uuid,uuid,jsonb,text) to service_role;

create or replace function public.get_receipt_review(p_receipt uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'filename',r.filename,'canonical_id',r.canonical_id,
 'merchant',r.merchant,'receipt_number',r.receipt_number,'purchased_on',r.purchased_on,'total',r.total::text,'currency',r.currency,
 'confirmation',r.confirmation,'source_deleted',r.source_deleted_at is not null,
 'extraction',jsonb_build_object('status',r.extraction_status,'attempts',r.extraction_attempts,'calls',r.extraction_calls,'route',r.extraction_route,'reason',r.extraction_reason,'error',r.extraction_error,'lease_until',r.extraction_lease_until),
 'duplicates',public.receipt_duplicate_candidates(r.id),
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'source_label',l.source_label,'proposed',l.proposed,'reviewed_name',l.reviewed_name,'quantity',l.quantity::text,'unit',l.unit,'product_id',l.product_id,'location_id',l.location_id,'expiry',l.expiry,'included',l.included) order by l.source_position nulls last,l.id) from public.receipt_lines l where l.receipt_id=r.id),'[]'::jsonb))
 from public.receipt_imports r where r.id=p_receipt;
$$;
