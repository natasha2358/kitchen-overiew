import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useHousehold } from "../auth/useHousehold";
import { backend } from "../../shared/supabase";
import {
  amountSchema,
  baseUnitSchema,
} from "../../../supabase/functions/_shared/meals";
import { Decimal } from "decimal.js";
import type { Json } from "../../shared/database.types";
export const shoppingFieldsSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(120),
    quantity: amountSchema.refine((v) => new Decimal(v).gt(0)),
    unit: baseUnitSchema,
    product_id: z.uuid().nullable(),
    checked: z.boolean(),
    removed: z.boolean(),
    revision: z.number().int().nonnegative(),
  })
  .refine(
    (i) => i.unit !== "item" || new Decimal(i.quantity).isInteger(),
    "Items must be whole",
  );
export type ShoppingItem = z.infer<typeof shoppingFieldsSchema>;
export function useShopping() {
  const h = useHousehold();
  return useQuery({
    queryKey: ["shopping", h.data?.id],
    enabled: !!h.data,
    queryFn: async () => {
      if (!h.data) throw new Error("Kitchen unavailable.");
      const r = await backend().rpc("get_shopping", { p_household: h.data.id });
      if (r.error) throw r.error;
      return z.array(shoppingFieldsSchema).parse(r.data);
    },
  });
}
export async function sendShopping(
  household: string,
  operation: string,
  request: Json,
) {
  const r = await backend().rpc("mutate_shopping", {
    p_household: household,
    p_operation: operation,
    p_request: request,
  });
  if (r.error) throw r.error;
  return shoppingFieldsSchema.parse(r.data);
}
