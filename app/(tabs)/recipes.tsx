import { Body, Card, Screen } from "../../src/shared/ui";
export default function Page() {
  return (
    <Screen title="Recipes" subtitle="Make something with what you have.">
      <Card>
        <Body>
          Meal suggestions will arrive in a later milestone, after inventory and
          receipt review.
        </Body>
      </Card>
    </Screen>
  );
}
