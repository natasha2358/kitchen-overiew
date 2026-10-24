import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { localBackend } from "./local-backend.mjs";
const settings = localBackend();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const api = createClient(settings.API_URL, settings.ANON_KEY, options),
  admin = createClient(settings.API_URL, settings.SERVICE_ROLE_KEY, options);
const db = new pg.Client({ connectionString: settings.DB_URL });
await db.connect();
const email = `auth-test-${randomUUID()}@example.test`,
  password = `Local-test-${randomUUID()}`;
let user;
async function emailLink(subject) {
  const mail = settings.INBUCKET_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(mail))
    throw new Error("Local Mailpit is required");
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = await fetch(
      `${mail}/api/v1/search?query=${encodeURIComponent("to:" + email)}`,
    ).then((r) => r.json());
    const message = found.messages?.find((m) => subject.test(m.Subject));
    if (message) {
      const body = await fetch(`${mail}/api/v1/message/${message.ID}`).then(
        (r) => r.json(),
      );
      const link = body.HTML?.match(
        /href="([^"]*\/auth\/v1\/verify[^\"]*)"/,
      )?.[1]?.replaceAll("&amp;", "&");
      if (link && new URL(link).origin === settings.API_URL) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "Expected local confirmation/recovery email was not delivered",
  );
}
try {
  const signup = await api.auth.signUp({ email, password });
  assert.equal(signup.error, null);
  assert.equal(signup.data.session, null, "email verification must be enabled");
  user = signup.data.user?.id;
  assert.ok(user);
  assert.ok(
    (await api.auth.signInWithPassword({ email, password })).error,
    "unverified sign-in must fail",
  );
  const confirmed = await fetch(await emailLink(/confirm/i), {
    redirect: "manual",
  });
  assert.ok(
    [302, 303].includes(confirmed.status),
    "confirmation redirects to the app",
  );
  assert.equal(
    (await api.auth.signInWithPassword({ email, password })).error,
    null,
  );
  const household = await api.rpc("bootstrap_household", {
    p_timezone: "Europe/Skopje",
  });
  assert.equal(household.error, null);
  assert.equal((await api.auth.resetPasswordForEmail(email)).error, null);
  const reset = await fetch(await emailLink(/reset/i), { redirect: "manual" });
  assert.ok([302, 303].includes(reset.status), "recovery redirects to the app");
  const location = reset.headers.get("location");
  assert.ok(location);
  const params = new URLSearchParams(new URL(location).hash.slice(1));
  const access = params.get("access_token"),
    refresh = params.get("refresh_token");
  assert.ok(access && refresh, "recovery must issue a usable session");
  assert.equal(
    (
      await api.auth.setSession({
        access_token: access,
        refresh_token: refresh,
      })
    ).error,
    null,
  );
  const changed = `Changed-${randomUUID()}`;
  assert.equal((await api.auth.updateUser({ password: changed })).error, null);
  assert.equal((await api.auth.signOut()).error, null);
  assert.ok((await api.auth.signInWithPassword({ email, password })).error);
  assert.equal(
    (await api.auth.signInWithPassword({ email, password: changed })).error,
    null,
  );
  await api.auth.signOut();
  console.log(
    "PASS real email signup, unverified denial, Mailpit confirmation, sign-in, household bootstrap, emailed recovery, password update, old-password rejection and sign-out",
  );
} finally {
  if (user) {
    const rows = await db.query(
      "select household_id from public.household_memberships where user_id=$1",
      [user],
    );
    for (const row of rows.rows) {
      await db.query(
        "delete from public.storage_locations where household_id=$1",
        [row.household_id],
      );
      await db.query(
        "delete from public.household_memberships where household_id=$1",
        [row.household_id],
      );
      await db.query("delete from public.households where id=$1", [
        row.household_id,
      ]);
    }
    await admin.auth.admin.deleteUser(user);
  }
  await db.end();
}
