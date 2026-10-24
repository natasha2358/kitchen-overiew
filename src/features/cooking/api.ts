import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useHousehold } from "../auth/useHousehold";
import { suggestionSchema } from "../meals/api";
import { cookingRequestSchema, cookingResultSchema } from "./domain";
export function useCookingSuggestion(id: string | undefined) {
  const h = useHousehold();
  return useQuery({
    queryKey: ["cooking-suggestion", h.data?.id, id],
    enabled: !!h.data && !!id,
    queryFn: async () => {
      if (!h.data || !id) throw new Error("Suggestion unavailable.");
      const r = await backend()
        .from("meal_suggestions")
        .select(
          "id,status,snapshot,recipes,error_code,created_at,model,prompt_version",
        )
        .eq("household_id", h.data.id)
        .eq("id", z.uuid().parse(id))
        .single();
      if (r.error) throw r.error;
      return suggestionSchema.parse(r.data);
    },
  });
}
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
