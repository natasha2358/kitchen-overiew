import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useAuth } from "./Providers";
const householdSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
});
export function useHousehold() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["household", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const timezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { data: id, error } = await backend().rpc("bootstrap_household", {
        p_timezone: timezone,
      });
      if (error) throw error;
      const result = await backend()
        .from("households")
        .select("id,name,timezone")
        .eq("id", id)
        .single();
      if (result.error) throw result.error;
      return householdSchema.parse(result.data);
    },
  });
}
