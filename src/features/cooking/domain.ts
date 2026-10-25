import { Decimal } from "decimal.js";
import { z } from "zod";
import {
  amountSchema,
  baseUnitSchema,
  MealContext,
} from "../../../supabase/functions/_shared/meals";
export const allocationSchema = z.object({
  batch_id: z.uuid(),
  revision: z.number().int().positive(),
  quantity: amountSchema.refine((v) => new Decimal(v).gt(0)),
});
export const actualIngredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  product_id: z.uuid().nullable(),
  unit: baseUnitSchema,
  quantity: amountSchema.refine((v) => new Decimal(v).gt(0)),
  untracked_quantity: amountSchema,
  untracked_confirmed: z.boolean(),
  allocations: z.array(allocationSchema).max(100),
});
export type ActualIngredient = z.infer<typeof actualIngredientSchema>;
export const cookingRequestSchema = z.object({
  action: z.literal("cook"),
  plan_id: z.uuid().nullable().optional(),
  plan_revision: z.number().int().positive().nullable().optional(),
  suggestion_id: z.uuid().nullable(),
  recipe_index: z.number().int().nonnegative().nullable(),
  preference_revision: z.number().int().nonnegative(),
  ingredients: z.array(actualIngredientSchema).min(1).max(30),
});
export const cookingResultSchema = z.object({
  cooking_id: z.uuid(),
  movements: z.array(
    z.object({
      batch_id: z.uuid(),
      used: amountSchema,
      remaining: amountSchema,
      unit: baseUnitSchema,
    }),
  ),
});
export type CookingRequest = z.infer<typeof cookingRequestSchema>;
export function eligibleBatches(
  context: MealContext,
  productId: string | null,
  unit: string,
) {
  return context.batches
    .filter(
      (b) =>
        b.product_id === productId &&
        b.base_unit === unit &&
        new Decimal(b.quantity).gt(0) &&
        (!b.expiry || b.expiry >= context.today),
    )
    .sort(
      (a, b) =>
        (a.expiry ?? "9999-12-31").localeCompare(b.expiry ?? "9999-12-31") ||
        a.acquired_at.localeCompare(b.acquired_at) ||
        a.id.localeCompare(b.id),
    );
}
export function proposeAllocations(
  context: MealContext,
  ingredient: Pick<ActualIngredient, "product_id" | "quantity" | "unit">,
) {
  let remaining = new Decimal(amountSchema.parse(ingredient.quantity));
  const allocations: z.infer<typeof allocationSchema>[] = [];
  for (const b of eligibleBatches(
    context,
    ingredient.product_id,
    ingredient.unit,
  )) {
    if (remaining.lte(0)) break;
    const used = Decimal.min(remaining, b.quantity);
    allocations.push({
      batch_id: b.id,
      revision: b.revision,
      quantity: used.toFixed(),
    });
    remaining = remaining.minus(used);
  }
  return { allocations, shortage: remaining.toFixed() };
}
export function validateCooking(request: CookingRequest, context: MealContext) {
  const parsed = cookingRequestSchema.parse(request);
  if (parsed.preference_revision !== context.preferences.revision)
    throw new Error("Preferences changed. Reload the review.");
  const ids = new Set<string>();
  const ingredients = new Set<string>();
  for (const i of parsed.ingredients) {
    const key = i.product_id ?? i.name.trim().toLowerCase();
    if (ingredients.has(key)) throw new Error("Combine repeated ingredients.");
    ingredients.add(key);
    const product = context.products.find((p) => p.id === i.product_id);
    if (i.product_id && (!product || product.base_unit !== i.unit))
      throw new Error("Resolve the product and compatible unit.");
    if (!i.product_id && i.allocations.length)
      throw new Error("Resolve the product before allocating stock.");
    let tracked = new Decimal(0);
    for (const a of i.allocations) {
      if (ids.has(a.batch_id))
        throw new Error("A batch appears more than once.");
      ids.add(a.batch_id);
      const b = eligibleBatches(context, i.product_id, i.unit).find(
        (b) => b.id === a.batch_id,
      );
      if (
        !b ||
        b.revision !== a.revision ||
        new Decimal(a.quantity).gt(b.quantity)
      )
        throw new Error("Stock changed or is insufficient. Reload the review.");
      if (i.unit === "item" && !new Decimal(a.quantity).isInteger())
        throw new Error("Items must be whole.");
      tracked = tracked.plus(a.quantity);
    }
    const untracked = new Decimal(i.untracked_quantity);
    if (untracked.gt(0) && !i.untracked_confirmed)
      throw new Error("Explicitly confirm every untracked amount.");
    if (!tracked.plus(untracked).eq(i.quantity))
      throw new Error("Tracked plus untracked must equal actual usage.");
    if (
      i.unit === "item" &&
      (!untracked.isInteger() || !new Decimal(i.quantity).isInteger())
    )
      throw new Error("Items must be whole.");
  }
  return parsed;
}
