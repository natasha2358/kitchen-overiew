import { submitIntent } from "./intent";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useRouter } from "expo-router";
import { z } from "zod";
import { AuthGate } from "../auth/AuthGate";
import { useHousehold } from "../auth/useHousehold";
import { useAuth } from "../auth/Providers";
import { Body, Button, Card, Field, Problem, Screen } from "../../shared/ui";
import { messageOf } from "../../shared/errors";
import { useLocations, useProducts } from "./api";
import { canonicalQuantity, matchProducts, Unit, unitSchema } from "./quantity";
function Form() {
  const locations = useLocations();
  const products = useProducts();
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("g");
  const [packages, setPackages] = useState("1");
  const [expiry, setExpiry] = useState("");
  const [location, setLocation] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ signature: string; operation: string } | null>(null);
  async function save() {
    setError("");
    setBusy(true);
    try {
      if (!online || !h.data)
        throw new Error("Connect and load your kitchen first.");
      const label = z.string().trim().min(1).max(120).parse(name);
      const date = expiry ? z.iso.date().parse(expiry) : null;
      const amount = canonicalQuantity(
        quantity,
        unitSchema.parse(unit),
        packages,
      );
      const request = {
        action: "create",
        name: label,
        ...amount,
        expiry: date,
        location_id: z.uuid().parse(location),
        ...(productId ? { product_id: productId } : {}),
      };
      const signature = JSON.stringify(request);
      if (!pending.current || pending.current.signature !== signature)
        pending.current = { signature, operation: randomUUID() };
      await submitIntent(h.data.id, pending.current.operation, request);
      await client.invalidateQueries({ queryKey: ["inventory", h.data.id] });
      await client.invalidateQueries({ queryKey: ["products", h.data.id] });
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
  const matches = matchProducts(name, products.data ?? []);
  return (
    <Card>
      <Field
        label="Product name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          setProductId("");
        }}
        editable={!busy}
      />
      {matches.length > 0 && (
        <Body>
          {matches.length > 1
            ? "Several names or aliases match. Choose the correct product, or use a new name."
            : "Existing product match — select to use it."}
        </Body>
      )}
      {matches.map((p) => (
        <Button
          key={p.id}
          title={
            (productId === p.id ? "✓ " : "") + p.name + " (" + p.base_unit + ")"
          }
          onPress={() => {
            setProductId(p.id);
            setUnit(p.base_unit);
          }}
          disabled={busy}
        />
      ))}
      <Field
        label="Quantity per package"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
        editable={!busy}
      />
      <Body>Unit</Body>
      {unitSchema.options.map((u) => (
        <Button
          key={u}
          title={(unit === u ? "✓ " : "") + u}
          onPress={() => setUnit(u)}
          disabled={busy}
        />
      ))}
      <Field
        label="Number of packages"
        value={packages}
        onChangeText={setPackages}
        keyboardType="number-pad"
        editable={!busy}
      />
      <Body>Storage location</Body>
      {locations.data?.map((l) => (
        <Button
          key={l.id}
          title={(location === l.id ? "✓ " : "") + l.name}
          onPress={() => setLocation(l.id)}
          disabled={busy}
        />
      ))}
      <Field
        label="Expiry (YYYY-MM-DD, optional)"
        value={expiry}
        onChangeText={setExpiry}
        placeholder="Unknown"
        editable={!busy}
      />
      {error && <Problem message={error} />}
      <Button
        title={busy ? "Saving…" : "Add groceries"}
        onPress={() => void save()}
        disabled={busy || !online || (matches.length > 1 && !productId)}
      />
    </Card>
  );
}
export function BatchForm() {
  return (
    <Screen
      title="Add groceries"
      subtitle="Track a batch, not individual packages."
    >
      <AuthGate>
        <Form />
      </AuthGate>
    </Screen>
  );
}
