import {
  receiptLineSchema,
  reviewIssues,
} from "../supabase/functions/_shared/contracts";
const line = {
  id: "a1df738c-6b5a-4e9d-aa93-6731227853f2",
  source_label: "Unclear label",
  reviewed_name: null,
  quantity: null,
  unit: null,
  product_id: null,
  location_id: null,
  expiry: null,
  included: true,
};
test("unresolved drafts can be saved but show review issues", () => {
  expect(receiptLineSchema.safeParse(line).success).toBe(true);
  expect(reviewIssues(line)).toHaveLength(3);
});
test("excluded lines are not required to resolve", () => {
  expect(reviewIssues({ ...line, included: false })).toEqual([]);
});
test("zero, fractional item counts and impossible dates are invalid", () => {
  expect(receiptLineSchema.safeParse({ ...line, quantity: "0" }).success).toBe(
    false,
  );
  expect(
    receiptLineSchema.safeParse({ ...line, quantity: "1.5", unit: "item" })
      .success,
  ).toBe(false);
  expect(
    receiptLineSchema.safeParse({ ...line, expiry: "2026-02-30" }).success,
  ).toBe(false);
});

test("review flags incompatible product dimensions before confirmation", () => {
  expect(
    reviewIssues({ ...line, unit: "ml", quantity: "10" }, { base_unit: "g" }),
  ).toContain("The unit does not match the selected product.");
  expect(
    reviewIssues({ ...line, unit: "kg", quantity: "1" }, { base_unit: "g" }),
  ).not.toContain("The unit does not match the selected product.");
});
test("invalid nonempty quantities do not appear review-ready", () => {
  expect(reviewIssues({ ...line, quantity: "NaN", unit: "g" })).toContain(
    "Correct invalid quantity, date, or line values.",
  );
});
