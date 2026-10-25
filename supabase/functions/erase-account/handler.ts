import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticate, cors, response } from "../_shared/http.ts";
import { observe } from "../_shared/telemetry.ts";
const requestSchema = z
  .object({
    action: z.enum(["prepare", "continue"]),
    confirmation: z.literal("DELETE MY ACCOUNT"),
    password: z.string().min(1).max(128),
  })
  .strict();
const batchSchema = z.object({
  state: z.enum(["frozen", "purging", "database_removed"]),
  household_id: z.uuid().nullable(),
  receipt_ids: z.array(z.uuid()),
  paths: z.array(z.string()).max(100),
});
export const handler = observe("erase-account", async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors });
  if (request.method !== "POST")
    return response({ error: "Method not allowed" }, 405);
  const auth = await authenticate(request);
  if (!auth || !auth.user.email)
    return response({ error: "Sign in again to resume account erasure." }, 401);
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return response(
      { error: "Enter your password and DELETE MY ACCOUNT to confirm." },
      400,
    );
  const reauth = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const verified = await reauth.auth.signInWithPassword({
    email: auth.user.email,
    password: body.data.password,
  });
  if (
    verified.error ||
    verified.data.user?.id !== auth.user.id ||
    !verified.data.session
  )
    return response({ error: "Password verification failed." }, 403);
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  try {
    const begun = await admin.rpc("begin_account_erasure", {
      p_user: auth.user.id,
    });
    if (begun.error)
      return response(
        {
          error:
            "Could not prepare erasure. This flow requires sole ownership of the kitchen.",
        },
        409,
      );
    const readBatch = async () => {
      const r = await admin.rpc("account_erasure_batch", {
        p_user: auth.user.id,
      });
      if (r.error) throw new Error("Erasure status unavailable");
      return batchSchema.parse(r.data);
    };
    let batch = await readBatch();
    if (body.data.action === "prepare")
      return response({
        prepared: true,
        household_id: batch.household_id,
        receipt_ids: batch.receipt_ids,
      });
    const revoked = await admin.auth.admin.signOut(
      verified.data.session.access_token,
      "global",
    );
    if (revoked.error) throw new Error("Session revocation failed");
    // Work is bounded; retries resume from the remaining Storage objects.
    for (let i = 0; i < 10 && batch.paths.length > 0; i++) {
      const removed = await admin.storage.from("receipts").remove(batch.paths);
      if (removed.error) throw new Error("File removal interrupted");
      batch = await readBatch();
    }
    if (batch.paths.length > 0)
      return response({ deleted: false, pending: true }, 202);
    const purged = await admin.rpc("purge_account_household", {
      p_user: auth.user.id,
    });
    if (purged.error) throw new Error("Database erasure interrupted");
    const deleted = await admin.auth.admin.deleteUser(auth.user.id);
    if (
      deleted.error &&
      deleted.error.status !== 404 &&
      deleted.error.code !== "user_not_found"
    )
      throw new Error("Auth removal interrupted");
    const finished = await admin.rpc("finish_account_erasure", {
      p_user: auth.user.id,
    });
    if (finished.error)
      return response(
        { error: "Account removed; cleanup requires operator reconciliation." },
        500,
      );
    return response({ deleted: true });
  } catch {
    return response(
      {
        error:
          "Erasure interrupted. Your kitchen is frozen. Sign in again if needed and resume deletion from Account.",
      },
      503,
    );
  } finally {
    // Only the ephemeral password-verification session is retained until this request ends.
    await reauth.auth.signOut({ scope: "local" });
  }
});
