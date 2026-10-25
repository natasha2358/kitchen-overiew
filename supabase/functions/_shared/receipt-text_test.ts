import assert from "node:assert/strict";
import { assessReceiptText, extractReceiptText } from "./receipt-text.ts";
Deno.test(
  "fictional REWE layout preserves every source label, decimal weight and repeated-count evidence",
  async () => {
    const base = new URL("../../../tests/fixtures/receipts/", import.meta.url);
    const result = await extractReceiptText(
      await Deno.readFile(new URL("rewe-style-fictional.pdf", base)),
    );
    const expected = JSON.parse(
      await Deno.readTextFile(new URL("rewe-style-expected.json", base)),
    );
    assert.equal(result.route, expected.route);
    assert.equal(result.pages, expected.pages);
    assert.equal(result.route, "embedded_text");
    if (result.route !== "embedded_text")
      throw new Error("Embedded extraction failed");
    for (const line of expected.lines)
      assert.ok(result.text.includes(line.label), `Missing ${line.label}`);
    for (const evidence of ["0,750 kg", "0,400 kg", "2 Stk", "0,85L"])
      assert.ok(result.text.includes(evidence));
    // Expected review decisions are annotations, never generated production proposals.
    assert.equal(expected.lines[3].stock_quantity, null);
  },
);
Deno.test(
  "image-only input is explicitly routed to unavailable vision, invalid input rejected",
  async () => {
    const bytes = await Deno.readFile(
      new URL(
        "../../../tests/fixtures/receipts/synthetic-image-only.pdf",
        import.meta.url,
      ),
    );
    assert.deepEqual(await extractReceiptText(bytes), {
      route: "vision_required",
      pages: 1,
      text: null,
      reason: "no_text",
    });
    await assert.rejects(() =>
      extractReceiptText(new TextEncoder().encode("not a PDF")),
    );
  },
);
Deno.test(
  "sparse, garbled, incomplete and excessive text are never silently accepted",
  () => {
    for (const [pages, reason] of [
      [[""], "no_text"],
      [["Price 1"], "sparse_text"],
      [["A\uFFFD 12"], "garbled_text"],
      [["Product 12 ".repeat(10), ""], "partial_pages"],
      [["x".repeat(50_001)], "text_limit"],
    ] as const) {
      const result = assessReceiptText([...pages]);
      assert.equal(result.route, "vision_required");
      assert.equal(result.reason, reason);
      assert.equal(result.text, null);
    }
  },
);
Deno.test(
  "readable owner-protected receipt opens, but opening-password requirement is rejected",
  async () => {
    const base = new URL("../../../tests/fixtures/receipts/", import.meta.url);
    const result = await extractReceiptText(
      await Deno.readFile(new URL("rewe-style-readable-protected.pdf", base)),
    );
    assert.equal(result.route, "embedded_text");
    assert.ok(result.text?.includes("BANANE BIO"));
    await assert.rejects(
      () =>
        Deno.readFile(new URL("password-required.pdf", base)).then(
          extractReceiptText,
        ),
      /opening password/,
    );
  },
);
