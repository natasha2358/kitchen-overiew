import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
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
import { useListOperation } from "../lists/operations";
import { useMealContext, useSuggestion } from "../meals/api";
import { sendPlan, usePlanner } from "./api";
import {
  addDays,
  weekStart,
  scaleRecipe,
  planFieldsSchema,
  PlanFields,
  slots,
} from "./domain";
function Editor({
  initial,
  blocked,
  onSave,
}: {
  initial: PlanFields;
  blocked: boolean;
  onSave: (form: PlanFields) => Promise<void>;
}) {
  const [form, setForm] = useState(initial);
  const [servings, setServings] = useState(String(initial.servings));
  const [error, setError] = useState("");
  return (
    <Card>
      <Body>
        {form.revision ? "Edit / reschedule meal" : "Schedule a meal"}
      </Body>
      <Field
        label="Meal title"
        value={form.title}
        editable={!blocked}
        onChangeText={(title) => setForm({ ...form, title })}
      />
      <Field
        label="Planned date (YYYY-MM-DD)"
        value={form.planned_on}
        editable={!blocked}
        onChangeText={(planned_on) => setForm({ ...form, planned_on })}
      />
      {slots.map((slot) => (
        <Button
          key={slot}
          title={(slot === form.slot ? "✓ " : "") + slot}
          disabled={blocked}
          onPress={() => setForm({ ...form, slot })}
        />
      ))}
      <Field
        label="Planned servings (1–12)"
        value={servings}
        keyboardType="number-pad"
        editable={!blocked}
        onChangeText={setServings}
      />
      <Body>
        {form.suggestion_id
          ? "Linked to a saved recipe. Actual quantities will be reviewed before cooking."
          : "Manual meal note. Add actual ingredients when you cook."}
      </Body>
      {error && <Problem message={error} />}
      <Button
        title="Save plan"
        disabled={blocked}
        onPress={() => {
          try {
            const valid = planFieldsSchema.parse({
              ...form,
              servings: Number(servings),
            });
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
function Board({
  today,
  defaultServings,
}: {
  today: string;
  defaultServings: number;
}) {
  const [start, setStart] = useState(() => weekStart(today));
  const [selected, setSelected] = useState<PlanFields>();
  const [version, setVersion] = useState(0);
  const [showCancelled, setShowCancelled] = useState(false);
  const plans = usePlanner(start);
  const action = useListOperation("planner", sendPlan);
  const router = useRouter();
  const { suggestion, index } = useLocalSearchParams<{
    suggestion?: string;
    index?: string;
  }>();
  const source = useSuggestion(suggestion);
  const recipe = source.data?.recipes?.[Number(index)];
  const initial: PlanFields = selected ?? {
    id: randomUUID(),
    planned_on: today >= start && today < addDays(start, 7) ? today : start,
    slot: "dinner",
    title: recipe?.title ?? "",
    servings: recipe?.servings ?? defaultServings,
    suggestion_id: suggestion ?? null,
    recipe_index: suggestion ? Number(index) : null,
    revision: 0,
    cancelled: false,
  };
  return (
    <>
      <Card>
        <Body>
          Week {start} to {addDays(start, 6)}
        </Body>
        <Body>
          Plans do not reserve or consume groceries. Only confirmed actual
          cooking changes stock.
        </Body>
        <Button
          title="Previous week"
          onPress={() => setStart((s) => addDays(s, -7))}
        />
        <Button title="This week" onPress={() => setStart(weekStart(today))} />
        <Button
          title="Next week"
          onPress={() => setStart((s) => addDays(s, 7))}
        />
        <Button
          title="Refresh plans"
          disabled={action.busy || !action.online}
          onPress={() => void plans.refetch()}
        />
        <Button
          title={
            showCancelled ? "Hide cancelled plans" : "Show cancelled plans"
          }
          onPress={() => setShowCancelled((v) => !v)}
        />
        {action.error && <Problem message={action.error} />}{" "}
        {action.notice && <Body>{action.notice}</Body>}
        {action.pending && (
          <Button
            title="Retry pending plan change"
            disabled={action.busy || !action.online}
            onPress={() => void action.retry()}
          />
        )}
      </Card>
      {plans.isPending && <Loading />}
      {plans.isError && <Problem message={messageOf(plans.error)} />}
      {Array.from({ length: 7 }, (_, offset) => addDays(start, offset)).map(
        (date) => {
          const entries = (plans.data ?? [])
            .filter(
              (p) => p.planned_on === date && (showCancelled || !p.cancelled),
            )
            .sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
          return (
            <Card key={date}>
              <Body>
                {date}
                {date === today ? " · Today" : ""}
              </Body>
              {entries.length === 0 && !plans.isPending && (
                <Body>No meals planned.</Body>
              )}
              {entries.map((p) => {
                let scalingError = "";
                if (p.recipe) {
                  try {
                    scaleRecipe(p.recipe, p.servings);
                  } catch (e) {
                    scalingError = messageOf(e);
                  }
                }
                return (
                  <Card key={p.id}>
                    <Body>
                      {p.slot} · {p.title} · {p.servings} servings
                    </Body>
                    <Body>
                      {p.cooking_id
                        ? "Cooked — actual usage recorded"
                        : p.cancelled
                          ? "Cancelled"
                          : "Planned — stock unchanged"}
                    </Body>
                    {scalingError && !p.cooking_id && (
                      <Body>{scalingError}</Body>
                    )}
                    {!p.cooking_id && (
                      <>
                        <Button
                          title="Edit / reschedule"
                          disabled={action.blocked}
                          onPress={() => {
                            setSelected(planFieldsSchema.parse(p));
                            setVersion((v) => v + 1);
                            router.setParams({
                              suggestion: undefined,
                              index: undefined,
                            });
                          }}
                        />
                        <Button
                          title={p.cancelled ? "Restore plan" : "Cancel plan"}
                          disabled={action.blocked}
                          onPress={() =>
                            void action.perform({
                              ...planFieldsSchema.parse(p),
                              action: "plan_save",
                              cancelled: !p.cancelled,
                            })
                          }
                        />
                        {!p.cancelled && (
                          <Button
                            title={
                              scalingError
                                ? "Review actual cooking amounts manually"
                                : "Review actual cooking usage"
                            }
                            disabled={!action.online || action.busy}
                            onPress={() =>
                              router.push({
                                pathname: "/cooking",
                                params: {
                                  plan: p.id,
                                  ...(scalingError ? { manual: "1" } : {}),
                                },
                              })
                            }
                          />
                        )}
                      </>
                    )}
                  </Card>
                );
              })}
            </Card>
          );
        },
      )}
      <Button
        title="New manual plan / discard editor changes"
        disabled={action.blocked}
        onPress={() => {
          setSelected(undefined);
          setVersion((v) => v + 1);
          router.setParams({ suggestion: undefined, index: undefined });
        }}
      />
      {suggestion && source.isPending ? (
        <Loading />
      ) : suggestion && (source.isError || !recipe) ? (
        <Problem
          message={
            source.error
              ? messageOf(source.error)
              : "Recipe unavailable. Start a manual plan instead."
          }
        />
      ) : (
        <Editor
          key={`${version}:${suggestion ?? "manual"}`}
          initial={initial}
          blocked={action.blocked}
          onSave={async (fields) => {
            if (await action.perform({ ...fields, action: "plan_save" })) {
              setStart(weekStart(fields.planned_on));
              setSelected(undefined);
              setVersion((v) => v + 1);
              router.setParams({ suggestion: undefined, index: undefined });
            }
          }}
        />
      )}
    </>
  );
}
function Planner() {
  const context = useMealContext();
  if (context.isPending) return <Loading />;
  if (context.isError) return <Problem message={messageOf(context.error)} />;
  return (
    <Board
      today={context.data.today}
      defaultServings={context.data.preferences.servings}
    />
  );
}
export function PlannerScreen() {
  return (
    <Screen title="Planner" subtitle="Your week of meals">
      <AuthGate>
        <Planner />
      </AuthGate>
    </Screen>
  );
}
