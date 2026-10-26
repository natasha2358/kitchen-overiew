import { useRouter } from "expo-router";
import { Fragment, ReactNode, useState } from "react";
import { appConfig } from "../../shared/config";
import { backend } from "../../shared/supabase";
import { messageOf } from "../../shared/errors";
import { Body, Button, Card, Loading, Problem, Toolbar } from "../../shared/ui";
import { AuthPanel } from "./AuthPanel";
import { useAuth } from "./Providers";
import { useHousehold } from "./useHousehold";
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { loading, session, online, recovery } = useAuth();
  const household = useHousehold();
  const [error, setError] = useState("");
  if (!appConfig.success)
    return (
      <Card>
        <Body>Connect your kitchen</Body>
        <Body>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          in .env.local, then restart Expo. See README.md for local setup.
        </Body>
      </Card>
    );
  if (loading) return <Loading />;
  if (!session || recovery)
    return (
      <>
        {!online && (
          <Problem message="Reconnect to sign in or recover your account." />
        )}
        <AuthPanel />
      </>
    );
  return (
    <Fragment key={session.user.id}>
      {!online && (
        <Problem message="You’re offline. Displayed information may be stale. Reconnect before making changes." />
      )}
      {!!error && <Problem message={error} />}
      <Toolbar>
        <Button
          title="Sign out"
          onPress={() => {
            void backend()
              .auth.signOut({ scope: "local" })
              .then((result) => {
                if (result.error) setError(messageOf(result.error));
              });
          }}
        />
        <Button
          title="Account settings"
          onPress={() => router.push("/account")}
        />
      </Toolbar>
      {household.isError ? (
        <Card>
          <Problem message={messageOf(household.error)} />
          <Button
            title="Retry kitchen setup"
            onPress={() => void household.refetch()}
            disabled={!online}
          />
        </Card>
      ) : household.data ? (
        children
      ) : (
        <Loading />
      )}
    </Fragment>
  );
}
