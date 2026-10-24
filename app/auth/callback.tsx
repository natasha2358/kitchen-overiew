import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { backend } from "../../src/shared/supabase";
import { messageOf } from "../../src/shared/errors";
import { Body, Button, Problem, Screen } from "../../src/shared/ui";
export default function AuthCallback() {
  const url = Linking.useURL();
  const router = useRouter();
  const [error, setError] = useState("");
  const exchange = useRef<{
    code: string;
    result: ReturnType<
      ReturnType<typeof backend>["auth"]["exchangeCodeForSession"]
    >;
  } | null>(null);
  const code = url ? new URL(url).searchParams.get("code") : null;
  useEffect(() => {
    if (!code) return;
    let active = true;
    if (exchange.current?.code !== code)
      exchange.current = {
        code,
        result: backend().auth.exchangeCodeForSession(code),
      };
    void exchange.current.result
      .then((result) => {
        if (!active) return;
        if (result.error)
          setError(
            "This link has expired or was opened on another device. Request a new link here.",
          );
        else router.replace("/");
      })
      .catch((e) => {
        if (active) setError(messageOf(e));
      });
    return () => {
      active = false;
    };
  }, [code, router]);
  return (
    <Screen title="Verify your account">
      {error || (url && !code) ? (
        <Problem
          message={error || "Request a new authentication link on this device."}
        />
      ) : (
        <Body>Checking your link…</Body>
      )}
      <Button title="Back to kitchen" onPress={() => router.replace("/")} />
    </Screen>
  );
}
