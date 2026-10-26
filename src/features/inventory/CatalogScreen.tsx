import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import {
  Choice,
  Segments,
  Toolbar,
  Disclosure,
  SplitPane,
  Body,
  Button,
  Card,
  Field,
  Problem,
  Screen,
  Loading,
} from "../../shared/ui";
import { AuthGate } from "../auth/AuthGate";
import { useAuth } from "../auth/Providers";
import { useHousehold } from "../auth/useHousehold";
import { productSchema, useLocations, useProducts } from "./api";
function Catalog({ initial }: { initial?: z.infer<typeof productSchema> }) {
  const h = useHousehold();
  const products = useProducts();
  const locations = useLocations();
  const client = useQueryClient();
  const { online } = useAuth();
  const [kind, setKind] = useState<"product" | "location">(
    initial ? "product" : "location",
  );
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [aliases, setAliases] = useState(initial?.aliases.join(", ") ?? "");
  const [unit, setUnit] = useState<"g" | "ml" | "item">(
    initial?.base_unit ?? "g",
  );
  const [staple, setStaple] = useState(initial?.always_available ?? false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(remove = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!online || !h.data)
        throw new Error("Connect before editing your kitchen.");
      const table = kind === "product" ? "products" : "storage_locations";
      if (remove) {
        if (!id) throw new Error("Select an existing record first.");
        const r = await backend()
          .from(table)
          .delete()
          .eq("id", id)
          .eq("household_id", h.data.id);
        if (r.error) throw r.error;
      } else if (kind === "product") {
        const values = {
          name: z.string().trim().min(1).max(120).parse(name),
          base_unit: unit,
          always_available: staple,
          aliases: z
            .array(z.string().trim().min(1).max(120))
            .max(50)
            .parse(
              aliases
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
            ),
        };
        const r = id
          ? await backend()
              .from("products")
              .update(values)
              .eq("id", id)
              .eq("household_id", h.data.id)
          : await backend()
              .from("products")
              .insert({ ...values, household_id: h.data.id });
        if (r.error) throw r.error;
      } else {
        const label = z.string().trim().min(1).max(80).parse(name);
        const r = id
          ? await backend()
              .from("storage_locations")
              .update({ name: label })
              .eq("id", id)
              .eq("household_id", h.data.id)
          : await backend()
              .from("storage_locations")
              .insert({ name: label, household_id: h.data.id });
        if (r.error) throw r.error;
      }
      await Promise.all(
        [
          "products",
          "locations",
          "inventory",
          "meal-context",
          "suggestions",
        ].map((key) =>
          client.invalidateQueries({ queryKey: [key, h.data?.id] }),
        ),
      );
      setNotice(remove ? "Unused record deleted." : "Settings saved.");
      setConfirmDelete(false);
      if (remove || !id) {
        setId("");
        setName("");
        setAliases("");
        setStaple(false);
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SplitPane
      main={
        <Card>
          <Disclosure title="About products and storage">
            <Body>
              Products with batch history and locations referenced by batches
              cannot be deleted. Rename them or move active stock; history is
              preserved.
            </Body>
          </Disclosure>
          <Toolbar>
            <Button
              title="New location"
              onPress={() => {
                setConfirmDelete(false);
                setNotice("");
                setError("");
                setKind("location");
                setId("");
                setName("");
              }}
              disabled={busy}
            />
            <Button
              title="New product"
              onPress={() => {
                setConfirmDelete(false);
                setNotice("");
                setError("");
                setKind("product");
                setId("");
                setName("");
                setAliases("");
                setStaple(false);
              }}
              disabled={busy}
            />
          </Toolbar>
          <Choice
            label="Edit existing"
            value={id ? `${kind}:${id}` : ""}
            options={[
              ...(products.data ?? []).map((p) => ({
                value: `product:${p.id}`,
                label: `Product · ${p.name}`,
              })),
              ...(locations.data ?? []).map((l) => ({
                value: `location:${l.id}`,
                label: `Location · ${l.name}`,
              })),
            ]}
            disabled={busy}
            onChange={(value) => {
              setConfirmDelete(false);
              setNotice("");
              setError("");
              const p = products.data?.find((p) => value === `product:${p.id}`);
              if (p) {
                setKind("product");
                setId(p.id);
                setName(p.name);
                setAliases(p.aliases.join(", "));
                setUnit(p.base_unit);
                setStaple(p.always_available);
              }
              const l = locations.data?.find(
                (l) => value === `location:${l.id}`,
              );
              if (l) {
                setKind("location");
                setId(l.id);
                setName(l.name);
              }
            }}
          />
          {!!products.isError && (
            <Problem message={messageOf(products.error)} />
          )}
          {!!locations.isError && (
            <Problem message={messageOf(locations.error)} />
          )}
        </Card>
      }
      detail={
        <Card>
          <Body>
            {id ? "Edit" : "Create"} {kind}
          </Body>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            editable={!busy}
          />
          {kind === "product" && (
            <>
              <Field
                label="Confirmed aliases (comma-separated)"
                value={aliases}
                onChangeText={setAliases}
                editable={!busy}
              />
              <Button
                title={
                  staple
                    ? "✓ Assume this staple is available for suggestions"
                    : "Optionally assume this staple is available"
                }
                onPress={() => setStaple((v) => !v)}
                disabled={busy}
              />
              <Body>
                This changes meal suggestions only. It adds no stock and never
                skips cooking deductions.
              </Body>
              <Segments
                label="Base unit"
                value={unit}
                options={(["g", "ml", "item"] as const).map((u) => ({
                  value: u,
                  label: u,
                }))}
                onChange={setUnit}
                disabled={busy || !!id}
              />
              {!!id && (
                <Body>
                  The unit of an existing product is fixed to preserve stock
                  history.
                </Body>
              )}
            </>
          )}
          {!!notice && <Body>{notice}</Body>}
          {!!error && <Problem message={error} />}
          <Button
            variant="primary"
            title="Save"
            onPress={() => void save()}
            disabled={busy || !online}
          />
          {!!id && (
            <Disclosure title="More settings">
              {confirmDelete ? (
                <>
                  <Body>
                    Delete {name}? Only unused records can be deleted.
                  </Body>
                  <Toolbar>
                    <Button
                      title="Confirm delete unused record"
                      variant="danger"
                      onPress={() => void save(true)}
                      disabled={busy || !online}
                    />
                    <Button
                      title="Cancel deletion"
                      onPress={() => setConfirmDelete(false)}
                      disabled={busy}
                    />
                  </Toolbar>
                </>
              ) : (
                <Button
                  title="Delete unused record"
                  variant="danger"
                  onPress={() => setConfirmDelete(true)}
                  disabled={busy || !online}
                />
              )}
            </Disclosure>
          )}
        </Card>
      }
    />
  );
}
export function CatalogScreen() {
  const { product } = useLocalSearchParams<{ product?: string }>();
  const products = useProducts();
  return (
    <Screen title="Your kitchen catalogue">
      <AuthGate>
        {product && products.isPending ? (
          <Loading />
        ) : product && products.isError ? (
          <Problem message={messageOf(products.error)} />
        ) : (
          <Catalog
            key={product ?? "catalog"}
            initial={products.data?.find((p) => p.id === product)}
          />
        )}
      </AuthGate>
    </Screen>
  );
}
