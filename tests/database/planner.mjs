import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testPlanner(db, { a, b, h, h2, asUser, denied }) {
  await asUser(a);
  const location = (
    await db.query(
      "select id from public.storage_locations where household_id=$1 limit 1",
      [h],
    )
  ).rows[0].id;
  const batch = (
    await db.query("select public.mutate_inventory($1,$2,$3) as r", [
      h,
      randomUUID(),
      {
        action: "create",
        name: "Planner oil",
        base_unit: "ml",
        quantity: "10",
        location_id: location,
      },
    ])
  ).rows[0].r;
  const product = (
    await db.query(
      "select product_id from public.inventory_batches where id=$1",
      [batch.batch_id],
    )
  ).rows[0].product_id;
  const generation = (
    await db.query(
      "select public.begin_meal_suggestion($1,$2,'fixture','planner-test') as r",
      [h, randomUUID()],
    )
  ).rows[0].r;
  const recipe = {
    title: "Planner fixture",
    servings: 2,
    ingredients: [
      { name: "Planner oil", product_id: product, quantity: "2.5", unit: "ml" },
    ],
    steps: ["Cook with oil."],
  };
  await db.query("reset role");
  await db.query("set local role service_role");
  await db.query("select public.finish_meal_suggestion($1,$2,$3,$4)", [
    h,
    generation.id,
    generation.attempt,
    JSON.stringify([recipe]),
  ]);
  await asUser(a);
  const id = randomUUID(),
    op = randomUUID();
  const request = {
    action: "plan_save",
    id,
    revision: 0,
    planned_on: "2026-10-26",
    slot: "dinner",
    title: "Planned dinner",
    servings: 4,
    suggestion_id: generation.id,
    recipe_index: 0,
    cancelled: false,
  };
  const plan = (
    await db.query("select public.save_planned_meal($1,$2,$3) as r", [
      h,
      op,
      request,
    ])
  ).rows[0].r;
  assert.equal(plan.cooking_id, null);
  assert.deepEqual(plan.recipe, recipe);
  assert.deepEqual(
    (
      await db.query("select public.save_planned_meal($1,$2,$3) as r", [
        h,
        op,
        request,
      ])
    ).rows[0].r,
    plan,
  );
  await denied("select public.save_planned_meal($1,$2,$3)", [
    h,
    op,
    { ...request, servings: 3 },
  ]);
  await denied("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 0 },
  ]);
  await db.query("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 1, planned_on: "2026-11-02" },
  ]);
  await db.query("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 2, cancelled: true },
  ]);
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [batch.batch_id],
      )
    ).rows[0].quantity,
    "10.000000",
  );
  const ingredient = {
    name: "Planner oil",
    product_id: product,
    quantity: "5",
    unit: "ml",
    untracked_quantity: "0",
    untracked_confirmed: false,
    allocations: [{ batch_id: batch.batch_id, revision: 1, quantity: "5" }],
  };
  const cook = {
    action: "cook",
    plan_id: id,
    plan_revision: 3,
    suggestion_id: generation.id,
    recipe_index: 0,
    preference_revision: generation.snapshot.preferences.revision,
    ingredients: [ingredient],
  };
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    randomUUID(),
    cook,
  ]);
  await asUser(b);
  assert.equal(
    (await db.query("select * from public.planned_meals where id=$1", [id]))
      .rowCount,
    0,
  );
  await denied("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    request,
  ]);
  await denied("select public.save_planned_meal($1,$2,$3)", [
    h2,
    randomUUID(),
    { ...request, id: randomUUID() },
  ]);
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h2,
    randomUUID(),
    { ...cook, preference_revision: 0 },
  ]);
  await asUser(a);
  await denied("update public.planned_meals set cooking_id=$1", [randomUUID()]);
  await db.query("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 3, cancelled: false },
  ]);
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    randomUUID(),
    cook,
  ]);
  await denied("select public.confirm_cooking($1,$2,$3)", [
    h,
    randomUUID(),
    {
      ...cook,
      plan_revision: 4,
      ingredients: [{ ...ingredient, quantity: "6" }],
    },
  ]);
  assert.equal(
    (
      await db.query(
        "select cooking_id from public.planned_meals where id=$1",
        [id],
      )
    ).rows[0].cooking_id,
    null,
  );
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [batch.batch_id],
      )
    ).rows[0].quantity,
    "10.000000",
  );
  const actual = { ...cook, plan_revision: 4 };
  const cookingOp = randomUUID();
  const result = (
    await db.query("select public.confirm_cooking($1,$2,$3) as r", [
      h,
      cookingOp,
      actual,
    ])
  ).rows[0].r;
  assert.equal(
    (
      await db.query(
        "select cooking_id from public.planned_meals where id=$1",
        [id],
      )
    ).rows[0].cooking_id,
    cookingOp,
  );
  assert.deepEqual(
    (
      await db.query("select public.confirm_cooking($1,$2,$3) as r", [
        h,
        randomUUID(),
        actual,
      ])
    ).rows[0].r,
    result,
  );
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [batch.batch_id],
      )
    ).rows[0].quantity,
    "5.000000",
  );
  await denied("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 5, cancelled: true },
  ]);
  const next = randomUUID();
  await db.query("select public.save_planned_meal($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, id: next },
  ]);
  const second = {
    ...actual,
    plan_id: next,
    plan_revision: 1,
    ingredients: [
      {
        ...ingredient,
        quantity: "2",
        allocations: [{ batch_id: batch.batch_id, revision: 2, quantity: "2" }],
      },
    ],
  };
  await db.query("select public.confirm_cooking($1,$2,$3)", [
    h,
    randomUUID(),
    second,
  ]);
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [batch.batch_id],
      )
    ).rows[0].quantity,
    "3.000000",
  );
  await db.query("reset role");
}
