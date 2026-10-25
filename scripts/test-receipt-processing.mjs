import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { localBackend } from "./local-backend.mjs";
const local = localBackend();
const root = process.env.FUNCTIONS_TEST_URL;
if (
  !root ||
  !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/functions\/v1$/.test(root)
)
  throw new Error("Loopback fixture harness required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, options);
const fixtures = [],
  paths = [];
function ok(r) {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}
async function call(name, owner, body) {
  return fetch(`${root}/${name}`, {
    method: "POST",
    headers: {
      apikey: local.ANON_KEY,
      Authorization: `Bearer ${owner.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `parser-${randomUUID()}@example.test`,
      password = `Fixture-${randomUUID()}`;
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    ).user;
    const api = createClient(local.API_URL, local.ANON_KEY, options);
    const session = ok(
      await api.auth.signInWithPassword({ email, password }),
    ).session;
    const household = ok(await api.rpc("bootstrap_household"));
    fixtures.push({
      user: user.id,
      api,
      household,
      token: session.access_token,
    });
  }
  const [a, b] = fixtures;
  async function upload(marker) {
    const pdf = await PDFDocument.load(
      await readFile(
        new URL(
          "../tests/fixtures/receipts/rewe-style-fictional.pdf",
          import.meta.url,
        ),
      ),
    );
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf
      .getPages()[1]
      .drawText(`${marker} ${randomUUID()}`, { x: 10, y: 30, size: 8, font });
    const receipt = ok(
      await a.api.rpc("prepare_receipt", {
        p_household: a.household,
        p_operation: randomUUID(),
        p_filename: "fictional.pdf",
      }),
    );
    paths.push(receipt.object_path);
    ok(
      await a.api.storage
        .from("receipts")
        .upload(receipt.object_path, await pdf.save(), {
          contentType: "application/pdf",
        }),
    );
    const verified = await call("verify-receipt", a, {
      receipt_id: receipt.id,
    });
    assert.equal(verified.status, 200, await verified.text());
    return receipt.id;
  }
  const normal = await upload("TEST_DELAY");
  assert.equal(
    (
      await call("parse-receipt-fixture", b, {
        receipt_id: normal,
        revision: 1,
      })
    ).status,
    404,
  );
  assert.ok(
    (
      await a.api.rpc("begin_receipt_extraction", {
        p_receipt: normal,
        p_user: a.user,
        p_revision: 1,
        p_model: "forged",
        p_prompt: "forged",
      })
    ).error,
  );
  const concurrent = await Promise.all([
    call("parse-receipt-fixture", a, { receipt_id: normal, revision: 1 }),
    call("parse-receipt-fixture", a, { receipt_id: normal, revision: 1 }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 202]);
  let review = ok(await a.api.rpc("get_receipt_review", { p_receipt: normal }));
  assert.equal(review.lines.length, 9);
  assert.equal(review.extraction.calls, 1);
  assert.equal(review.extraction.attempts, 1);
  assert.equal(review.lines[3].quantity, null);
  assert.equal(review.lines[5].included, false);
  assert.equal(
    ok(await a.api.rpc("get_inventory", { p_household: a.household })).length,
    0,
  );
  const location = ok(
    await a.api.from("storage_locations").select("id").limit(1),
  )[0].id;
  const lines = review.lines.map(({ proposed, ...line }) => ({
    ...line,
    included: line.quantity !== null,
    location_id: line.quantity !== null ? location : null,
  }));
  const saved = ok(
    await a.api.rpc("save_receipt_review", {
      p_receipt: normal,
      p_revision: review.revision,
      p_lines: lines,
      p_metadata: {
        merchant: "REWE TEST MARKET",
        total: "16.95",
        currency: "EUR",
      },
    }),
  );
  const operation = randomUUID();
  const confirmation = ok(
    await a.api.rpc("confirm_receipt", {
      p_receipt: normal,
      p_revision: saved,
      p_operation: operation,
    }),
  );
  assert.equal(confirmation.batches.length, 2);
  assert.deepEqual(
    ok(
      await a.api.rpc("confirm_receipt", {
        p_receipt: normal,
        p_revision: saved,
        p_operation: operation,
      }),
    ),
    confirmation,
  );
  assert.equal(
    (
      await call("parse-receipt-fixture", a, {
        receipt_id: normal,
        revision: 1,
      })
    ).status,
    200,
    "lost response replays completion, including after confirmation",
  );
  assert.equal(
    ok(await a.api.rpc("get_inventory", { p_household: a.household })).length,
    2,
  );
  const fallback = await upload("TEST_FALLBACK");
  const fallbackResult = await call("parse-receipt-fixture", a, {
    receipt_id: fallback,
    revision: 1,
  });
  assert.equal(fallbackResult.status, 200, await fallbackResult.text());
  review = ok(await a.api.rpc("get_receipt_review", { p_receipt: fallback }));
  assert.equal(review.extraction.route, "vision");
  assert.equal(review.extraction.calls, 2);
  assert.equal(review.extraction.reason, "incomplete_line_coverage");
  const refusal = await upload("TEST_REFUSAL");
  assert.equal(
    (
      await call("parse-receipt-fixture", a, {
        receipt_id: refusal,
        revision: 1,
      })
    ).status,
    502,
  );
  review = ok(await a.api.rpc("get_receipt_review", { p_receipt: refusal }));
  assert.equal(review.extraction.error, "MODEL_REFUSAL");
  assert.equal(review.lines.length, 0);
  assert.equal(review.extraction.calls, 1);
  const late = await upload("TEST_DELAY");
  const processing = call("parse-receipt-fixture", a, {
    receipt_id: late,
    revision: 1,
  });
  let reserved = false;
  for (let i = 0; i < 50; i++) {
    const r = ok(
      await a.api
        .from("receipt_imports")
        .select("extraction_calls")
        .eq("id", late)
        .single(),
    );
    if (r.extraction_calls === 1) {
      reserved = true;
      break;
    }
    await delay(20);
  }
  assert.ok(reserved, "model call must start before editing");
  ok(
    await a.api.rpc("save_receipt_review", {
      p_receipt: late,
      p_revision: 1,
      p_lines: [],
    }),
  );
  assert.equal((await processing).status, 409);
  review = ok(await a.api.rpc("get_receipt_review", { p_receipt: late }));
  assert.equal(review.lines.length, 0);
  assert.equal(review.revision, 2);
  assert.equal(review.extraction.error, "REVIEW_OR_SOURCE_CHANGED");
  const tampered = await upload("TEST_HASH");
  const tamperedPath = ok(
    await a.api
      .from("receipt_imports")
      .select("object_path")
      .eq("id", tampered)
      .single(),
  ).object_path;
  ok(
    await admin.storage
      .from("receipts")
      .upload(tamperedPath, new TextEncoder().encode("different bytes"), {
        contentType: "application/pdf",
        upsert: true,
      }),
  );
  const rejectedHash = await call("parse-receipt-fixture", a, {
    receipt_id: tampered,
    revision: 1,
  });
  assert.equal(rejectedHash.status, 502);
  assert.equal((await rejectedHash.json()).code, "SOURCE_CHANGED");
  review = ok(await a.api.rpc("get_receipt_review", { p_receipt: tampered }));
  assert.equal(review.extraction.calls, 0);
  const limited = await upload("TEST_RATE_LIMIT");
  assert.equal(
    (
      await call("parse-receipt-fixture", a, {
        receipt_id: limited,
        revision: 1,
      })
    ).status,
    429,
  );
  console.log(
    "PASS mocked model with real Auth/Storage/DB: concurrent extraction, fallback, refusal, review preservation, manual confirmation and no duplicate stock",
  );
} finally {
  if (paths.length) ok(await admin.storage.from("receipts").remove(paths));
  for (const fixture of fixtures) {
    ok(await admin.rpc("begin_account_erasure", { p_user: fixture.user }));
    ok(await admin.rpc("purge_account_household", { p_user: fixture.user }));
    ok(await admin.auth.admin.deleteUser(fixture.user));
    ok(await admin.rpc("finish_account_erasure", { p_user: fixture.user }));
  }
}
