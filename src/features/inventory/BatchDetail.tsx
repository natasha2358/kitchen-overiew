import { Decimal } from "decimal.js";
import { submitIntent } from "./intent";
import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import {
  Choice,
  Disclosure,
  Heading,
  Segments,
  Toolbar,
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
import { decimalSchema, sumQuantities } from "./quantity";
const historySchema = z.array(
  z.object({
    id: z.uuid(),
    delta: z.string(),
    balance: decimalSchema,
    reason: z.string(),
    created_at: z.string(),
  }),
);
export function BatchEditor({
  batch,
  onSaved,
}: {
  batch: Batch;
  onSaved?: () => void;
}) {
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const locations = useLocations();
  const inventory = useInventory();
  const [action, setAction] = useState<
    "add" | "adjust" | "waste" | "move" | "edit" | "remove"
  >("adjust");
  const [quantity, setQuantity] = useState(batch.quantity);
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
      if (onSaved) onSaved();
      else router.replace({ pathname: "/", params: { saved: "1" } });
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
          {batch.name} · {new Decimal(batch.quantity).toFixed()}{" "}
          {batch.base_unit}
        </Body>
        <Body>
          {batch.location} · {batch.expiry ?? "Expiry unknown"}
        </Body>
        <Heading>Batch settings</Heading>
        <Segments
          label="Change"
          value={action}
          disabled={busy}
          onChange={(next) => {
            setAction(next);
            setQuantity(next === "adjust" ? batch.quantity : "");
          }}
          options={[
            { value: "adjust", label: "Set quantity" },
            { value: "add", label: "Add stock" },
            { value: "move", label: "Move location" },
            { value: "edit", label: "Edit expiry" },
          ]}
        />
        <Disclosure title="More batch actions">
          <Toolbar>
            <Button
              title="Record waste"
              disabled={busy}
              onPress={() => {
                setAction("waste");
                setQuantity("");
              }}
            />
            <Button
              title="Remove remaining stock"
              variant="danger"
              disabled={busy}
              onPress={() => setAction("remove")}
            />
          </Toolbar>
        </Disclosure>
        <Body>
          {action === "waste"
            ? "Record waste"
            : action === "remove"
              ? "Remove remaining stock"
              : "Review the value, then confirm your change."}
        </Body>
        {["add", "adjust", "waste"].includes(action) && (
          <Field
            label={`Quantity (${batch.base_unit})`}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            editable={!busy}
          />
        )}
        {action === "move" && (
          <Choice
            label="Storage location"
            value={location}
            options={(locations.data ?? []).map((l) => ({
              value: l.id,
              label: l.name,
            }))}
            onChange={setLocation}
            disabled={busy}
          />
        )}
        {!!locations.isError && (
          <Problem message={messageOf(locations.error)} />
        )}
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
        {!!error && <Problem message={error} />}
        <Button
          variant={action === "remove" ? "danger" : "primary"}
          title={
            busy
              ? "Saving…"
              : action === "remove"
                ? "Confirm removal of all remaining stock"
                : "Confirm change"
          }
          onPress={() => void save()}
          disabled={busy || !online}
        />
        {!!error && (
          <Button
            title="Refresh stock after a conflict"
            onPress={() =>
              void client.invalidateQueries({
                queryKey: ["inventory", h.data?.id],
              })
            }
            disabled={busy || !online}
          />
        )}
      </Card>
      <Card>
        <Heading>Product settings</Heading>
        {!!inventory.data && (
          <Body>
            Product total:{" "}
            {sumQuantities(
              inventory.data
                .filter(
                  (other) =>
                    other.product_id === batch.product_id &&
                    other.base_unit === batch.base_unit,
                )
                .map((other) => other.quantity),
            )}{" "}
            {batch.base_unit}
          </Body>
        )}
        <Body>
          Name, aliases and staple preferences apply to every batch of this
          ingredient.
        </Body>
        <Button
          title={`Edit product: ${batch.name}`}
          onPress={() =>
            router.push({
              pathname: "/inventory/catalog",
              params: { product: batch.product_id },
            })
          }
          disabled={busy}
        />
      </Card>
      <Card>
        <Disclosure title="Stock history">
          {!!history.isPending && <Loading />}
          {!!history.isError && <Problem message={messageOf(history.error)} />}
          {history.data?.map((m) => (
            <Body key={m.id}>
              {m.reason}: {m.delta} {batch.base_unit} → {m.balance} ·{" "}
              {new Date(m.created_at).toLocaleString()}
            </Body>
          ))}
        </Disclosure>
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
    <BatchEditor key={`${batch.id}:${batch.revision}`} batch={batch} />
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
