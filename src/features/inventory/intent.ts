import { z } from "zod";
import { sessionStorageAdapter } from "../../shared/session-storage";
import { mutateInventory } from "./api";
import type { Json } from "../../shared/database.types";
const intentSchema = z.object({ operation: z.uuid(), request: z.json() });
const active = new Set<string>();
const key = (household: string) => `stock-intent.${household}`;
export async function pendingIntent(household: string) {
  const raw = await sessionStorageAdapter.getItem(key(household));
  return raw ? intentSchema.parse(JSON.parse(raw)) : null;
}
export async function submitIntent(
  household: string,
  operation: string,
  request: Json,
) {
  if (active.has(household))
    throw new Error("A stock change is already pending.");
  active.add(household);
  try {
    const existing = await pendingIntent(household);
    if (
      existing &&
      JSON.stringify(existing.request) !== JSON.stringify(request)
    )
      throw new Error(
        "A previous stock request needs reconciliation. Return to Kitchen and retry it first.",
      );
    const intent = existing ?? { operation, request };
    await sessionStorageAdapter.setItem(key(household), JSON.stringify(intent));
    try {
      const result = await mutateInventory(
        household,
        intent.operation,
        intent.request,
      );
      await sessionStorageAdapter.removeItem(key(household));
      return result;
    } catch (error) {
      // PostgreSQL validation/conflict responses prove this transaction did not commit.
      // Network errors retain the exact request and ID for safe replay after restart.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string" &&
        [
          "22023",
          "22007",
          "22008",
          "22P02",
          "23502",
          "23503",
          "23505",
          "23514",
          "40001",
          "42501",
        ].includes(error.code)
      )
        await sessionStorageAdapter.removeItem(key(household));
      throw error;
    }
  } finally {
    active.delete(household);
  }
}
