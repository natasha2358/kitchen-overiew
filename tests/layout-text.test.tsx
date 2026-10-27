import { fireEvent, render, screen } from "@testing-library/react-native";
import { BatchDetail } from "../src/features/inventory/BatchDetail";

import { ShoppingScreen } from "../src/features/shopping/ShoppingScreen";
const mockSubmit = jest.fn();
jest.mock("../src/features/inventory/intent", () => ({
  submitIntent: (...args: unknown[]) => mockSubmit(...args),
}));

jest.mock("../src/shared/ui", () => {
  const actual =
    jest.requireActual<typeof import("../src/shared/ui")>("../src/shared/ui");
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    Card: ({ children }: { children: import("react").ReactNode }) => {
      // Native test renderers do not enforce the browser View's text restriction.
      for (const child of React.Children.toArray(children)) {
        if (typeof child === "string" || typeof child === "number") {
          throw new Error("Raw text inside Card");
        }
      }
      return <actual.Card>{children}</actual.Card>;
    },
  };
});
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "batch" }),
  useRouter: () => ({ replace: jest.fn(), setParams: jest.fn() }),
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "test-id" }));
jest.mock("../src/features/auth/AuthGate", () => ({
  AuthGate: ({ children }: { children: import("react").ReactNode }) => children,
}));
jest.mock("../src/features/auth/Providers", () => ({
  useAuth: () => ({ online: true }),
}));
jest.mock("../src/features/auth/useHousehold", () => ({
  useHousehold: () => ({ data: { id: "household" } }),
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("../src/features/inventory/api", () => ({
  useInventory: () => ({
    data: [
      {
        id: "batch",
        name: "Rice",
        quantity: "500",
        base_unit: "g",
        location_id: "pantry",
        location: "Pantry",
        expiry: null,
        revision: 1,
      },
    ],
  }),
  useLocations: () => ({ data: [] }),
  useProducts: () => ({ data: [] }),
}));
jest.mock("../src/features/meals/api", () => ({
  useSuggestion: () => ({}),
  useMealContext: () => ({}),
}));
jest.mock("../src/features/shopping/api", () => ({
  ...jest.requireActual<typeof import("../src/features/shopping/api")>(
    "../src/features/shopping/api",
  ),
  useShopping: () => ({ data: [] }),
}));
jest.mock("../src/features/lists/operations", () => ({
  useListOperation: () => ({
    error: "",
    notice: "",
    online: true,
    blocked: false,
  }),
}));

test("batch editor renders empty feedback without raw text children", async () => {
  await render(<BatchDetail />);
  expect(screen.getByText("Confirm change")).toBeTruthy();
  await fireEvent.press(screen.getByText("Move location"));
  expect(screen.getByRole("button", { name: /Stock history/ })).toBeTruthy();
});

test("shopping renders empty feedback and shows validation errors inside text", async () => {
  await render(<ShoppingScreen />);
  expect(screen.getByText("Your shopping list is empty.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Save shopping item"));
  expect(screen.getByRole("alert")).toBeTruthy();
});

test("choosing removal does not mutate stock until its explicit confirmation", async () => {
  await render(<BatchDetail />);
  await fireEvent.press(screen.getByRole("button", { name: "Used up" }));
  expect(screen.queryByLabelText("Quantity (g)")).toBeNull();
  expect(mockSubmit).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Confirm used up",
    }),
  );
  expect(mockSubmit).toHaveBeenCalledWith(
    "household",
    "test-id",
    expect.objectContaining({
      action: "remove",
      batch_id: "batch",
      revision: 1,
    }),
  );
});

test("cancelling used up preserves the batch and its quantity editor", async () => {
  await render(<BatchDetail />);
  await fireEvent.press(screen.getByRole("button", { name: "Used up" }));
  await fireEvent.press(screen.getByRole("button", { name: "Cancel used up" }));
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Quantity (g)").props.value).toBe("500");
});
