import assert from "node:assert/strict";
export async function testErasure(db, { a, b, h, h2, asUser, denied }) {
  await asUser(a);
  await denied("select public.begin_account_erasure($1)", [a]);
  await denied("select public.purge_account_household($1)", [b]);
  await denied("select * from private.account_erasure_jobs");
  await db.query("reset role");
  await db.query("set local role service_role");
  await db.query("select public.begin_account_erasure($1)", [a]);
  await db.query("select public.begin_account_erasure($1)", [a]);
  const batch = (
    await db.query("select public.account_erasure_batch($1) as r", [a])
  ).rows[0].r;
  assert.equal(batch.state, "frozen");
  assert.equal(batch.household_id, h);
  assert.ok(batch.receipt_ids.length > 0);
  await asUser(a);
  assert.equal(
    (await db.query("select * from public.products where household_id=$1", [h]))
      .rowCount,
    0,
  );
  await denied("select public.bootstrap_household()");
  await denied(
    "insert into public.products(household_id,name,base_unit) values($1,'Late product','g')",
    [h],
  );
  await db.query("reset role");
  await db.query("set local role service_role");
  await denied(
    "insert into public.products(household_id,name,base_unit) values($1,'Late service product','g')",
    [h],
  );
  await denied("select public.finish_account_erasure($1)", [a]);
  await db.query("reset role");
  await db.query(
    `create function private.fixture_purge_failure() returns trigger language plpgsql as $$ begin if old.household_id='${h}'::uuid then raise exception 'fixture failure'; end if; return old; end $$`,
  );
  await db.query(
    "create trigger fixture_purge_failure before delete on public.products for each row execute function private.fixture_purge_failure()",
  );
  const before = (
    await db.query(
      "select count(*)::int n from public.inventory_batches where household_id=$1",
      [h],
    )
  ).rows[0].n;
  await db.query("set local role service_role");
  await denied("select public.purge_account_household($1)", [a]);
  await db.query("reset role");
  assert.equal(
    (
      await db.query(
        "select state from private.account_erasure_jobs where user_id=$1",
        [a],
      )
    ).rows[0].state,
    "frozen",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.inventory_batches where household_id=$1",
        [h],
      )
    ).rows[0].n,
    before,
  );
  await db.query("drop trigger fixture_purge_failure on public.products");
  await db.query("drop function private.fixture_purge_failure()");
  await db.query("set local role service_role");
  await db.query("select public.purge_account_household($1)", [a]);
  await db.query("select public.purge_account_household($1)", [a]);
  assert.equal(
    (await db.query("select * from public.households where id=$1", [h]))
      .rowCount,
    0,
  );
  assert.equal(
    (await db.query("select * from public.households where id=$1", [h2]))
      .rowCount,
    1,
  );
  await asUser(a);
  await denied("select public.bootstrap_household()");
  await db.query("reset role");
  await db.query("delete from auth.users where id=$1", [a]);
  await db.query("set local role service_role");
  await db.query("select public.finish_account_erasure($1)", [a]);
  await db.query("reset role");
  assert.equal(
    (
      await db.query(
        "select * from private.account_erasure_jobs where user_id=$1",
        [a],
      )
    ).rowCount,
    0,
  );
}
