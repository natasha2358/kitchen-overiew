// Test-only factory wiring. No production entrypoint imports this file.
import { createParseHandler } from "../supabase/functions/parse-receipt/handler.ts";
import proposal from "../tests/fixtures/receipts/rewe-model-proposal.json" with { type: "json" };
export const fixtureReceiptHandler = createParseHandler({
  configuration: () => ({
    key: "unused-fixture-value",
    model: "fixture-model",
    visionEnabled: true,
  }),
  send: async ({ body }) => {
    if (body.includes("TEST_DELAY"))
      await new Promise((resolve) => setTimeout(resolve, 800));
    if (body.includes("TEST_REFUSAL"))
      return Response.json({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      });
    const result = structuredClone(proposal);
    if (body.includes("TEST_FALLBACK") && !body.includes('"type":"input_file"'))
      result.coverage_complete = false;
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(result) }],
        },
      ],
    });
  },
});
