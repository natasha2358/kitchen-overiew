import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
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
const directory = mkdtempSync(join(tmpdir(), "kitchen-edge-"));
const envFile = join(directory, "runtime.env");
try {
  writeFileSync(
    envFile,
    Object.entries({
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
