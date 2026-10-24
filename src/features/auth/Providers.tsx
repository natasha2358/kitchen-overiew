import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../shared/supabase";

const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  online: boolean;
  recovery: boolean;
  finishRecovery: () => void;
}>({
  session: null,
  loading: true,
  online: true,
  recovery: false,
  finishRecovery: () => {},
});
export function useAuth() {
  return useContext(AuthContext);
}
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
          mutations: { retry: false, networkMode: "always" },
        },
      }),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [online, setOnline] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const currentUser = useRef<string | undefined>(undefined);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const connected =
          state.isConnected !== false && state.isInternetReachable !== false;
        setOnline(connected);
        onlineManager.setOnline(connected);
      }),
    [],
  );
  useEffect(() => {
    const api = supabase;
    if (!api) return;
    // INITIAL_SESSION and all later transitions use the same ordered event source.
    const { data } = api.auth.onAuthStateChange((event, next) => {
      if (next?.user.id !== currentUser.current || event === "SIGNED_OUT") {
        void client.cancelQueries();
        client.clear();
        currentUser.current = next?.user.id;
      }
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      setSession(next);
      setLoading(false);
    });
    if (Platform.OS !== "web") api.auth.startAutoRefresh();
    const app = AppState.addEventListener("change", (state) => {
      if (Platform.OS !== "web") {
        if (state === "active") api.auth.startAutoRefresh();
        else api.auth.stopAutoRefresh();
      }
    });
    return () => {
      data.subscription.unsubscribe();
      app.remove();
      api.auth.stopAutoRefresh();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          session,
          loading,
          online,
          recovery,
          finishRecovery: () => setRecovery(false),
        }}
      >
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
