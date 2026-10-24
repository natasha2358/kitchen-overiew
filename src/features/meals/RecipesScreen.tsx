import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
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
import { useAuth } from "../auth/Providers";
import { useHousehold } from "../auth/useHousehold";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import { sessionStorageAdapter } from "../../shared/session-storage";
import {
  contextChanged,
  evaluateRecipe,
  MealContext,
  preferencesSchema,
} from "../../../supabase/functions/_shared/meals";
import { generateMeals, useMealContext, useSuggestions } from "./api";
function Preferences({ context }: { context: MealContext }) {
  const [dietary, setDietary] = useState(context.preferences.dietary);
  const [excluded, setExcluded] = useState(
    context.preferences.excluded.join(", "),
  );
  const [servings, setServings] = useState(
    String(context.preferences.servings),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!h.data || !online) throw new Error("Reconnect first.");
      const p = preferencesSchema.parse({
        dietary,
        excluded: excluded
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        servings: Number(servings),
        revision: context.preferences.revision,
      });
      const r = await backend().rpc("save_food_preferences", {
        p_household: h.data.id,
        p_revision: p.revision,
        p_dietary: p.dietary,
        p_excluded: p.excluded,
        p_servings: p.servings,
      });
      if (r.error) throw r.error;
      await client.invalidateQueries({ queryKey: ["meal-context", h.data.id] });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Body>Food preferences</Body>
      {(["vegetarian", "vegan", "gluten_free"] as const).map((d) => (
        <Button
          key={d}
          title={(dietary.includes(d) ? "✓ " : "") + d.replaceAll("_", " ")}
          onPress={() =>
            setDietary((old) =>
              old.includes(d) ? old.filter((x) => x !== d) : [...old, d],
            )
          }
          disabled={busy}
        />
      ))}
      <Field
        label="Excluded ingredients (comma-separated)"
        value={excluded}
        onChangeText={setExcluded}
        editable={!busy}
      />
      <Field
        label="Servings (1–12)"
        value={servings}
        onChangeText={setServings}
        keyboardType="number-pad"
        editable={!busy}
      />
      {error && <Problem message={error} />}
      <Button
        title="Save preferences"
        onPress={() => void save()}
        disabled={busy || !online}
      />
    </Card>
  );
}
function Recipes() {
  const context = useMealContext();
  const suggestions = useSuggestions();
  const h = useHousehold();
  const { online } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disclosed, setDisclosed] = useState(false);
  async function generate(id?: string) {
    setBusy(true);
    setError("");
    try {
      if (!online || !h.data) throw new Error("Reconnect first.");
      const key = `meal-request.${h.data.id}`;
      const pending = await sessionStorageAdapter.getItem(key);
      const request = id ?? (pending ? z.uuid().parse(pending) : randomUUID());
      await sessionStorageAdapter.setItem(key, request);
      await generateMeals(h.data.id, request);
      await sessionStorageAdapter.removeItem(key);
      await client.invalidateQueries({ queryKey: ["suggestions", h.data.id] });
      await context.refetch();
    } catch (e) {
      setError(messageOf(e));
      await suggestions.refetch();
    } finally {
      setBusy(false);
    }
  }
  if (context.isPending) return <Loading />;
  if (context.isError) return <Problem message={messageOf(context.error)} />;
  return (
    <>
      <Preferences
        key={context.data.preferences.revision}
        context={context.data}
      />
      <Card>
        <Body>
          Meal suggestions send relevant stock, designated staples and saved
          preferences to OpenAI. Suggestions never change stock. Review
          ingredients before cooking.
        </Body>
        <Button
          title={
            disclosed
              ? "✓ Data use acknowledged"
              : "Acknowledge meal suggestion data use"
          }
          onPress={() => setDisclosed((v) => !v)}
          disabled={busy}
        />
        <Button
          title={busy ? "Generating…" : "Suggest meals / retry pending request"}
          onPress={() => void generate()}
          disabled={busy || !online || !disclosed}
        />
        <Button
          title="Start a new generation request"
          onPress={() => void generate(randomUUID())}
          disabled={busy || !online || !disclosed}
        />
        <Button
          title="Refresh stock and saved suggestions"
          onPress={() => {
            void context.refetch();
            void suggestions.refetch();
          }}
          disabled={busy || !online}
        />
        {context.data.batches.length === 0 &&
          !context.data.products.some((p) => p.always_available) && (
            <Body>
              Add groceries in Kitchen or designate an optional staple in the
              catalogue.
            </Body>
          )}
        {error && <Problem message={error} />}
      </Card>
      {suggestions.isPending && <Loading />}
      {suggestions.isError && (
        <Problem message={messageOf(suggestions.error)} />
      )}
      {suggestions.data?.length === 0 && <Body>No saved suggestions yet.</Body>}
      {suggestions.data?.map((s) => (
        <Card key={s.id}>
          <Body>
            {new Date(s.created_at).toLocaleString()} · {s.status}
          </Body>
          {s.status !== "completed" && (
            <>
              <Body>
                {s.error_code ??
                  "Generation is pending. Retry after its lease expires."}
              </Body>
              <Button
                title="Retry this generation"
                onPress={() => void generate(s.id)}
                disabled={busy || !online || !disclosed}
              />
            </>
          )}
          {contextChanged(s.snapshot, context.data) && (
            <Body>
              Stock, preferences, date or staple assumptions changed since
              generation. Availability below uses refreshed data.
            </Body>
          )}
          {s.recipes?.length === 0 && (
            <Body>
              No compatible recipes found. Adjust preferences or add groceries.
            </Body>
          )}
          {s.recipes?.map((recipe, index) => {
            let evaluation;
            try {
              evaluation = evaluateRecipe(recipe, context.data);
            } catch (e) {
              return (
                <Card key={index}>
                  <Body>{recipe.title}</Body>
                  <Problem message={messageOf(e)} />
                  <Body>Generate again with your current preferences.</Body>
                </Card>
              );
            }
            return (
              <Card key={index}>
                <Body>
                  {recipe.title} · {recipe.servings} servings
                </Body>
                {evaluation.map((ingredient, i) => (
                  <Body key={i}>
                    {ingredient.name}: {ingredient.quantity} {ingredient.unit} ·
                    measured {ingredient.available} · missing{" "}
                    {ingredient.shortage} ·{" "}
                    {ingredient.state === "assumed_staple"
                      ? "assumed staple availability (not tracked stock)"
                      : ingredient.state}
                  </Body>
                ))}
                {recipe.steps.map((step, i) => (
                  <Body key={i}>
                    {i + 1}. {step}
                  </Body>
                ))}
                <Body>
                  Cooking confirmation arrives in M7. Viewing this recipe
                  changes no stock.
                </Body>
              </Card>
            );
          })}
        </Card>
      ))}
    </>
  );
}
export function RecipesScreen() {
  return (
    <Screen title="Recipes" subtitle="Meals from your kitchen">
      <AuthGate>
        <Recipes />
      </AuthGate>
    </Screen>
  );
}
