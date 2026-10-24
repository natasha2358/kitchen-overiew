create table public.receipt_imports (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
  uploaded_by uuid not null references auth.users(id), upload_operation uuid not null,
  filename text not null check(length(filename) between 1 and 200), object_path text not null unique,
  status text not null default 'uploading' check(status in ('uploading','uploaded','review_ready','duplicate')),
  verified_hash text check(verified_hash ~ '^[0-9a-f]{64}$'), canonical_id uuid,
  revision integer not null default 1, created_at timestamptz not null default now(),
  unique(household_id,id), unique(household_id,upload_operation), unique(household_id,verified_hash),
  foreign key(household_id,canonical_id) references public.receipt_imports(household_id,id),
  check((status='duplicate' and canonical_id is not null and verified_hash is null) or (status<>'duplicate' and canonical_id is null))
);
create table public.receipt_lines (
  id uuid primary key, household_id uuid not null, receipt_id uuid not null,
  source_label text not null check(length(source_label) between 1 and 500),
  proposed jsonb, reviewed_name text check(length(reviewed_name) <= 120),
  quantity numeric(20,6) check(quantity > 0 and quantity < 1000000000000), unit text check(unit in ('g','kg','ml','l','item')),
  product_id uuid, location_id uuid, expiry date, included boolean not null default true,
  check(unit is distinct from 'item' or quantity is null or trunc(quantity)=quantity),
  foreign key(household_id,receipt_id) references public.receipt_imports(household_id,id),
  foreign key(household_id,product_id) references public.products(household_id,id),
  foreign key(household_id,location_id) references public.storage_locations(household_id,id)
);
create index receipt_lines_import on public.receipt_lines(household_id,receipt_id);
alter table public.receipt_imports enable row level security;
alter table public.receipt_lines enable row level security;
create policy receipt_read on public.receipt_imports for select to authenticated using(private.is_member(household_id));
create policy line_read on public.receipt_lines for select to authenticated using(private.is_member(household_id));
revoke all on public.receipt_imports, public.receipt_lines from anon, authenticated;
grant select on public.receipt_imports, public.receipt_lines to authenticated;

create function public.prepare_receipt(p_household uuid,p_operation uuid,p_filename text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.receipt_imports; v_id uuid := gen_random_uuid();
begin
  if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_filename is null or length(p_filename) not between 1 and 200 then raise exception 'Invalid upload' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_household::text||p_operation::text,0));
  select * into v_row from public.receipt_imports where household_id=p_household and upload_operation=p_operation;
  if found then
    if v_row.filename <> p_filename then raise exception 'Upload ID reused' using errcode='40001'; end if;
  else
    insert into public.receipt_imports(id,household_id,uploaded_by,upload_operation,filename,object_path)
    values(v_id,p_household,auth.uid(),p_operation,p_filename,p_household::text||'/'||v_id::text||'/source.pdf') returning * into v_row;
  end if;
  return jsonb_build_object('id',v_row.id,'object_path',v_row.object_path,'status',v_row.status);
end; $$;

create function public.finalize_receipt_upload(p_receipt uuid,p_user uuid,p_hash text) returns jsonb
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
    update public.receipt_imports set status='duplicate',canonical_id=v_canonical where id=v_row.id;
  else
    update public.receipt_imports set status='uploaded',verified_hash=p_hash where id=v_row.id; v_canonical:=v_row.id;
  end if;
  return jsonb_build_object('id',v_canonical,'duplicate',v_canonical<>v_row.id);
end; $$;
revoke all on function public.finalize_receipt_upload(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_receipt_upload(uuid,uuid,text) to service_role;

create function public.save_receipt_review(p_receipt uuid,p_revision integer,p_lines jsonb) returns integer
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
  update public.receipt_imports set revision=revision+1,status='review_ready' where id=v_row.id returning revision into p_revision;
  return p_revision;
end; $$;
create function public.get_receipt_review(p_receipt uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'filename',r.filename,'canonical_id',r.canonical_id,'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'source_label',l.source_label,'proposed',l.proposed,'reviewed_name',l.reviewed_name,'quantity',l.quantity::text,'unit',l.unit,'product_id',l.product_id,'location_id',l.location_id,'expiry',l.expiry,'included',l.included) order by l.id) from public.receipt_lines l where l.receipt_id=r.id),'[]'::jsonb)) from public.receipt_imports r where r.id=p_receipt;
$$;
revoke all on function public.prepare_receipt(uuid,uuid,text), public.save_receipt_review(uuid,integer,jsonb), public.get_receipt_review(uuid) from public,anon;
grant execute on function public.prepare_receipt(uuid,uuid,text), public.save_receipt_review(uuid,integer,jsonb), public.get_receipt_review(uuid) to authenticated;

