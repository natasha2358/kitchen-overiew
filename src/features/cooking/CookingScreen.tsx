import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Decimal } from "decimal.js";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
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
import { useHousehold } from "../auth/useHousehold";
import { useAuth } from "../auth/Providers";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import { readOperation, runOperation } from "../../shared/operation-intent";
import {
  MealContext,
  Recipe,
  validateRecipe,
} from "../../../supabase/functions/_shared/meals";
import { useMealContext } from "../meals/api";
import {
  ActualIngredient,
  cookingRequestSchema,
  cookingResultSchema,
  eligibleBatches,
  proposeAllocations,
  validateCooking,
} from "./domain";
import { useCookingHistory, useCookingSuggestion } from "./api";
const blank = (): ActualIngredient => ({
  name: "",
  product_id: null,
  unit: "g",
  quantity: "",
  untracked_quantity: "0",
  untracked_confirmed: false,
  allocations: [],
});
function CookingEditor({
  context,
  recipe,
  suggestionId,
  recipeIndex,
  reload,
}: {
  context: MealContext;
  recipe?: Recipe;
  suggestionId: string | null;
  recipeIndex: number | null;
  reload: () => Promise<void>;
}) {
  const [ingredients, setIngredients] = useState<ActualIngredient[]>(() =>
    recipe
      ? recipe.ingredients.map((i) => ({
          ...i,
          untracked_quantity: "0",
          untracked_confirmed: false,
          allocations: proposeAllocations(context, { ...i }).allocations,
        }))
      : [blank()],
  );
  const [operation] = useState(randomUUID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<z.infer<typeof cookingResultSchema> | null>(
    null,
  );
  const [pending, setPending] =
    useState<Awaited<ReturnType<typeof readOperation>>>(null);
  const [loaded, setLoaded] = useState(false);
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  const history = useCookingHistory();
  const household = h.data?.id;
  useEffect(() => {
    let active = true;
    if (household)
      readOperation(`cooking.${household}`)
        .then((p) => {
          if (active) {
            setPending(p);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (active) setError(messageOf(e));
        });
    return () => {
      active = false;
    };
  }, [household]);
  function change(index: number, patch: Partial<ActualIngredient>) {
    setIngredients((old) =>
      old.map((i, n) => (n === index ? { ...i, ...patch } : i)),
    );
    setError("");
  }
  async function submit(retry = false) {
    setBusy(true);
    setError("");
    try {
      if (!household || !online || !loaded)
        throw new Error("Reconnect and load pending operations first.");
      const key = `cooking.${household}`;
      const prior = await readOperation(key);
      if (prior && !retry)
        throw new Error("Retry the pending cooking operation first.");
      const request =
        retry && prior
          ? cookingRequestSchema.parse(prior.request)
          : validateCooking(
              {
                action: "cook",
                suggestion_id: suggestionId,
                recipe_index: recipeIndex,
                preference_revision: context.preferences.revision,
                ingredients,
              },
              context,
            );
      if (!retry)
        validateRecipe(
          {
            title: recipe?.title ?? "Actual meal",
            servings: context.preferences.servings,
            steps: ["Actual cooking review"],
            ingredients: request.ingredients.map(
              ({ name, product_id, quantity, unit }) => ({
                name,
                product_id,
                quantity,
                unit,
              }),
            ),
          },
          context,
        );
      const result = await runOperation(
        key,
        prior?.operation ?? operation,
        request,
        async (operation, payload) => {
          const r = await backend().rpc("confirm_cooking", {
            p_household: household,
            p_operation: operation,
            p_request: cookingRequestSchema.parse(payload),
          });
          if (r.error) throw r.error;
          return cookingResultSchema.parse(r.data);
        },
      );
      setDone(result);
      setPending(null);
      await client.invalidateQueries();
    } catch (e) {
      setError(messageOf(e));
      if (household) setPending(await readOperation(`cooking.${household}`));
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || !loaded || !!pending || !!done;
  return (
    <>
      <Card>
        <Body>{recipe?.title ?? "Record an actual meal"}</Body>
        <Body>
          Review every amount and selected batch. Untracked usage must be
          explicitly confirmed, including staples. Nothing changes until you
          press Cooked.
        </Body>
        {error && <Problem message={error} />}
        {!loaded && <Loading />}
        {pending && (
          <>
            <Body>
              A previous cooking confirmation has an uncertain result. Retry its
              original request before recording another meal.
            </Body>
            <Button
              title="Retry pending cooking confirmation"
              onPress={() => void submit(true)}
              disabled={busy || !online}
            />
          </>
        )}
        {done && (
          <>
            <Body>
              Cooking recorded: {done.movements.length} stock movements.
            </Body>
            {done.movements.map((m) => (
              <Body key={m.batch_id}>
                Used {m.used} {m.unit}; remaining {m.remaining}.
              </Body>
            ))}
            <Button
              title="Record another meal"
              onPress={() => void reload()}
              disabled={busy || !online}
            />
          </>
        )}
        {!done && (
          <Button
            title="Discard edits and reload current stock"
            onPress={() => void reload()}
            disabled={busy || !!pending || !online}
          />
        )}
      </Card>
      {!done &&
        ingredients.map((i, index) => (
          <Card key={index}>
            <Field
              label="Ingredient name"
              value={i.name}
              onChangeText={(name) => change(index, { name })}
              editable={!disabled}
            />
            <Body>
              Product:{" "}
              {context.products.find((p) => p.id === i.product_id)?.name ??
                "Unmapped (untracked use only)"}
            </Body>
            {context.products.map((p) => (
              <Button
                key={p.id}
                title={(p.id === i.product_id ? "✓ " : "") + p.name}
                onPress={() =>
                  change(index, {
                    product_id: p.id,
                    name: p.name,
                    unit: p.base_unit,
                    allocations: [],
                    untracked_quantity: "0",
                    untracked_confirmed: false,
                  })
                }
                disabled={disabled}
              />
            ))}
            <Button
              title="Use an unmapped ingredient"
              onPress={() =>
                change(index, {
                  product_id: null,
                  allocations: [],
                  untracked_quantity: "0",
                  untracked_confirmed: false,
                })
              }
              disabled={disabled}
            />
            <Field
              label={`Actual amount used (${i.unit})`}
              value={i.quantity}
              onChangeText={(quantity) =>
                change(index, { quantity, untracked_confirmed: false })
              }
              keyboardType="decimal-pad"
              editable={!disabled}
            />
            {!i.product_id &&
              (["g", "ml", "item"] as const).map((unit) => (
                <Button
                  key={unit}
                  title={(unit === i.unit ? "✓ " : "") + unit}
                  onPress={() =>
                    change(index, { unit, untracked_confirmed: false })
                  }
                  disabled={disabled}
                />
              ))}
            <Button
              title="Propose tracked amounts, earliest expiry first"
              onPress={() => {
                try {
                  change(index, {
                    allocations: proposeAllocations(context, i).allocations,
                    untracked_quantity: "0",
                    untracked_confirmed: false,
                  });
                } catch (e) {
                  setError(messageOf(e));
                }
              }}
              disabled={disabled}
            />
            {eligibleBatches(context, i.product_id, i.unit).map((b) => (
              <Field
                key={b.id}
                label={`Use from batch ${b.id.slice(0, 8)} · expires ${b.expiry ?? "unknown"} · available ${b.quantity} ${b.base_unit}`}
                value={
                  i.allocations.find((a) => a.batch_id === b.id)?.quantity ??
                  "0"
                }
                keyboardType="decimal-pad"
                editable={!disabled}
                onChangeText={(quantity) =>
                  change(index, {
                    allocations: [
                      ...i.allocations.filter((a) => a.batch_id !== b.id),
                      ...(quantity === "0" || quantity === ""
                        ? []
                        : [{ batch_id: b.id, revision: b.revision, quantity }]),
                    ],
                    untracked_confirmed: false,
                  })
                }
              />
            ))}
            <Body>
              Any amount not allocated above is unresolved until you explicitly
              record it as untracked.
            </Body>
            <Field
              label="Amount used outside tracked inventory"
              value={i.untracked_quantity}
              keyboardType="decimal-pad"
              editable={!disabled}
              onChangeText={(untracked_quantity) =>
                change(index, {
                  untracked_quantity,
                  untracked_confirmed: false,
                })
              }
            />
            <Button
              title={
                i.untracked_confirmed
                  ? "✓ Untracked amount explicitly confirmed"
                  : "Confirm this untracked amount"
              }
              onPress={() => {
                try {
                  if (new Decimal(i.untracked_quantity).lte(0))
                    throw new Error("Enter a positive untracked amount first.");
                  change(index, {
                    untracked_confirmed: !i.untracked_confirmed,
                  });
                } catch (e) {
                  setError(messageOf(e));
                }
              }}
              disabled={disabled}
            />
            <Button
              title="Remove ingredient from actual meal"
              onPress={() =>
                setIngredients((old) => old.filter((_, n) => n !== index))
              }
              disabled={disabled}
            />
          </Card>
        ))}
      {!done && (
        <Card>
          <Button
            title="Add actual ingredient"
            onPress={() => setIngredients((old) => [...old, blank()])}
            disabled={disabled || ingredients.length >= 30}
          />
          <Button
            title={busy ? "Recording…" : "Cooked — confirm actual usage"}
            onPress={() => void submit()}
            disabled={disabled || !online || ingredients.length === 0}
          />
        </Card>
      )}
      <Card>
        <Body>Recent cooking history</Body>
        {history.isPending && <Loading />}
        {history.isError && <Problem message={messageOf(history.error)} />}{" "}
        {history.data?.length === 0 && <Body>No cooking recorded yet.</Body>}
        {history.data?.map((event) => (
          <Card key={event.id}>
            <Body>{new Date(event.created_at).toLocaleString()}</Body>
            {event.snapshot.ingredients.map((i, n) => (
              <Body key={n}>
                {i.name}: {i.quantity} {i.unit} used, {i.untracked_quantity}{" "}
                explicitly untracked.
              </Body>
            ))}
          </Card>
        ))}
      </Card>
    </>
  );
}
function Review() {
  const { suggestion, index } = useLocalSearchParams<{
    suggestion?: string;
    index?: string;
  }>();
  const context = useMealContext();
  const saved = useCookingSuggestion(suggestion);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  if (context.isPending || (suggestion && saved.isPending)) return <Loading />;
  if (context.isError) return <Problem message={messageOf(context.error)} />;
  if (suggestion && saved.isError)
    return <Problem message={messageOf(saved.error)} />;
  const recipeIndex = suggestion ? Number(index) : null;
  const recipe =
    recipeIndex !== null ? saved.data?.recipes?.[recipeIndex] : undefined;
  if (suggestion && (!recipe || saved.data?.status !== "completed"))
    return <Problem message="Recipe unavailable." />;
  return (
    <>
      {error && <Problem message={error} />}
      <CookingEditor
        key={version}
        context={context.data}
        recipe={recipe}
        suggestionId={suggestion ?? null}
        recipeIndex={recipeIndex}
        reload={async () => {
          setError("");
          const r = await context.refetch();
          if (r.error) {
            setError(messageOf(r.error));
            return;
          }
          setVersion((v) => v + 1);
        }}
      />
    </>
  );
}
export function CookingScreen() {
  return (
    <Screen title="Review cooking">
      <AuthGate>
        <Review />
      </AuthGate>
    </Screen>
  );
}
