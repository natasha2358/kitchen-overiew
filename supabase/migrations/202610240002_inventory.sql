create function public.normalize_product_name(value text) returns text
language sql immutable set search_path = '' as $$ select lower(btrim(regexp_replace(value, '\s+', ' ', 'g'))); $$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  name text not null check (length(public.normalize_product_name(name)) between 1 and 120),
  normalized_name text generated always as (public.normalize_product_name(name)) stored,
  base_unit text not null check (base_unit in ('g','ml','item')),
  aliases text[] not null default '{}' check (cardinality(aliases) <= 50),
  always_available boolean not null default false,
  unique (household_id, id), unique (household_id, id, base_unit), unique (household_id, normalized_name)
);
create table public.inventory_batches (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id),
  product_id uuid not null, location_id uuid not null,
  quantity numeric(20,6) not null check (quantity >= 0 and quantity < 1000000000000),
  base_unit text not null check (base_unit in ('g','ml','item')),
  expiry date, acquired_at timestamptz not null default now(), revision integer not null default 1 check (revision > 0),
  package_count integer, package_size numeric(20,6),
  check (base_unit <> 'item' or (trunc(quantity) = quantity and (package_size is null or trunc(package_size)=package_size))),
  check ((package_count is null and package_size is null) or (package_count > 0 and package_size > 0)),
  unique (household_id, id),
  foreign key (household_id, product_id, base_unit) references public.products(household_id, id, base_unit),
  foreign key (household_id, location_id) references public.storage_locations(household_id, id)
);
create index batch_household_expiry on public.inventory_batches(household_id, expiry);
create table public.inventory_operations (
  household_id uuid not null references public.households(id), id uuid not null,
  request jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(household_id, id)
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  batch_id uuid not null, operation_id uuid not null, actor_id uuid not null references auth.users(id),
  delta numeric(20,6) not null, balance numeric(20,6) not null check(balance >= 0),
  reason text not null check(reason in ('create','add','adjust','waste','move','edit','remove')),
  created_at timestamptz not null default now(),
  foreign key(household_id,batch_id) references public.inventory_batches(household_id,id),
  foreign key(household_id,operation_id) references public.inventory_operations(household_id,id)
);
create index movement_household_batch on public.stock_movements(household_id,batch_id);

create function private.prevent_product_dimension_change() returns trigger
language plpgsql set search_path = '' as $$ begin
  if new.base_unit <> old.base_unit and exists(select 1 from public.inventory_batches where product_id = old.id) then
    raise exception 'A product with stock history cannot change unit dimension' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger product_dimension before update on public.products for each row execute function private.prevent_product_dimension_change();

