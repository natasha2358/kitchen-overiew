import {
  addDays,
  weekStart,
  scaleRecipe,
} from "../src/features/planner/domain";
import type { Recipe } from "../supabase/functions/_shared/meals";
const recipe: Recipe = {
  title: "Fixture",
  servings: 2,
  ingredients: [{ name: "Oil", product_id: null, quantity: "0.1", unit: "ml" }],
  steps: ["Use oil."],
};
test("weeks start Monday across month/year boundaries without local DST shifts", () => {
  expect(weekStart("2026-10-25")).toBe("2026-10-19");
  expect(weekStart("2026-10-26")).toBe("2026-10-26");
  expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
});
test("serving scaling preserves exact decimals and original snapshots", () => {
  expect(scaleRecipe(recipe, 6).ingredients[0]?.quantity).toBe("0.3");
  expect(recipe.ingredients[0]?.quantity).toBe("0.1");
});
test("serving changes do not silently round items or repeating decimals", () => {
  expect(() =>
    scaleRecipe(
      {
        ...recipe,
        ingredients: [
          { name: "Egg", product_id: null, quantity: "1", unit: "item" },
        ],
      },
      1,
    ),
  ).toThrow("quantity decisions");
  expect(() => scaleRecipe({ ...recipe, servings: 3 }, 1)).toThrow(
    "quantity decisions",
  );
});
