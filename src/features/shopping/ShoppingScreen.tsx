import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Decimal } from "decimal.js";
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
import { messageOf } from "../../shared/errors";
import { useProducts } from "../inventory/api";
import { useMealContext, useSuggestion } from "../meals/api";
import { evaluateRecipe } from "../../../supabase/functions/_shared/meals";
import { useListOperation } from "../lists/operations";
import {
  sendShopping,
  shoppingFieldsSchema,
  ShoppingItem,
  useShopping,
} from "./api";
function Editor({
  initial,
  blocked,
  onSave,
}: {
  initial?: ShoppingItem;
  blocked: boolean;
  onSave: (value: ShoppingItem) => Promise<boolean>;
}) {
  const [form, setForm] = useState<ShoppingItem>(
    () =>
      initial ?? {
        id: randomUUID(),
        label: "",
        quantity: "1",
        unit: "item",
        product_id: null,
        checked: false,
        removed: false,
        revision: 0,
      },
  );
  const [error, setError] = useState("");
  const products = useProducts();
  return (
    <Card>
      <Body>{initial ? "Edit shopping item" : "Add a shopping item"}</Body>
      <Field
        label="Item name"
        value={form.label}
        editable={!blocked}
        onChangeText={(label) => setForm({ ...form, label, product_id: null })}
      />
      <Field
        label="Quantity"
        value={form.quantity}
        keyboardType="decimal-pad"
        editable={!blocked}
        onChangeText={(quantity) => setForm({ ...form, quantity })}
      />
      {(["g", "ml", "item"] as const).map((unit) => (
        <Button
          key={unit}
          title={(unit === form.unit ? "✓ " : "") + unit}
          disabled={blocked}
          onPress={() => setForm({ ...form, unit, product_id: null })}
        />
      ))}
      <Body>Optional existing product</Body>
      {products.data?.map((p) => (
        <Button
          key={p.id}
          title={(form.product_id === p.id ? "✓ " : "") + p.name}
          disabled={blocked}
          onPress={() =>
            setForm({
              ...form,
              product_id: p.id,
              label: p.name,
              unit: p.base_unit,
            })
          }
        />
      ))}
      {!!error && <Problem message={error} />}
      <Button
        title="Save shopping item"
        disabled={blocked}
        onPress={() => {
          try {
            const valid = shoppingFieldsSchema.parse(form);
            setError("");
            void onSave(valid);
          } catch (e) {
            setError(messageOf(e));
          }
        }}
      />
    </Card>
  );
}
function Shopping() {
  const items = useShopping();
  const action = useListOperation("shopping", sendShopping);
  const [selected, setSelected] = useState<ShoppingItem>();
  const [editorKey, setEditorKey] = useState(0);
  const [archived, setArchived] = useState(false);
  const router = useRouter();
  const { suggestion, index } = useLocalSearchParams<{
    suggestion?: string;
    index?: string;
  }>();
  const saved = useSuggestion(suggestion);
  const context = useMealContext();
  let candidates: ReturnType<typeof evaluateRecipe> = [];
  let proposalError = "";
  if (suggestion && saved.data && context.data) {
    try {
      const recipe = saved.data.recipes?.[Number(index)];
      if (!recipe) throw new Error("Recipe unavailable.");
      candidates = evaluateRecipe(recipe, context.data);
    } catch (e) {
      proposalError = messageOf(e);
    }
  }
  return (
    <>
      <Card>
        <Body>
          Checking off a purchase only updates this list. Add bought groceries
          to Kitchen or import a receipt to change stock.
        </Body>
        {!!action.error && <Problem message={action.error} />}
        {!!action.notice && <Body>{action.notice}</Body>}
        {!!action.pending && (
          <Button
            title="Retry pending shopping change"
            disabled={action.busy || !action.online}
            onPress={() => void action.retry()}
          />
        )}
        <Button
          title="Refresh shopping list"
          disabled={action.busy || !action.online}
          onPress={() => void items.refetch()}
        />
        <Button
          title={archived ? "Hide removed items" : "Show removed items"}
          onPress={() => setArchived((v) => !v)}
        />
      </Card>
      {!!suggestion && (
        <Card>
          <Body>
            Review measured shortages. Adding a staple shortage is optional.
            Quantities are recomputed by the server; adding the same recipe
            ingredient again opens its existing list item without increasing it.
          </Body>
          {!!(saved.isPending || context.isPending) && <Loading />}
          {!!saved.isError && <Problem message={messageOf(saved.error)} />}
          {!!context.isError && <Problem message={messageOf(context.error)} />}
          {!!proposalError && <Problem message={proposalError} />}
          {candidates.map(
            (i, n) =>
              new Decimal(i.shortage).gt(0) && (
                <Button
                  key={n}
                  title={`Add ${i.shortage} ${i.unit} ${i.name}${i.state === "assumed_staple" ? " (assumed staple)" : ""}`}
                  disabled={action.blocked}
                  onPress={() =>
                    void action.perform({
                      action: "shopping_shortage",
                      suggestion_id: suggestion,
                      recipe_index: Number(index),
                      ingredient_index: n,
                    })
                  }
                />
              ),
          )}
          {candidates.length > 0 &&
            candidates.every((i) => new Decimal(i.shortage).eq(0)) && (
              <Body>No measured shortages.</Body>
            )}
          <Button
            title="Close shortage review"
            onPress={() =>
              router.setParams({ suggestion: undefined, index: undefined })
            }
          />
        </Card>
      )}
      {!!items.isPending && <Loading />}
      {!!items.isError && <Problem message={messageOf(items.error)} />}
      {items.data?.filter((i) => archived || !i.removed).length === 0 && (
        <Body>Your shopping list is empty.</Body>
      )}
      {items.data
        ?.filter((i) => archived || !i.removed)
        .map((i) => (
          <Card key={i.id}>
            <Body>
              {i.removed
                ? "Removed · "
                : i.checked
                  ? "Purchased · "
                  : "To buy · "}
              {i.label}: {i.quantity} {i.unit}
            </Body>
            <Button
              title={i.checked ? "Mark not purchased" : "Mark purchased"}
              disabled={action.blocked || i.removed}
              onPress={() =>
                void action.perform({
                  ...i,
                  action: "shopping_save",
                  checked: !i.checked,
                })
              }
            />
            <Button
              title="Edit item"
              disabled={action.blocked}
              onPress={() => {
                setSelected(i);
                setEditorKey((v) => v + 1);
              }}
            />
            <Button
              title={i.removed ? "Restore item" : "Remove item from list"}
              disabled={action.blocked}
              onPress={() =>
                void action.perform({
                  ...i,
                  action: "shopping_save",
                  removed: !i.removed,
                })
              }
            />
          </Card>
        ))}
      <Button
        title="New item / discard editor changes"
        disabled={action.blocked}
        onPress={() => {
          setSelected(undefined);
          setEditorKey((v) => v + 1);
        }}
      />
      <Editor
        key={editorKey}
        initial={selected}
        blocked={action.blocked}
        onSave={async (value) => {
          const ok = await action.perform({
            ...value,
            action: "shopping_save",
          });
          if (ok) {
            setSelected(undefined);
            setEditorKey((v) => v + 1);
          }
          return ok;
        }}
      />
    </>
  );
}
export function ShoppingScreen() {
  return (
    <Screen title="Shopping" subtitle="Plan your next grocery trip">
      <AuthGate>
        <Shopping />
      </AuthGate>
    </Screen>
  );
}
