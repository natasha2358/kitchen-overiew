import { Children, isValidElement, ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  useWindowDimensions,
} from "react-native";

export const colors = {
  ink: "#16372b",
  muted: "#52685c",
  green: "#216248",
  cream: "#f3f6f4",
  white: "#ffffff",
  border: "#dfe7e2",
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
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
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
  variant = "secondary",
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primary,
        variant === "danger" && styles.danger,
        { opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "primary" && { color: colors.white },
          variant === "danger" && { color: colors.error },
        ]}
      >
        {title}
      </Text>
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
    padding: 16,
    gap: 10,
    maxWidth: 1200,
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
  title: { color: colors.ink, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    boxShadow: "0 2px 8px rgba(22, 55, 43, 0.04)",
    padding: 14,
    gap: 8,
  },
  body: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  button: {
    backgroundColor: "#edf3ef",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  primary: { backgroundColor: colors.green, borderColor: colors.green },
  danger: { backgroundColor: "#fff3f1", borderColor: "#e8bcb5" },
  field: { gap: 4 },
  input: {
    color: colors.ink,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 48,
    fontSize: 16,
  },
  error: { color: colors.error, fontSize: 16, lineHeight: 24 },
});

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ color: colors.ink, fontSize: 18, fontWeight: "700" }}
    >
      {children}
    </Text>
  );
}
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      {children}
    </View>
  );
}
export function Disclosure({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ color: colors.green, fontWeight: "600", fontSize: 14 }}>
          {open ? "−" : "+"} {title}
        </Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}
export function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Body>{label}</Body>
      <Toolbar>
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: value === option.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: 48,
              justifyContent: "center",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor:
                value === option.value ? colors.green : colors.border,
              backgroundColor:
                value === option.value ? colors.green : colors.white,
            }}
          >
            <Text
              style={{
                color: value === option.value ? colors.white : colors.ink,
                fontSize: 14,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Toolbar>
    </View>
  );
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? "Choose"}`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => {
          setOpen(!open);
          setSearch("");
        }}
        style={[styles.input, { justifyContent: "center" }]}
      >
        <Text style={styles.body}>
          {label}: {selected?.label ?? "Choose"} {open ? "▴" : "▾"}
        </Text>
      </Pressable>
      {open && !disabled ? (
        <Card>
          <Field
            label={`Search ${label.toLowerCase()}`}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <ScrollView
            style={{ maxHeight: 240 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {filtered.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === option.value }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={{ minHeight: 48, padding: 10, justifyContent: "center" }}
              >
                <Text style={styles.body}>
                  {value === option.value ? "✓ " : ""}
                  {option.label}
                </Text>
              </Pressable>
            ))}
            {filtered.length === 0 ? <Body>No matches.</Body> : null}
          </ScrollView>
          <Button
            title={`Close ${label.toLowerCase()}`}
            onPress={() => setOpen(false)}
          />
        </Card>
      ) : null}
    </View>
  );
}
export function SplitPane({
  main,
  detail,
}: {
  main: ReactNode;
  detail: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 960 && fontScale <= 1.3;
  return (
    <View
      style={{
        flexDirection: wide ? "row" : "column",
        gap: 16,
        alignItems: "stretch",
      }}
    >
      <View style={{ flex: wide ? 1.4 : undefined, minWidth: 0, gap: 10 }}>
        {main}
      </View>
      <View style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: 10 }}>
        {detail}
      </View>
    </View>
  );
}
export function ItemRow({
  title,
  subtitle,
  trailing,
  onPress,
  selected = false,
}: {
  title: string;
  subtitle: string;
  trailing: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${trailing}, ${subtitle}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        padding: 12,
        minHeight: 72,
        borderRadius: 12,
        backgroundColor: selected || pressed ? "#e5f0e9" : colors.white,
        borderWidth: 1,
        borderColor: selected ? colors.green : colors.border,
        gap: 4,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: colors.ink,
            flexShrink: 1,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.green }}>
          {trailing} ›
        </Text>
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.3 || width < 760 ? 1 : width < 1100 ? 2 : 3;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {Children.toArray(children).map((child, index) => (
        <View
          key={isValidElement(child) ? (child.key ?? index) : index}
          style={{
            width: columns === 1 ? "100%" : columns === 2 ? "49%" : "32%",
            minWidth: 0,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
