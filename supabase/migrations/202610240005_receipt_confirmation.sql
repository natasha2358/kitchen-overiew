-- Confirmation and source lifecycle remain protected RPC operations.
alter table public.receipt_imports drop constraint receipt_imports_status_check;
alter table public.receipt_imports add constraint receipt_imports_status_check check(status in ('uploading','uploaded','review_ready','duplicate','confirmed'));
alter table public.receipt_imports add column merchant text check(length(merchant)<=200),
 add column receipt_number text check(length(receipt_number)<=100), add column purchased_on date,
 add column total numeric(20,6) check(total>=0), add column currency text check(currency ~ '^[A-Z]{3}$'),
 add column confirmation jsonb, add column source_path text, add column source_deleted_at timestamptz,
 add column deletion_token uuid;
update public.receipt_imports set source_path=object_path;
alter table public.receipt_lines add constraint receipt_line_household_identity unique(household_id,id);
alter table public.inventory_batches add column receipt_line_id uuid unique,
 add foreign key(household_id,receipt_line_id) references public.receipt_lines(household_id,id);
alter table public.stock_movements drop constraint stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check check(reason in ('create','add','adjust','waste','move','edit','remove','receipt','cook'));

drop function public.save_receipt_review(uuid,integer,jsonb);
create function public.save_receipt_review(p_receipt uuid,p_revision integer,p_lines jsonb,p_metadata jsonb default '{}'::jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_row public.receipt_imports; v_line jsonb; v_id uuid; v_ids uuid[] := '{}'; v_quantity numeric;
begin
  select * into v_row from public.receipt_imports where id=p_receipt for update;
  if not found or not private.is_member(v_row.household_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if v_row.status not in ('uploaded','review_ready') then raise exception 'Verify the upload before review' using errcode='22023'; end if;
  if v_row.revision is distinct from p_revision then raise exception 'Review changed. Reopen before saving.' using errcode='40001'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>200 then raise exception 'Invalid lines' using errcode='22023'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_id:=(v_line->>'id')::uuid;
    if v_id is null or v_id=any(v_ids) then raise exception 'Invalid line identity' using errcode='22023'; end if;
    v_ids:=array_append(v_ids,v_id);
    v_quantity:=case when v_line->>'quantity' is null then null else private.quantity(v_line->>'quantity') end;
    insert into public.receipt_lines(id,household_id,receipt_id,source_label,reviewed_name,quantity,unit,product_id,location_id,expiry,included)
    values(v_id,v_row.household_id,v_row.id,v_line->>'source_label',v_line->>'reviewed_name',v_quantity,v_line->>'unit',(v_line->>'product_id')::uuid,(v_line->>'location_id')::uuid,(v_line->>'expiry')::date,coalesce((v_line->>'included')::boolean,true))
    on conflict(id) do update set reviewed_name=excluded.reviewed_name,quantity=excluded.quantity,unit=excluded.unit,product_id=excluded.product_id,location_id=excluded.location_id,expiry=excluded.expiry,included=excluded.included
    where public.receipt_lines.receipt_id=v_row.id and public.receipt_lines.household_id=v_row.household_id;
    if not found then raise exception 'Line unavailable' using errcode='22023'; end if;
  end loop;
  delete from public.receipt_lines where receipt_id=v_row.id and not(id=any(v_ids));
  if jsonb_typeof(p_metadata) is distinct from 'object' then raise exception 'Invalid metadata' using errcode='22023'; end if;
  update public.receipt_imports set merchant=nullif(btrim(p_metadata->>'merchant'),''),receipt_number=nullif(btrim(p_metadata->>'receipt_number'),''),
    purchased_on=(p_metadata->>'purchased_on')::date,total=case when p_metadata->>'total' is null then null else private.quantity(p_metadata->>'total') end,
    currency=nullif(upper(btrim(p_metadata->>'currency')),''),revision=revision+1,status='review_ready' where id=v_row.id returning revision into p_revision;
  return p_revision;
end; $$;

create function public.receipt_duplicate_candidates(p_receipt uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'filename',b.filename,'status',b.status) order by b.id),'[]'::jsonb)
 from public.receipt_imports a join public.receipt_imports b on a.household_id=b.household_id and a.id<>b.id
 where a.id=p_receipt and b.verified_hash is not null
 and nullif(public.normalize_product_name(a.merchant),'')=public.normalize_product_name(b.merchant)
 and ((a.receipt_number is not null and lower(a.receipt_number)=lower(b.receipt_number))
 or (a.purchased_on=b.purchased_on and a.total=b.total and a.currency=b.currency));
