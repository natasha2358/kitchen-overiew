import assert from "node:assert/strict";
import {
  interpretReceipt,
  ReceiptProcessingError,
  type ModelRequest,
} from "./receipt-model.ts";
import { validateReceiptProposal } from "./receipt-proposal.ts";
import { extractReceiptText, type ReceiptTextResult } from "./receipt-text.ts";
const base = new URL("../../../tests/fixtures/receipts/", import.meta.url);
const bytes = await Deno.readFile(new URL("rewe-style-fictional.pdf", base));
const proposal = JSON.parse(
  await Deno.readTextFile(new URL("rewe-model-proposal.json", base)),
);
const text = await extractReceiptText(bytes);
function success(data: unknown = proposal) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(data) }],
      },
    ],
  });
}
async function run(
  responses: (() => Response | Promise<Response>)[],
  input: ReceiptTextResult = text,
  visionEnabled = true,
  signal = new AbortController().signal,
) {
  const calls: unknown[] = [],
    reservations: unknown[] = [];
  const promise = interpretReceipt(
    bytes,
    input,
    {
      model: "fixture-model",
      visionEnabled,
      reserve: async (route, reason) => {
        reservations.push({ route, reason });
      },
      send: async (request: ModelRequest) => {
        calls.push(JSON.parse(request.body));
        const next = responses.shift();
        assert.ok(next, "call budget exceeded");
        return next();
      },
    },
    signal,
  );
  return { promise, calls, reservations };
}
Deno.test(
  "text route returns all fictional source lines and never sends PDF or mutation tools",
  async () => {
    const r = await run([() => success()]);
    assert.equal((await r.promise).lines.length, 9);
    assert.equal(r.calls.length, 1);
    const body = JSON.stringify(r.calls[0]);
    assert.ok(body.includes('"store":false'));
    assert.ok(body.includes('"type":"input_text"'));
    assert.ok(!body.includes('"input_file"'));
    assert.ok(!body.includes('"tools"'));
    assert.deepEqual(r.reservations, [
      { route: "embedded_text", reason: null },
    ]);
  },
);
Deno.test(
  "incomplete text coverage falls back once to inline PDF; image-only starts in vision",
  async () => {
    const r = await run([
      () => success({ ...proposal, coverage_complete: false }),
      () => success(),
    ]);
    await r.promise;
    assert.equal(r.calls.length, 2);
    assert.ok(
      JSON.stringify(r.calls[1]).includes("data:application/pdf;base64,"),
    );
    assert.deepEqual(r.reservations[1], {
      route: "vision",
      reason: "incomplete_line_coverage",
    });
    const image = await run([() => success()], {
      route: "vision_required",
      pages: 1,
      text: null,
      reason: "no_text",
    });
    await image.promise;
    assert.deepEqual(image.reservations, [
      { route: "vision", reason: "no_text" },
    ]);
  },
);
Deno.test(
  "transport retry and fallback share two calls; incomplete output cannot spend a third",
  async () => {
    const r = await run([
      () => new Response(null, { status: 503 }),
      () => success({ ...proposal, coverage_complete: false }),
    ]);
    await assert.rejects(
      r.promise,
      (e) =>
        e instanceof ReceiptProcessingError && e.code === "INCOMPLETE_RESPONSE",
    );
    assert.equal(r.calls.length, 2);
    const recovered = await run([
      () => {
        throw new Error("private transport details");
      },
      () => success(),
    ]);
    await recovered.promise;
    assert.equal(recovered.calls.length, 2);
  },
);
Deno.test(
  "refusal, truncated and malformed output do not trigger paid fallback retries",
  async () => {
    for (const [body, code] of [
      [
        {
          status: "completed",
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        },
        "MODEL_REFUSAL",
      ],
      [{ status: "incomplete", output: [] }, "INCOMPLETE_RESPONSE"],
      [
        {
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "bad json" }],
            },
          ],
        },
        "INVALID_PROPOSAL",
      ],
    ] as const) {
      const r = await run([() => Response.json(body)]);
      await assert.rejects(
        r.promise,
        (e) => e instanceof ReceiptProcessingError && e.code === code,
      );
      assert.equal(r.calls.length, 1);
    }
  },
);
Deno.test(
  "disabled vision and elapsed deadline make no model calls",
  async () => {
    const r = await run(
      [],
      { route: "vision_required", pages: 1, text: null, reason: "no_text" },
      false,
    );
    await assert.rejects(r.promise, /VISION_DISABLED/);
    assert.equal(r.calls.length, 0);
    const controller = new AbortController();
    controller.abort();
    const expired = await run([], text, true, controller.signal);
    await assert.rejects(expired.promise, /TIMEOUT/);
    assert.equal(expired.reservations.length, 0);
  },
);
Deno.test(
  "semantic validation rejects inferred sizes, price quantities, fractional items and fake references",
  () => {
    assert.equal(text.route, "embedded_text");
    const original = validateReceiptProposal(proposal, text.text);
    assert.equal(original.lines[3].quantity, null);
    for (const patch of [
      { quantity: "1000", unit: "ml", quantity_evidence: "2 Stk x 1,10" },
      { quantity: "1.10", unit: "item", quantity_evidence: "1,10" },
      {
        quantity: "2",
        unit: "item",
        quantity_evidence: "2 Stk",
        package_quantity: "500",
        package_unit: "g",
      },
      { quantity: "1.5", unit: "item", quantity_evidence: "1.5 item" },
      { product_id: crypto.randomUUID() },
      { source_label: "Invented product label" },
    ]) {
      const changed = structuredClone(proposal);
      changed.lines[3] = { ...changed.lines[3], ...patch };
      assert.throws(() => validateReceiptProposal(changed, text.text));
    }
  },
);

Deno.test(
  "missing or reordered REWE priced lines cannot be accepted merely because the model claims coverage",
  async () => {
    for (const lines of [
      proposal.lines.slice(1),
      [...proposal.lines].reverse(),
    ]) {
      const omitted = { ...proposal, lines };
      const r = await run([() => success(omitted), () => success(omitted)]);
      await assert.rejects(r.promise, /INCOMPLETE_RESPONSE/);
      assert.equal(r.calls.length, 2);
    }
  },
);
Deno.test(
  "two rate limits exhaust the call budget and provider bodies are bounded",
  async () => {
    const limited = await run([
      () => new Response("private details", { status: 429 }),
      () => new Response(null, { status: 429 }),
    ]);
    await assert.rejects(limited.promise, /RATE_LIMITED/);
    assert.equal(limited.calls.length, 2);
    const oversized = await run([() => new Response("x".repeat(300_001))]);
    await assert.rejects(oversized.promise, /INVALID_PROPOSAL/);
    assert.equal(oversized.calls.length, 1);
  },
);
Deno.test(
  "aborting an in-flight provider call consumes one reservation and never retries",
  async () => {
    const controller = new AbortController();
    let calls = 0,
      reservations = 0;
    await assert.rejects(
      interpretReceipt(
        bytes,
        text,
        {
          model: "fixture-model",
          visionEnabled: true,
          reserve: async () => {
            reservations++;
          },
          send: async () => {
            calls++;
            controller.abort();
            throw new DOMException("Aborted", "AbortError");
          },
        },
        controller.signal,
      ),
      /TIMEOUT/,
    );
    assert.equal(calls, 1);
    assert.equal(reservations, 1);
  },
);
