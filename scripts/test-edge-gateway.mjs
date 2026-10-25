import assert from "node:assert/strict";
import { SignJWT, generateKeyPair, decodeProtectedHeader } from "jose";
import { localBackend } from "./local-backend.mjs";
const local = localBackend();
const endpoint = `${local.API_URL}/functions/v1/parse-receipt`;
const secret = new TextEncoder().encode(local.JWT_SECRET);
const expired = await new SignJWT({ role: "authenticated" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime(1)
  .sign(secret);
const forged = await new SignJWT({ role: "authenticated" })
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("5m")
  .sign(new TextEncoder().encode("incorrect-fixture-secret"));
const { privateKey } = await generateKeyPair("ES256");
const jwks = await (
  await fetch(`${local.API_URL}/auth/v1/.well-known/jwks.json`)
).json();
const forgedAsymmetric = await new SignJWT({ role: "authenticated" })
  .setProtectedHeader({ alg: "ES256", kid: jwks.keys[0].kid })
  .setAudience("authenticated")
  .setExpirationTime("5m")
  .sign(privateKey);
assert.equal(decodeProtectedHeader(forgedAsymmetric).alg, "ES256");
for (const token of [
  "not-a-token",
  "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.",
  expired,
  forged,
  forgedAsymmetric,
]) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: local.ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 401);
  assert.equal(
    (await r.json()).msg,
    "Invalid JWT",
    "runtime must reject before invoking handler",
  );
}
console.log(
  "PASS real Edge gateway rejects malformed, unsigned, expired, forged HS256 and forged ES256 tokens",
);
