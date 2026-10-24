import { z } from "zod";
import { Decimal } from "decimal.js";
Decimal.set({ precision: 32 });
export const amountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/)
  .refine((v) => new Decimal(v).lt("1000000000000"));
export const baseUnitSchema = z.enum(["g", "ml", "item"]);
export const preferencesSchema = z.object({
  dietary: z.array(z.enum(["vegetarian", "vegan", "gluten_free"])).max(3),
  excluded: z.array(z.string().trim().min(1).max(120)).max(100),
  servings: z.number().int().min(1).max(12),
  revision: z.number().int().nonnegative(),
});
export const mealProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  aliases: z.array(z.string()),
  base_unit: baseUnitSchema,
  always_available: z.boolean(),
});
export const mealBatchSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  quantity: amountSchema,
  base_unit: baseUnitSchema,
  expiry: z.iso.date().nullable(),
  acquired_at: z.string(),
  revision: z.number().int().positive(),
});
export const contextSchema = z.object({
  today: z.iso.date(),
  timezone: z.string(),
  preferences: preferencesSchema,
  products: z.array(mealProductSchema).max(500),
  batches: z.array(mealBatchSchema).max(5000),
});
export type MealContext = z.infer<typeof contextSchema>;
export const ingredientSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    product_id: z.uuid().nullable(),
    quantity: amountSchema.refine((v) => new Decimal(v).gt(0)),
    unit: baseUnitSchema,
  })
  .strict()
  .refine(
    (v) => v.unit !== "item" || new Decimal(v.quantity).isInteger(),
    "Items must be whole",
  );
export const recipeSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    servings: z.number().int().min(1).max(12),
    ingredients: z.array(ingredientSchema).min(1).max(30),
    steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(20),
  })
  .strict();
export const proposalSchema = z
  .object({ recipes: z.array(recipeSchema).max(3) })
  .strict();
export type Recipe = z.infer<typeof recipeSchema>;
const normalized = (v: string) => v.toLowerCase().trim().replace(/\s+/g, " ");
const commonMeat = [
  "beef",
  "pork",
  "chicken",
  "turkey",
  "lamb",
  "fish",
  "salmon",
  "tuna",
  "shrimp",
  "bacon",
  "ham",
  "gelatin",
];
// Conservative known-name checks, not a taxonomy or a claim of allergy certification.
const dietExclusions = {
  vegetarian: commonMeat,
  vegan: [
    ...commonMeat,
    "milk",
    "butter",
    "cheese",
    "cream",
    "egg",
    "eggs",
    "yogurt",
    "honey",
  ],
  gluten_free: ["wheat", "barley", "rye", "couscous", "semolina"],
};
export function validateRecipe(recipe: Recipe, context: MealContext): Recipe {
  const parsed = recipeSchema.parse(recipe);
  if (parsed.servings !== context.preferences.servings)
    throw new Error("Servings do not match saved preferences.");
  const excluded = [
    ...context.preferences.excluded,
    ...context.preferences.dietary.flatMap((d) => dietExclusions[d]),
  ].map(normalized);
  const seen = new Set<string>();
  for (const ingredient of parsed.ingredients) {
    const product = context.products.find(
      (p) => p.id === ingredient.product_id,
    );
    if (ingredient.product_id && !product)
      throw new Error("Unknown product reference.");
    if (product && product.base_unit !== ingredient.unit)
      throw new Error("Incompatible ingredient unit.");
    const key = product?.id ?? normalized(ingredient.name);
    if (seen.has(key))
      throw new Error("Combine repeated ingredients before review.");
    seen.add(key);
    const names = [
      ingredient.name,
      ...(product ? [product.name, ...product.aliases] : []),
    ].map(normalized);
    if (
      excluded.some((x) => names.some((name) => ` ${name} `.includes(` ${x} `)))
    )
      throw new Error(
        "Suggestion conflicts with an excluded ingredient or dietary choice.",
      );
  }
  return parsed;
}
export function evaluateRecipe(recipe: Recipe, context: MealContext) {
  validateRecipe(recipe, context);
  return recipe.ingredients.map((ingredient) => {
    const product = context.products.find(
      (p) => p.id === ingredient.product_id,
    );
    const available = context.batches
      .filter(
        (b) =>
          b.product_id === product?.id &&
          b.base_unit === ingredient.unit &&
          (!b.expiry || b.expiry >= context.today),
      )
      .reduce((sum, b) => sum.plus(b.quantity), new Decimal(0));
    const shortage = Decimal.max(
      0,
      new Decimal(ingredient.quantity).minus(available),
    );
    return {
      ...ingredient,
      available: available.toFixed(),
      shortage: shortage.toFixed(),
      state: !product
        ? "unresolved"
        : shortage.eq(0)
          ? "stocked"
          : product.always_available
            ? "assumed_staple"
            : "shortage",
    };
  });
}
export function contextChanged(before: MealContext, now: MealContext) {
  return JSON.stringify(before) !== JSON.stringify(now);
}
