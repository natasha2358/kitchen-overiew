import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pendingIntent, submitIntent } from "./intent";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Decimal } from "decimal.js";
import { AuthGate } from "../auth/AuthGate";
import { useHousehold } from "../auth/useHousehold";
import { useAuth } from "../auth/Providers";
import { Body, Button, Card, Loading, Problem, Screen } from "../../shared/ui";
import { messageOf } from "../../shared/errors";
import { useInventory, useLocations } from "./api";
import { expiryState, sumQuantities } from "./quantity";
function Inventory() {
  const inventory = useInventory();
  const locations = useLocations();
  const h = useHousehold();
  const router = useRouter();
  const { online } = useAuth();
  const client = useQueryClient();
  const intent = useQuery({
    queryKey: ["stock-intent", h.data?.id],
    enabled: !!h.data,
    staleTime: 0,
    queryFn: () => (h.data ? pendingIntent(h.data.id) : null),
  });
  const [reconciling, setReconciling] = useState(false);
  const [intentError, setIntentError] = useState("");
  async function reconcile() {
    if (!h.data || !intent.data || !online) return;
    setReconciling(true);
    setIntentError("");
    try {
      await submitIntent(h.data.id, intent.data.operation, intent.data.request);
      await client.invalidateQueries({ queryKey: ["inventory", h.data.id] });
    } catch (e) {
      setIntentError(messageOf(e));
    } finally {
      await intent.refetch();
      setReconciling(false);
    }
  }
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState(false);
  const batches = (inventory.data ?? []).filter(
    (b) =>
      (history || new Decimal(b.quantity).gt(0)) &&
      (!filter || b.location_id === filter),
  );
  return (
    <>
      {!!intent.data && (
        <Card>
          <Body>
            A previous stock request needs reconciliation. Retrying uses the
            same operation ID and cannot apply it twice.
          </Body>
          <Button
            title="Reconcile previous stock request"
            onPress={() => void reconcile()}
            disabled={reconciling || !online}
          />
        </Card>
      )}
      {!!intentError && <Problem message={intentError} />}
      <Button
        title="Add groceries"
        onPress={() => router.push("/inventory/new")}
        disabled={!online}
      />
      <Button
        title="Import a receipt"
        onPress={() => router.push("/receipts")}
        disabled={!online}
      />
      <Button
        title="Products and storage locations"
        onPress={() => router.push("/inventory/catalog")}
      />
      <Card>
        <Body>Storage filter</Body>
        <Button
          title={filter ? "Show all locations" : "All locations selected"}
          onPress={() => setFilter("")}
        />
        {locations.data?.map((l) => (
          <Button
            key={l.id}
            title={(filter === l.id ? "✓ " : "") + l.name}
            onPress={() => setFilter(l.id)}
          />
        ))}
        <Button
          title={
            history ? "Hide exhausted batches" : "Include exhausted batches"
          }
          onPress={() => setHistory(!history)}
        />
      </Card>
      {!!inventory.isPending && <Loading />}
      {!!inventory.isError && (
        <Card>
          <Problem message={messageOf(inventory.error)} />
          <Button
            title="Retry inventory"
            onPress={() => void inventory.refetch()}
            disabled={!online}
          />
        </Card>
      )}
      {!inventory.isPending && !inventory.isError && !batches.length && (
        <Card>
          <Body>Your kitchen has room for something good.</Body>
          <Body>Add your first groceries, or choose a different filter.</Body>
        </Card>
      )}
      {batches.map((b) => (
        <Card key={b.id}>
          <Body>{b.name}</Body>
          <Body>
            {new Decimal(b.quantity).toFixed()} {b.base_unit} · {b.location}
          </Body>
          <Body>
            Product total:{" "}
            {sumQuantities(
              (inventory.data ?? [])
                .filter((other) => other.product_id === b.product_id)
                .map((other) => other.quantity),
            )}{" "}
            {b.base_unit}
          </Body>
          <Body>
            {b.expiry
              ? `Expiry ${b.expiry} · ${expiryState(b.expiry, h.data?.timezone ?? "UTC")}`
              : "Expiry unknown"}
          </Body>
          <Button
            title={`Manage ${b.name} batch`}
            onPress={() =>
              router.push({ pathname: "/inventory/[id]", params: { id: b.id } })
            }
          />
        </Card>
      ))}
    </>
  );
}
export function KitchenScreen() {
  return (
    <Screen
      title="Your kitchen"
      subtitle="A little less waste. A little more possibility."
    >
      <AuthGate>
        <Inventory />
      </AuthGate>
    </Screen>
  );
}
