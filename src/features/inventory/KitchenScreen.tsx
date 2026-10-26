import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pendingIntent, submitIntent } from "./intent";
import { useState } from "react";
import { useWindowDimensions } from "react-native";
import { BatchEditor } from "./BatchDetail";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Decimal } from "decimal.js";
import { AuthGate } from "../auth/AuthGate";
import { useHousehold } from "../auth/useHousehold";
import { useAuth } from "../auth/Providers";
import {
  Body,
  Button,
  Card,
  Loading,
  Problem,
  Screen,
  Field,
  Choice,
  Toolbar,
  Disclosure,
  SplitPane,
  ItemRow,
  Heading,
} from "../../shared/ui";
import { messageOf } from "../../shared/errors";
import { useInventory, useLocations } from "./api";
import { expiryState } from "./quantity";
function Inventory() {
  const inventory = useInventory();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 960 && fontScale <= 1.3;
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const [selected, setSelected] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
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
      (!filter || b.location_id === filter) &&
      b.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const batch = inventory.data?.find((b) => b.id === selected);
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
      {(saved === "1" || !!notice) && <Body>Stock change saved.</Body>}
      <Toolbar>
        <Button
          variant="primary"
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
      </Toolbar>
      <Card>
        <Field
          label="Search ingredients"
          value={search}
          onChangeText={setSearch}
        />
        <Choice
          label="Storage"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "", label: "All locations" },
            ...(locations.data ?? []).map((l) => ({
              value: l.id,
              label: l.name,
            })),
          ]}
        />
        <Disclosure title="More filters">
          <Button
            title={
              history ? "Hide exhausted batches" : "Include exhausted batches"
            }
            onPress={() => setHistory(!history)}
          />
        </Disclosure>
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
      <SplitPane
        main={
          <>
            <Heading>{batches.length} batches</Heading>
            {batches.map((b) => (
              <ItemRow
                key={b.id}
                title={b.name}
                trailing={`${new Decimal(b.quantity).toFixed()} ${b.base_unit}`}
                subtitle={`${b.location} · ${b.expiry ? `${b.expiry} · ${expiryState(b.expiry, h.data?.timezone ?? "UTC")}` : "Expiry unknown"}`}
                selected={!!wide && selected === b.id}
                onPress={() => {
                  if (wide) setSelected(b.id);
                  else
                    router.push({
                      pathname: "/inventory/[id]",
                      params: { id: b.id },
                    });
                }}
              />
            ))}
          </>
        }
        detail={
          wide ? (
            batch ? (
              <BatchEditor
                key={`${batch.id}:${batch.revision}`}
                batch={batch}
                onSaved={() => setNotice("saved")}
              />
            ) : (
              <Card>
                <Heading>Ingredient details</Heading>
                <Body>Select a batch to adjust stock, location or expiry.</Body>
              </Card>
            )
          ) : null
        }
      />
    </>
  );
}
export function KitchenScreen() {
  return (
    <Screen title="Your kitchen" subtitle="Your ingredients, at a glance">
      <AuthGate>
        <Inventory />
      </AuthGate>
    </Screen>
  );
}
