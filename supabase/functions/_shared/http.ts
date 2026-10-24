import { createClient } from "@supabase/supabase-js";
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
export async function authenticate(request: Request) {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const api = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await api.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  return { api, user: data.user };
}
