import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { localBackend } from "./local-backend.mjs";
const settings = localBackend();
const functionURL =
  process.env.FUNCTIONS_TEST_URL || `${settings.API_URL}/functions/v1`;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/functions\/v1$/.test(functionURL))
  throw new Error("Function tests require a loopback endpoint");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  settings.API_URL,
  settings.SERVICE_ROLE_KEY,
  options,
);
const db = new pg.Client({ connectionString: settings.DB_URL });
await db.connect();
const users = [],
  households = [],
  paths = [];
function ok(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
try {
  const clients = [];
  for (let i = 0; i < 2; i++) {
    const email = `kitchen-test-${randomUUID()}@example.test`,
      password = `Local-test-${randomUUID()}`;
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    users.push(user.id);
    const client = createClient(settings.API_URL, settings.ANON_KEY, options);
    assert.ok(
      (
        await client.auth.signInWithPassword({
          email,
          password: "wrong-password",
        })
      ).error,
    );
    ok(await client.auth.signInWithPassword({ email, password }));
    clients.push(client);
    const h = ok(
      await client.rpc("bootstrap_household", { p_timezone: "UTC" }),
    );
    households.push(h);
  }
  const [a, b] = clients,
    [h] = households;
  assert.equal(
    ok(await b.from("households").select("*").eq("id", h)).length,
    0,
  );
  const pdf = await readFile(
    new URL("../tests/fixtures/receipts/synthetic-text.pdf", import.meta.url),
  );
  const receipt = ok(
    await a.rpc("prepare_receipt", {
      p_household: h,
      p_operation: randomUUID(),
      p_filename: "synthetic-text.pdf",
    }),
  );
  paths.push(receipt.object_path);
  ok(
    await a.storage
      .from("receipts")
      .upload(receipt.object_path, pdf, { contentType: "application/pdf" }),
  );
  assert.ok(
    (
      await a.storage.from("receipts").upload(receipt.object_path, pdf, {
        contentType: "application/pdf",
        upsert: true,
      })
    ).error,
    "overwrite must fail",
  );
  assert.ok(
    (await b.storage.from("receipts").download(receipt.object_path)).error,
    "foreign PDF must be private",
  );
  assert.ok(
    (
      await b.storage
        .from("receipts")
        .upload(`${h}/${randomUUID()}/source.pdf`, pdf, {
          contentType: "application/pdf",
        })
    ).error,
    "forged path must fail",
  );
  const aToken = ok(await a.auth.getSession()).session.access_token,
    bToken = ok(await b.auth.getSession()).session.access_token;
  async function edge(name, token, id) {
    return fetch(`${functionURL}/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: settings.ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ receipt_id: id }),
    });
  }
  assert.equal((await edge("verify-receipt", bToken, receipt.id)).status, 404);
  assert.equal(
    (await edge("verify-receipt", "invalid", receipt.id)).status,
    401,
  );
  const verified = await edge("verify-receipt", aToken, receipt.id);
  assert.equal(verified.status, 200, await verified.clone().text());
  assert.equal((await verified.json()).id, receipt.id);
  const duplicate = ok(
    await a.rpc("prepare_receipt", {
      p_household: h,
      p_operation: randomUUID(),
      p_filename: "same-bytes.pdf",
    }),
  );
  paths.push(duplicate.object_path);
  ok(
    await a.storage
      .from("receipts")
      .upload(duplicate.object_path, pdf, { contentType: "application/pdf" }),
  );
  const dedup = await edge("verify-receipt", aToken, duplicate.id);
  assert.equal(dedup.status, 200);
  assert.equal((await dedup.json()).id, receipt.id);
  const racePdf = await readFile(
    new URL(
      "../tests/fixtures/receipts/synthetic-image-only.pdf",
      import.meta.url,
    ),
  );
  const racing = [];
  for (let i = 0; i < 2; i++) {
    const item = ok(
      await a.rpc("prepare_receipt", {
        p_household: h,
        p_operation: randomUUID(),
        p_filename: "image-only.pdf",
      }),
    );
    paths.push(item.object_path);
    ok(
      await a.storage
        .from("receipts")
        .upload(item.object_path, racePdf, { contentType: "application/pdf" }),
    );
    racing.push(item);
  }
  const verifiedRace = await Promise.all(
    racing.map(async (item) => {
      const response = await edge("verify-receipt", aToken, item.id);
      assert.equal(response.status, 200);
      return response.json();
    }),
  );
  assert.equal(
    verifiedRace[0].id,
    verifiedRace[1].id,
    "concurrent identical uploads share one canonical receipt",
  );
  for (const [filename, status] of [
    ["rewe-style-readable-protected.pdf", 200],
    ["password-required.pdf", 422],
  ]) {
    const protectedReceipt = ok(
      await a.rpc("prepare_receipt", {
        p_household: h,
        p_operation: randomUUID(),
        p_filename: filename,
      }),
    );
    paths.push(protectedReceipt.object_path);
    ok(
      await a.storage
        .from("receipts")
        .upload(
          protectedReceipt.object_path,
          await readFile(
            new URL(`../tests/fixtures/receipts/${filename}`, import.meta.url),
          ),
          { contentType: "application/pdf" },
        ),
    );
    const result = await edge("verify-receipt", aToken, protectedReceipt.id);
    assert.equal(result.status, status, `${filename}: ${await result.text()}`);
  }
  const malformed = ok(
    await a.rpc("prepare_receipt", {
      p_household: h,
      p_operation: randomUUID(),
      p_filename: "not-a-pdf.pdf",
    }),
  );
  paths.push(malformed.object_path);
  ok(
    await a.storage
      .from("receipts")
      .upload(malformed.object_path, Buffer.from("invalid PDF"), {
        contentType: "application/pdf",
      }),
  );
  assert.equal(
    (await edge("verify-receipt", aToken, malformed.id)).status,
    422,
  );
  assert.equal(
    (await edge("delete-receipt-source", bToken, receipt.id)).status,
    409,
  );
  assert.equal(
    (await edge("delete-receipt-source", "invalid", receipt.id)).status,
    401,
  );
  assert.equal(
    (await edge("delete-receipt-source", aToken, receipt.id)).status,
    200,
  );
  assert.equal(
    (await edge("delete-receipt-source", aToken, receipt.id)).status,
    200,
  );
  assert.ok(
    (await a.storage.from("receipts").download(receipt.object_path)).error,
  );
  const retained = ok(
    await a
      .from("receipt_imports")
      .select("verified_hash,source_deleted_at")
      .eq("id", receipt.id)
      .single(),
  );
  assert.ok(retained.verified_hash && retained.source_deleted_at);
  const replacement = ok(
    await a.rpc("prepare_receipt", {
      p_household: h,
      p_operation: randomUUID(),
      p_filename: "replacement.pdf",
    }),
  );
  paths.push(replacement.object_path);
  ok(
    await a.storage
      .from("receipts")
      .upload(replacement.object_path, pdf, { contentType: "application/pdf" }),
  );
  const restored = await edge("verify-receipt", aToken, replacement.id);
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).id, receipt.id);
  const current = ok(
    await a
      .from("receipt_imports")
      .select("source_path,source_deleted_at")
      .eq("id", receipt.id)
      .single(),
  );
  assert.equal(current.source_path, replacement.object_path);
  assert.equal(current.source_deleted_at, null);
  const disabled = await edge("parse-receipt", aToken, receipt.id);
  assert.equal(disabled.status, 501);
  assert.equal((await disabled.json()).code, "PARSING_NOT_CONFIGURED");
  assert.equal(
    ok(await a.rpc("get_inventory", { p_household: h })).length,
    0,
    "upload and verification cannot mutate stock",
  );
  ok(await a.auth.signOut());
  assert.equal(ok(await a.auth.getSession()).session, null);
  console.log(
    "PASS real Auth login/rejection/logout, household API isolation, private Storage upload/read/overwrite denial, Edge authentication, PDF verification, duplicate identity, invalid file rejection, explicit parsing boundary, unchanged inventory",
  );
} finally {
  if (paths.length) ok(await admin.storage.from("receipts").remove(paths));
  for (const h of households) {
    await db.query(
      "update public.receipt_imports set canonical_id=null,status='uploading' where household_id=$1",
      [h],
    );
    for (const table of [
      "receipt_lines",
      "receipt_imports",
      "stock_movements",
      "inventory_operations",
      "inventory_batches",
      "products",
      "storage_locations",
      "household_memberships",
    ])
      await db.query(`delete from public.${table} where household_id=$1`, [h]);
    await db.query("delete from public.households where id=$1", [h]);
  }
  for (const user of users) ok(await admin.auth.admin.deleteUser(user));
  await db.end();
}
