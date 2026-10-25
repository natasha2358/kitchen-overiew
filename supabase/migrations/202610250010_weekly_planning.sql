create table public.planned_meals (
 id uuid primary key,household_id uuid not null references public.households(id),
 planned_on date not null,slot text not null check(slot in ('breakfast','lunch','dinner','snack')),
 title text not null check(length(btrim(title)) between 1 and 160),servings integer not null check(servings between 1 and 12),
 suggestion_id uuid,recipe_index integer,recipe jsonb,revision integer not null default 1,
 cancelled boolean not null default false,cooking_id uuid,created_at timestamptz not null default now(),
 unique(household_id,id),unique(household_id,cooking_id),
 foreign key(household_id,suggestion_id) references public.meal_suggestions(household_id,id),
 foreign key(household_id,cooking_id) references public.cooking_confirmations(household_id,id),
 check((suggestion_id is null and recipe_index is null and recipe is null) or (suggestion_id is not null and recipe_index is not null and recipe_index>=0 and recipe is not null)),
 check(not(cancelled and cooking_id is not null))
);
create index planned_meals_week on public.planned_meals(household_id,planned_on);
alter table public.planned_meals enable row level security;
create policy household_read on public.planned_meals for select to authenticated using(private.is_member(household_id));
revoke all on public.planned_meals from anon,authenticated;
grant select on public.planned_meals to authenticated;
create function public.save_planned_meal(p_household uuid,p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.list_operations; entry public.planned_meals; snapshot jsonb; source public.meal_suggestions;
 source_id uuid:=(p_request->>'suggestion_id')::uuid; idx integer:=(p_request->>'recipe_index')::integer; v_result jsonb;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_operation is null or p_request->>'action' is distinct from 'plan_save' then raise exception 'Invalid plan operation' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||'list'||p_operation::text,0));
 select * into prior from public.list_operations where household_id=p_household and id=p_operation;
 if found then
  if prior.request<>p_request then raise exception 'Operation ID reused' using errcode='40001'; end if;return prior.result;
 end if;
 if source_id is not null then
  select * into source from public.meal_suggestions where household_id=p_household and id=source_id and status='completed';
  if not found or idx is null or idx<0 or idx>=jsonb_array_length(source.recipes) then raise exception 'Recipe unavailable' using errcode='22023'; end if;
  snapshot:=source.recipes->idx;
 elsif idx is not null then raise exception 'Invalid recipe reference' using errcode='22023'; end if;
 if p_request->>'planned_on' is null or p_request->>'planned_on' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD for the planned date' using errcode='22023'; end if;
 select * into entry from public.planned_meals where household_id=p_household and id=(p_request->>'id')::uuid for update;
 if found then
  if entry.cooking_id is not null then raise exception 'A cooked plan is history. Create another meal.' using errcode='22023'; end if;
  if entry.revision is distinct from (p_request->>'revision')::integer then raise exception 'Plan changed. Reload before editing.' using errcode='40001'; end if;
  update public.planned_meals set planned_on=(p_request->>'planned_on')::date,slot=p_request->>'slot',title=btrim(p_request->>'title'),
   servings=(p_request->>'servings')::integer,suggestion_id=source_id,recipe_index=idx,recipe=snapshot,cancelled=(p_request->>'cancelled')::boolean,revision=revision+1
   where id=entry.id returning * into entry;
 else
  if (p_request->>'revision')::integer is distinct from 0 then raise exception 'Plan unavailable' using errcode='40001'; end if;
  insert into public.planned_meals(id,household_id,planned_on,slot,title,servings,suggestion_id,recipe_index,recipe,cancelled)
   values((p_request->>'id')::uuid,p_household,(p_request->>'planned_on')::date,p_request->>'slot',btrim(p_request->>'title'),(p_request->>'servings')::integer,source_id,idx,snapshot,(p_request->>'cancelled')::boolean) returning * into entry;
 end if;
 v_result:=to_jsonb(entry);
 insert into public.list_operations(household_id,id,request,result) values(p_household,p_operation,p_request,v_result);
 return v_result;
end; $$;
revoke all on function public.save_planned_meal(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_planned_meal(uuid,uuid,jsonb) to authenticated;

-- Planning only becomes history in the same transaction as actual cooking.
create or replace function public.confirm_cooking(p_household uuid,p_operation uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_plan public.planned_meals; plan_id uuid:=(p_request->>'plan_id')::uuid; prior public.inventory_operations; v_result jsonb; ingredient jsonb; allocation jsonb;
 b public.inventory_batches; p public.products; suggestion public.meal_suggestions;
 total numeric; tracked numeric; untracked numeric; amount numeric; balance numeric; unit text;
 batch_ids uuid[]:='{}'; ingredient_ids text[]:='{}'; ingredient_key text; movements jsonb:='[]';
 today date; preference_rev integer; exclusions text[]; dietary text[]; names text[];
 suggestion_id uuid:=(p_request->>'suggestion_id')::uuid; recipe_index integer:=(p_request->>'recipe_index')::integer;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_operation is null or jsonb_typeof(p_request) is distinct from 'object' or p_request->>'action' is distinct from 'cook' then raise exception 'Invalid cooking request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||p_operation::text,0));
 select * into prior from public.inventory_operations where household_id=p_household and id=p_operation;
 if found then
   if prior.request<>p_request then raise exception 'Operation ID reused with changed contents' using errcode='40001'; end if;
   return prior.result;
 end if;
 if plan_id is not null then
  select * into v_plan from public.planned_meals where household_id=p_household and id=plan_id for update;
  if not found then raise exception 'Plan unavailable' using errcode='42501'; end if;
  if v_plan.cooking_id is not null then
   select result into v_result from public.cooking_confirmations where household_id=p_household and id=v_plan.cooking_id;
   return v_result;
  end if;
  if v_plan.cancelled or v_plan.revision is distinct from (p_request->>'plan_revision')::integer then raise exception 'Plan changed or cancelled. Reload.' using errcode='40001'; end if;
  if suggestion_id is distinct from v_plan.suggestion_id or recipe_index is distinct from v_plan.recipe_index then raise exception 'Plan recipe changed. Reload.' using errcode='40001'; end if;
 elsif p_request->>'plan_revision' is not null then raise exception 'Invalid plan revision' using errcode='22023'; end if;
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
 if plan_id is not null then
  update public.planned_meals set cooking_id=p_operation,revision=revision+1 where id=plan_id and household_id=p_household;
 end if;
 return v_result;
end; $$;
