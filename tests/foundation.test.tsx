import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../src/shared/ui';
import { sections } from '../src/shared/navigation';
import Shopping from '../app/(tabs)/shopping';
test('four navigation destinations are unique', () => {
  expect(sections.map(s => s.title)).toEqual(['Kitchen', 'Recipes', 'Shopping', 'Planner']);
  expect(new Set(sections.map(s => s.route)).size).toBe(4);
});
test('deferred shopping functionality is explicit', async () => {
  await render(<Shopping />);
  expect(screen.getByText(/Shopping lists are planned/)).toBeTruthy();
});
test('disabled actions cannot submit', async () => {
  const onPress = jest.fn();
  await render(<Button title="Save" disabled onPress={onPress} />);
  await fireEvent.press(screen.getByText('Save'));
  expect(onPress).not.toHaveBeenCalled();
});
