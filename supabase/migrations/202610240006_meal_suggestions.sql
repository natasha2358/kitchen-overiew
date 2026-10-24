create table public.food_preferences (
 household_id uuid primary key references public.households(id),
 dietary text[] not null default '{}' check(dietary <@ array['vegetarian','vegan','gluten_free']),
 excluded text[] not null default '{}' check(cardinality(excluded)<=100 and length(excluded::text)<=10000),
 servings integer not null default 2 check(servings between 1 and 12), revision integer not null default 1
);
create table public.meal_suggestions (
 id uuid not null, household_id uuid not null references public.households(id),
 status text not null check(status in ('pending','completed','failed')), attempt uuid not null,
 attempts integer not null default 1 check(attempts between 1 and 2), lease_until timestamptz not null,
 snapshot jsonb not null, recipes jsonb, error_code text, model text not null, prompt_version text not null,
 created_at timestamptz not null default now(), primary key(household_id,id), unique(id)
);
do $$ declare t text; begin
 foreach t in array array['food_preferences','meal_suggestions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy household_read on public.%I for select to authenticated using(private.is_member(household_id))',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant update(always_available) on public.products to authenticated;

create function public.save_food_preferences(p_household uuid,p_revision integer,p_dietary text[],p_excluded text[],p_servings integer) returns integer
language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||'preferences',0));
 select revision into rev from public.food_preferences where household_id=p_household;
 if coalesce(rev,0) is distinct from p_revision then raise exception 'Preferences changed. Reload.' using errcode='40001'; end if;
 if exists(select 1 from unnest(p_excluded) x where x is null or length(btrim(x)) not between 1 and 120) then raise exception 'Invalid exclusions' using errcode='22023'; end if;
 insert into public.food_preferences(household_id,dietary,excluded,servings,revision)
 values(p_household,p_dietary,p_excluded,p_servings,coalesce(rev,0)+1)
 on conflict(household_id) do update set dietary=excluded.dietary,excluded=excluded.excluded,servings=excluded.servings,revision=excluded.revision;
 return coalesce(rev,0)+1;
end; $$;
create function public.meal_context(p_household uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ctx jsonb;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 select jsonb_build_object('today',(now() at time zone h.timezone)::date,'timezone',h.timezone,
 'preferences',coalesce((select jsonb_build_object('dietary',f.dietary,'excluded',f.excluded,'servings',f.servings,'revision',f.revision) from public.food_preferences f where f.household_id=h.id),'{"dietary":[],"excluded":[],"servings":2,"revision":0}'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'aliases',p.aliases,'base_unit',p.base_unit,'always_available',p.always_available) order by p.id) from public.products p where p.household_id=h.id),'[]'::jsonb),
 'batches',public.get_inventory(h.id)) into ctx from public.households h where h.id=p_household;
 return ctx;
end; $$;
create function public.begin_meal_suggestion(p_household uuid,p_request uuid,p_model text,p_prompt text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.meal_suggestions; ctx jsonb;
begin
 if not private.is_member(p_household) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_request is null or length(p_model) not between 1 and 100 or length(p_prompt) not between 1 and 100 then raise exception 'Invalid generation request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||'meal-generation',0));
 select * into r from public.meal_suggestions where household_id=p_household and id=p_request for update;
 if found then
   if r.status='completed' then return to_jsonb(r); end if;
   if r.status='pending' and r.lease_until>now() then raise exception 'Generation pending. Reopen later.' using errcode='40001'; end if;
   if r.attempts>=2 then raise exception 'Attempt budget exhausted. Start a new request.' using errcode='22023'; end if;
 else
   if (select count(*) from public.meal_suggestions where household_id=p_household and created_at>now()-interval '10 minutes')>=5 then raise exception 'Generation limit reached. Try later.' using errcode='P0001'; end if;
 end if;
 ctx:=public.meal_context(p_household);
 if jsonb_array_length(ctx->'products')>500 or jsonb_array_length(ctx->'batches')>5000 then raise exception 'Kitchen exceeds suggestion input limit' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(ctx->'products') p where (p->>'always_available')::boolean)
 and not exists(select 1 from jsonb_array_elements(ctx->'batches') b where (b->>'quantity')::numeric>0 and (b->>'expiry' is null or (b->>'expiry')::date >= (ctx->>'today')::date)) then raise exception 'Add usable groceries or designate staples first' using errcode='22023'; end if;
 insert into public.meal_suggestions(id,household_id,status,attempt,lease_until,snapshot,model,prompt_version)
 values(p_request,p_household,'pending',gen_random_uuid(),now()+interval '90 seconds',ctx,p_model,p_prompt)
 on conflict(household_id,id) do update set status='pending',attempt=excluded.attempt,attempts=public.meal_suggestions.attempts+1,lease_until=excluded.lease_until,snapshot=excluded.snapshot,model=excluded.model,prompt_version=excluded.prompt_version,error_code=null
 returning * into r;
 return to_jsonb(r);
end; $$;
create function public.finish_meal_suggestion(p_household uuid,p_request uuid,p_attempt uuid,p_recipes jsonb,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_error is null and (p_recipes is null or jsonb_typeof(p_recipes)<>'array' or jsonb_array_length(p_recipes)>3) then raise exception 'Invalid recipes' using errcode='22023'; end if;
 update public.meal_suggestions s set recipes=case when p_error is null then p_recipes else null end,
 status=case when p_error is null then 'completed' else 'failed' end,error_code=p_error
 where household_id=p_household and id=p_request and attempt=p_attempt and status='pending' and lease_until>now()
 and coalesce((select revision from public.food_preferences where household_id=p_household),0)=(s.snapshot->'preferences'->>'revision')::integer;
 if not found then raise exception 'Generation expired or preferences changed. Retry.' using errcode='40001'; end if;
end; $$;
revoke all on function public.finish_meal_suggestion(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_meal_suggestion(uuid,uuid,uuid,jsonb,text) to service_role;
revoke all on function public.save_food_preferences(uuid,integer,text[],text[],integer),public.meal_context(uuid),public.begin_meal_suggestion(uuid,uuid,text,text) from public,anon;
grant execute on function public.save_food_preferences(uuid,integer,text[],text[],integer),public.meal_context(uuid),public.begin_meal_suggestion(uuid,uuid,text,text) to authenticated;
