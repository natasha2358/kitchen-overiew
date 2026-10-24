import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";

export const colors = {
  ink: "#16372b",
  muted: "#52685c",
  green: "#216248",
  cream: "#f6f5ed",
  white: "#ffffff",
  border: "#d6dfd6",
  error: "#9c2b26",
};
export function Screen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>SMART KITCHEN</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {children}
    </ScrollView>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function Problem({ message }: { message: string }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}
export function Loading() {
  return (
    <ActivityIndicator accessibilityLabel="Loading" color={colors.green} />
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: {
    padding: 24,
    gap: 16,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 64,
  },
  eyebrow: {
    color: colors.green,
    fontWeight: "700",
    letterSpacing: 2,
    fontSize: 12,
  },
  title: { color: colors.ink, fontSize: 34, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 25 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  body: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  button: {
    backgroundColor: colors.green,
    borderRadius: 12,
    padding: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  field: { gap: 6 },
  input: {
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 48,
    fontSize: 16,
  },
  error: { color: colors.error, fontSize: 16, lineHeight: 24 },
});
