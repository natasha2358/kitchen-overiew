import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testConfirmation(db, { a, b, h, asUser, denied }) {
  await asUser(a);
  const location = (
    await db.query(
      "select id from public.storage_locations where household_id=$1 limit 1",
      [h],
    )
  ).rows[0].id;
  async function draft(hash) {
    await asUser(a);
    const id = (
      await db.query(
        "select public.prepare_receipt($1,$2,'confirmation.pdf') as r",
        [h, randomUUID()],
      )
    ).rows[0].r.id;
    await db.query("reset role");
    await db.query("set local role service_role");
    await db.query("select public.finalize_receipt_upload($1,$2,$3)", [
      id,
      a,
      hash.repeat(64),
    ]);
    await asUser(a);
    return id;
  }
  const id = await draft("b");
  const line = {
    id: randomUUID(),
    source_label: "M5 rice",
    reviewed_name: "M5 rice",
    quantity: "0.5",
    unit: "kg",
    product_id: null,
    location_id: location,
    expiry: null,
    included: true,
  };
  const invalid = {
    ...line,
    id: randomUUID(),
    reviewed_name: "Unresolved",
    location_id: null,
  };
  await db.query("select public.save_receipt_review($1,1,$2)", [
    id,
    JSON.stringify([line, invalid]),
  ]);
  const op = randomUUID();
  await denied("select public.confirm_receipt($1,2,$2)", [id, op]);
  assert.equal(
    (
      await db.query(
        "select * from public.inventory_batches where receipt_line_id=$1",
        [line.id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await db.query("select * from public.inventory_operations where id=$1", [
        op,
      ])
    ).rowCount,
    0,
  );
  await db.query("select public.save_receipt_review($1,2,$2)", [
    id,
    JSON.stringify([line]),
  ]);
  const result = (
    await db.query("select public.confirm_receipt($1,3,$2) as r", [id, op])
  ).rows[0].r;
  assert.equal(result.batches.length, 1);
  assert.equal(Number(result.batches[0].quantity), 500);
  assert.deepEqual(
    (await db.query("select public.confirm_receipt($1,3,$2) as r", [id, op]))
      .rows[0].r,
    result,
  );
  assert.deepEqual(
    (
      await db.query("select public.confirm_receipt($1,1,$2) as r", [
        id,
        randomUUID(),
      ])
    ).rows[0].r,
    result,
  );
  await denied("select public.confirm_receipt($1,4,$2)", [id, op]);
  await denied("select public.save_receipt_review($1,4,$2)", [id, "[]"]);
  await asUser(b);
  await denied("select public.confirm_receipt($1,3,$2)", [id, randomUUID()]);
  await asUser(a);
  const deletion = (
    await db.query("select public.begin_receipt_deletion($1) as r", [id])
  ).rows[0].r;
  await db.query("reset role");
  await db.query("set local role service_role");
  await db.query("select public.finish_receipt_deletion($1,$2,$3)", [
    id,
    a,
    deletion.token,
  ]);
  await asUser(a);
  const review = (
    await db.query("select public.get_receipt_review($1) as r", [id])
  ).rows[0].r;
  assert.equal(review.source_deleted, true);
  assert.deepEqual(review.confirmation, result);
  const replacement = await draft("b");
  assert.equal(
    (
      await db.query(
        "select canonical_id from public.receipt_imports where id=$1",
        [replacement],
      )
    ).rows[0].canonical_id,
    id,
  );
  assert.equal(
    (
      await db.query(
        "select source_deleted_at from public.receipt_imports where id=$1",
        [id],
      )
    ).rows[0].source_deleted_at,
    null,
  );

  const possibleA = await draft("d");
  const possibleB = await draft("e");
  const metadata = {
    merchant: "Fixture store",
    purchased_on: "2026-10-24",
    total: "12.50",
    currency: "EUR",
  };
  for (const receipt of [possibleA, possibleB])
    await db.query("select public.save_receipt_review($1,1,$2,$3)", [
      receipt,
      JSON.stringify([{ ...line, id: randomUUID() }]),
      metadata,
    ]);
  const candidates = (
    await db.query("select public.receipt_duplicate_candidates($1) as r", [
      possibleA,
    ])
  ).rows[0].r;
  assert.deepEqual(
    candidates.map((c) => c.id),
    [possibleB],
  );
  await denied("select public.confirm_receipt($1,2,$2)", [
    possibleA,
    randomUUID(),
  ]);
  const acknowledged = (
    await db.query("select public.confirm_receipt($1,2,$2,$3) as r", [
      possibleA,
      randomUUID(),
      [possibleB],
    ])
  ).rows[0].r;
  assert.equal(acknowledged.batches.length, 1);
  await db.query("reset role");
}
