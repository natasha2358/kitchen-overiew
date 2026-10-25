import { observe } from "../_shared/telemetry.ts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticate, cors, response } from "../_shared/http.ts";
export const handler = observe("delete-receipt-source", async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors });
  if (request.method !== "POST")
    return response({ error: "Method not allowed" }, 405);
  const auth = await authenticate(request);
  if (!auth) return response({ error: "Sign in first." }, 401);
  try {
    const { receipt_id } = z
      .object({ receipt_id: z.uuid() })
      .strict()
      .parse(await request.json());
    // The user-scoped RPC authorizes membership and locks the source lifecycle.
    const claim = await auth.api.rpc("begin_receipt_deletion", {
      p_receipt: receipt_id,
    });
    if (claim.error)
      return response({ error: "Receipt unavailable or not verified." }, 409);
    const state = z
      .discriminatedUnion("deleted", [
        z.object({ deleted: z.literal(true) }),
        z.object({
          deleted: z.literal(false),
          path: z.string(),
          token: z.uuid(),
        }),
      ])
      .parse(claim.data);
    if (state.deleted) return response({ deleted: true });
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const removed = await admin.storage.from("receipts").remove([state.path]);
    if (removed.error)
      return response(
        { error: "Source deletion interrupted. Retry deletion." },
        503,
      );
    const saved = await admin.rpc("finish_receipt_deletion", {
      p_receipt: receipt_id,
      p_user: auth.user.id,
      p_token: state.token,
    });
    if (saved.error)
      return response({ error: "Reconcile source deletion by retrying." }, 409);
    return response({ deleted: true });
  } catch {
    return response({ error: "Invalid deletion request." }, 400);
  }
});
