import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { backend } from "../../shared/supabase";
import { useHousehold } from "../auth/useHousehold";
import { decimalSchema } from "./quantity";
import type { Json } from "../../shared/database.types";
export const batchSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  name: z.string(),
  location_id: z.uuid(),
  location: z.string(),
  quantity: decimalSchema,
  base_unit: z.enum(["g", "ml", "item"]),
  expiry: z.iso.date().nullable(),
  revision: z.number().int().positive(),
  acquired_at: z.string(),
});
export type Batch = z.infer<typeof batchSchema>;
export const locationSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
});
export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  base_unit: z.enum(["g", "ml", "item"]),
  aliases: z.array(z.string()),
});
export function useInventory() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["inventory", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen not loaded.");
      const result = await backend().rpc("get_inventory", {
        p_household: h.data.id,
      });
      if (result.error) throw result.error;
      return z.array(batchSchema).parse(result.data);
    },
  });
}
export function useLocations() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["locations", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen not loaded.");
      const result = await backend()
        .from("storage_locations")
        .select("id,name")
        .eq("household_id", h.data.id)
        .order("name");
      if (result.error) throw result.error;
      return z.array(locationSchema).parse(result.data);
    },
  });
}
export function useProducts() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["products", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen not loaded.");
      const result = await backend()
        .from("products")
        .select("id,name,base_unit,aliases")
        .eq("household_id", h.data.id)
        .order("name");
      if (result.error) throw result.error;
      return z.array(productSchema).parse(result.data);
    },
  });
}
export async function mutateInventory(
  household: string,
  operation: string,
  request: Json,
) {
  const result = await backend().rpc("mutate_inventory", {
    p_household: household,
    p_operation: operation,
    p_request: request,
  });
  if (result.error) throw result.error;
  return z
    .object({
      batch_id: z.uuid(),
      quantity: decimalSchema,
      revision: z.number().int(),
    })
    .parse(result.data);
}
