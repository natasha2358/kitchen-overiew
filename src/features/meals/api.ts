import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useHousehold } from "../auth/useHousehold";
import {
  contextSchema,
  recipeSchema,
} from "../../../supabase/functions/_shared/meals";
export const suggestionSchema = z.object({
  id: z.uuid(),
  status: z.enum(["pending", "completed", "failed"]),
  snapshot: contextSchema,
  recipes: z.array(recipeSchema).max(3).nullable(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  model: z.string(),
  prompt_version: z.string(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
export function useMealContext() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["meal-context", h.data?.id],
    enabled: !!h.data,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable.");
      const r = await backend().rpc("meal_context", { p_household: h.data.id });
      if (r.error) throw r.error;
      return contextSchema.parse(r.data);
    },
  });
}
export function useSuggestions() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["suggestions", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable.");
      const r = await backend()
        .from("meal_suggestions")
        .select(
          "id,status,snapshot,recipes,error_code,created_at,model,prompt_version",
        )
        .eq("household_id", h.data.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (r.error) throw r.error;
      return z.array(suggestionSchema).parse(r.data);
    },
  });
}
export async function generateMeals(household: string, request: string) {
  const r = await backend().functions.invoke("suggest-meals", {
    body: { household_id: household, request_id: request },
  });
  if (r.error) {
    if (r.error.context instanceof Response) {
      const body = z
        .object({ error: z.string() })
        .safeParse(await r.error.context.json());
      if (body.success) throw new Error(body.data.error);
    }
    throw r.error;
  }
  return z.object({ id: z.uuid() }).parse(r.data);
}
