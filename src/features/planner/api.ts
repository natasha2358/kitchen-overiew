import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useHousehold } from "../auth/useHousehold";
import { addDays, plannedMealSchema } from "./domain";
import type { Json } from "../../shared/database.types";
export function usePlanner(start: string) {
  const h = useHousehold();
  return useQuery({
    queryKey: ["planner", h.data?.id, start],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable.");
      const r = await backend()
        .from("planned_meals")
        .select("*")
        .eq("household_id", h.data.id)
        .gte("planned_on", start)
        .lt("planned_on", addDays(start, 7))
        .order("planned_on")
        .order("created_at");
      if (r.error) throw r.error;
      return z.array(plannedMealSchema).parse(r.data);
    },
  });
}
export function usePlannedMeal(id: string | undefined) {
  const h = useHousehold();
  return useQuery({
    queryKey: ["planned-meal", h.data?.id, id],
    enabled: !!h.data && !!id,
    queryFn: async () => {
      if (!h.data || !id) throw new Error("Plan unavailable.");
      const r = await backend()
        .from("planned_meals")
        .select("*")
        .eq("household_id", h.data.id)
        .eq("id", z.uuid().parse(id))
        .single();
      if (r.error) throw r.error;
      return plannedMealSchema.parse(r.data);
    },
  });
}
export async function sendPlan(
  household: string,
  operation: string,
  request: Json,
) {
  const r = await backend().rpc("save_planned_meal", {
    p_household: household,
    p_operation: operation,
    p_request: request,
  });
  if (r.error) throw r.error;
  return plannedMealSchema.parse(r.data);
}
