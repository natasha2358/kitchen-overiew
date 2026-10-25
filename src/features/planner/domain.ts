import { Decimal } from "decimal.js";
import { z } from "zod";
import {
  recipeSchema,
  Recipe,
} from "../../../supabase/functions/_shared/meals";
export const slots = ["breakfast", "lunch", "dinner", "snack"] as const;
export const planFieldsSchema = z.object({
  id: z.uuid(),
  planned_on: z.iso.date(),
  slot: z.enum(slots),
  title: z.string().trim().min(1).max(160),
  servings: z.number().int().min(1).max(12),
  suggestion_id: z.uuid().nullable(),
  recipe_index: z.number().int().nonnegative().nullable(),
  revision: z.number().int().nonnegative(),
  cancelled: z.boolean(),
});
export type PlanFields = z.infer<typeof planFieldsSchema>;
export const plannedMealSchema = planFieldsSchema.extend({
  recipe: recipeSchema.nullable(),
  cooking_id: z.uuid().nullable(),
});
export type PlannedMeal = z.infer<typeof plannedMealSchema>;
export function addDays(date: string, days: number) {
  z.iso.date().parse(date);
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date: string) {
  z.iso.date().parse(date);
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}
export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  z.number().int().min(1).max(12).parse(servings);
  const scaled = {
    ...recipe,
    servings,
    ingredients: recipe.ingredients.map((i) => {
      const quantity = new Decimal(i.quantity)
        .mul(servings)
        .div(recipe.servings);
      if (
        quantity.decimalPlaces() > 6 ||
        (i.unit === "item" && !quantity.isInteger())
      )
        throw new Error(
          "These servings need quantity decisions. Review actual amounts manually or choose compatible servings.",
        );
      return { ...i, quantity: quantity.toFixed() };
    }),
  };
  return recipeSchema.parse(scaled);
}
