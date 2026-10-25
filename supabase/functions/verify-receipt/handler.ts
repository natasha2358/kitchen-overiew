import { observe } from "../_shared/telemetry.ts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { validatePdf } from "../_shared/pdf.ts";
import { authenticate, cors, response } from "../_shared/http.ts";
export const handler = observe("verify-receipt", async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors });
  if (request.method !== "POST")
    return response({ error: "Method not allowed" }, 405);
  const auth = await authenticate(request);
  if (!auth) return response({ error: "Sign in before uploading." }, 401);
  let id: string;
  try {
    id = z
      .object({ receipt_id: z.uuid() })
      .strict()
      .parse(await request.json()).receipt_id;
  } catch {
    return response({ error: "Invalid receipt request." }, 400);
  }
  const { data: receipt, error } = await auth.api
    .from("receipt_imports")
    .select("id,household_id,uploaded_by,object_path")
    .eq("id", id)
    .single();
  if (error || !receipt || receipt.uploaded_by !== auth.user.id)
    return response({ error: "Receipt unavailable." }, 404);
  // Explicit membership and uploader checks precede the privileged hash-registration call.
  const member = await auth.api
    .from("household_memberships")
    .select("user_id")
    .eq("household_id", receipt.household_id)
    .eq("user_id", auth.user.id)
    .single();
  if (member.error || !member.data)
    return response({ error: "Receipt unavailable." }, 404);
  const file = await auth.api.storage
    .from("receipts")
    .download(receipt.object_path);
  if (file.error || !file.data)
    return response(
      { error: "Upload incomplete. Select the original PDF and retry." },
      409,
    );
  try {
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const { pages } = await validatePdf(bytes);
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const saved = await admin.rpc("finalize_receipt_upload", {
      p_receipt: id,
      p_user: auth.user.id,
      p_hash: hash,
    });
    if (saved.error)
      return response(
        { error: "Could not register this receipt. Retry verification." },
        500,
      );
    return response({ ...saved.data, pages, parsing: "not_configured" });
  } catch (e) {
    return response(
      { error: e instanceof Error ? e.message : "Invalid PDF." },
      422,
    );
  }
});
