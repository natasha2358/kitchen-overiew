import {
  evaluateRecipe,
  type MealContext,
  type Recipe,
} from "../supabase/functions/_shared/meals";
const product = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Salt",
  aliases: [],
  base_unit: "g" as const,
  always_available: false,
};
const context: MealContext = {
  today: "2026-10-24",
  timezone: "UTC",
  preferences: { dietary: [], excluded: [], servings: 2, revision: 0 },
  products: [product],
  batches: [],
};
const recipe: Recipe = {
  title: "Seasoned meal",
  servings: 2,
  ingredients: [
    { name: "Salt", product_id: product.id, quantity: "2", unit: "g" },
  ],
  steps: ["Season the meal."],
};
test("staple on/off changes only assumption, never measured stock", () => {
  expect(evaluateRecipe(recipe, context)[0]).toMatchObject({
    available: "0",
    shortage: "2",
    state: "shortage",
  });
  const staple = {
    ...context,
    products: [{ ...product, always_available: true }],
  };
  expect(evaluateRecipe(recipe, staple)[0]).toMatchObject({
    available: "0",
    shortage: "2",
    state: "assumed_staple",
  });
  expect(evaluateRecipe(recipe, context)[0]?.state).toBe("shortage");
  expect(context.batches).toEqual([]);
});
test("staples cannot override exclusions or forged references", () => {
  expect(() =>
    evaluateRecipe(recipe, {
      ...context,
      preferences: { ...context.preferences, excluded: ["salt"] },
    }),
  ).toThrow("excluded");
  expect(() => evaluateRecipe(recipe, { ...context, products: [] })).toThrow(
    "Unknown product",
  );
});
test("expiry and decimal availability are deterministic", () => {
  const batch = {
    id: "22222222-2222-4222-8222-222222222222",
    product_id: product.id,
    quantity: "0.1",
    base_unit: "g" as const,
    expiry: null,
    acquired_at: "2026-10-01T00:00:00Z",
    revision: 1,
  };
  expect(
    evaluateRecipe(recipe, {
      ...context,
      batches: [
        batch,
        { ...batch, quantity: "0.2" },
        { ...batch, quantity: "100", expiry: "2026-10-23" },
      ],
    })[0],
  ).toMatchObject({ available: "0.3", shortage: "1.7" });
});
test("reject incompatible units and repeated mapped products", () => {
  expect(() =>
    evaluateRecipe(
      {
        ...recipe,
        ingredients: [
          {
            ...(recipe.ingredients.at(0) ?? {
              name: "Salt",
              product_id: product.id,
              quantity: "2",
              unit: "g" as const,
            }),
            unit: "ml",
          },
        ],
      },
      context,
    ),
  ).toThrow("Incompatible");
  expect(() =>
    evaluateRecipe(
      {
        ...recipe,
        ingredients: [...recipe.ingredients, ...recipe.ingredients],
      },
      context,
    ),
  ).toThrow("repeated");
});
