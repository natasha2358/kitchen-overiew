import { clearErasedHousehold } from "../src/features/auth/AccountScreen";
import { sessionStorageAdapter } from "../src/shared/session-storage";
jest.mock("../src/shared/session-storage", () => ({
  sessionStorageAdapter: { removeItem: jest.fn().mockResolvedValue(undefined) },
}));
test("erasure clears household retry data including receipt confirmations", async () => {
  await clearErasedHousehold("household-a", ["receipt-a", "receipt-b"]);
  expect(
    jest
      .mocked(sessionStorageAdapter.removeItem)
      .mock.calls.map(([key]) => key),
  ).toEqual([
    "stock-intent.household-a",
    "meal-request.household-a",
    "cooking.household-a",
    "shopping.household-a",
    "planner.household-a",
    "receipt-confirm.household-a.receipt-a",
    "receipt-confirm.household-a.receipt-b",
  ]);
});
test("account without a household does not touch another household's storage", async () => {
  await clearErasedHousehold(null, []);
  expect(sessionStorageAdapter.removeItem).not.toHaveBeenCalled();
});
test("device cleanup failure stops before irreversible server continuation", async () => {
  jest
    .mocked(sessionStorageAdapter.removeItem)
    .mockRejectedValueOnce(new Error("Device storage unavailable"));
  await expect(clearErasedHousehold("household-a", [])).rejects.toThrow(
    "Device storage unavailable",
  );
});
