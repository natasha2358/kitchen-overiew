import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticate, cors, response } from "../_shared/http.ts";
import { observe } from "../_shared/telemetry.ts";
import { extractReceiptText } from "../_shared/receipt-text.ts";
import { RECEIPT_PROMPT_VERSION } from "../_shared/receipt-proposal.ts";
import {
  interpretReceipt,
  ReceiptProcessingError,
  type ModelRequest,
} from "../_shared/receipt-model.ts";
type Configuration = { key: string; model: string; visionEnabled: boolean };
// Injection is only a module-level test seam, never a request/env-controlled model URL.
export function createParseHandler(
  dependencies: {
    configuration?: () => Configuration | undefined;
    send?: (request: ModelRequest) => Promise<Response>;
  } = {},
) {
  return observe("parse-receipt", async (request) => {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return response({ error: "Method not allowed" }, 405);
    const auth = await authenticate(request);
    if (!auth) return response({ error: "Sign in before parsing." }, 401);
    const input = z
      .object({
        receipt_id: z.uuid(),
        revision: z.number().int().positive().optional(),
      })
      .strict()
      .safeParse(await request.json().catch(() => null));
    if (!input.success)
      return response({ error: "Invalid receipt request." }, 400);
    const { data: receipt, error } = await auth.api
      .from("receipt_imports")
      .select("id,revision,uploaded_by")
      .eq("id", input.data.receipt_id)
      .single();
    if (error || !receipt || receipt.uploaded_by !== auth.user.id)
      return response({ error: "Receipt unavailable." }, 404);
    const config = dependencies.configuration
      ? dependencies.configuration()
      : (() => {
          const key = Deno.env.get("OPENAI_API_KEY"),
            model = Deno.env.get("OPENAI_RECEIPT_MODEL");
          return key && model
            ? {
                key,
                model,
                visionEnabled: Deno.env.get("OPENAI_RECEIPT_VISION") === "true",
              }
            : undefined;
        })();
    if (!config)
      return response(
        {
          code: "PARSING_NOT_CONFIGURED",
          error:
            "Configure the server receipt model and API key, or enter lines manually. No model call was made.",
        },
        501,
      );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const claim = await admin.rpc("begin_receipt_extraction", {
      p_receipt: receipt.id,
      p_user: auth.user.id,
      p_revision: input.data.revision ?? receipt.revision,
      p_model: config.model,
      p_prompt: RECEIPT_PROMPT_VERSION,
    });
    if (claim.error)
      return response(
        { error: claim.error.message },
        claim.error.code === "42501"
          ? 404
          : claim.error.code === "P0001"
            ? 429
            : 409,
      );
    const state = z
      .discriminatedUnion("acquired", [
        z.object({
          acquired: z.literal(false),
          status: z.enum(["pending", "completed"]),
        }),
        z.object({
          acquired: z.literal(true),
          status: z.literal("pending"),
          attempt: z.uuid(),
          path: z.string(),
          hash: z.string().regex(/^[0-9a-f]{64}$/),
        }),
      ])
      .parse(claim.data);
    if (!state.acquired)
      return response(
        { id: receipt.id, status: state.status },
        state.status === "pending" ? 202 : 200,
      );
    const signal = AbortSignal.timeout(45_000);
    const finish = async (proposal: unknown, code: string | null) =>
      admin
        .rpc("finish_receipt_extraction", {
          p_receipt: receipt.id,
          p_user: auth.user.id,
          p_attempt: state.attempt,
          p_proposal: proposal,
          p_error: code,
        })
        .abortSignal(AbortSignal.timeout(5000));
    try {
      const file = await auth.api.storage
        .from("receipts")
        .download(state.path, {}, { signal });
      if (file.error || !file.data)
        throw new ReceiptProcessingError("SOURCE_UNAVAILABLE");
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== state.hash)
        throw new ReceiptProcessingError("SOURCE_CHANGED");
      let extracted;
      try {
        extracted = await extractReceiptText(bytes);
      } catch {
        throw new ReceiptProcessingError("INVALID_PDF");
      }
      const proposal = await interpretReceipt(
        bytes,
        extracted,
        {
          model: config.model,
          visionEnabled: config.visionEnabled,
          send:
            dependencies.send ??
            (({ body, signal }) =>
              fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${config.key}`,
                  "Content-Type": "application/json",
                },
                body,
                signal,
              })),
          reserve: async (route, reason) => {
            const r = await admin
              .rpc("reserve_receipt_model_call", {
                p_receipt: receipt.id,
                p_user: auth.user.id,
                p_attempt: state.attempt,
                p_route: route,
                p_reason: reason,
              })
              .abortSignal(signal);
            if (r.error) throw new ReceiptProcessingError("PROCESSING_FAILED");
          },
        },
        signal,
      );
      const saved = await finish(proposal, null);
      if (saved.error || saved.data !== true)
        return response(
          {
            error:
              "Review, source or processing lease changed. Reload the saved draft; no proposal was applied.",
          },
          409,
        );
      return response({ id: receipt.id, status: "completed" });
    } catch (error) {
      const code = signal.aborted
        ? "TIMEOUT"
        : error instanceof ReceiptProcessingError
          ? error.code
          : "PROCESSING_FAILED";
      const failed = await finish(null, code);
      if (failed.error || failed.data !== true)
        return response(
          {
            error:
              "Processing state changed. Reload the saved draft; your edits are preserved.",
          },
          409,
        );
      return response(
        {
          code,
          error: `${code}: no draft was saved. Retry within the remaining attempt budget or enter lines manually.`,
        },
        code === "VISION_DISABLED" ? 501 : code === "TIMEOUT" ? 504 : 502,
      );
    }
  });
}
export const handler = createParseHandler();
