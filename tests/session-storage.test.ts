import { sessionStorageAdapter } from "../src/shared/session-storage";
const mockVault = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockVault.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockVault.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockVault.delete(k);
  },
}));
beforeEach(() => mockVault.clear());
test("large native sessions roundtrip and sign-out erases every chunk", async () => {
  const value = "x".repeat(7000);
  await sessionStorageAdapter.setItem("session", value);
  expect(await sessionStorageAdapter.getItem("session")).toBe(value);
  await sessionStorageAdapter.removeItem("session");
  expect(mockVault.size).toBe(0);
});
test("shorter refreshed session removes old chunks", async () => {
  await sessionStorageAdapter.setItem("session", "x".repeat(5000));
  await sessionStorageAdapter.setItem("session", "new");
  expect(await sessionStorageAdapter.getItem("session")).toBe("new");
  expect(mockVault.size).toBe(2);
});
test("incomplete stored token is not used", async () => {
  mockVault.set("session.count", "2");
  mockVault.set("session.0", "partial");
  expect(await sessionStorageAdapter.getItem("session")).toBeNull();
});
