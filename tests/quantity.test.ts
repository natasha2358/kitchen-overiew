import {
  canonicalQuantity,
  convert,
  expiryState,
  matchProducts,
  remaining,
  sumQuantities,
} from "../src/features/inventory/quantity";
test("two 500g packages produce 1000g, consuming 250g leaves 750g", () => {
  const batch = canonicalQuantity("500", "g", "2");
  expect(batch.quantity).toBe("1000");
  expect(remaining(batch.quantity, "250")).toBe("750");
});
test("decimal operations preserve exact balances", () => {
  expect(sumQuantities(["0.1", "0.2"])).toBe("0.3");
  expect(remaining("0.3", "0.1")).toBe("0.2");
});
test("compatible conversions only", () => {
  expect(convert("0.5", "kg", "g")).toBe("500");
  expect(convert("0.25", "l", "ml")).toBe("250");
  expect(() => convert("1", "g", "ml")).toThrow();
  expect(() => convert("1", "item", "g")).toThrow();
});
test.each(["-1", "NaN", "Infinity", "1e3", "0.0000001", "1000000000000", ""])(
  "invalid quantity %s is rejected",
  (value) => {
    expect(() => canonicalQuantity(value, "g")).toThrow();
  },
);
test("rejects zero, fractional items, missing package size, fractional package counts and overdraft", () => {
  expect(() => canonicalQuantity("0", "g")).toThrow();
  expect(() => canonicalQuantity("1.5", "item")).toThrow();
  expect(() => canonicalQuantity("", "g", "2")).toThrow();
  expect(() => canonicalQuantity("1", "g", "1.5")).toThrow();
  expect(() => remaining("1", "2")).toThrow();
});
test("normalized aliases return all ambiguous matches rather than guessing", () => {
  const products = [
    { name: "Brown Rice", aliases: ["rice"] },
    { name: "White rice", aliases: ["RICE"] },
  ];
  expect(matchProducts("  brown   RICE ", products)).toHaveLength(1);
  expect(matchProducts(" rice ", products)).toHaveLength(2);
  expect(matchProducts("ric", products)).toHaveLength(0);
});
test("expiry uses household calendar date, inclusive seven-day window and unknown last semantics", () => {
  const now = new Date("2026-01-01T23:30:00Z");
  expect(expiryState("2026-01-01", "Europe/Skopje", now)).toBe("past");
  expect(expiryState("2026-01-09", "Europe/Skopje", now)).toBe("soon");
  expect(expiryState("2026-01-10", "Europe/Skopje", now)).toBe("fresh");
  expect(expiryState(null, "UTC", now)).toBe("unknown");
  expect(() => expiryState("2026-02-30", "UTC", now)).toThrow();
});
