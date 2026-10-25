import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testShopping(db, { a, b, h, asUser, denied }) {
  await asUser(a);
  const count = async () =>
    (
      await db.query(
        "select count(*)::int n from public.stock_movements where household_id=$1",
        [h],
      )
    ).rows[0].n;
  const before = await count();
  const id = randomUUID(),
    op = randomUUID();
  const request = {
    action: "shopping_save",
    id,
    revision: 0,
    label: "Shopping oats",
    quantity: "250.5",
    unit: "g",
    product_id: null,
    checked: false,
    removed: false,
  };
  const saved = (
    await db.query("select public.mutate_shopping($1,$2,$3) as r", [
      h,
      op,
      request,
    ])
  ).rows[0].r;
  assert.equal(saved.quantity, "250.500000");
  assert.deepEqual(
    (
      await db.query("select public.mutate_shopping($1,$2,$3) as r", [
        h,
        op,
        request,
      ])
    ).rows[0].r,
    saved,
  );
  await denied("select public.mutate_shopping($1,$2,$3)", [
    h,
    op,
    { ...request, quantity: "999" },
  ]);
  await denied("select public.mutate_shopping($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 0, checked: true },
  ]);
  await db.query("select public.mutate_shopping($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, revision: 1, checked: true },
  ]);
  assert.equal(await count(), before);
  await denied("select public.mutate_shopping($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, id: randomUUID(), unit: "item", quantity: "0.5" },
  ]);
  await denied("update public.shopping_items set checked=false");
  await asUser(b);
  assert.equal(
    (await db.query("select public.get_shopping($1) as r", [h])).rows[0].r
      .length,
    0,
  );
  await denied("select public.mutate_shopping($1,$2,$3)", [
    h,
    randomUUID(),
    request,
  ]);
  const foreign = (
    await db.query(
      "insert into public.products(household_id,name,base_unit) select household_id,'Other shopping product','g' from public.household_memberships where user_id=$1 returning id",
      [b],
    )
  ).rows[0].id;
  await asUser(a);
  await denied("select public.mutate_shopping($1,$2,$3)", [
    h,
    randomUUID(),
    { ...request, id: randomUUID(), product_id: foreign },
  ]);
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
        name: "Shopping oil",
        base_unit: "ml",
        quantity: "0.3",
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
      "select public.begin_meal_suggestion($1,$2,'fixture','shopping-test') as r",
      [h, randomUUID()],
    )
  ).rows[0].r;
  const recipe = {
    title: "Fixture meal",
    servings: generation.snapshot.preferences.servings,
    ingredients: [
      {
        name: "Shopping oil",
        product_id: product,
        unit: "ml",
        quantity: "0.5",
      },
    ],
    steps: ["Use oil."],
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
  const shortage = {
    action: "shopping_shortage",
    suggestion_id: generation.id,
    recipe_index: 0,
    ingredient_index: 0,
  };
  const imported = (
    await db.query("select public.mutate_shopping($1,$2,$3) as r", [
      h,
      randomUUID(),
      shortage,
    ])
  ).rows[0].r;
  assert.equal(imported.quantity, "0.200000");
  assert.equal(
    (
      await db.query("select public.mutate_shopping($1,$2,$3) as r", [
        h,
        randomUUID(),
        shortage,
      ])
    ).rows[0].r.id,
    imported.id,
  );
  assert.equal(
    (
      await db.query(
        "select quantity::text from public.inventory_batches where id=$1",
        [batch.batch_id],
      )
    ).rows[0].quantity,
    "0.300000",
  );
  await db.query("reset role");
}
