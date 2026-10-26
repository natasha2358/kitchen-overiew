import { fireEvent, render, screen } from "@testing-library/react-native";
import { Choice, Disclosure, Segments, Body } from "../src/shared/ui";

test("searchable choices stay collapsed until opened and select explicitly", async () => {
  const onChange = jest.fn();
  await render(
    <Choice
      label="Storage"
      value=""
      options={[
        { value: "pantry", label: "Pantry" },
        { value: "fridge", label: "Fridge" },
      ]}
      onChange={onChange}
    />,
  );
  expect(screen.queryByRole("radio")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Storage: Choose" }),
  );
  await fireEvent.changeText(screen.getByLabelText("Search storage"), "frid");
  expect(screen.queryByRole("radio", { name: "Pantry" })).toBeNull();
  await fireEvent.press(screen.getByRole("radio", { name: "Fridge" }));
  expect(onChange).toHaveBeenCalledWith("fridge");
  expect(screen.queryByRole("radio")).toBeNull();
});

test("disabled selections cannot change and expose their selected state", async () => {
  const onChange = jest.fn();
  await render(
    <Segments
      label="Unit"
      value="g"
      options={[
        { value: "g", label: "Grams" },
        { value: "ml", label: "Millilitres" },
      ]}
      onChange={onChange}
      disabled
    />,
  );
  expect(
    screen.getByRole("radio", { name: "Grams", checked: true, disabled: true }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Millilitres" }));
  expect(onChange).not.toHaveBeenCalled();
});

test("less frequent settings are explicitly expandable", async () => {
  await render(
    <Disclosure title="More actions">
      <Body>Remove stock</Body>
    </Disclosure>,
  );
  expect(screen.queryByText("Remove stock")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: /More actions/ }));
  expect(screen.getByText("Remove stock")).toBeTruthy();
});
