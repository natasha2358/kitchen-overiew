import { observe } from "../_shared/telemetry.ts";
import { z } from "zod";
import { authenticate, cors, response } from "../_shared/http.ts";
export const handler = observe("parse-receipt", async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors });
  if (request.method !== "POST")
    return response({ error: "Method not allowed" }, 405);
  const auth = await authenticate(request);
  if (!auth) return response({ error: "Sign in before parsing." }, 401);
  let id: string;
  try {
    id = z
      .object({ receipt_id: z.uuid() })
      .strict()
      .parse(await request.json()).receipt_id;
  } catch {
    return response({ error: "Invalid receipt request." }, 400);
  }
  const result = await auth.api
    .from("receipt_imports")
    .select("id,status")
    .eq("id", id)
    .single();
  if (result.error || !result.data)
    return response({ error: "Receipt unavailable." }, 404);
  return response(
    {
      code: "PARSING_NOT_CONFIGURED",
      error:
        "Automatic line interpretation is not enabled. You can review and enter lines manually. Embedded-text extraction has initial fixture coverage; model integration and quality evaluation are still required.",
    },
    501,
  );
});
