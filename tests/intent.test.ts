import { pendingIntent, submitIntent } from "../src/features/inventory/intent";
const mockStore = new Map<string, string>();
const mockMutate = jest.fn();
jest.mock("../src/shared/session-storage", () => ({
  sessionStorageAdapter: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockStore.set(k, v);
    },
    removeItem: async (k: string) => {
      mockStore.delete(k);
    },
  },
}));
jest.mock("../src/features/inventory/api", () => ({
  mutateInventory: (...args: unknown[]) => mockMutate(...args),
}));
const op = "31205468-6367-4c8c-a366-de1009497da7";
beforeEach(() => mockStore.clear());
test("lost response preserves original operation ID across subsequent retries", async () => {
  mockMutate.mockRejectedValueOnce(new Error("Connection lost"));
  await expect(
    submitIntent("household", op, { action: "create" }),
  ).rejects.toThrow("Connection lost");
  expect((await pendingIntent("household"))?.operation).toBe(op);
  mockMutate.mockResolvedValueOnce({ quantity: "1" });
  await submitIntent("household", "c2f0bd12-82f6-4399-9d85-7038d0634844", {
    action: "create",
  });
  expect(mockMutate.mock.calls[1]?.[1]).toBe(op);
  expect(await pendingIntent("household")).toBeNull();
});
test("a new intent cannot overwrite an unresolved one", async () => {
  mockMutate.mockRejectedValueOnce(new Error("Connection lost"));
  await expect(
    submitIntent("household", op, { action: "create" }),
  ).rejects.toThrow();
  await expect(
    submitIntent("household", op, { action: "remove" }),
  ).rejects.toThrow("reconciliation");
  expect(mockMutate).toHaveBeenCalledTimes(1);
});
test("known database rejection clears the intent so the user can correct it", async () => {
  mockMutate.mockRejectedValueOnce({ code: "40001" });
  await expect(
    submitIntent("household", op, { action: "waste" }),
  ).rejects.toEqual({ code: "40001" });
  expect(await pendingIntent("household")).toBeNull();
});