do $$ declare t text; begin
  foreach t in array array['products','inventory_batches','inventory_operations','stock_movements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy household_read on public.%I for select to authenticated using (private.is_member(household_id))',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
create policy product_insert on public.products for insert to authenticated with check(private.is_member(household_id));
create policy product_update on public.products for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy product_delete on public.products for delete to authenticated using(private.is_member(household_id));
grant insert, update(name, base_unit, aliases), delete on public.products to authenticated;

create function private.quantity(value text) returns numeric
language plpgsql immutable set search_path = '' as $$ begin
  if value is null or value !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then raise exception 'Invalid decimal quantity' using errcode='22023'; end if;
  return value::numeric;
end; $$;
revoke all on function private.quantity(text) from public, anon, authenticated;

create function public.mutate_inventory(p_household uuid, p_operation uuid, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_action text := p_request->>'action'; v_existing public.inventory_operations;
  v_batch public.inventory_batches; v_product public.products; v_location uuid;
  v_quantity numeric; v_before numeric := 0; v_delta numeric; v_result jsonb; v_expiry date;
  v_packages integer; v_size numeric;
begin
  if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or jsonb_typeof(p_request) <> 'object' then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_household::text || p_operation::text, 0));
  select * into v_existing from public.inventory_operations where household_id=p_household and id=p_operation;
  if found then
    if v_existing.request <> p_request then raise exception 'Operation ID reused with different contents' using errcode='40001'; end if;
    return v_existing.result;
  end if;
  if v_action is null or v_action not in ('create','add','adjust','waste','move','edit','remove') then raise exception 'Invalid action' using errcode='22023'; end if;
  if p_request ? 'expiry' and p_request->>'expiry' is not null then
    if p_request->>'expiry' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD' using errcode='22023'; end if;
    v_expiry := (p_request->>'expiry')::date;
  end if;
  if v_action = 'create' then
    v_location := (p_request->>'location_id')::uuid;
    if not exists(select 1 from public.storage_locations where household_id=p_household and id=v_location) then raise exception 'Invalid location' using errcode='22023'; end if;
    if p_request->>'product_id' is not null then
      select * into v_product from public.products where household_id=p_household and id=(p_request->>'product_id')::uuid;
      if not found then raise exception 'Invalid product' using errcode='22023'; end if;
    else
      insert into public.products(household_id,name,base_unit) values(p_household,btrim(p_request->>'name'),p_request->>'base_unit')
        on conflict(household_id,normalized_name) do nothing;
      select * into v_product from public.products where household_id=p_household and normalized_name=public.normalize_product_name(p_request->>'name');
    end if;
    if v_product.base_unit is distinct from p_request->>'base_unit' then raise exception 'Incompatible unit' using errcode='22023'; end if;
    v_quantity := private.quantity(p_request->>'quantity');
    if v_quantity <= 0 then raise exception 'Quantity must be positive' using errcode='22023'; end if;
    if p_request ? 'package_count' then
      v_packages := (p_request->>'package_count')::integer; v_size := private.quantity(p_request->>'package_size');
      if v_packages is null or v_packages < 1 or v_size <= 0 or v_packages * v_size <> v_quantity then raise exception 'Invalid package quantities' using errcode='22023'; end if;
    end if;
    insert into public.inventory_batches(household_id,product_id,location_id,quantity,base_unit,expiry,package_count,package_size)
      values(p_household,v_product.id,v_location,v_quantity,v_product.base_unit,v_expiry,v_packages,v_size) returning * into v_batch;
  else
    select * into v_batch from public.inventory_batches where household_id=p_household and id=(p_request->>'batch_id')::uuid for update;
    if not found then raise exception 'Batch unavailable' using errcode='22023'; end if;
    if v_batch.revision is distinct from (p_request->>'revision')::integer then raise exception 'Stock changed. Refresh and review.' using errcode='40001'; end if;
    if p_request->>'base_unit' is distinct from v_batch.base_unit then raise exception 'Incompatible unit' using errcode='22023'; end if;
    v_before := v_batch.quantity; v_quantity := v_before;
    if v_action in ('add','waste','adjust') then
      v_quantity := private.quantity(p_request->>'quantity');
      if v_action in ('add','waste') and v_quantity <= 0 then raise exception 'Quantity must be positive' using errcode='22023'; end if;
      if v_action='add' then v_quantity := v_before+v_quantity; end if;
      if v_action='waste' then v_quantity := v_before-v_quantity; end if;
    elsif v_action='remove' then v_quantity := 0;
    elsif v_action='move' then
      v_location := (p_request->>'location_id')::uuid;
      if not exists(select 1 from public.storage_locations where household_id=p_household and id=v_location) then raise exception 'Invalid location' using errcode='22023'; end if;
      v_batch.location_id := v_location;
    elsif v_action='edit' then
      if not (p_request ? 'expiry') then raise exception 'Expiry required (nullable)' using errcode='22023'; end if;
      v_batch.expiry := v_expiry;
    end if;
    if v_quantity < 0 then raise exception 'Insufficient stock' using errcode='22023'; end if;
    update public.inventory_batches set quantity=v_quantity, location_id=v_batch.location_id, expiry=v_batch.expiry, revision=revision+1 where id=v_batch.id returning * into v_batch;
  end if;
  v_delta := v_quantity-v_before;
  v_result := jsonb_build_object('batch_id',v_batch.id,'quantity',v_batch.quantity::text,'revision',v_batch.revision);
  insert into public.inventory_operations(household_id,id,request,result) values(p_household,p_operation,p_request,v_result);
  insert into public.stock_movements(household_id,batch_id,operation_id,actor_id,delta,balance,reason)
    values(p_household,v_batch.id,p_operation,auth.uid(),v_delta,v_batch.quantity,v_action);
  return v_result;
end; $$;
revoke all on function public.mutate_inventory(uuid,uuid,jsonb) from public, anon;
grant execute on function public.mutate_inventory(uuid,uuid,jsonb) to authenticated;

-- JSON contracts deliberately encode decimal values as strings, never JS numbers.
create function public.get_inventory(p_household uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'product_id',b.product_id,'name',p.name,'location_id',b.location_id,'location',l.name,'quantity',b.quantity::text,'base_unit',b.base_unit,'expiry',b.expiry,'revision',b.revision,'acquired_at',b.acquired_at) order by b.expiry nulls last, b.acquired_at, b.id),'[]'::jsonb)
  from public.inventory_batches b join public.products p on p.id=b.product_id join public.storage_locations l on l.id=b.location_id where b.household_id=p_household;
$$;
create function public.get_batch_history(p_household uuid,p_batch uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'delta',delta::text,'balance',balance::text,'reason',reason,'created_at',created_at) order by created_at desc,id),'[]'::jsonb) from public.stock_movements where household_id=p_household and batch_id=p_batch;
$$;
revoke all on function public.get_inventory(uuid), public.get_batch_history(uuid,uuid), public.normalize_product_name(text) from public, anon;
grant execute on function public.get_inventory(uuid), public.get_batch_history(uuid,uuid), public.normalize_product_name(text) to authenticated;
