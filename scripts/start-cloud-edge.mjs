import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { localBackend } from "./local-backend.mjs";
const local = localBackend();
const functions = [
  "verify-receipt",
  "parse-receipt",
  "delete-receipt-source",
  "suggest-meals",
  "erase-account",
];
if (process.argv.includes("--test-fixtures"))
  functions.push("parse-receipt-fixture");
const config = Object.fromEntries(
  functions.map((name) => [
    name,
    {
      entrypointPath: `/cloud-edge/${name}/index.js`,
      importMapPath: "",
      verifyJWT: true,
    },
  ]),
);
const modelEnvIndex = process.argv.indexOf("--model-env-file");
const modelEnvironment = {};
if (modelEnvIndex !== -1) {
  if (process.argv.includes("--test-fixtures"))
    throw new Error("Fixture runtime cannot receive live model configuration");
  const path = process.argv[modelEnvIndex + 1];
  if (!path || path.startsWith("--"))
    throw new Error("Provide a server environment file path");
  const supplied = parseEnv(readFileSync(path, "utf8"));
  for (const key of [
    "OPENAI_API_KEY",
    "OPENAI_RECEIPT_MODEL",
    "OPENAI_RECEIPT_VISION",
    "OPENAI_MEAL_MODEL",
  ]) {
    const value = supplied[key];
    if (value) {
      if (/[\r\n]/u.test(value))
        throw new Error("Model environment values must be single-line");
      modelEnvironment[key] = value;
    }
  }
}
const directory = mkdtempSync(join(tmpdir(), "kitchen-edge-"));
const envFile = join(directory, "runtime.env");
try {
  writeFileSync(
    envFile,
    Object.entries({
      ...modelEnvironment,
      NO_PROXY: "kong,auth,rest,storage,127.0.0.1,localhost",
      no_proxy: "kong,auth,rest,storage,127.0.0.1,localhost",
      SUPABASE_URL: "http://kong:8000",
      SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      SUPABASE_INTERNAL_JWT_SECRET: local.JWT_SECRET,
      SUPABASE_INTERNAL_HOST_PORT: "54321",
      SUPABASE_INTERNAL_DEBUG: "false",
      SUPABASE_INTERNAL_WALLCLOCK_LIMIT_SEC: "150",
      SUPABASE_INTERNAL_FUNCTIONS_CONFIG: JSON.stringify(config),
    })
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  execFileSync(
    "docker",
    [
      "run",
      "-d",
      "--name",
      "kitchen_cloud_edge",
      "--label",
      "smart-kitchen.cloud-edge=true",
      "--network",
      "supabase_network_kitchen-overiew",
      "--network-alias",
      "supabase_edge_runtime_kitchen-overiew",
      "--entrypoint",
      "/bin/sh",
      "--env-file",
      envFile,
      "--mount",
      `type=bind,src=${resolve(".cloud-edge")},dst=/cloud-edge,readonly`,
      "supabase/edge-runtime:v1.70.0",
      "-c",
      'export NO_PROXY="${NO_PROXY},kong,auth,rest,storage"; export no_proxy="$NO_PROXY"; exec edge-runtime start --main-service=/cloud-edge/main --port=8081 --policy=per_worker',
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const health = await fetch(
        `${local.API_URL}/functions/v1/_internal/health`,
        { signal: AbortSignal.timeout(500) },
      );
      ready = health.ok && (await health.json()).message === "ok";
    } catch {}
    if (ready) break;
    await delay(200);
  }
  if (!ready)
    throw new Error(
      "Cloud Edge runtime did not become healthy; inspect kitchen_cloud_edge logs",
    );
  console.log(
    "Started cloud-only Edge Runtime with JWT verification; no host port or public tunnel created.",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
