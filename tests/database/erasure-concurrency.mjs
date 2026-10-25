import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
export async function testErasureConcurrency(connectionString) {
  const admin = new pg.Client({ connectionString }),
    writer = new pg.Client({ connectionString }),
    eraser = new pg.Client({ connectionString }),
    late = new pg.Client({ connectionString });
  await Promise.all([admin, writer, eraser, late].map((c) => c.connect()));
  const user = randomUUID();
  let household;
  let freezing;
  try {
    await admin.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, `freeze-${user}@example.test`],
    );
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    household = (await admin.query("select public.bootstrap_household() as id"))
      .rows[0].id;
    const p1 = randomUUID(),
      p2 = randomUUID();
    await admin.query(
      "insert into public.products(id,household_id,name,base_unit) values($1,$3,'Freeze A','g'),($2,$3,'Freeze B','g')",
      [p1, p2, household],
    );
    for (const c of [writer, late]) {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      await c.query("set local role authenticated");
    }
    await writer.query(
      "update public.products set name='Before freeze' where id=$1",
      [p1],
    );
    await eraser.query("set statement_timeout='10s'");
    await eraser.query("set role service_role");
    await eraser.query("begin");
    freezing = eraser
      .query("select public.begin_account_erasure($1)", [user])
      .then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      waiting = (
        await admin.query(
          "select wait_event_type='Lock' as waiting from pg_stat_activity where pid=$1",
          [eraser.processID],
        )
      ).rows[0]?.waiting;
      if (waiting) break;
      await delay(20);
    }
    assert.ok(waiting, "erasure must wait for an in-flight write to commit");
    await writer.query(
      "update public.products set name='Existing transaction completes' where id=$1",
      [p2],
    );
    await writer.query("commit");
    assert.deepEqual(await freezing, { ok: true });
    await assert.rejects(
      late.query("update public.products set name='Late write' where id=$1", [
        p2,
      ]),
      (error) => error.code === "40001",
    );
    await late.query("rollback");
    await eraser.query("commit");
    await writer.query("begin");
    await writer.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    await writer.query("set local role authenticated");
    await assert.rejects(
      writer.query(
        "insert into public.products(household_id,name,base_unit) values($1,'After freeze','g')",
        [household],
      ),
    );
    await writer.query("rollback");
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from public.products where household_id=$1",
          [household],
        )
      ).rows[0].n,
      2,
    );
    console.log(
      "PASS erasure waits for in-flight writes, rejects later writes and avoids reverse-lock deadlock",
    );
  } finally {
    await writer.query("rollback");
    await late.query("rollback");
    if (freezing) await freezing;
    await eraser.query("rollback");
    if (household) {
      await admin.query("select public.begin_account_erasure($1)", [user]);
      await admin.query("select public.purge_account_household($1)", [user]);
    }
    await admin.query("delete from auth.users where id=$1", [user]);
    await admin.query("select public.finish_account_erasure($1)", [user]);
    await Promise.all([admin, writer, eraser, late].map((c) => c.end()));
  }
}