$$;
create or replace function public.get_receipt_review(p_receipt uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'filename',r.filename,'canonical_id',r.canonical_id,
 'merchant',r.merchant,'receipt_number',r.receipt_number,'purchased_on',r.purchased_on,'total',r.total::text,'currency',r.currency,
 'confirmation',r.confirmation,'source_deleted',r.source_deleted_at is not null,
 'duplicates',public.receipt_duplicate_candidates(r.id),
 'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'source_label',l.source_label,'proposed',l.proposed,'reviewed_name',l.reviewed_name,'quantity',l.quantity::text,'unit',l.unit,'product_id',l.product_id,'location_id',l.location_id,'expiry',l.expiry,'included',l.included) order by l.id) from public.receipt_lines l where l.receipt_id=r.id),'[]'::jsonb))
 from public.receipt_imports r where r.id=p_receipt;
$$;
create function public.confirm_receipt(p_receipt uuid,p_revision integer,p_operation uuid,p_acknowledged uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.receipt_imports; l public.receipt_lines; p public.products; b uuid; q numeric; u text;
 req jsonb; prior public.inventory_operations; v_result jsonb; batches jsonb:='[]'; candidates uuid[];
begin
 select * into r from public.receipt_imports where id=p_receipt;
 if not found or not private.is_member(r.household_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_operation is null then raise exception 'Operation required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.household_id::text||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended(r.household_id::text||'receipt-confirm',0));
 select * into r from public.receipt_imports where id=p_receipt for update;
 req:=jsonb_build_object('action','confirm_receipt','receipt_id',p_receipt,'revision',p_revision,'acknowledged',to_jsonb(p_acknowledged));
 select * into prior from public.inventory_operations where household_id=r.household_id and id=p_operation;
 if found then
   if prior.request<>req then raise exception 'Operation ID reused' using errcode='40001'; end if;
   return prior.result;
 end if;
 if r.confirmation is not null then return r.confirmation; end if;
 if r.status<>'review_ready' or r.verified_hash is null then raise exception 'Save a verified review first' using errcode='22023'; end if;
 if r.revision is distinct from p_revision then raise exception 'Review changed. Reload.' using errcode='40001'; end if;
 select coalesce(array_agg((x->>'id')::uuid),'{}') into candidates from jsonb_array_elements(public.receipt_duplicate_candidates(r.id)) x;
 if not candidates <@ coalesce(p_acknowledged,'{}') then raise exception 'Review and acknowledge possible duplicates' using errcode='40001'; end if;
 if not exists(select 1 from public.receipt_lines where receipt_id=r.id and included) then raise exception 'Include at least one valid line' using errcode='22023'; end if;
 insert into public.inventory_operations(household_id,id,request,result) values(r.household_id,p_operation,req,'{}');
 for l in select * from public.receipt_lines where receipt_id=r.id and included order by id loop
   if l.quantity is null or l.unit is null or l.location_id is null then raise exception 'Resolve all included lines' using errcode='22023'; end if;
   u:=case l.unit when 'kg' then 'g' when 'l' then 'ml' else l.unit end;
   q:=l.quantity*case when l.unit in ('kg','l') then 1000 else 1 end;
   if l.product_id is null then
     if nullif(btrim(l.reviewed_name),'') is null then raise exception 'Product name required' using errcode='22023'; end if;
     insert into public.products(household_id,name,base_unit) values(r.household_id,l.reviewed_name,u) on conflict(household_id,normalized_name) do nothing;
     select * into p from public.products where household_id=r.household_id and normalized_name=public.normalize_product_name(l.reviewed_name) for share;
   else
     select * into p from public.products where household_id=r.household_id and id=l.product_id for share;
   end if;
   if p.id is null or p.base_unit is distinct from u then raise exception 'Incompatible product unit' using errcode='22023'; end if;
   insert into public.inventory_batches(household_id,product_id,location_id,quantity,base_unit,expiry,receipt_line_id)
    values(r.household_id,p.id,l.location_id,q,u,l.expiry,l.id) returning id into b;
   insert into public.stock_movements(household_id,batch_id,operation_id,actor_id,delta,balance,reason) values(r.household_id,b,p_operation,auth.uid(),q,q,'receipt');
   batches:=batches||jsonb_build_array(jsonb_build_object('batch_id',b,'line_id',l.id,'quantity',q::text,'base_unit',u));
 end loop;
 v_result:=jsonb_build_object('receipt_id',r.id,'operation_id',p_operation,'batches',batches);
 update public.inventory_operations o set result=v_result where o.household_id=r.household_id and o.id=p_operation;
 update public.receipt_imports set confirmation=v_result,status='confirmed',revision=revision+1 where id=r.id;
 return v_result;
end; $$;

-- A persistent token makes deletion retryable without racing verified source replacement.
create function public.begin_receipt_deletion(p_receipt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.receipt_imports;
begin
 select * into r from public.receipt_imports where id=p_receipt for update;
 if not found or not private.is_member(r.household_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if r.verified_hash is null then raise exception 'Verify the source first' using errcode='22023'; end if;
 if r.source_deleted_at is not null then return jsonb_build_object('deleted',true); end if;
 update public.receipt_imports set deletion_token=coalesce(deletion_token,gen_random_uuid()) where id=r.id returning * into r;
 return jsonb_build_object('deleted',false,'path',coalesce(r.source_path,r.object_path),'token',r.deletion_token);
end; $$;
create function public.finish_receipt_deletion(p_receipt uuid,p_user uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.receipt_imports r set source_deleted_at=now(),deletion_token=null where id=p_receipt and deletion_token=p_token
 and exists(select 1 from public.household_memberships m where m.household_id=r.household_id and m.user_id=p_user);
 if not found then raise exception 'Deletion changed. Retry.' using errcode='40001'; end if;
end; $$;
revoke all on function public.finish_receipt_deletion(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_receipt_deletion(uuid,uuid,uuid) to service_role;
create or replace function public.finalize_receipt_upload(p_receipt uuid,p_user uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.receipt_imports; v_canonical uuid;
begin
  select * into v_row from public.receipt_imports where id=p_receipt for update;
  if not found or v_row.uploaded_by <> p_user or not exists(select 1 from public.household_memberships where household_id=v_row.household_id and user_id=p_user) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash' using errcode='22023'; end if;
  if v_row.status <> 'uploading' then return jsonb_build_object('id',coalesce(v_row.canonical_id,v_row.id),'duplicate',v_row.status='duplicate'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_row.household_id::text||p_hash,0));
  select id into v_canonical from public.receipt_imports where household_id=v_row.household_id and verified_hash=p_hash;
  if v_canonical is not null then
    perform 1 from public.receipt_imports where id=v_canonical for update;
    if exists(select 1 from public.receipt_imports where id=v_canonical and deletion_token is not null) then raise exception 'Source deletion pending. Retry later.' using errcode='40001'; end if;
    update public.receipt_imports set source_path=v_row.object_path,source_deleted_at=null where id=v_canonical and source_deleted_at is not null;
    update public.receipt_imports set status='duplicate',canonical_id=v_canonical where id=v_row.id;
  else
    update public.receipt_imports set status='uploaded',verified_hash=p_hash where id=v_row.id; v_canonical:=v_row.id;
  end if;
  return jsonb_build_object('id',v_canonical,'duplicate',v_canonical<>v_row.id);
end; $$;

revoke all on function public.save_receipt_review(uuid,integer,jsonb,jsonb), public.receipt_duplicate_candidates(uuid), public.confirm_receipt(uuid,integer,uuid,uuid[]), public.begin_receipt_deletion(uuid) from public,anon;
grant execute on function public.save_receipt_review(uuid,integer,jsonb,jsonb), public.receipt_duplicate_candidates(uuid), public.confirm_receipt(uuid,integer,uuid,uuid[]), public.begin_receipt_deletion(uuid) to authenticated;
