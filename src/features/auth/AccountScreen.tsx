import { useState } from "react";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { appConfig } from "../../shared/config";
import { sessionStorageAdapter } from "../../shared/session-storage";
import { messageOf } from "../../shared/errors";
import {
  Body,
  Button,
  Card,
  Field,
  Loading,
  Problem,
  Screen,
} from "../../shared/ui";
import { useAuth } from "./Providers";
import { AuthPanel } from "./AuthPanel";
const preparationSchema = z.object({
  prepared: z.literal(true),
  household_id: z.uuid().nullable(),
  receipt_ids: z.array(z.uuid()),
});
export async function clearErasedHousehold(
  household: string | null,
  receipts: string[],
) {
  if (!household) return;
  const keys = [
    `stock-intent.${household}`,
    `meal-request.${household}`,
    `cooking.${household}`,
    `shopping.${household}`,
    `planner.${household}`,
    ...receipts.map((id) => `receipt-confirm.${household}.${id}`),
  ];
  for (const key of keys) await sessionStorageAdapter.removeItem(key);
}
export function AccountScreen() {
  const { session, online, loading, recovery } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function erase() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!session || !online) throw new Error("Reconnect and sign in first.");
      const input = z
        .object({
          password: z.string().min(1).max(128),
          confirmation: z.literal("DELETE MY ACCOUNT"),
        })
        .parse({ password, confirmation });
      async function invoke(action: "prepare" | "continue") {
        const r = await backend().functions.invoke("erase-account", {
          body: { ...input, action },
        });
        if (r.error) {
          if (r.error.context instanceof Response) {
            const body = z
              .object({ error: z.string() })
              .safeParse(await r.error.context.json());
            if (body.success) throw new Error(body.data.error);
          }
          throw r.error;
        }
        return r.data;
      }
      const prepared = preparationSchema.parse(await invoke("prepare"));
      // Erase pending device drafts before requesting irreversible server deletion.
      await clearErasedHousehold(prepared.household_id, prepared.receipt_ids);
      await client.cancelQueries();
      client.clear();
      const result = z
        .discriminatedUnion("deleted", [
          z.object({ deleted: z.literal(true) }),
          z.object({ deleted: z.literal(false), pending: z.literal(true) }),
        ])
        .parse(await invoke("continue"));
      if (!result.deleted) {
        setNotice(
          "Deletion is in progress. Press Resume account erasure to remove the remaining files.",
        );
        return;
      }
      setPassword("");
      setConfirmation("");
      await backend().auth.signOut({ scope: "local" });
      router.replace("/");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  return (
    <Screen title="Account">
      {!appConfig.success ? (
        <Problem message="Configure your Supabase connection before managing an account." />
      ) : loading ? (
        <Loading />
      ) : !session || recovery ? (
        <AuthPanel />
      ) : (
        <Card>
          <Body>Delete your account and its kitchen</Body>
          <Body>
            This permanently removes your private PDFs, inventory, receipts,
            meals, shopping lists and plans, then your sign-in account. This
            cannot be undone. Writes freeze when preparation starts; interrupted
            deletion must be resumed here.
          </Body>
          <Body>
            Only a sole household owner can use this workflow. Enter your
            current password to verify this request.
          </Body>
          <Field
            label="Current password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
          />
          <Field
            label="Type DELETE MY ACCOUNT"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            editable={!busy}
          />
          {error && <Problem message={error} />}{" "}
          {notice && <Body>{notice}</Body>}
          <Button
            title={
              busy
                ? "Erasing account…"
                : "Permanently delete / resume account erasure"
            }
            onPress={() => void erase()}
            disabled={
              busy ||
              !online ||
              confirmation !== "DELETE MY ACCOUNT" ||
              !password
            }
          />
          <Button
            title="Sign out to sign in again"
            disabled={busy}
            onPress={() => void backend().auth.signOut({ scope: "local" })}
          />
        </Card>
      )}
    </Screen>
  );
}
