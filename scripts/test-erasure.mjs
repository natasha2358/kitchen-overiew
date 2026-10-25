import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { localBackend } from "./local-backend.mjs";
const settings = localBackend();
const url =
  process.env.FUNCTIONS_TEST_URL || `${settings.API_URL}/functions/v1`;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/functions\/v1$/.test(url))
  throw new Error("Local function endpoint required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  settings.API_URL,
  settings.SERVICE_ROLE_KEY,
  options,
);
const db = new pg.Client({ connectionString: settings.DB_URL });
await db.connect();
const fixtures = [];
const suffix = randomUUID().replaceAll("-", "");
const trigger = `fixture_erasure_${suffix}`;
function ok(r) {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}
async function call(token, password, action, extra = {}) {
  return fetch(`${url}/erase-account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: settings.ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      password,
      confirmation: "DELETE MY ACCOUNT",
      action,
      ...extra,
    }),
  });
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `erasure-${randomUUID()}@example.test`,
      password = `Fixture-${randomUUID()}`;
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    const api = createClient(settings.API_URL, settings.ANON_KEY, options);
    const session = ok(
      await api.auth.signInWithPassword({ email, password }),
    ).session;
    const household = ok(
      await api.rpc("bootstrap_household", { p_timezone: "UTC" }),
    );
    fixtures.push({
      user: user.id,
      api,
      email,
      password,
      token: session.access_token,
      household,
    });
  }
  const [a, b] = fixtures;
  const location = ok(
    await a.api.from("storage_locations").select("id").limit(1),
  )[0].id;
  ok(
    await a.api.rpc("mutate_inventory", {
      p_household: a.household,
      p_operation: randomUUID(),
      p_request: {
        action: "create",
        name: "Erasure fixture rice",
        base_unit: "g",
        quantity: "100",
        location_id: location,
      },
    }),
  );
  ok(
    await a.api.rpc("mutate_shopping", {
      p_household: a.household,
      p_operation: randomUUID(),
      p_request: {
        action: "shopping_save",
        id: randomUUID(),
        revision: 0,
        label: "Fixture item",
        unit: "item",
        quantity: "1",
        product_id: null,
        checked: false,
        removed: false,
      },
    }),
  );
  ok(
    await a.api.rpc("save_planned_meal", {
      p_household: a.household,
      p_operation: randomUUID(),
      p_request: {
        action: "plan_save",
        id: randomUUID(),
        revision: 0,
        title: "Fixture plan",
        planned_on: "2026-10-26",
        slot: "lunch",
        servings: 1,
        suggestion_id: null,
        recipe_index: null,
        cancelled: false,
      },
    }),
  );
  const pdf = await readFile(
    new URL("../tests/fixtures/receipts/synthetic-text.pdf", import.meta.url),
  );
  const receipts = [];
  for (let i = 0; i < 2; i++) {
    const receipt = ok(
      await a.api.rpc("prepare_receipt", {
        p_household: a.household,
        p_operation: randomUUID(),
        p_filename: "fixture.pdf",
      }),
    );
    receipts.push(receipt.id);
    ok(
      await a.api.storage
        .from("receipts")
        .upload(receipt.object_path, pdf, { contentType: "application/pdf" }),
    );
  }
  assert.equal((await call("invalid", a.password, "prepare")).status, 401);
  assert.equal((await call(a.token, "wrong password", "prepare")).status, 403);
  assert.equal(
    (await call(b.token, b.password, "prepare", { user_id: a.user })).status,
    400,
  );
  assert.ok(
    (await b.api.rpc("begin_account_erasure", { p_user: a.user })).error,
  );
  assert.equal(ok(await a.api.from("households").select("id")).length, 1);
  const prepared = await call(a.token, a.password, "prepare");
  assert.equal(prepared.status, 200);
  const manifest = await prepared.json();
  assert.equal(manifest.household_id, a.household);
  assert.deepEqual(manifest.receipt_ids.sort(), receipts.sort());
  assert.equal(ok(await a.api.from("products").select("id")).length, 0);
  assert.ok((await a.api.rpc("bootstrap_household")).error);
  assert.ok(
    (
      await admin.storage
        .from("receipts")
        .upload(`${a.household}/late/source.pdf`, pdf, {
          contentType: "application/pdf",
        })
    ).error,
  );
  assert.ok(
    (await admin.rpc("purge_account_household", { p_user: a.user })).error,
    "private files must be removed first",
  );
  assert.equal((await call(a.token, a.password, "prepare")).status, 200);
  // Inject a failure only for this disposable household, then prove retry recovery.
  await db.query(
    `create function private.${trigger}() returns trigger language plpgsql as $$ begin if starts_with(old.name,'${a.household}/') then raise exception 'fixture failure'; end if; return old; end $$`,
  );
  await db.query(
    `create trigger ${trigger} before delete on storage.objects for each row execute function private.${trigger}()`,
  );
  assert.equal((await call(a.token, a.password, "continue")).status, 503);
  assert.equal(
    (
      await db.query(
        "select state from private.account_erasure_jobs where user_id=$1",
        [a.user],
      )
    ).rows[0].state,
    "frozen",
  );
  assert.ok(ok(await admin.auth.admin.getUserById(a.user)).user);
  await db.query(`drop trigger ${trigger} on storage.objects`);
  await db.query(`drop function private.${trigger}()`);
  a.token = ok(
    await a.api.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    }),
  ).session.access_token;
  const result = await call(a.token, a.password, "continue");
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).deleted, true);
  assert.ok((await admin.auth.admin.getUserById(a.user)).error);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from storage.objects where bucket_id='receipts' and starts_with(name,$1)",
        [`${a.household}/`],
      )
    ).rows[0].n,
    0,
  );
  for (const table of [
    "households",
    "household_memberships",
    "products",
    "inventory_batches",
    "stock_movements",
    "inventory_operations",
    "receipt_imports",
    "receipt_lines",
    "food_preferences",
    "meal_suggestions",
    "cooking_confirmations",
    "list_operations",
    "shopping_items",
    "planned_meals",
  ]) {
    const column = table === "households" ? "id" : "household_id";
    assert.equal(
      (
        await db.query(
          `select count(*)::int n from public.${table} where ${column}=$1`,
          [a.household],
        )
      ).rows[0].n,
      0,
    );
  }
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from private.account_erasure_jobs where user_id=$1",
        [a.user],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(ok(await b.api.from("households").select("id")).length, 1);
  console.log(
    "PASS password-confirmed erasure, foreign-target denial, write/upload freeze, injected Storage failure recovery, full household/Storage/Auth removal and other-account preservation",
  );
} finally {
  await db.query(`drop trigger if exists ${trigger} on storage.objects`);
  await db.query(`drop function if exists private.${trigger}()`);
  // Clean up only accounts created by this test; never reset or truncate user data.
  for (const fixture of fixtures) {
    const exists = await admin.auth.admin.getUserById(fixture.user);
    if (!exists.error) {
      ok(await admin.rpc("begin_account_erasure", { p_user: fixture.user }));
      const batch = ok(
        await admin.rpc("account_erasure_batch", { p_user: fixture.user }),
      );
      if (batch.paths.length)
        ok(await admin.storage.from("receipts").remove(batch.paths));
      ok(await admin.rpc("purge_account_household", { p_user: fixture.user }));
      ok(await admin.auth.admin.deleteUser(fixture.user));
    }
    ok(await admin.rpc("finish_account_erasure", { p_user: fixture.user }));
  }
  await db.end();
}
