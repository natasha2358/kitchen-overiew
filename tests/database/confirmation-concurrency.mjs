import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
export async function testConfirmationConcurrency(connectionString) {
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  const user = randomUUID();
  let household;
  async function rpc(sql, args) {
    const c = new pg.Client({ connectionString });
    await c.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      await c.query("set local role authenticated");
      const result = (await c.query(sql, args)).rows[0].r;
      await c.query("commit");
      return result;
    } finally {
      await c.query("rollback");
      await c.end();
    }
  }
  try {
    await admin.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, `${user}@example.test`],
    );
    await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    household = (await admin.query("select public.bootstrap_household() as id"))
      .rows[0].id;
    const location = (
      await admin.query(
        "select id from public.storage_locations where household_id=$1 limit 1",
        [household],
      )
    ).rows[0].id;
    const receipt = (
      await rpc("select public.prepare_receipt($1,$2,'concurrency.pdf') as r", [
        household,
        randomUUID(),
      ])
    ).id;
    await admin.query("select public.finalize_receipt_upload($1,$2,$3)", [
      receipt,
      user,
      "c".repeat(64),
    ]);
    const line = {
      id: randomUUID(),
      source_label: "Concurrent rice",
      reviewed_name: "Concurrent rice",
      quantity: "10",
      unit: "g",
      location_id: location,
      product_id: null,
      expiry: null,
      included: true,
    };
    await rpc("select public.save_receipt_review($1,1,$2) as r", [
      receipt,
      JSON.stringify([line]),
    ]);
    const confirmations = await Promise.all([
      rpc("select public.confirm_receipt($1,2,$2) as r", [
        receipt,
        randomUUID(),
      ]),
      rpc("select public.confirm_receipt($1,2,$2) as r", [
        receipt,
        randomUUID(),
      ]),
    ]);
    assert.deepEqual(confirmations[0], confirmations[1]);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from public.inventory_batches where receipt_line_id=$1",
          [line.id],
        )
      ).rows[0].n,
      1,
    );
    const batch = confirmations[0].batches[0].batch_id;
    const product = (
      await admin.query(
        "select product_id from public.inventory_batches where id=$1",
        [batch],
      )
    ).rows[0].product_id;
    const cooking = {
      action: "cook",
      suggestion_id: null,
      recipe_index: null,
      preference_revision: 0,
      ingredients: [
        {
          name: "Concurrent rice",
          product_id: product,
          unit: "g",
          quantity: "6",
          untracked_quantity: "0",
          untracked_confirmed: false,
          allocations: [{ batch_id: batch, revision: 1, quantity: "6" }],
        },
      ],
    };
    const race = await Promise.allSettled([
      rpc("select public.confirm_cooking($1,$2,$3) as r", [
        household,
        randomUUID(),
        cooking,
      ]),
      rpc("select public.confirm_cooking($1,$2,$3) as r", [
        household,
        randomUUID(),
        cooking,
      ]),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(race.filter((r) => r.status === "rejected").length, 1);
    assert.equal(
      (
        await admin.query(
          "select quantity::text from public.inventory_batches where id=$1",
          [batch],
        )
      ).rows[0].quantity,
      "4.000000",
    );
    const repeat = {
      ...cooking,
      ingredients: [
        {
          ...cooking.ingredients[0],
          quantity: "2",
          allocations: [{ batch_id: batch, revision: 2, quantity: "2" }],
        },
      ],
    };
    const op = randomUUID();
    const retries = await Promise.all([
      rpc("select public.confirm_cooking($1,$2,$3) as r", [
        household,
        op,
        repeat,
      ]),
      rpc("select public.confirm_cooking($1,$2,$3) as r", [
        household,
        op,
        repeat,
      ]),
    ]);
    assert.deepEqual(retries[0], retries[1]);
    assert.equal(
      (
        await admin.query(
          "select quantity::text from public.inventory_batches where id=$1",
          [batch],
        )
      ).rows[0].quantity,
      "2.000000",
    );

    const planId = randomUUID();
    await rpc("select public.save_planned_meal($1,$2,$3) as r", [
      household,
      randomUUID(),
      {
        action: "plan_save",
        id: planId,
        revision: 0,
        title: "Concurrent planned meal",
        planned_on: "2026-10-26",
        slot: "lunch",
        servings: 1,
        suggestion_id: null,
        recipe_index: null,
        cancelled: false,
      },
    ]);
    const plannedCooking = {
      ...cooking,
      plan_id: planId,
      plan_revision: 1,
      ingredients: [
        {
          ...cooking.ingredients[0],
          quantity: "1",
          allocations: [{ batch_id: batch, revision: 3, quantity: "1" }],
        },
      ],
    };
    const plannedResults = await Promise.all([
      rpc("select public.confirm_cooking($1,$2,$3) as r", [
        household,
        randomUUID(),
        plannedCooking,
      ]),
      rpc("select public.confirm_cooking($1,$2,$3) as r", [
        household,
        randomUUID(),
        plannedCooking,
      ]),
    ]);
    assert.deepEqual(plannedResults[0], plannedResults[1]);
    assert.equal(
      (
        await admin.query(
          "select quantity::text from public.inventory_batches where id=$1",
          [batch],
        )
      ).rows[0].quantity,
      "1.000000",
    );
    console.log(
      "PASS receipt single confirmation and concurrent cooking/retry protection and single planned-meal cooking",
    );
  } finally {
    // Only random records created by this suite are removed; never reset a database.
    if (household)
      for (const table of [
        "planned_meals",
        "shopping_items",
        "list_operations",
        "stock_movements",
        "cooking_confirmations",
        "inventory_operations",
        "inventory_batches",
        "receipt_lines",
        "receipt_imports",
        "meal_suggestions",
        "food_preferences",
        "products",
        "storage_locations",
        "household_memberships",
      ])
        await admin.query(`delete from public.${table} where household_id=$1`, [
          household,
        ]);
    if (household)
      await admin.query("delete from public.households where id=$1", [
        household,
      ]);
    await admin.query("delete from auth.users where id=$1", [user]);
    await admin.end();
  }
}
