import { z } from "zod";
function publicClientKey(value: string) {
  if (value.startsWith("sb_publishable_")) return value.length > 20;
  try {
    const payload = value.split(".")[1];
    if (!payload) return false;
    return z
      .object({ role: z.literal("anon") })
      .safeParse(
        JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))),
      ).success;
  } catch {
    return false;
  }
}
function secureOrLocal(value: string) {
  const url = new URL(value);
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  const parts = url.hostname.split(".").map(Number);
  if (
    parts.length !== 4 ||
    !parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 &&
      parts[1] !== undefined &&
      parts[1] >= 16 &&
      parts[1] <= 31)
  );
}
const configSchema = z.object({
  url: z
    .url()
    .refine(secureOrLocal, "Use HTTPS or a local development address"),
  key: z
    .string()
    .min(20)
    .refine(
      publicClientKey,
      "Use a publishable key or legacy anon key, never a privileged key",
    ),
});
export function parseConfig(url: unknown, key: unknown) {
  return configSchema.safeParse({ url, key });
}
export const appConfig = parseConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
