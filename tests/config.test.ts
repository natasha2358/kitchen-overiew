import { parseConfig } from "../src/shared/config";
test("missing configuration stays at the explicit setup boundary", () => {
  expect(parseConfig(undefined, undefined).success).toBe(false);
});
test("rejects insecure public URLs and secret key prefix", () => {
  expect(
    parseConfig("http://example.com", "sb_publishable_" + "a".repeat(30))
      .success,
  ).toBe(false);
  expect(
    parseConfig(
      "https://example.supabase.co",
      "sb_secret_" + "sb_publishable_" + "a".repeat(30),
    ).success,
  ).toBe(false);
});
test("supports Android emulator local Supabase and public cloud URL", () => {
  expect(
    parseConfig("http://10.0.2.2:54321", "sb_publishable_" + "a".repeat(30))
      .success,
  ).toBe(true);
  expect(
    parseConfig(
      "https://example.supabase.co",
      "sb_publishable_" + "sb_publishable_" + "a".repeat(30),
    ).success,
  ).toBe(true);
});

test("rejects privileged legacy JWTs and deceptive local hostnames", () => {
  const jwt = (role: string) =>
    "header." + btoa(JSON.stringify({ role })) + ".signature";
  expect(
    parseConfig("https://example.supabase.co", jwt("service_role")).success,
  ).toBe(false);
  expect(parseConfig("https://example.supabase.co", jwt("anon")).success).toBe(
    true,
  );
  expect(
    parseConfig(
      "http://localhost.evil.test",
      "sb_publishable_" + "a".repeat(30),
    ).success,
  ).toBe(false);
});
