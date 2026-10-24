import { z } from "zod";
import { sessionStorageAdapter } from "./session-storage";
import type { Json } from "./database.types";
const schema = z.object({ operation: z.uuid(), request: z.json() });
const active = new Set<string>();
export async function readOperation(key: string) {
  const raw = await sessionStorageAdapter.getItem(key);
  return raw ? schema.parse(JSON.parse(raw)) : null;
}
export async function runOperation<T>(
  key: string,
  operation: string,
  request: Json,
  send: (operation: string, request: Json) => Promise<T>,
): Promise<T> {
  if (active.has(key)) throw new Error("A confirmation is already pending.");
  active.add(key);
  try {
    const prior = await readOperation(key);
    if (prior && JSON.stringify(prior.request) !== JSON.stringify(request))
      throw new Error("Retry the pending confirmation before changing it.");
    const intent = prior ?? { operation, request };
    await sessionStorageAdapter.setItem(key, JSON.stringify(intent));
    try {
      const result = await send(intent.operation, intent.request);
      await sessionStorageAdapter.removeItem(key);
      return result;
    } catch (error) {
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
        await sessionStorageAdapter.removeItem(key);
      throw error;
    }
  } finally {
    active.delete(key);
  }
}
