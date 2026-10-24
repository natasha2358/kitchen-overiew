import { render, screen, fireEvent } from "@testing-library/react-native";
import { AuthPanel } from "../src/features/auth/AuthPanel";
const mockSignIn = jest.fn();
const mockReset = jest.fn();
jest.mock("../src/shared/supabase", () => ({
  backend: () => ({
    auth: { signInWithPassword: mockSignIn, resetPasswordForEmail: mockReset },
  }),
}));
jest.mock("../src/features/auth/Providers", () => ({
  useAuth: () => ({ online: true, recovery: false }),
}));
jest.mock("expo-linking", () => ({
  createURL: () => "smartkitchen://auth/callback",
}));
test("invalid email never reaches authentication", async () => {
  await render(<AuthPanel />);
  await fireEvent.changeText(screen.getByLabelText("Email"), "invalid");
  await fireEvent.changeText(
    screen.getByLabelText("Password"),
    "long-enough-password",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(mockSignIn).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeTruthy();
});
test("sign-in error is visible and does not clear the entered email", async () => {
  mockSignIn.mockResolvedValue({
    error: new Error("Invalid login credentials"),
  });
  await render(<AuthPanel />);
  await fireEvent.changeText(
    screen.getByLabelText("Email"),
    "cook@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Password"),
    "long-enough-password",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByText("Invalid login credentials")).toBeTruthy();
  expect(screen.getByLabelText("Email").props.value).toBe("cook@example.test");
});
test("recovery response does not reveal account existence", async () => {
  mockReset.mockResolvedValue({ error: { status: 400 } });
  await render(<AuthPanel />);
  await fireEvent.press(
    screen.getByRole("button", { name: "Forgot password" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Email"),
    "unknown@example.test",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Send recovery email" }),
  );
  expect(
    screen.getByText(
      "If an account exists, check your email for a recovery link.",
    ),
  ).toBeTruthy();
});
