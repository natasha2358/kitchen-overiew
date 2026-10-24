import { submitIntent } from "./intent";
import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { backend } from "../../shared/supabase";
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
import { AuthGate } from "../auth/AuthGate";
import { useAuth } from "../auth/Providers";
import { useHousehold } from "../auth/useHousehold";
import { Batch, useInventory, useLocations } from "./api";
import { decimalSchema } from "./quantity";
const historySchema = z.array(
  z.object({
    id: z.uuid(),
    delta: z.string(),
    balance: decimalSchema,
    reason: z.string(),
    created_at: z.string(),
  }),
);
function Editor({ batch }: { batch: Batch }) {
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const locations = useLocations();
  const [action, setAction] = useState<
    "add" | "adjust" | "waste" | "move" | "edit" | "remove"
  >("adjust");
  const [quantity, setQuantity] = useState("");
  const [expiry, setExpiry] = useState(batch.expiry ?? "");
  const [location, setLocation] = useState(batch.location_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; operation: string } | null>(null);
  const history = useQuery({
    queryKey: ["history", h.data?.id, batch.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable");
      const result = await backend().rpc("get_batch_history", {
        p_household: h.data.id,
        p_batch: batch.id,
      });
      if (result.error) throw result.error;
      return historySchema.parse(result.data);
    },
  });
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!online || !h.data) throw new Error("Connect before changing stock.");
      const request = {
        action,
        batch_id: batch.id,
        revision: batch.revision,
        base_unit: batch.base_unit,
        ...(action === "move"
          ? { location_id: location }
          : action === "edit"
            ? { expiry: expiry ? z.iso.date().parse(expiry) : null }
            : action === "remove"
              ? {}
              : { quantity: decimalSchema.parse(quantity) }),
      };
      const signature = JSON.stringify(request);
      if (pending.current?.signature !== signature)
        pending.current = { signature, operation: randomUUID() };
      await submitIntent(h.data.id, pending.current.operation, request);
      await client.invalidateQueries({ queryKey: ["inventory", h.data.id] });
      await client.invalidateQueries({
        queryKey: ["history", h.data.id, batch.id],
      });
      pending.current = null;
      router.replace("/");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      await client.invalidateQueries({
        queryKey: ["stock-intent", h.data?.id],
      });
      setBusy(false);
    }
  }
  return (
    <>
      <Card>
        <Body>
          {batch.name} · {batch.quantity} {batch.base_unit}
        </Body>
        <Body>
          {batch.location} · {batch.expiry ?? "Expiry unknown"}
        </Body>
        {(["adjust", "add", "waste", "move", "edit", "remove"] as const).map(
          (a) => (
            <Button
              key={a}
              title={
                (action === a ? "✓ " : "") +
                {
                  adjust: "Set remaining quantity",
                  add: "Add to this batch",
                  waste: "Record waste",
                  move: "Move location",
                  edit: "Edit expiry",
                  remove: "Remove remaining stock",
                }[a]
              }
              onPress={() => setAction(a)}
              disabled={busy}
            />
          ),
        )}
        {["add", "adjust", "waste"].includes(action) && (
          <Field
            label={`Quantity (${batch.base_unit})`}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            editable={!busy}
          />
        )}
        {action === "move" &&
          locations.data?.map((l) => (
            <Button
              key={l.id}
              title={(location === l.id ? "✓ " : "") + l.name}
              onPress={() => setLocation(l.id)}
              disabled={busy}
            />
          ))}
        {action === "edit" && (
          <Field
            label="Expiry (YYYY-MM-DD, blank for unknown)"
            value={expiry}
            onChangeText={setExpiry}
            editable={!busy}
          />
        )}
        {action === "remove" && (
          <Body>
            Confirming sets this batch to zero and records a removal. Its stock
            history stays available.
          </Body>
        )}
        {error && <Problem message={error} />}
        <Button
          title={busy ? "Saving…" : "Confirm change"}
          onPress={() => void save()}
          disabled={busy || !online}
        />
        <Button
          title="Refresh stock after a conflict"
          onPress={() =>
            void client.invalidateQueries({
              queryKey: ["inventory", h.data?.id],
            })
          }
          disabled={busy || !online}
        />
      </Card>
      <Card>
        <Body>Stock history</Body>
        {history.isPending && <Loading />}
        {history.isError && <Problem message={messageOf(history.error)} />}
        {history.data?.map((m) => (
          <Body key={m.id}>
            {m.reason}: {m.delta} {batch.base_unit} → {m.balance} ·{" "}
            {new Date(m.created_at).toLocaleString()}
          </Body>
        ))}
      </Card>
    </>
  );
}
function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const inventory = useInventory();
  const batch = inventory.data?.find((b) => b.id === id);
  if (inventory.isPending) return <Loading />;
  if (inventory.isError)
    return <Problem message={messageOf(inventory.error)} />;
  return batch ? (
    <Editor key={`${batch.id}:${batch.revision}`} batch={batch} />
  ) : (
    <Body>Batch unavailable in this kitchen.</Body>
  );
}
export function BatchDetail() {
  return (
    <Screen title="Manage batch">
      <AuthGate>
        <Detail />
      </AuthGate>
    </Screen>
  );
}
