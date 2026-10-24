import { Decimal } from "decimal.js";
import { z } from "zod";
Decimal.set({ precision: 32 });
export const unitSchema = z.enum(["g", "kg", "ml", "l", "item"]);
export type Unit = z.infer<typeof unitSchema>;
export const decimalSchema = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,6})?$/,
    "Use a nonnegative decimal with at most 6 decimal places.",
  );
const units = {
  g: { base: "g", factor: "1" },
  kg: { base: "g", factor: "1000" },
  ml: { base: "ml", factor: "1" },
  l: { base: "ml", factor: "1000" },
  item: { base: "item", factor: "1" },
} as const;
export function canonicalQuantity(value: string, unit: Unit, packages = "1") {
  const quantity = new Decimal(decimalSchema.parse(value));
  const count = new Decimal(
    z
      .string()
      .regex(/^[1-9]\d{0,5}$/, "Package count must be a positive whole number.")
      .parse(packages),
  );
  if (quantity.lte(0)) throw new Error("Quantity must be positive.");
  if (unit === "item" && !quantity.isInteger())
    throw new Error("Items must be whole numbers.");
  const perPackage = quantity.mul(units[unit].factor);
  const total = perPackage.mul(count);
  if (total.gte("1000000000000")) throw new Error("Quantity is too large.");
  return {
    quantity: total.toFixed(),
    base_unit: units[unit].base,
    package_count: count.toNumber(),
    package_size: perPackage.toFixed(),
  };
}
export function convert(value: string, from: Unit, to: Unit) {
  if (units[from].base !== units[to].base)
    throw new Error("Incompatible quantity dimensions.");
  const amount = new Decimal(decimalSchema.parse(value));
  if (from === "item" && !amount.isInteger())
    throw new Error("Items must be whole numbers.");
  return amount.mul(units[from].factor).div(units[to].factor).toFixed();
}
export function remaining(balance: string, consumed: string) {
  const result = new Decimal(decimalSchema.parse(balance)).minus(
    decimalSchema.parse(consumed),
  );
  if (result.isNegative()) throw new Error("Insufficient stock.");
  return result.toFixed();
}
export function sumQuantities(values: readonly string[]) {
  return values
    .reduce(
      (total, value) => total.plus(decimalSchema.parse(value)),
      new Decimal(0),
    )
    .toFixed();
}
export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
export function matchProducts<T extends { name: string; aliases: string[] }>(
  label: string,
  products: readonly T[],
): T[] {
  const key = normalizeName(label);
  return products.filter(
    (p) =>
      normalizeName(p.name) === key ||
      p.aliases.some((a) => normalizeName(a) === key),
  );
}
export function expiryState(
  expiry: string | null,
  timezone: string,
  now = new Date(),
): "unknown" | "past" | "soon" | "fresh" {
  if (!expiry) return "unknown";
  z.iso.date().parse(expiry);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const end = new Date(today + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() + 7);
  return expiry < today
    ? "past"
    : expiry <= end.toISOString().slice(0, 10)
      ? "soon"
      : "fresh";
}
