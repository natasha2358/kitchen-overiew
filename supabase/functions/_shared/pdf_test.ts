import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { validatePdf, MAX_PDF_BYTES } from "./pdf.ts";
import { extractionProposalSchema } from "./contracts.ts";
Deno.test(
  "synthetic embedded-text and image-only PDFs pass structural checks",
  async () => {
    for (const file of ["synthetic-text.pdf", "synthetic-image-only.pdf"]) {
      const bytes = await Deno.readFile(
        new URL(`../../../tests/fixtures/receipts/${file}`, import.meta.url),
      );
      assert.equal((await validatePdf(bytes)).pages, 1);
    }
  },
);
Deno.test(
  "invalid, empty, oversized and over-page-limit PDFs are rejected",
  async () => {
    for (const bytes of [
      new Uint8Array(),
      new TextEncoder().encode("not a pdf"),
      new TextEncoder().encode("%PDF-corrupt"),
      new Uint8Array(MAX_PDF_BYTES + 1),
    ])
      await assert.rejects(() => validatePdf(bytes));
    const document = await PDFDocument.create();
    for (let i = 0; i < 11; i++) document.addPage();
    const bytes = await document.save();
    await assert.rejects(() => validatePdf(bytes));
  },
);
Deno.test(
  "proposal contract rejects malformed output and preserves unresolved fields",
  async () => {
    const fixture = JSON.parse(
      await Deno.readTextFile(
        new URL(
          "../../../tests/fixtures/receipts/proposal.json",
          import.meta.url,
        ),
      ),
    );
    const proposal = extractionProposalSchema.parse(fixture);
    assert.equal(proposal.lines[3]?.quantity, null);
    assert.equal(
      extractionProposalSchema.safeParse({
        lines: [
          {
            source_label: "x",
            proposed_name: "x",
            quantity: "NaN",
            unit: "g",
            issues: [],
          },
        ],
      }).success,
      false,
    );
    assert.equal(
      extractionProposalSchema.safeParse({ refusal: "Cannot process" }).success,
      false,
    );
  },
);
