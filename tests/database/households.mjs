import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testHouseholds(db) {
  const a = randomUUID(), b = randomUUID(), unverified = randomUUID();
  await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,'a@example.test',now()),($2,'b@example.test',now()),($3,'pending@example.test',null)", [a,b,unverified]);
  async function asUser(user) { await db.query('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]); await db.query('set local role authenticated'); }
  async function denied(sql, args=[]) { await db.query('savepoint denied'); await assert.rejects(db.query(sql,args)); await db.query('rollback to savepoint denied'); }
  await asUser(a);
  const h = (await db.query("select public.bootstrap_household('Europe/Skopje') as id")).rows[0].id;
  assert.equal((await db.query("select public.bootstrap_household('UTC') as id")).rows[0].id,h);
  assert.equal((await db.query('select * from public.storage_locations')).rowCount,3);
  await denied('insert into public.household_memberships(household_id,user_id) values($1,$2)',[h,b]);
  await denied("update public.households set name='forged'");
  await asUser(b);
  const h2 = (await db.query('select public.bootstrap_household() as id')).rows[0].id;
  assert.notEqual(h,h2);
  assert.equal((await db.query('select * from public.households where id=$1',[h])).rowCount,0);
  assert.equal((await db.query('select * from public.storage_locations where household_id=$1',[h])).rowCount,0);
  await denied("insert into public.storage_locations(household_id,name) values($1,'Forged')",[h]);
  assert.equal((await db.query("update public.storage_locations set name='Forged' where household_id=$1",[h])).rowCount,0);
  await asUser(unverified); await denied('select public.bootstrap_household()');
  await db.query('reset role'); await db.query('set local role anon');
  await denied('select * from public.households'); await denied('select public.bootstrap_household()');
  await db.query('reset role');
  return { a,b,h,h2, asUser,denied };
}
