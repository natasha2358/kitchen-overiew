import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { localBackend } from "./local-backend.mjs";
const local = localBackend();
const runId = randomUUID();
const child = spawn(
  "node_modules/.bin/deno",
  [
    "run",
    "--allow-read",
    "--allow-env",
    "--allow-net=127.0.0.1,localhost",
    "--config",
    "supabase/functions/deno.json",
    "scripts/serve-test-handlers.ts",
  ],
  {
    env: {
      ...process.env,
      HARNESS_RUN_ID: runId,
      SUPABASE_URL: local.API_URL,
      SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      OPENAI_API_KEY: "",
      OPENAI_MEAL_MODEL: "",
    },
    stdio: ["ignore", "ignore", "inherit"],
  },
);
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("Local handler harness failed to start");
    try {
      const health = await fetch("http://127.0.0.1:54329/__health");
      ready = health.ok && (await health.text()) === runId;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw new Error("Local handler harness startup timed out");
  for (const script of [
    "scripts/test-services.mjs",
    "scripts/test-erasure.mjs",
  ]) {
    const test = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        FUNCTIONS_TEST_URL: "http://127.0.0.1:54329/functions/v1",
      },
      stdio: "inherit",
    });
    const code = await new Promise((resolve, reject) => {
      test.on("error", reject);
      test.on("exit", resolve);
    });
    if (code !== 0) throw new Error("Local handler integration failed");
  }
  console.log(
    "PASS application handlers against local Auth/Storage (Supabase Edge runtime bootstrap not covered)",
  );
} finally {
  child.kill("SIGTERM");
}
