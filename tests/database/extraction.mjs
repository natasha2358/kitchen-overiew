import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
export async function testExtraction(db, ctx) {
  const { a, b, h, asUser, denied } = ctx;
  const proposal = JSON.parse(
    await readFile(
      new URL("../fixtures/receipts/rewe-model-proposal.json", import.meta.url),
    ),
  );
  async function service() {
    await db.query("reset role");
    await db.query("set local role service_role");
  }
  async function receipt() {
    await asUser(a);
    const r = (
      await db.query(
        "select public.prepare_receipt($1,$2,'fixture.pdf') data",
        [h, randomUUID()],
      )
    ).rows[0].data;
    await service();
    await db.query("select public.finalize_receipt_upload($1,$2,$3)", [
      r.id,
      a,
      randomUUID().replaceAll("-", "").repeat(2),
    ]);
    return r.id;
  }
  const begin = async (id) =>
    (
      await db.query(
        "select public.begin_receipt_extraction($1,$2,1,'fixture-model','fixture-v1') data",
        [id, a],
      )
    ).rows[0].data;
  const reserve = (id, attempt) =>
    db.query(
      "select public.reserve_receipt_model_call($1,$2,$3,'embedded_text',null)",
      [id, a, attempt],
    );
  const finish = async (id, attempt, value = proposal) =>
    (
      await db.query(
        "select public.finish_receipt_extraction($1,$2,$3,$4) result",
        [id, a, attempt, JSON.stringify(value)],
      )
    ).rows[0].result;
  const id = await receipt();
  await asUser(a);
  await denied(
    "select public.begin_receipt_extraction($1,$2,1,'model','prompt')",
    [id, a],
  );
  await denied(
    "select public.reserve_receipt_model_call($1,$2,$3,'embedded_text',null)",
    [id, a, randomUUID()],
  );
  await denied("select public.finish_receipt_extraction($1,$2,$3,$4)", [
    id,
    a,
    randomUUID(),
    JSON.stringify(proposal),
  ]);
  await service();
  await denied(
    "select public.begin_receipt_extraction($1,$2,1,'model','prompt')",
    [id, b],
  );
  const claim = await begin(id);
  assert.equal(claim.acquired, true);
  assert.deepEqual(await begin(id), { status: "pending", acquired: false });
  await reserve(id, claim.attempt);
  await denied("select public.finish_receipt_extraction($1,$2,$3,$4)", [
    id,
    a,
    claim.attempt,
    JSON.stringify({ ...proposal, coverage_complete: false }),
  ]);
  const malformed = structuredClone(proposal);
  malformed.lines[1].quantity = "-3";
  await denied("select public.finish_receipt_extraction($1,$2,$3,$4)", [
    id,
    a,
    claim.attempt,
    JSON.stringify(malformed),
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.receipt_lines where receipt_id=$1",
        [id],
      )
    ).rows[0].n,
    0,
    "all-or-nothing proposal writes",
  );
  assert.equal(await finish(id, claim.attempt), true);
  assert.equal(await finish(id, claim.attempt), true);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from public.receipt_lines where receipt_id=$1",
        [id],
      )
    ).rows[0].n,
    9,
  );
  await asUser(a);
  const review = (
    await db.query("select public.get_receipt_review($1) data", [id])
  ).rows[0].data;
  assert.equal(review.revision, 2);
  assert.equal(review.extraction.status, "completed");
  assert.deepEqual(
    review.lines.map((l) => l.source_label),
    proposal.lines.map((l) => l.source_label),
  );
  assert.equal(review.lines[3].quantity, null);
  assert.equal(review.lines[5].included, false);
  assert.ok(
    review.lines.every(
      (l) =>
        l.location_id === null && l.product_id === null && l.expiry === null,
    ),
  );
  await denied("select public.confirm_receipt($1,2,$2)", [id, randomUUID()]);
  await asUser(b);
  assert.equal(
    (await db.query("select public.get_receipt_review($1) data", [id])).rows[0]
      .data,
    null,
  );
  const edited = await receipt();
  const editingClaim = await begin(edited);
  await reserve(edited, editingClaim.attempt);
  await asUser(a);
  await db.query("select public.save_receipt_review($1,1,'[]')", [edited]);
  await service();
  assert.equal(
    await finish(edited, editingClaim.attempt),
    false,
    "manual save invalidates late extraction",
  );
  await denied(
    "select public.begin_receipt_extraction($1,$2,2,'model','prompt')",
    [edited, a],
  );
  const expired = await receipt();
  const old = await begin(expired);
  await reserve(expired, old.attempt);
  await db.query("reset role");
  await db.query(
    "update public.receipt_imports set extraction_lease_until=now()-interval '1 second' where id=$1",
    [expired],
  );
  await service();
  assert.equal(await finish(expired, old.attempt), false);
  const newer = await begin(expired);
  assert.notEqual(newer.attempt, old.attempt);
  await denied(
    "select public.reserve_receipt_model_call($1,$2,$3,'vision','no_text')",
    [expired, a, old.attempt],
  );
  assert.equal(await finish(expired, old.attempt), false);
  await reserve(expired, newer.attempt);
  await reserve(expired, newer.attempt);
  await denied(
    "select public.reserve_receipt_model_call($1,$2,$3,'vision','no_text')",
    [expired, a, newer.attempt],
  );
  await db.query(
    "select public.finish_receipt_extraction($1,$2,$3,null,'UPSTREAM_FAILED')",
    [expired, a, newer.attempt],
  );
  await denied(
    "select public.begin_receipt_extraction($1,$2,1,'model','prompt')",
    [expired, a],
  );
  const deleted = await receipt();
  const deleting = await begin(deleted);
  await reserve(deleted, deleting.attempt);
  await db.query("savepoint frozen_completion");
  await db.query("select public.begin_account_erasure($1)", [a]);
  await denied("select public.finish_receipt_extraction($1,$2,$3,$4)", [
    deleted,
    a,
    deleting.attempt,
    JSON.stringify(proposal),
  ]);
  await db.query("rollback to savepoint frozen_completion");
  await asUser(a);
  await db.query("select public.begin_receipt_deletion($1)", [deleted]);
  await service();
  assert.equal(await finish(deleted, deleting.attempt), false);
  await db.query("reset role");
  console.log(
    "PASS extraction RPC isolation, atomic proposals, source order, unresolved review, bounded calls/retries, expired leases and preserved edits/deletions",
  );
}
