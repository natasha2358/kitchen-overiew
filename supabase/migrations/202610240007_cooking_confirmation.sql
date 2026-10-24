create table public.cooking_confirmations (
 id uuid not null, household_id uuid not null references public.households(id),
 suggestion_id uuid, recipe_index integer, snapshot jsonb not null, result jsonb not null,
 actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(household_id,id),
 foreign key(household_id,id) references public.inventory_operations(household_id,id),
 foreign key(household_id,suggestion_id) references public.meal_suggestions(household_id,id),
 check((suggestion_id is null and recipe_index is null) or (suggestion_id is not null and recipe_index>=0))
);
alter table public.cooking_confirmations enable row level security;
create policy household_read on public.cooking_confirmations for select to authenticated using(private.is_member(household_id));
revoke all on public.cooking_confirmations from anon,authenticated;
grant select on public.cooking_confirmations to authenticated;
alter table public.stock_movements add column cooking_id uuid,
 add foreign key(household_id,cooking_id) references public.cooking_confirmations(household_id,id);

create function public.confirm_cooking(p_household uuid,p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.inventory_operations; v_result jsonb; ingredient jsonb; allocation jsonb;
 b public.inventory_batches; p public.products; suggestion public.meal_suggestions;
 total numeric; tracked numeric; untracked numeric; amount numeric; balance numeric; unit text;
 batch_ids uuid[]:='{}'; ingredient_ids text[]:='{}'; ingredient_key text; movements jsonb:='[]';
 today date; preference_rev integer; exclusions text[]; dietary text[]; names text[];
 suggestion_id uuid:=(p_request->>'suggestion_id')::uuid; recipe_index integer:=(p_request->>'recipe_index')::integer;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_operation is null or jsonb_typeof(p_request) is distinct from 'object' then raise exception 'Invalid cooking request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||p_operation::text,0));
 select * into prior from public.inventory_operations where household_id=p_household and id=p_operation;
 if found then
   if prior.request<>p_request then raise exception 'Operation ID reused with changed contents' using errcode='40001'; end if;
   return prior.result;
 end if;
 -- Preference updates cannot race acceptance of this cooking review.
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||'preferences',0));
 select revision,excluded,f.dietary into preference_rev,exclusions,dietary from public.food_preferences f where household_id=p_household;
 if coalesce(preference_rev,0) is distinct from (p_request->>'preference_revision')::integer then raise exception 'Preferences changed. Review again.' using errcode='40001'; end if;
 exclusions:=coalesce(exclusions,'{}'); dietary:=coalesce(dietary,'{}');
 if dietary && array['vegetarian','vegan'] then exclusions:=exclusions||array['beef','pork','chicken','turkey','lamb','fish','salmon','tuna','shrimp','bacon','ham','gelatin']; end if;
 if 'vegan'=any(dietary) then exclusions:=exclusions||array['milk','butter','cheese','cream','egg','eggs','yogurt','honey']; end if;
 if 'gluten_free'=any(dietary) then exclusions:=exclusions||array['wheat','barley','rye','couscous','semolina']; end if;
 select (now() at time zone timezone)::date into today from public.households where id=p_household;
 if suggestion_id is not null then
   select * into suggestion from public.meal_suggestions where household_id=p_household and id=suggestion_id and status='completed';
   if not found or recipe_index is null or recipe_index<0 or recipe_index>=jsonb_array_length(suggestion.recipes) then raise exception 'Suggestion unavailable' using errcode='22023'; end if;
 elsif recipe_index is not null then raise exception 'Invalid recipe reference' using errcode='22023'; end if;
 if jsonb_typeof(p_request->'ingredients') is distinct from 'array' or jsonb_array_length(p_request->'ingredients') not between 1 and 30 then raise exception 'Review ingredients' using errcode='22023'; end if;
 -- Validate every shape before expanding and locking batch references.
 for ingredient in select value from jsonb_array_elements(p_request->'ingredients') loop
   if jsonb_typeof(ingredient) is distinct from 'object' or jsonb_typeof(ingredient->'allocations') is distinct from 'array' or jsonb_array_length(ingredient->'allocations')>100 then raise exception 'Invalid allocations' using errcode='22023'; end if;
 end loop;
 -- Consistent global UUID order prevents opposite allocation order deadlocks.
 perform b0.id from public.inventory_batches b0 where b0.household_id=p_household and b0.id in (
   select (a->>'batch_id')::uuid from jsonb_array_elements(p_request->'ingredients') i cross join lateral jsonb_array_elements(i->'allocations') a
 ) order by b0.id for update;
 insert into public.inventory_operations(household_id,id,request,result) values(p_household,p_operation,p_request,'{}');
 insert into public.cooking_confirmations(id,household_id,suggestion_id,recipe_index,snapshot,result,actor_id)
 values(p_operation,p_household,suggestion_id,recipe_index,p_request,'{}',auth.uid());
 for ingredient in select value from jsonb_array_elements(p_request->'ingredients') loop
   unit:=ingredient->>'unit';
   if unit is null or unit not in ('g','ml','item') or length(btrim(ingredient->>'name')) not between 1 and 120 or ingredient->>'name' is null then raise exception 'Invalid ingredient' using errcode='22023'; end if;
   total:=private.quantity(ingredient->>'quantity'); untracked:=private.quantity(ingredient->>'untracked_quantity'); tracked:=0;
   if total<=0 or total>=1000000000000 or untracked>total then raise exception 'Invalid actual quantity' using errcode='22023'; end if;
   if unit='item' and (trunc(total)<>total or trunc(untracked)<>untracked) then raise exception 'Items must be whole' using errcode='22023'; end if;
   if untracked>0 and (ingredient->>'untracked_confirmed')::boolean is distinct from true then raise exception 'Explicitly confirm untracked usage' using errcode='22023'; end if;
   p:=null;
   if ingredient->>'product_id' is not null then
     select * into p from public.products where household_id=p_household and id=(ingredient->>'product_id')::uuid for share;
     if not found or p.base_unit<>unit then raise exception 'Invalid product or unit' using errcode='22023'; end if;
   elsif jsonb_array_length(ingredient->'allocations')>0 then raise exception 'Resolve product before allocating stock' using errcode='22023'; end if;
   ingredient_key:=coalesce(p.id::text,public.normalize_product_name(ingredient->>'name'));
   if ingredient_key=any(ingredient_ids) then raise exception 'Combine repeated ingredients' using errcode='22023'; end if;
   ingredient_ids:=array_append(ingredient_ids,ingredient_key);
   names:=array[ingredient->>'name',p.name]||coalesce(p.aliases,'{}');
   if exists(select 1 from unnest(exclusions) x cross join unnest(names) n where position(' '||public.normalize_product_name(x)||' ' in ' '||public.normalize_product_name(n)||' ')>0) then raise exception 'Ingredient conflicts with saved preferences' using errcode='22023'; end if;
   for allocation in select value from jsonb_array_elements(ingredient->'allocations') loop
     amount:=private.quantity(allocation->>'quantity');
     if amount<=0 or (unit='item' and trunc(amount)<>amount) then raise exception 'Invalid allocated quantity' using errcode='22023'; end if;
     select * into b from public.inventory_batches where household_id=p_household and id=(allocation->>'batch_id')::uuid;
     if not found or b.product_id is distinct from p.id or b.base_unit<>unit then raise exception 'Batch unavailable for this ingredient' using errcode='22023'; end if;
     if b.id=any(batch_ids) then raise exception 'Repeated batch allocation' using errcode='22023'; end if;
     batch_ids:=array_append(batch_ids,b.id);
     if b.revision is distinct from (allocation->>'revision')::integer or (b.expiry is not null and b.expiry<today) then raise exception 'Stock changed or expired. Refresh review.' using errcode='40001'; end if;
     balance:=b.quantity-amount;
     if balance<0 then raise exception 'Insufficient stock' using errcode='22023'; end if;
     update public.inventory_batches set quantity=balance,revision=revision+1 where id=b.id;
     insert into public.stock_movements(household_id,batch_id,operation_id,actor_id,delta,balance,reason,cooking_id)
     values(p_household,b.id,p_operation,auth.uid(),-amount,balance,'cook',p_operation);
     tracked:=tracked+amount;
     movements:=movements||jsonb_build_array(jsonb_build_object('batch_id',b.id,'used',amount::text,'remaining',balance::text,'unit',unit));
   end loop;
   if tracked+untracked<>total then raise exception 'Tracked plus explicitly untracked must equal actual usage' using errcode='22023'; end if;
 end loop;
 v_result:=jsonb_build_object('cooking_id',p_operation,'movements',movements);
 update public.inventory_operations set result=v_result where household_id=p_household and id=p_operation;
 update public.cooking_confirmations set result=v_result where household_id=p_household and id=p_operation;
 return v_result;
end; $$;
revoke all on function public.confirm_cooking(uuid,uuid,jsonb) from public,anon;
grant execute on function public.confirm_cooking(uuid,uuid,jsonb) to authenticated;
