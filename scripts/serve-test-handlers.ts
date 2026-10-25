import { fixtureReceiptHandler } from "./fixture-receipt-handler.ts";
import { handler as erase } from "../supabase/functions/erase-account/handler.ts";
// Test harness only: real handlers and real local Auth/Storage, no runtime JWT shim.
// Each handler must continue validating identity itself through Auth.getUser().
import { handler as verify } from "../supabase/functions/verify-receipt/handler.ts";
import { handler as parse } from "../supabase/functions/parse-receipt/handler.ts";
import { handler as remove } from "../supabase/functions/delete-receipt-source/handler.ts";
import { handler as suggest } from "../supabase/functions/suggest-meals/handler.ts";
const routes: Record<string, (request: Request) => Promise<Response>> = {
  "verify-receipt": verify,
  "parse-receipt": parse,
  "parse-receipt-fixture": fixtureReceiptHandler,
  "delete-receipt-source": remove,
  "suggest-meals": suggest,
  "erase-account": erase,
};
Deno.serve({ hostname: "127.0.0.1", port: 54329 }, (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/__health") return new Response(Deno.env.get("HARNESS_RUN_ID") ?? "");
  const handler = routes[path.replace(/^\/functions\/v1\//, "")];
  return handler
    ? handler(request)
    : new Response("Not found", { status: 404 });
});
