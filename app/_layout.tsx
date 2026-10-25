import { Providers } from "../src/features/auth/Providers";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../src/shared/ui";
export default function RootLayout() {
  return (
    <Providers>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerTintColor: colors.ink,
            headerStyle: { backgroundColor: colors.cream },
            headerTitle: "Smart Kitchen",
          }}
        >
          <Stack.Screen name="account" options={{ title: "Account" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="inventory/new"
            options={{ title: "Add groceries" }}
          />
          <Stack.Screen
            name="inventory/[id]"
            options={{ title: "Manage batch" }}
          />
          <Stack.Screen
            name="inventory/catalog"
            options={{ title: "Products and locations" }}
          />
          <Stack.Screen
            name="receipts/index"
            options={{ title: "Receipt drafts" }}
          />
          <Stack.Screen
            name="receipts/[id]"
            options={{ title: "Review receipt" }}
          />
          <Stack.Screen
            name="cooking/index"
            options={{ title: "Review cooking" }}
          />
          <Stack.Screen
            name="auth/callback"
            options={{ title: "Verify account" }}
          />
        </Stack>
      </SafeAreaView>
    </Providers>
  );
}
