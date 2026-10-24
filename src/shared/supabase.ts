import { createClient } from "@supabase/supabase-js";
import { appConfig } from "./config";
import { sessionStorageAdapter } from "./session-storage";
import type { Database } from "./database.types";
export const supabase = appConfig.success
  ? createClient<Database>(appConfig.data.url, appConfig.data.key, {
      auth: {
        storage: sessionStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    })
  : null;
export function backend() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}
