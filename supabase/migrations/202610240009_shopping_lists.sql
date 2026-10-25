-- Metadata operations are separate from the stock ledger.
create table public.list_operations (
 household_id uuid not null references public.households(id),id uuid not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(household_id,id)
);
create table public.shopping_items (
 id uuid primary key,household_id uuid not null references public.households(id),
 label text not null check(length(btrim(label)) between 1 and 120),quantity numeric(20,6) not null check(quantity>0 and quantity<1000000000000),
 unit text not null check(unit in ('g','ml','item')),product_id uuid,
 checked boolean not null default false,removed boolean not null default false,revision integer not null default 1,
 source_key text,created_at timestamptz not null default now(),
 check(unit<>'item' or trunc(quantity)=quantity),unique(household_id,id),unique(household_id,source_key),
 foreign key(household_id,product_id) references public.products(household_id,id)
);
do $$ declare t text; begin
 foreach t in array array['list_operations','shopping_items'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy household_read on public.%I for select to authenticated using(private.is_member(household_id))',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create function public.get_shopping(p_household uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',i.quantity::text) order by i.created_at,i.id),'[]') from public.shopping_items i where household_id=p_household;
$$;
create function public.mutate_shopping(p_household uuid,p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.list_operations; item public.shopping_items; recipe jsonb; ingredient jsonb; s public.meal_suggestions;
 q numeric; measured numeric; u text; product uuid; source text; v_result jsonb; today date; idx integer; line_idx integer;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_operation is null or jsonb_typeof(p_request) is distinct from 'object' then raise exception 'Invalid list request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||'list'||p_operation::text,0));
 select * into prior from public.list_operations where household_id=p_household and id=p_operation;
 if found then
 if prior.request<>p_request then raise exception 'Operation ID reused' using errcode='40001'; end if;return prior.result;
 end if;
 if p_request->>'action'='shopping_shortage' then
  select * into s from public.meal_suggestions where household_id=p_household and id=(p_request->>'suggestion_id')::uuid and status='completed';
  idx:=(p_request->>'recipe_index')::integer;line_idx:=(p_request->>'ingredient_index')::integer;
  if not found or idx is null or idx<0 or idx>=jsonb_array_length(s.recipes) then raise exception 'Recipe unavailable' using errcode='22023'; end if;
  recipe:=s.recipes->idx;
  if line_idx is null or line_idx<0 or line_idx>=jsonb_array_length(recipe->'ingredients') then raise exception 'Ingredient unavailable' using errcode='22023'; end if;
  ingredient:=recipe->'ingredients'->line_idx;u:=ingredient->>'unit';product:=(ingredient->>'product_id')::uuid;
  source:=s.id::text||':'||idx::text||':'||line_idx::text;
  select * into item from public.shopping_items where household_id=p_household and source_key=source;
  if not found then
   select (now() at time zone timezone)::date into today from public.households where id=p_household;
   select coalesce(sum(quantity),0) into measured from public.inventory_batches where household_id=p_household and product_id=product and base_unit=u and (expiry is null or expiry>=today);
   q:=greatest(0,private.quantity(ingredient->>'quantity')-measured);
   if q=0 then raise exception 'This ingredient has no measured shortage' using errcode='22023'; end if;
   if product is not null and not exists(select 1 from public.products where household_id=p_household and id=product and base_unit=u) then raise exception 'Product changed. Review recipe again.' using errcode='40001'; end if;
   insert into public.shopping_items(id,household_id,label,quantity,unit,product_id,source_key)
   values(gen_random_uuid(),p_household,ingredient->>'name',q,u,product,source) on conflict(household_id,source_key) do nothing;
   select * into item from public.shopping_items where household_id=p_household and source_key=source;
  end if;
 elsif p_request->>'action'='shopping_save' then
  q:=private.quantity(p_request->>'quantity');u:=p_request->>'unit';product:=(p_request->>'product_id')::uuid;
  if product is not null and not exists(select 1 from public.products where household_id=p_household and id=product and base_unit=u) then raise exception 'Invalid product or unit' using errcode='22023'; end if;
  select * into item from public.shopping_items where household_id=p_household and id=(p_request->>'id')::uuid for update;
  if found then
   if item.revision is distinct from (p_request->>'revision')::integer then raise exception 'Shopping item changed. Reload.' using errcode='40001'; end if;
   update public.shopping_items set label=btrim(p_request->>'label'),quantity=q,unit=u,product_id=product,
    checked=(p_request->>'checked')::boolean,removed=(p_request->>'removed')::boolean,revision=revision+1 where id=item.id returning * into item;
  else
   if (p_request->>'revision')::integer is distinct from 0 then raise exception 'Shopping item unavailable' using errcode='40001'; end if;
   insert into public.shopping_items(id,household_id,label,quantity,unit,product_id,checked,removed)
   values((p_request->>'id')::uuid,p_household,btrim(p_request->>'label'),q,u,product,(p_request->>'checked')::boolean,(p_request->>'removed')::boolean) returning * into item;
  end if;
 else raise exception 'Invalid shopping action' using errcode='22023'; end if;
 v_result:=to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text);
 insert into public.list_operations(household_id,id,request,result) values(p_household,p_operation,p_request,v_result);
 return v_result;
end; $$;
revoke all on function public.get_shopping(uuid),public.mutate_shopping(uuid,uuid,jsonb) from public,anon;
grant execute on function public.get_shopping(uuid),public.mutate_shopping(uuid,uuid,jsonb) to authenticated;
