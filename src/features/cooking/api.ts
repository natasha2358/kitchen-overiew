import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useHousehold } from "../auth/useHousehold";
import { cookingRequestSchema, cookingResultSchema } from "./domain";
export { useSuggestion as useCookingSuggestion } from "../meals/api";
export function useCookingHistory() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["cooking-history", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable.");
      const r = await backend()
        .from("cooking_confirmations")
        .select("id,created_at,snapshot,result")
        .eq("household_id", h.data.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (r.error) throw r.error;
      return z
        .array(
          z.object({
            id: z.uuid(),
            created_at: z.string(),
            snapshot: cookingRequestSchema,
            result: cookingResultSchema,
          }),
        )
        .parse(r.data);
    },
  });
}
