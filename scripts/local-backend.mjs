import { execFileSync } from "node:child_process";
export function localBackend() {
  const status = JSON.parse(
    execFileSync(
      process.env.SUPABASE_BIN || "supabase",
      ["status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL) ||
    !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/postgres$/.test(
      status.DB_URL,
    )
  )
    throw new Error("Tests only support the local Supabase instance");
  return status;
}
