import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
export async function testConcurrency(connectionString) {
  const admin=new pg.Client({connectionString});await admin.connect();
  const user=randomUUID(); let household;
  async function request(op,body) {
    const c=new pg.Client({connectionString});await c.connect();
    try { await c.query('begin');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await c.query('set local role authenticated');
      const r=(await c.query('select public.mutate_inventory($1,$2,$3) as result',[household,op,body])).rows[0].result;await c.query('commit');return r;
    } finally {await c.query('rollback');await c.end();}
  }
  try {
    await admin.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@example.test`]);
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    household=(await admin.query('select public.bootstrap_household() as id')).rows[0].id;
    const location=(await admin.query('select id from public.storage_locations where household_id=$1 limit 1',[household])).rows[0].id;
    const op=randomUUID(), body={action:'create',name:'Concurrent rice',quantity:'1000',base_unit:'g',location_id:location};
    const results=await Promise.all([request(op,body),request(op,body)]);assert.deepEqual(results[0],results[1]);
    assert.equal((await admin.query('select count(*)::int as n from public.stock_movements where household_id=$1',[household])).rows[0].n,1);
    const waste={action:'waste',batch_id:results[0].batch_id,revision:1,quantity:'600',base_unit:'g'};
    const races=await Promise.allSettled([request(randomUUID(),waste),request(randomUUID(),waste)]);
    assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1);
    assert.equal((await admin.query('select quantity::text from public.inventory_batches where household_id=$1',[household])).rows[0].quantity,'400.000000');
    console.log('PASS concurrent duplicate operation and conflicting stock changes');
  } finally {
    // Delete only this test's random household; never truncate or reset user data.
    if(household) for(const table of ['stock_movements','inventory_operations','inventory_batches','products','storage_locations','household_memberships']) await admin.query(`delete from public.${table} where household_id=$1`,[household]);
    if(household) await admin.query('delete from public.households where id=$1',[household]);
    await admin.query('delete from auth.users where id=$1',[user]);await admin.end();
  }
}
