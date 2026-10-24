import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testMeals(db, { a, b, h, asUser, denied }) {
  await asUser(a);
  assert.equal(
    (
      await db.query("select public.save_food_preferences($1,0,$2,$3,2) as r", [
        h,
        ["vegetarian"],
        ["peanut"],
      ])
    ).rows[0].r,
    1,
  );
  await denied("select public.save_food_preferences($1,0,$2,$3,2)", [
    h,
    [],
    [],
  ]);
  const p = (
    await db.query(
      "insert into public.products(household_id,name,base_unit) values($1,'M6 salt','g') returning id",
      [h],
    )
  ).rows[0].id;
  const before = (
    await db.query("select count(*) as n from public.stock_movements")
  ).rows[0].n;
  await db.query(
    "update public.products set always_available=true where id=$1",
    [p],
  );
  const id = randomUUID();
  const request = (
    await db.query(
      "select public.begin_meal_suggestion($1,$2,'fixture-model','test-v1') as r",
      [h, id],
    )
  ).rows[0].r;
  assert.equal(request.snapshot.preferences.revision, 1);
  assert.equal(
    (await db.query("select count(*) as n from public.stock_movements")).rows[0]
      .n,
    before,
  );
  await denied(
    "select public.begin_meal_suggestion($1,$2,'fixture-model','test-v1')",
    [h, id],
  );
  await denied("update public.meal_suggestions set status='completed'");
  await denied("select public.finish_meal_suggestion($1,$2,$3,'[]')", [
    h,
    id,
    request.attempt,
  ]);
  await asUser(b);
  assert.equal(
    (await db.query("select * from public.meal_suggestions where id=$1", [id]))
      .rowCount,
    0,
  );
  await denied("select public.meal_context($1)", [h]);
  await denied("select public.save_food_preferences($1,1,$2,$3,2)", [
    h,
    [],
    [],
  ]);
  await asUser(a);
  await db.query("select public.save_food_preferences($1,1,$2,$3,3)", [
    h,
    [],
    [],
  ]);
  await db.query("reset role");
  await db.query("set local role service_role");
  await denied("select public.finish_meal_suggestion($1,$2,$3,'[]')", [
    h,
    id,
    request.attempt,
  ]);
  await db.query("reset role");
}
