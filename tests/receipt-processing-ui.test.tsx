import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ReceiptEditor } from "../src/features/receipts/ReceiptReview";
import { receiptReviewSchema } from "../supabase/functions/_shared/contracts";
const mockParse = jest.fn(),
  mockRpc = jest.fn();
jest.mock("../src/features/receipts/api", () => ({
  parseReceipt: (...args: unknown[]) => mockParse(...args),
}));
jest.mock("../src/shared/supabase", () => ({
  backend: () => ({ rpc: mockRpc }),
}));
jest.mock("../src/features/auth/Providers", () => ({
  useAuth: () => ({ online: true }),
}));
jest.mock("../src/features/auth/useHousehold", () => ({
  useHousehold: () => ({ data: { id: "household-a" } }),
}));
jest.mock("../src/features/inventory/api", () => ({
  useLocations: () => ({ data: [] }),
  useProducts: () => ({ data: [] }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
const receipt = receiptReviewSchema.parse({
  id: "145a5d9a-43cf-41d5-989c-a8404817f3eb",
  revision: 1,
  filename: "fixture.pdf",
  status: "uploaded",
  canonical_id: null,
  merchant: null,
  receipt_number: null,
  purchased_on: null,
  total: null,
  currency: null,
  source_deleted: false,
  confirmation: null,
  duplicates: [],
  lines: [],
  extraction: {
    status: "idle",
    attempts: 0,
    calls: 0,
    route: null,
    reason: null,
    error: null,
    lease_until: null,
  },
});
async function show() {
  await render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
      }
    >
      <ReceiptEditor receipt={receipt} />
    </QueryClientProvider>,
  );
}
test("unsaved receipt edits cannot be replaced by a generation request", async () => {
  await show();
  await fireEvent.changeText(
    screen.getByLabelText("merchant"),
    "My correction",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Generate / retry receipt draft" }),
  );
  expect(mockParse).not.toHaveBeenCalled();
  expect(screen.getByLabelText("merchant").props.value).toBe("My correction");
});
test("configuration failure remains visible and manual review is available", async () => {
  mockParse.mockRejectedValueOnce(
    new Error("Configure the server receipt model"),
  );
  await show();
  await fireEvent.press(
    screen.getByRole("button", { name: "Generate / retry receipt draft" }),
  );
  expect(screen.getByText("Configure the server receipt model")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add manual line" })).toBeTruthy();
});
test("completed proposal loads unresolved values and issues without confirming stock", async () => {
  mockParse.mockResolvedValueOnce({ id: receipt.id, status: "completed" });
  mockRpc.mockResolvedValueOnce({
    error: null,
    data: {
      ...receipt,
      status: "review_ready",
      revision: 2,
      lines: [
        {
          id: "52f4464d-e0f3-4ce4-b065-30e181ed9361",
          source_label: "H-MILCH",
          reviewed_name: "Milk",
          quantity: null,
          unit: null,
          product_id: null,
          location_id: null,
          expiry: null,
          included: true,
          proposed: {
            proposed_name: "Milk",
            quantity: null,
            unit: null,
            issues: ["Package size is absent"],
          },
        },
      ],
    },
  });
  await show();
  await fireEvent.press(
    screen.getByRole("button", { name: "Generate / retry receipt draft" }),
  );
  expect(screen.getByText("Review: Package size is absent")).toBeTruthy();
  expect(
    screen.getByLabelText("Quantity (blank if unresolved)").props.value,
  ).toBe("");
  expect(mockRpc.mock.calls.map((call) => call[0])).toEqual([
    "get_receipt_review",
  ]);
});
