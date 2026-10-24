import { type MealContext } from "../supabase/functions/_shared/meals";
import {
  proposeAllocations,
  validateCooking,
  type CookingRequest,
} from "../src/features/cooking/domain";
const product = "11111111-1111-4111-8111-111111111111";
const batch = "22222222-2222-4222-8222-222222222222";
const context: MealContext = {
  today: "2026-10-24",
  timezone: "UTC",
  preferences: { dietary: [], excluded: [], servings: 2, revision: 0 },
  products: [
    {
      id: product,
      name: "Oil",
      aliases: [],
      base_unit: "ml",
      always_available: true,
    },
  ],
  batches: [
    {
      id: batch,
      product_id: product,
      quantity: "10",
      base_unit: "ml",
      expiry: null,
      acquired_at: "2026-10-01",
      revision: 1,
    },
  ],
};
const ingredient = {
  name: "Oil",
  product_id: product,
  unit: "ml" as const,
  quantity: "15",
  untracked_quantity: "5",
  untracked_confirmed: true,
  allocations: [{ batch_id: batch, quantity: "10", revision: 1 }],
};
const request: CookingRequest = {
  action: "cook",
  suggestion_id: null,
  recipe_index: null,
  preference_revision: 0,
  ingredients: [ingredient],
};
test("15 ml usage splits into 10 tracked plus 5 explicitly untracked", () => {
  expect(validateCooking(request, context)).toEqual(request);
  expect(() =>
    validateCooking(
      {
        ...request,
        ingredients: [{ ...ingredient, untracked_confirmed: false }],
      },
      context,
    ),
  ).toThrow("Explicitly");
  expect(() =>
    validateCooking(
      {
        ...request,
        ingredients: [
          {
            ...ingredient,
            allocations: [{ batch_id: batch, quantity: "15", revision: 1 }],
          },
        ],
      },
      context,
    ),
  ).toThrow("insufficient");
});
test("proposals prefer earliest expiry, then acquisition and ID, excluding expired stock", () => {
  const early = {
    ...context.batches[0],
    id: "33333333-3333-4333-8333-333333333333",
    product_id: product,
    quantity: "2",
    base_unit: "ml" as const,
    expiry: "2026-10-25",
    acquired_at: "2026-10-02",
    revision: 1,
  };
  const plan = proposeAllocations(
    {
      ...context,
      batches: [
        ...context.batches,
        early,
        {
          ...early,
          id: "44444444-4444-4444-8444-444444444444",
          expiry: "2026-10-23",
          quantity: "100",
        },
      ],
    },
    ingredient,
  );
  expect(plan.allocations.map((a) => a.batch_id)).toEqual([early.id, batch]);
  expect(plan.shortage).toBe("3");
});
test("no stock salt requires explicit finite untracked usage", () => {
  const salt = {
    name: "Salt",
    product_id: null,
    unit: "g" as const,
    quantity: "1.5",
    untracked_quantity: "1.5",
    untracked_confirmed: true,
    allocations: [],
  };
  expect(
    validateCooking({ ...request, ingredients: [salt] }, context).ingredients[0]
      ?.allocations,
  ).toEqual([]);
  expect(() =>
    validateCooking(
      { ...request, ingredients: [{ ...salt, untracked_quantity: "1" }] },
      context,
    ),
  ).toThrow("must equal");
});
test("stale revisions, duplicate allocations and incompatible units fail", () => {
  expect(() =>
    validateCooking(request, {
      ...context,
      batches: context.batches.map((b) => ({ ...b, revision: 2 })),
    }),
  ).toThrow("changed");
  expect(() =>
    validateCooking(
      { ...request, ingredients: [{ ...ingredient, unit: "g" }] },
      context,
    ),
  ).toThrow("compatible");
  expect(() =>
    validateCooking(
      {
        ...request,
        ingredients: [
          {
            ...ingredient,
            allocations: [...ingredient.allocations, ...ingredient.allocations],
          },
        ],
      },
      context,
    ),
  ).toThrow("more than once");
});
