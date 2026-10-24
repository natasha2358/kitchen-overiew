import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testCooking(db, { a, b, h, h2, asUser, denied }) {
  await asUser(a);
  const location = (
    await db.query(
      "select id from public.storage_locations where household_id=$1 limit 1",
      [h],
    )
  ).rows[0].id;
  const created = (
    await db.query("select public.mutate_inventory($1,$2,$3) as r", [
      h,
      randomUUID(),
      {
        action: "create",
        name: "M7 oil",
        base_unit: "ml",
        quantity: "10",
        location_id: location,
      },
    ])
  ).rows[0].r;
  const product = (
    await db.query(
      "select product_id from public.inventory_batches where id=$1",
      [created.batch_id],
    )
  ).rows[0].product_id;
  const revision = (await db.query("select public.meal_context($1) as r", [h]))
    .rows[0].r.preferences.revision;
  const actual = {
    name: "M7 oil",
    product_id: product,
    unit: "ml",
    quantity: "15",
    untracked_quantity: "5",
    untracked_confirmed: true,
    allocations: [{ batch_id: created.batch_id, revision: 1, quantity: "10" }],
  };
  const request = {
    action: "cook",
    suggestion_id: null,
    recipe_index: null,
    preference_revision: revision,
    ingredients: [actual],
  };
  const op = randomUUID();
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    op,
    { ...request, ingredients: [{ ...actual, untracked_confirmed: false }] },
  ]);
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [created.batch_id],
      )
    ).rows[0].quantity,
    "10.000000",
  );
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    op,
    {
      ...request,
      ingredients: [
        actual,
        {
          name: "Invalid",
          product_id: null,
          unit: "g",
          quantity: "1",
          untracked_quantity: "0",
          untracked_confirmed: false,
          allocations: [],
        },
      ],
    },
  ]);
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [created.batch_id],
      )
    ).rows[0].quantity,
    "10.000000",
  );
  assert.equal(
    (
      await db.query("select * from public.cooking_confirmations where id=$1", [
        op,
      ])
    ).rowCount,
    0,
  );
  const cooked = (
    await db.query("select public.confirm_cooking($1,$2,$3) as r", [
      h,
      op,
      request,
    ])
  ).rows[0].r;
  assert.equal(cooked.movements.length, 1);
  assert.equal(cooked.movements[0].remaining, "0.000000");
  assert.equal(
    (
      await db.query(
        "select delta::text from public.stock_movements where cooking_id=$1",
        [op],
      )
    ).rows[0].delta,
    "-10.000000",
  );
  assert.deepEqual(
    (
      await db.query("select public.confirm_cooking($1,$2,$3) as r", [
        h,
        op,
        request,
      ])
    ).rows[0].r,
    cooked,
  );
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    randomUUID(),
    request,
  ]);
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    op,
    { ...request, ingredients: [] },
  ]);
  await asUser(b);
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    randomUUID(),
    request,
  ]);
  assert.equal(
    (
      await db.query("select * from public.cooking_confirmations where id=$1", [
        op,
      ])
    ).rowCount,
    0,
  );
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h2,
    randomUUID(),
    { ...request, preference_revision: 0 },
  ]);
  await asUser(a);
  const untracked = {
    action: "cook",
    suggestion_id: null,
    recipe_index: null,
    preference_revision: revision,
    ingredients: [
      {
        name: "Salt",
        product_id: null,
        unit: "g",
        quantity: "1",
        untracked_quantity: "1",
        untracked_confirmed: true,
        allocations: [],
      },
    ],
  };
  const salt = (
    await db.query("select public.confirm_cooking($1,$2,$3) as r", [
      h,
      randomUUID(),
      untracked,
    ])
  ).rows[0].r;
  assert.deepEqual(salt.movements, []);
  assert.equal(
    (
      await db.query(
        "select * from public.stock_movements where cooking_id=$1",
        [salt.cooking_id],
      )
    ).rowCount,
    0,
  );
  await denied("delete from public.cooking_confirmations");
  await db.query("reset role");
}
