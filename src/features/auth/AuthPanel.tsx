import { useState } from "react";
import * as Linking from "expo-linking";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import { Body, Button, Card, Field, Problem } from "../../shared/ui";
import { useAuth } from "./Providers";
export const emailSchema = z.email();
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128);
export function AuthPanel() {
  const { online, recovery, finishRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!online) throw new Error("Connect to the internet to continue.");
      if (recovery) {
        const result = await backend().auth.updateUser({
          password:
            mode === "signup"
              ? passwordSchema.parse(password)
              : z
                  .string()
                  .min(1, "Enter your password.")
                  .max(128)
                  .parse(password),
        });
        if (result.error) throw result.error;
        setPassword("");
        finishRecovery();
        setMessage("Password updated.");
        return;
      }
      const address = emailSchema.parse(email.trim());
      const redirect = Linking.createURL("auth/callback");
      if (mode === "reset") {
        const result = await backend().auth.resetPasswordForEmail(address, {
          redirectTo: redirect,
        });
        if (
          result.error &&
          result.error.status &&
          (result.error.status === 429 || result.error.status >= 500)
        )
          throw new Error("Recovery is temporarily unavailable. Please retry.");
        setMessage(
          "If an account exists, check your email for a recovery link.",
        );
      } else {
        const credentials = {
          email: address,
          password:
            mode === "signup"
              ? passwordSchema.parse(password)
              : z
                  .string()
                  .min(1, "Enter your password.")
                  .max(128)
                  .parse(password),
        };
        const result =
          mode === "signup"
            ? await backend().auth.signUp({
                ...credentials,
                options: { emailRedirectTo: redirect },
              })
            : await backend().auth.signInWithPassword(credentials);
        if (result.error) throw result.error;
        setPassword("");
        if (mode === "signup")
          setMessage("Check your email to verify your account, then sign in.");
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Body>
        {recovery
          ? "Choose a new password"
          : mode === "signup"
            ? "Create your kitchen account"
            : mode === "reset"
              ? "Recover your account"
              : "Welcome to your kitchen"}
      </Body>
      {!recovery && (
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
      )}
      {(recovery || mode !== "reset") && (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={
            mode === "signup" || recovery ? "new-password" : "current-password"
          }
        />
      )}
      {!!message && <Body>{message}</Body>}
      {!!error && <Problem message={error} />}
      <Button
        title={
          busy
            ? "Please wait…"
            : recovery
              ? "Update password"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send recovery email"
                  : "Sign in"
        }
        onPress={() => void submit()}
        disabled={busy || !online}
      />
      {!recovery && (
        <>
          <Button
            title={mode === "signin" ? "Create an account" : "Back to sign in"}
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
              setMessage("");
            }}
            disabled={busy}
          />
          <Button
            title="Forgot password"
            onPress={() => {
              setMode("reset");
              setError("");
              setMessage("");
            }}
            disabled={busy}
          />
        </>
      )}
    </Card>
  );
}
