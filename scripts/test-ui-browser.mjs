import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { localBackend } from "./local-backend.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = fileURLToPath(new URL("../.ui-artifacts/", import.meta.url));
await mkdir(artifacts, { recursive: true });
const require = createRequire(new URL("../package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const settings = localBackend();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, opts);
const api = createClient(settings.API_URL, settings.ANON_KEY, opts);
const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};
const email = `ui-${randomUUID()}@example.test`,
  password = `Ui-test-${randomUUID()}`;
let user, browser, server;
try {
  const occupied = await fetch("http://localhost:8091").then(
    () => true,
    () => false,
  );
  assert.equal(
    occupied,
    false,
    "Port 8091 must be free for the isolated UI test",
  );
  user = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  ).user.id;
  ok(await api.auth.signInWithPassword({ email, password }));
  const h = ok(await api.rpc("bootstrap_household", { p_timezone: "UTC" }));
  const locations = ok(
    await api.from("storage_locations").select("id,name").eq("household_id", h),
  );
  for (const [index, name] of [
    "Brown rice",
    "Cherry tomatoes",
    "Oat milk",
    "Greek yogurt",
    "Fresh spinach",
    "Rolled oats",
    "Red lentils",
    "Olive oil",
  ].entries()) {
    ok(
      await api.rpc("mutate_inventory", {
        p_household: h,
        p_operation: randomUUID(),
        p_request: {
          action: "create",
          name,
          base_unit: "g",
          quantity: "500",
          package_count: 1,
          package_size: "500",
          location_id: locations[index % locations.length].id,
          expiry: index % 2 ? "2026-11-05" : null,
        },
      }),
    );
  }
  server = spawn(
    process.execPath,
    [
      "node_modules/expo/bin/cli",
      "start",
      "--web",
      "--port",
      "8091",
      "--localhost",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        EXPO_PUBLIC_SUPABASE_URL: settings.API_URL,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: settings.ANON_KEY,
        EXPO_NO_TELEMETRY: "1",
        EXPO_OFFLINE: "1",
        CI: "1",
      },
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://localhost:8091")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /Unexpected text node/.test(m.text()))
      errors.push(m.text());
  });
  await page.goto("http://localhost:8091");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: /Brown rice, 500 g/ }).waitFor();
  await page.screenshot({ path: `${artifacts}kitchen-desktop.png` });
  await page.getByRole("button", { name: /Brown rice, 500 g/ }).click();
  await page.getByRole("heading", { name: "Batch settings" }).waitFor();
  await page.getByRole("radio", { name: "Move location", exact: true }).click();
  await page.getByRole("button", { name: /Storage location:/ }).click();
  await page.getByLabel("Search storage location").fill("fridge");
  await page.getByRole("radio", { name: /Fridge/ }).click();
  await page
    .getByRole("button", { name: "Confirm change", exact: true })
    .click();
  await page.getByText("Stock change saved.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Edit product: Brown rice", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    "Brown rice",
  );
  await page.goto("http://localhost:8091");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Brown rice, 500 g/ }).waitFor();
  await page.screenshot({ path: `${artifacts}kitchen-mobile-web.png` });
  const visibleRows = await page
    .getByRole("button")
    .evaluateAll(
      (nodes) =>
        nodes.filter(
          (n) =>
            /500 g/.test(n.getAttribute("aria-label") ?? "") &&
            n.getBoundingClientRect().top >= 0 &&
            n.getBoundingClientRect().bottom < innerHeight - 72,
        ).length,
    );
  assert.ok(
    visibleRows >= 4,
    "At least four ingredient rows fit the 390×844 viewport",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "mobile overflow",
  );
  await page.getByRole("button", { name: /Brown rice, 500 g/ }).click();
  await page.getByRole("heading", { name: "Batch settings" }).waitFor();
  await page.getByRole("button", { name: /More batch actions/ }).click();
  await page
    .getByRole("button", { name: "Remove remaining stock", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm removal of all remaining stock",
      exact: true,
    })
    .waitFor();
  assert.equal(
    ok(await api.rpc("get_inventory", { p_household: h })).find(
      (b) => b.name === "Brown rice",
    ).quantity,
    "500.000000",
    "choosing removal must not mutate stock",
  );
  await page.screenshot({ path: `${artifacts}kitchen-detail-mobile.png` });
  for (const route of ["shopping", "planner", "recipes", "receipts"]) {
    await page.goto(`http://localhost:8091/${route}`);
    await page
      .getByRole("button", { name: "Account settings", exact: true })
      .waitFor();
    await page.waitForTimeout(500);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${route} overflow`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop/mobile-web sign-in, list/detail navigation, storage selection + confirmed mutation, selected product settings, removal confirmation gate, four routes, no horizontal overflow or JS/raw-text errors.",
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  if (user) {
    ok(await admin.rpc("begin_account_erasure", { p_user: user }));
    ok(await admin.rpc("purge_account_household", { p_user: user }));
    ok(await admin.auth.admin.deleteUser(user));
    ok(await admin.rpc("finish_account_erasure", { p_user: user }));
  }
}
