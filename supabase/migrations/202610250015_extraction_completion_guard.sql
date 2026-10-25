-- Incomplete coverage cannot be persisted as a completed draft.
create or replace function public.finish_receipt_extraction(p_receipt uuid,p_user uuid,p_attempt uuid,p_proposal jsonb,p_error text default null) returns boolean
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
 if r.extraction_calls=0 or p_proposal is null or p_proposal->'coverage_complete' is distinct from 'true'::jsonb or jsonb_typeof(p_proposal->'lines') is distinct from 'array' or jsonb_array_length(p_proposal->'lines') not between 1 and 200 or jsonb_typeof(p_proposal->'metadata') is distinct from 'object' then raise exception 'Invalid proposal' using errcode='22023'; end if;
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
